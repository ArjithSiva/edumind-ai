/**
 * Custom auth, reproduced from server/src/middleware/auth.js.
 *
 * Deliberately NOT Enter Cloud's built-in auth: the app already ships email +
 * bcrypt + its own JWT, and the seeded demo passwords have to keep working with
 * zero changes to Login.jsx / Register.jsx / AuthContext.jsx.
 *
 * `verify_jwt = false` is set for this function in supabase/config.toml, so the
 * gateway does not reject the app's own tokens before this code runs.
 */
import { SignJWT, jwtVerify } from "https://esm.sh/jose@5.9.6";
// bcryptjs is CommonJS: esm.sh exposes no named exports for it, so it must be
// imported as the default and called as bcrypt.hash / bcrypt.compare.
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { db, TABLES } from "./db.ts";
import { json } from "./cors.ts";

const JWT_SECRET = Deno.env.get("JWT_SECRET") || "";
const JWT_EXPIRES_IN = Deno.env.get("JWT_EXPIRES_IN") || "7d";
const secretKey = new TextEncoder().encode(JWT_SECRET);

/** Same token payload as jwt.sign({ id }, JWT_SECRET, { expiresIn }). */
export async function signToken(id: string): Promise<string> {
  return await new SignJWT({ id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(secretKey);
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const matchPassword = (plain: string, hashed: string) => bcrypt.compare(plain, hashed);

export type AuthedUser = Record<string, unknown>;

type ProtectResult = { user: AuthedUser; error: null } | { user: null; error: Response };

/**
 * Reproduces `protect`: same 401 messages, same lookup order. Never returns
 * password_hash to callers unless they ask for it (login does, for the compare).
 */
export async function protect(
  req: Request,
  { withPassword = false }: { withPassword?: boolean } = {},
): Promise<ProtectResult> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return { user: null, error: json({ message: "Not authorised — no token provided" }, 401) };
  }

  let decoded: { id?: string };
  try {
    decoded = (await jwtVerify(token, secretKey)).payload as { id?: string };
  } catch (err) {
    console.error(`[auth] token verify failed: ${(err as Error).message}`);
    return { user: null, error: json({ message: "Session expired — sign in again" }, 401) };
  }

  const cols = withPassword
    ? "*"
    : "id,name,email,role,institution,department,year,subjects,learning_style,daily_target_minutes,streak,last_active_date,study_minutes,assessment_level,assessment_strengths,assessment_weaknesses,assessment_completed_at,created_at,updated_at";

  const { data, error } = await db
    .from(TABLES.users)
    .select(cols)
    .eq("id", decoded.id)
    .maybeSingle();

  if (error) {
    console.error(`[auth] user lookup failed: ${error.message}`);
    return { user: null, error: json({ message: "Session expired — sign in again" }, 401) };
  }
  if (!data) {
    return { user: null, error: json({ message: "Account no longer exists" }, 401) };
  }
  return { user: data as AuthedUser, error: null };
}
