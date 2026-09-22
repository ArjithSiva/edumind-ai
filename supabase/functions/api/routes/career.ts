/**
 * /api/career -- role recommendations. Ported from server/src/routes/career.js.
 */
import { json } from "../shared/cors.ts";
import { db, TABLES } from "../shared/db.ts";
import { protect } from "../shared/auth.ts";
import { subjectAverages } from "../shared/aggregate.ts";
import { serializeCareerPlan } from "../shared/serialize.ts";
import { aiConfigured, completeJSON, modelFromRequest } from "../shared/ai.ts";
import { careerPrompt } from "../shared/prompts.ts";
import { resourcesFor, sanitizeCertifications, sanitizeResources } from "../shared/resources.ts";
import { body, match, type RouteCtx, type RouteHandler } from "../shared/router.ts";


/** Seeded role library -- used when no AI key is configured. */
const ROLE_LIBRARY = [
  {
    role: "Backend Engineer",
    drivers: ["Python", "DBMS", "Data Structures"],
    why: "Your strongest measured subjects are the ones backend interviews test hardest: language fundamentals, data structures and database querying.",
    skillsToLearn: ["Node.js or Django REST APIs", "SQL query optimisation", "Docker basics", "System design fundamentals"],
    firstSteps: ["Build one CRUD API with auth and deploy it", "Solve 20 array and hashmap problems", "Write a README that explains your schema choices"],
    certifications: [
      { name: "AWS Certified Cloud Practitioner", provider: "AWS" },
      { name: "Meta Back-End Developer Professional Certificate", provider: "Meta" },
    ],
  },
  {
    role: "Full-Stack Developer",
    drivers: ["Web Development", "Python", "DBMS"],
    why: "You already ship working interfaces alongside server logic, which is the exact combination product teams hire for at entry level.",
    skillsToLearn: ["React state management", "REST and JWT auth patterns", "CI/CD with GitHub Actions", "Responsive CSS"],
    firstSteps: ["Ship one full-stack app to a real URL", "Add tests to an existing project", "Rebuild a product you use, badly, then improve it"],
    certifications: [
      { name: "Meta Front-End Developer Professional Certificate", provider: "Meta" },
      { name: "Microsoft Certified: Azure Fundamentals (AZ-900)", provider: "Microsoft" },
    ],
  },
  {
    role: "IoT / Embedded Systems Engineer",
    drivers: ["Python", "Data Structures"],
    why: "Your branch is CSE (IoT), and embedded roles reward exactly the low-level, constraint-aware thinking your coursework already covers.",
    skillsToLearn: ["Embedded C", "MQTT and edge protocols", "ESP32 / Raspberry Pi projects", "Sensor data pipelines"],
    firstSteps: ["Build a sensor-to-dashboard pipeline end to end", "Publish the wiring diagram and firmware", "Read one datasheet fully"],
    certifications: [
      { name: "Microsoft Certified: Azure Fundamentals (AZ-900)", provider: "Microsoft" },
      { name: "AWS Certified Cloud Practitioner", provider: "AWS" },
    ],
  },
  {
    role: "Data Analyst",
    drivers: ["DBMS", "Python"],
    why: "Analytics converts your SQL and Python work into business questions, and it is the shortest bridge from your current subjects to a paid role.",
    skillsToLearn: ["Pandas and NumPy", "Window functions in SQL", "Power BI or Tableau", "Statistics for A/B testing"],
    firstSteps: ["Clean one messy public dataset and publish the notebook", "Recreate a company dashboard from open data", "Write up one insight in plain English"],
    certifications: [
      { name: "Google Data Analytics Professional Certificate", provider: "Google" },
      { name: "IBM Data Analyst Professional Certificate", provider: "IBM" },
    ],
  },
  {
    role: "Machine Learning Engineer",
    drivers: ["Python", "Data Structures"],
    why: "Your Python scores are consistently your highest, which is the prerequisite most ML candidates are actually missing.",
    skillsToLearn: ["Linear algebra and probability", "scikit-learn then PyTorch", "Feature engineering", "Model deployment with FastAPI"],
    firstSteps: ["Train and deploy one model behind an API", "Reproduce a paper's baseline", "Learn to read a confusion matrix properly"],
    certifications: [
      { name: "Google AI Professional Certificate", provider: "Google" },
      { name: "IBM Data Science Professional Certificate", provider: "IBM" },
    ],
  },
];

