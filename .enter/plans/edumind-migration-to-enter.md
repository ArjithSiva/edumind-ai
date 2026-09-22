# EduMind AI → Enter Cloud migration (Plan A)

## Context

EduMind AI currently runs as three separate services (Vercel client, Render/Express
server, MongoDB Atlas). For the hackathon submission it must run entirely on Enter,
with Enter Cloud replacing MongoDB Atlas, Qwen (via Groq) unchanged as the AI engine,
and the existing React client kept as-is. This plan audits the uploaded codebase and
Enter Cloud's actual capabilities, then lays out a surgical port: one backend function
reproducing the Express router, a Postgres schema mirroring the Mongoose models, and
the client's `api.js` repointed at the new endpoint — no UI rewrite, no route renames,
no behavior changes.

The full source was read: all 9 route files, `models/index.js`, `services/ai.js`,
`services/prompts.js`, `services/resources.js`, `seed/dataset.js` + `seed.js`,
`middleware/`, `config/db.js`, and the client's `api.js`, `App.jsx`, `AuthContext.jsx`,
`ThemeContext.jsx`, every page, `vercel.json`/`vite.config.js`. The grep audit for
`api.<method>(` and `_id` usage in the client matched the brief's counts exactly (27
`_id` reads across `Progress`, `Planner`, `Assignments`, `Doubts`, `Quiz` — confirmed).

## §3 — Verification answers

1. **Runtime / imports.** Enter Cloud backend functions run on Deno (`Deno.serve`).
   Third-party packages must be imported from **esm.sh**, not bare `npm:` specifiers
   (this is Enter's stated convention, not just Deno's own npm compat) — e.g.
   `import { compare, hash } from "https://esm.sh/bcryptjs@2.4.3"` and
   `import { SignJWT, jwtVerify } from "https://esm.sh/jose@5.9.6"`. Both packages
   are available this way, so `bcryptjs` + `jose` work as intended.
2. **Max execution time.** Not published in Enter's own docs. Enter Cloud's backend
   functions are built on the same Deno-edge-function model as Supabase (confirmed by
   this project's own system instructions: "self-hosted Supabase instance"). Supabase's
   published limits are **150s wall-clock on free / 400s on paid**, with only **2s of
   active CPU time** counted per request (time spent waiting on an outbound `fetch`,
   like the Groq call, does not count against CPU time). Our AI calls already have a
   30s internal timeout, well inside either wall-clock budget. Treat this as a
   reasonable, but unverified-for-Enter-specifically, assumption — confirmed empirically
   in Phase 4 by running a real quiz/tutor/planner request end-to-end and checking it
   doesn't hit a platform timeout.
3. **Service-role DB access + secrets.** Yes. A backend function creates a Supabase
   client with the service-role key, which bypasses RLS by design — this is how the
   function will read/write every table while every table's RLS stays "on, no
   anon/authenticated policies." Secrets (including `SUPABASE_URL` /
   `SUPABASE_SERVICE_ROLE_KEY`, which Enter Cloud auto-injects into every function) are
   read with `Deno.env.get()`. To verify: confirm those two are present without needing
   `supabase_add_secret` once the function is deployed in Phase 3.
4. **Long-running Express host.** Not supported. Enter Cloud's documented backend
   surface is backend (edge) functions only — there is no persistent Node/container
   hosting tier in Enter's own product documentation. **Plan A is used, not Plan B.**
5. **Deep-link SPA fallback.** Verified live: hitting an arbitrary unregistered path
   on this project's current preview renders the app's own React "not found" UI, not a
   bare server 404 — meaning the host serves `index.html` for every path and
   client-side routing takes over. `/quiz`, `/planner`, etc. will survive a hard
   refresh once they're registered as routes.
6. **CORS / origins.** Enter Cloud's own documented pattern for every backend function
   is `Access-Control-Allow-Origin: '*'` plus an explicit `Access-Control-Allow-Headers`
   allow-list. Using `*` sidesteps needing to enumerate preview/published/custom-domain
   origins at all; `authorization, content-type, x-ai-model` will be the allowed
   headers (the client never sends `x-client-info`/`apikey` since it isn't using the
   Supabase SDK to call this function).

## Key design decisions (deviations from generic Enter convention, all in service of "keep the client unchanged")

