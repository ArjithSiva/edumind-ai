/**
 * /api/auth -- register, login, me. Ported from server/src/routes/auth.js.
 *
 * Custom auth is kept deliberately: email + bcrypt + our own JWT, so the
 * existing Login.jsx / Register.jsx / AuthContext.jsx and the seeded demo
 * passwords work with zero changes.
 */
import { json } from "../shared/cors.ts";
import { db, TABLES } from "../shared/db.ts";
import { hashPassword, matchPassword, protect, signToken } from "../shared/auth.ts";
import { shapeUser } from "../shared/serialize.ts";
import { body, match, type RouteCtx, type RouteHandler } from "../shared/router.ts";
type UserRow = Record<string, unknown>;

async function register(ctx: RouteCtx): Promise<Response> {
  const b = await body(ctx.req);
  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").toLowerCase().trim();
  const password = String(b.password ?? "");
  const department = b.department ? String(b.department) : undefined;
  const year = b.year !== undefined ? Number(b.year) : undefined;
  const subjects = Array.isArray(b.subjects) ? (b.subjects as unknown[]).map(String) : [];
  const learningStyle = b.learningStyle ? String(b.learningStyle) : undefined;

  if (!name || !email || !password) {
    return json({ message: "Name, email and password are all required" }, 400);
  }
  if (password.length < 6) {
    return json({ message: "Password must be at least 6 characters" }, 400);
  }

  const { data: existing } = await db.from(TABLES.users).select("id").eq("email", email).maybeSingle();
  if (existing) return json({ message: "That email is already registered" }, 409);

  const insert: Record<string, unknown> = { name, email, password_hash: await hashPassword(password) };
  if (department) insert.department = department;
  if (year !== undefined && Number.isFinite(year)) insert.year = year;
  if (subjects.length) insert.subjects = subjects;
  if (learningStyle) insert.learning_style = learningStyle;
  insert.last_active_date = new Date().toISOString();

  const { data: user, error } = await db.from(TABLES.users).insert(insert).select("*").single();
  if (error || !user) {
    console.error(`[auth] register insert failed: ${error?.message}`);
    // Mirrors the old duplicate-key path in middleware/error.js.
    if (error?.code === "23505") return json({ message: "That email is already registered" }, 409);
    return json({ message: error?.message || "Couldn't create your account" }, 500);
  }
  const u = user as UserRow;

  // Give every new account a starting plan so no screen is ever empty.
  const userSubjects = (u.subjects as string[]) ?? [];
  await db.from(TABLES.goals).insert({
    user_id: u.id,
    title: `Build a strong foundation in ${userSubjects[0] ?? "your subjects"}`,
    target_date: new Date(Date.now() + 60 * 864e5).toISOString(),
    progress: 5,
  });

  const starterTasks = userSubjects.slice(0, 3).map((s, i) => ({
    user_id: u.id,
    title: `Get started with ${s}`,
    subject: s,
    topic: "Fundamentals",
    scheduled_for: new Date(Date.now() + i * 864e5).toISOString(),
    duration_minutes: 45,
    priority: i + 1,
    note: "Starter task — take a quiz and EduMind will replan around your results",
  }));
  if (starterTasks.length) {
    const { error: taskErr } = await db.from(TABLES.tasks).insert(starterTasks);
    if (taskErr) console.error(`[auth] starter tasks failed for ${u.id}: ${taskErr.message}`);
  }

  return json({ token: await signToken(u.id as string), user: shapeUser(u) }, 201);
}

async function login(ctx: RouteCtx): Promise<Response> {
  const b = await body(ctx.req);
  const email = String(b.email ?? "").toLowerCase();
  const password = String(b.password ?? "");
  if (!email || !password) return json({ message: "Enter your email and password" }, 400);

  const { data } = await db.from(TABLES.users).select("*").eq("email", email).maybeSingle();
  const user = data as UserRow | null;
  if (!user || !(await matchPassword(password, String(user.password_hash)))) {
    return json({ message: "Email or password is incorrect" }, 401);
  }

  // Streak: consecutive calendar days with a login.
  const today = new Date().toDateString();
  const last = user.last_active_date ? new Date(user.last_active_date as string).toDateString() : null;
  if (last !== today) {
    const yesterday = new Date(Date.now() - 864e5).toDateString();
    const streak = last === yesterday ? Number(user.streak ?? 0) + 1 : 1;
    const { error } = await db
      .from(TABLES.users)
      .update({ streak, last_active_date: new Date().toISOString() })
      .eq("id", user.id);
    if (error) console.error(`[auth] streak update failed for ${user.id}: ${error.message}`);
    user.streak = streak;
  }

  return json({ token: await signToken(user.id as string), user: shapeUser(user) });
}

async function me(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  return json({ user: shapeUser(user) });
}

async function updateMe(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const b = await body(ctx.req);
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "department", "year", "subjects", "learningStyle", "dailyTargetMinutes"]) {
    if (b[k] === undefined) continue;
    if (k === "learningStyle") patch.learning_style = b[k];
    else if (k === "dailyTargetMinutes") patch.daily_target_minutes = Number(b[k]);
    else patch[k] = b[k];
  }

  if (Object.keys(patch).length) {
    const { data, error: upErr } = await db
      .from(TABLES.users)
      .update(patch)
      .eq("id", user.id)
      .select("*")
      .single();
    if (upErr) {
      console.error(`[auth] profile update failed for ${user.id}: ${upErr.message}`);
      return json({ message: upErr.message }, 400);
    }
    return json({ user: shapeUser(data as UserRow) });
  }
  return json({ user: shapeUser(user) });
}

const AUTH_ROUTES: Record<string, [string, RouteHandler][]> = {
  POST: [["register", register], ["login", login]],
  GET: [["me", me]],
  PUT: [["me", updateMe]],
};

export async function handleAuth(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(AUTH_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}
