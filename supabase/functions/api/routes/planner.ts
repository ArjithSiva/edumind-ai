/**
 * /api/planner -- goals, tasks, and the AI rebuild. Ported from
 * server/src/routes/planner.js.
 */
import { json } from "../shared/cors.ts";
import { db, TABLES } from "../shared/db.ts";
import { protect } from "../shared/auth.ts";
import { weakTopicsWithSubject } from "../shared/aggregate.ts";
import { serializeGoal, serializeTask } from "../shared/serialize.ts";
import { aiConfigured, completeJSON, modelFromRequest } from "../shared/ai.ts";
import { plannerPrompt } from "../shared/prompts.ts";
import { resourcesFor, sanitizeResources } from "../shared/resources.ts";
import { body, match, toInt, type RouteCtx, type RouteHandler } from "../shared/router.ts";


/** GET /api/planner -- goals + tasks + today's focus. */
async function getPlanner(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;

  const [goalsRes, tasksRes] = await Promise.all([
    db.from(TABLES.goals).select("*").eq("user_id", uid).order("created_at", { ascending: true }),
    db.from(TABLES.tasks).select("*").eq("user_id", uid)
      .order("priority", { ascending: true }).order("scheduled_for", { ascending: true }),
  ]);
  if (goalsRes.error) console.error(`[planner] goals failed: ${goalsRes.error.message}`);
  if (tasksRes.error) console.error(`[planner] tasks failed: ${tasksRes.error.message}`);

  const goals = ((goalsRes.data ?? []) as Row[]).map(serializeGoal);
  const tasks = ((tasksRes.data ?? []) as Row[]).map(serializeTask);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 864e5);

  const today = tasks.filter((t) => {
    if (t.completed) return false;
    const when = new Date(t.scheduledFor as string).getTime();
    return when >= startOfDay.getTime() && when < endOfDay.getTime();
  });
  const focus = today[0] || tasks.find((t) => !t.completed) || null;

  return json({ goals, tasks, today, focus, weakTopics: await weakTopicsWithSubject(uid) });
}

/** POST /api/planner/generate { days } -- AI rebuilds the plan around weak topics. */
async function generatePlan(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;

  const b = await body(ctx.req);
  const days = Math.min(Math.max(toInt(b.days, 7), 3), 14);
  const weak = await weakTopicsWithSubject(uid);
  const weakNames = weak.map((w) => `${w.topic} (${w.avg}%)`);
  const subjects = (user.subjects as string[]) ?? [];

  let tasks: Row[];
  let source = "ai";
  try {
    if (!aiConfigured()) throw new Error("no key");
    const data = (await completeJSON({
      prompt: plannerPrompt(user, weakNames, days),
      model: modelFromRequest(ctx.req),
    })) as Record<string, unknown> | Record<string, unknown>[];
    const list = (Array.isArray(data) ? data : data.tasks) as Row[] | undefined;

    tasks = (list || [])
      .filter((t) => t?.title)
      .slice(0, days * 2)
      .map((t) => {
        const label = String(t.topic || t.title);
        const isWeak = weak.some(
          (w) => w.topic && label.toLowerCase().includes(String(w.topic).toLowerCase()),
        );
        let resources = sanitizeResources(t.resources, { limit: 2 });
        // If this task is built around a weak topic but the model gave nothing
        // usable, top it up from the curated set rather than leaving it empty.
        if (isWeak && !resources.length) resources = resourcesFor(t.topic || t.title, t.subject);
        return {
          user_id: uid,
          title: String(t.title),
          subject: String(t.subject || subjects[0]),
          topic: label,
          scheduled_for: new Date(Date.now() + (Number(t.dayOffset) || 0) * 864e5).toISOString(),
          duration_minutes: Math.min(Math.max(Number(t.durationMinutes) || 45, 15), 180),
          priority: Math.min(Math.max(Number(t.priority) || 2, 1), 3),
          auto_scheduled: true,
          note: String(t.note || ""),
          resources,
        };
      });
    if (!tasks.length) throw new Error("empty plan");
  } catch (err) {
    console.error(`[planner] falling back to rules-based plan for user ${uid}: ${(err as Error).message}`);
    // Deterministic planner: weak topics first, then a pass over every subject.
    source = "rules";
    const queue = [
      ...weak.map((w) => ({
        title: `Revise ${w.topic}`, subject: w.subject, topic: w.topic, priority: 1,
        note: `Scheduled first — your average here is ${w.avg}%`,
        resources: resourcesFor(w.topic, w.subject),
      })),
      ...subjects.map((s) => ({
        title: `Practice ${s}`, subject: s, topic: s, priority: 2,
        note: "Regular practice block", resources: [] as Row[],
      })),
      {
        title: "Mixed practice: 10 MCQs across all subjects", subject: subjects[0],
        topic: "Revision", priority: 3, note: "Weekly mixed revision", resources: [] as Row[],
      },
    ].slice(0, days);

    tasks = queue.map((t, i) => ({
      ...t,
      user_id: uid,
      scheduled_for: new Date(Date.now() + i * 864e5).toISOString(),
      duration_minutes: (user.daily_target_minutes as number) || 45,
      auto_scheduled: true,
    }));
  }

  // Replace only the un-completed auto-scheduled tasks; keep manual and done ones.
  const { error: delErr } = await db
    .from(TABLES.tasks).delete()
    .eq("user_id", uid).eq("completed", false).eq("auto_scheduled", true);
  if (delErr) console.error(`[planner] replace delete failed for ${uid}: ${delErr.message}`);

  const { data: created, error: insErr } = await db.from(TABLES.tasks).insert(tasks).select("*");
  if (insErr) {
    console.error(`[planner] task insert failed for ${uid}: ${insErr.message}`);
    return json({ message: insErr.message }, 500);
  }

  return json(
    { tasks: ((created ?? []) as Row[]).map(serializeTask), source, weakTopics: weak },
    201,
  );
}