- **`verify_jwt = false` on the function**, with the function doing its own JWT check
  (via `jose` + the app's own `JWT_SECRET`) inside the code — because this app's auth
  is a custom bcrypt+JWT scheme, not Supabase Auth. A Supabase-gateway JWT check would
  reject every real request before our code even ran. This exactly reproduces today's
  `protect()` middleware.
- **The client calls the function's plain HTTPS URL with axios**, not
  `supabase.functions.invoke()`. Enter's normal guidance is to always go through the
  Supabase client; that guidance assumes a single-purpose function called with one JSON
  body. This app needs a full REST router (9 resources, GET/POST/PATCH/DELETE, path
  params) behind stable `/api/...` paths that 27+ existing call sites already use —
  reproducing that through `functions.invoke` would mean rewriting every page. Calling
  the function's own URL directly with axios is the only way to satisfy "same paths,
  same methods, client unchanged." CORS is still handled explicitly in the function, so
  this is safe.
- **Aggregations computed in TypeScript, not SQL views/RPC.** Backend functions may not
  run raw SQL. Mongoose's `$group/$avg` (weak-topic averages, subject averages, etc.)
  are replicated by fetching a user's `attempts` rows with the supabase-js query builder
  and reducing them in code — correct at this app's scale (a few dozen attempts per
  user) and avoids adding SQL functions via migration for something this small.
- **Seeding runs from the agent's own tools (`supabase_insert`/`supabase_migration`),
  not from an HTTP seed endpoint.** This is safer than the brief's `SEED_TOKEN`-gated
  endpoint idea — there's no public seed route to protect or remember to disable, so
  `SEED_TOKEN` is dropped from the secrets list. Demo passwords are hashed once with
  bcrypt in the sandbox and inserted as literal hashes.
- **The doubt view-count increment** (`$inc views`) becomes a plain read-then-update
  (no raw SQL, no RPC) — acceptable given this app's concurrency profile.

## Schema (Postgres, `uuid` PKs via `gen_random_uuid()`, `timestamptz`, snake_case, RLS on/no policies)

| Table | Key columns | Notes |
|---|---|---|
| `users` | `password_hash` (never selected in any response), `email` unique, `subjects text[]`, `learning_style`, `daily_target_minutes`, `streak`, `last_active_date`, `study_minutes`, `assessment_level`, `assessment_strengths text[]`, `assessment_weaknesses text[]`, `assessment_completed_at` | serializer nests the last 4 into `assessment: {...}` only when `assessment_completed_at` is set |
| `chat_messages` | `user_id`, `session_id`, `role`, `content`, `topic`, `resources jsonb` | index `(user_id, session_id, created_at)` |
| `quizzes` | `user_id` nullable (null = public bank), `topic`, `subject`, `difficulty`, `questions jsonb`, `source` | `answer_index` inside `questions` is stripped by the serializer for every client-facing read |
| `attempts` | `user_id`, `quiz_id`, `answers int[]`, `score`, `total`, `percentage`, `duration_seconds`, `topic`, `subject` | |
| `goals` | `user_id`, `title`, `target_date`, `progress`, `status` | |
| `tasks` | `user_id`, `priority` (1–3), `auto_scheduled`, `completed_at`, `resources jsonb` | |
| `assignments` | `user_id`, `content`, `submission jsonb` | |
| `doubts` | `user_id`, `tags text[]`, `views` | |
| `doubt_answers` | `doubt_id`, `author_id` nullable, `author_name` default `'EduMind AI'`, `is_ai`, `upvotes`, `resources jsonb` | serializer nests these under each doubt's `answers[]` |
| `career_plans` | `user_id`, `interests text[]`, `strengths text[]`, `recommendations jsonb` | |

Every table: `index (user_id)` where applicable, RLS enabled, zero anon/authenticated
policies — all access goes through the function's service-role client, scoped by
`user_id` in every query.

One shared serializer helper per table converts `id`→`_id` (string), snake_case→
camelCase, and timestamps to ISO strings, so **no client page needs a data-shape edit**.

## Route porting (1:1, same paths/methods/JSON — reproduced inside one function's router)