function fallbackRecommendations(perf: { subject: string | null; average: number }[]): Row[] {
  const scoreOf = (s: string) => perf.find((p) => p.subject === s)?.average ?? 55;
  return ROLE_LIBRARY
    .map((r) => {
      const avg = r.drivers.reduce((a, d) => a + scoreOf(d), 0) / r.drivers.length;
      return {
        role: r.role,
        match: Math.round(Math.min(96, avg * 0.9 + 15)),
        why: r.why,
        skillsToLearn: r.skillsToLearn,
        firstSteps: r.firstSteps,
        resources: resourcesFor(r.skillsToLearn[0], r.drivers[0]),
        certifications: sanitizeCertifications(r.certifications),
      };
    })
    .sort((a, b) => (b.match as number) - (a.match as number))
    .slice(0, 4);
}

/** GET /api/career -- last saved plan. */
async function getPlan(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { data } = await db
    .from(TABLES.careerPlans).select("*").eq("user_id", user.id)
    .order("created_at", { ascending: false }).limit(1);
  const plan = ((data ?? []) as Row[])[0];
  return json({ plan: plan ? serializeCareerPlan(plan) : null });
}

/** POST /api/career/generate { interests: [], strengths: [] } */
async function generateCareer(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;

  const b = await body(ctx.req);
  const interests = (Array.isArray(b.interests) ? (b.interests as unknown[]) : []).map(String).slice(0, 8);
  const strengths = (Array.isArray(b.strengths) ? (b.strengths as unknown[]) : []).map(String).slice(0, 8);

  const perf = await subjectAverages(uid);

  let recommendations: Row[];
  let source = "ai";
  try {
    if (!aiConfigured()) throw new Error("no key");
    const data = (await completeJSON({
      prompt: careerPrompt(user, interests, strengths, perf as { subject: string; average: number }[]),
      model: modelFromRequest(ctx.req),
    })) as Row | Row[];
    const list = ((Array.isArray(data) ? data : data.recommendations) as Row[]) || [];
    recommendations = list
      .filter((r) => r?.role)
      .slice(0, 5)
      .map((r) => ({
        role: String(r.role),
        match: Math.min(100, Math.max(0, Number(r.match) || 70)),
        why: String(r.why || ""),
        skillsToLearn: ((r.skillsToLearn as unknown[]) || []).map(String).slice(0, 6),
        firstSteps: ((r.firstSteps as unknown[]) || []).map(String).slice(0, 5),
        resources: sanitizeResources(r.resources, { limit: 3 }),
        certifications: sanitizeCertifications(r.certifications, { limit: 3 }),
      }));
    if (!recommendations.length) throw new Error("empty");
  } catch (err) {
    console.error(`[career] falling back to rules-based recommendations for user ${uid}: ${(err as Error).message}`);
    source = "rules";
    recommendations = fallbackRecommendations(perf);
  }

  const { data: plan, error: insErr } = await db
    .from(TABLES.careerPlans)
    .insert({ user_id: uid, interests, strengths, recommendations })
    .select("*")
    .single();
  if (insErr) {
    console.error(`[career] insert failed for ${uid}: ${insErr.message}`);
    return json({ message: insErr.message }, 500);
  }
  return json({ plan: serializeCareerPlan(plan as Row), source, performance: perf }, 201);
}

const CAREER_ROUTES: Record<string, [string, RouteHandler][]> = {
  GET: [["", getPlan]],
  POST: [["generate", generateCareer]],
};

export async function handleCareer(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(CAREER_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}