/** POST /api/planner/tasks */
async function createTask(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const b = await body(ctx.req);
  if (!b.title) return json({ message: "Give the task a title" }, 400);

  const { data, error: insErr } = await db
    .from(TABLES.tasks)
    .insert({
      user_id: user.id,
      title: b.title,
      subject: b.subject ?? null,
      topic: b.topic ?? null,
      scheduled_for: new Date((b.scheduledFor as string) || Date.now()).toISOString(),
      duration_minutes: Number(b.durationMinutes) || 45,
      priority: Number(b.priority) || 2,
    })
    .select("*")
    .single();
  if (insErr) {
    console.error(`[planner] create task failed: ${insErr.message}`);
    return json({ message: insErr.message }, 400);
  }
  return json({ task: serializeTask(data as Row) }, 201);
}

/** PATCH /api/planner/tasks/:id -- toggle done, edit fields. */
async function patchTask(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;

  const { data: existing } = await db
    .from(TABLES.tasks).select("*").eq("id", params.id).eq("user_id", uid).maybeSingle();
  if (!existing) return json({ message: "Task not found" }, 404);
  const task = existing as Row;

  const b = await body(ctx.req);
  const patch: Row = {};

  if (b.completed !== undefined) {
    const completed = Boolean(b.completed);
    patch.completed = completed;
    patch.completed_at = completed ? new Date().toISOString() : null;
    if (completed) {
      const { error: upErr } = await db
        .from(TABLES.users)
        .update({ study_minutes: Number(user.study_minutes ?? 0) + Number(task.duration_minutes ?? 0) })
        .eq("id", uid);
      if (upErr) console.error(`[planner] studyMinutes update failed for ${uid}: ${upErr.message}`);
    }
  }
  for (const k of ["title", "subject", "topic", "priority", "durationMinutes", "scheduledFor"]) {
    if (b[k] === undefined) continue;
    if (k === "durationMinutes") patch.duration_minutes = Number(b[k]);
    else if (k === "scheduledFor") patch.scheduled_for = new Date(b[k] as string).toISOString();
    else patch[k] = b[k];
  }

  const { data, error: upErr } = await db
    .from(TABLES.tasks).update(patch).eq("id", params.id).eq("user_id", uid).select("*").single();
  if (upErr) {
    console.error(`[planner] patch task failed: ${upErr.message}`);
    return json({ message: upErr.message }, 400);
  }
  return json({ task: serializeTask(data as Row) });
}

async function deleteTask(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { data, error: delErr } = await db
    .from(TABLES.tasks).delete().eq("id", params.id).eq("user_id", user.id).select("id");
  if (delErr) console.error(`[planner] delete task failed: ${delErr.message}`);
  if (!data?.length) return json({ message: "Task not found" }, 404);
  return json({ message: "Task removed" });
}

/* ------------------------------------------------------------------ goals */

async function createGoal(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const b = await body(ctx.req);
  if (!b.title) return json({ message: "Give the goal a title" }, 400);

  const { data, error: insErr } = await db
    .from(TABLES.goals)
    .insert({
      user_id: user.id,
      title: b.title,
      target_date: b.targetDate ? new Date(b.targetDate as string).toISOString() : null,
    })
    .select("*")
    .single();
  if (insErr) {
    console.error(`[planner] create goal failed: ${insErr.message}`);
    return json({ message: insErr.message }, 400);
  }
  return json({ goal: serializeGoal(data as Row) }, 201);
}

async function patchGoal(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { data: existing } = await db
    .from(TABLES.goals).select("id").eq("id", params.id).eq("user_id", user.id).maybeSingle();
  if (!existing) return json({ message: "Goal not found" }, 404);

  const b = await body(ctx.req);
  const patch: Row = {};
  if (b.title !== undefined) patch.title = b.title;
  if (b.targetDate !== undefined) patch.target_date = new Date(b.targetDate as string).toISOString();
  if (b.progress !== undefined) patch.progress = Number(b.progress);
  if (b.status !== undefined) patch.status = b.status;

  const { data, error: upErr } = await db
    .from(TABLES.goals).update(patch).eq("id", params.id).eq("user_id", user.id).select("*").single();
  if (upErr) {
    console.error(`[planner] patch goal failed: ${upErr.message}`);
    return json({ message: upErr.message }, 400);
  }
  return json({ goal: serializeGoal(data as Row) });
}

async function deleteGoal(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const { error: delErr } = await db
    .from(TABLES.goals).delete().eq("id", params.id).eq("user_id", user.id);
  if (delErr) console.error(`[planner] delete goal failed: ${delErr.message}`);
  return json({ message: "Goal removed" });
}

const PLANNER_ROUTES: Record<string, [string, RouteHandler][]> = {
  GET: [["", getPlanner]],
  POST: [["generate", generatePlan], ["tasks", createTask], ["goals", createGoal]],
  PATCH: [["tasks/:id", patchTask], ["goals/:id", patchGoal]],
  DELETE: [["tasks/:id", deleteTask], ["goals/:id", deleteGoal]],
};

export async function handlePlanner(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(PLANNER_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}