`auth` (register/login/me), `tutor` (sessions, ask), `quiz` (suggest-topic, generate,
bank, :id, :id/submit, history/all), `planner` (goals, tasks, generate), `progress`
(summary, activity), `career` (generate), `assignments` (suggest-topic, generate,
:id/submit), `doubts` (list, :id, answers, upvote, resolve), `assessment`
(start/answer) — all ported from the corresponding `server/src/routes/*.js`, plus
`GET /api/health` and `GET /api/health/ai-check`. `services/ai.js`, `prompts.js`,
`resources.js` are copied nearly verbatim (pure JS/fetch, no Mongoose) into the
function; only their imports change.

Rate limiting: a small `rate_limit_hits` table (`bucket_key text`, `created_at`),
counted with `.select(..., { count: 'exact', head: true })` over a time window —
auth 40/15min, AI routes 20/min bucketed by `(ip, model)`, ai-check 5/min, matching the
brief. The 20s ai-check cache stays as an in-memory `Map` inside the function (fine
since a single invocation's warm instance can serve a few repeated calls; a cold
instance just re-checks, which is harmless).

## Frontend changes (minimal)

- Copy `client/src/{pages,components,context}` and `styles.css` into this project's
  `src/` largely unchanged (they're plain React + CSS, no Tailwind/shadcn dependency).
- `src/router.tsx`: replace the placeholder route array with EduMind's real routes
  (login, register, onboarding, and the 9-screen layout), preserving the
  `RequireAuth`/`RedirectIfAuthed` guards from the original `App.jsx`. Keep exporting
  `routers` / `window.__routers__` since the platform's own tooling (preview URL
  switcher) depends on that convention.
- `src/App.tsx`: keep `QueryClientProvider`/`TooltipProvider`/`Toaster` (harmless,
  already there), add `ThemeProvider`/`AuthProvider` around `RouterProvider`.
- `src/main.tsx`: swap in `styles.css` alongside the existing `index.css` (Tailwind's
  reset stays; verified visually per screen in Phase 5, patched narrowly only if a
  conflict actually shows up — no redesign).
- `client/src/api.js`: baseURL becomes the deployed function's URL (read from the
  generated `src/integrations/supabase/client.ts` constant, not a `VITE_*` env var);
  everything else (interceptors, `X-AI-Model` header, `errMsg`) stays. Update the
  `errMsg` copy that mentions Render sleeping/`VITE_API_URL`.
- Add `axios` as a dependency (not currently in this project).
- Delete: `client/vercel.json`, `server/render.yaml`, both `Dockerfile`s, and this
  project's now-orphaned placeholder `src/pages/Index.tsx` / `NotFound.tsx` / `App.css`
  (superseded by the real app, not used by the new routes).
- Rewrite only the README sections that describe Vercel/Render/Atlas deployment steps.

## Secrets to create (you enter the values; exact names)

`JWT_SECRET`, `JWT_EXPIRES_IN` (`7d`), `AI_PROVIDER` (`groq`), `GROQ_API_KEY`,
`GROQ_MODEL` (`qwen/qwen3.8-27b`). `SEED_TOKEN` is **not** needed (see design decisions
above). `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are expected to already be
auto-injected by Enter Cloud — confirmed, not requested, in Phase 3.

## Build phases (checkpoint after each)

1. Enable Enter Cloud; create schema + RLS; show table list.
2. Seed demo data via agent tools (3 users w/ bcrypt hash, quiz bank, primary user's
   goals/tasks/attempts/doubts/assignments); confirm row counts.
3. Function skeleton: CORS, `/health`, `/health/ai-check`, auth (register/login/me),
   rate limiter, JWT verify — deploy, smoke-test with curl-equivalent calls.
4. Port remaining routes in order: progress → planner → quiz → tutor → doubts →
   assignments → career → assessment, smoke-testing each against the live function.
5. Swap client base URL, fix `errMsg` copy, delete leftover files, update README.
6. Full verification against §10 of the original brief.

## Implementation checklist

- [ ] `users`, `chat_messages`, `quizzes`, `attempts`, `goals`, `tasks`, `assignments`,
      `doubts`, `doubt_answers`, `career_plans`, `rate_limit_hits` created with RLS on,
      no anon/authenticated policies, indexes as specified.
- [ ] Seed data inserted via agent tools: 3 users (bcrypt-hashed `edumind123`), public
      quiz bank (6 topics), primary user's goals/tasks/attempts/doubts/assignments/chat
      history/career plan, matching `dataset.js` exactly.
- [ ] `supabase/functions/api/index.ts` created with `Deno.serve`, CORS (`*` origin,
      `authorization, content-type, x-ai-model` headers), `OPTIONS` short-circuit.
- [ ] `verify_jwt = false` set for the function in `supabase/config.toml`.
- [ ] In-function JWT sign/verify (`jose`) + bcrypt compare (`bcryptjs`) reproduce
      `middleware/auth.js` exactly (`protect`, `signToken`).
- [ ] Every route from `routes/*.js` ported with identical path, method, request body
      shape, and response JSON shape (via the per-table serializer emitting `_id`,
      camelCase, ISO dates).
- [ ] `answerIndex` is stripped from every quiz/question payload sent to the client
      (quiz `forClient`, assessment `forClientQuestion`); grading happens only inside
      the function using the service-role-read `answerIndex`.
- [ ] Every query is scoped by `user_id = <authenticated user>`, except the doubts feed
      (intentionally shared read, author-only write/delete — reproducing
      `routes/doubts.js` exactly).
- [ ] Quiz submit <60% creates a priority-1 `auto_scheduled` task exactly once (matches
      the `existing` check in `quiz.js`).
- [ ] `services/ai.js`, `prompts.js`, `resources.js` ported with `[ai]`-prefixed
      `console.error` fallback logging preserved on every path.
- [ ] `AVAILABLE_MODELS` stays exactly `qwen/qwen3.8-27b`, `openai/gpt-oss-120b`,
      `openai/gpt-oss-20b`; `X-AI-Model` header validated server-side against this list.
- [ ] Rate limiting via `rate_limit_hits`: auth 40/15min, AI routes 20/min per
      `(ip, model)`, ai-check 5/min with 20s cache.
- [ ] `client/src/api.js` baseURL points at the deployed function; `X-AI-Model`
      interceptor and 401 redirect logic unchanged; `errMsg` copy updated.
- [ ] `src/router.tsx` / `App.tsx` / `main.tsx` wire the ported pages with `styles.css`,
      preserving `RequireAuth`/`RedirectIfAuthed`, the sidebar streak card, and the
      centered `.view` layout — no new routes, no renamed routes.
- [ ] Vercel/Render/Docker leftovers and orphaned template placeholder files removed;
      README rewritten only where it describes the old deploy targets.

## Verification checklist (report passed / failed / could-not-test per item, with what was actually observed — no code-looks-right claims)

- [ ] `GET /api/health` → `status: ok`.
- [ ] `GET /api/health/ai-check` → `ok: true`, provider `groq`, a Qwen model id.
- [ ] Login as `sridhar@edumind.dev` / `edumind123` → Dashboard shows Recursion (40%)
      and SQL Joins (55%) as weak topics.
- [ ] Quiz on Recursion answered badly → <60% → priority-1 auto-scheduled task appears
      in Planner (marked *Auto*) and on Dashboard; Progress trend updates.
- [ ] Tutor, Quiz, Planner, Career, Doubts each return `source: "ai"` with a working key.
- [ ] Register a new account → lands on `/onboarding` → finish or skip works.
- [ ] Assignment: generate, submit typed text and a `.txt` upload, get AI feedback.
- [ ] Doubt forum: post → AI answer appears → add an answer → upvote.
- [ ] Fetch a quiz through the API → confirm no `answerIndex` anywhere in the response.
- [ ] Account A cannot read account B's tasks/attempts/assignments by id (expect 404,
      not another user's data).
- [ ] Hard refresh on `/quiz` renders the app (not a bare 404); dark mode toggles;
      network tab / bundle show no secret values.
- [ ] `desktop_1280` and `mobile_390` screenshots of Dashboard/Quiz taken post-port to
      confirm no visual regression from Tailwind's global reset interacting with
      `styles.css`.

## Known gaps carried over from the source app (not introduced by this migration)

No delete-submission endpoint for assignments; Assignments/Quiz have no "resources"
recommendations (Tutor/Planner/Career/Doubts do) — both are pre-existing, intentional
scope limits per `HEADSUP.md`, not something this migration changes.
