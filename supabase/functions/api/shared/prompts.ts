/**
 * Every prompt the app sends lives here, ported verbatim from
 * server/src/services/prompts.js so tone and behaviour are unchanged.
 *
 * `user` is the authenticated user row -- prompts are personalised with the
 * student's year, subjects and learning style, which is what makes this
 * "personalized learning" rather than a chat wrapper.
 */

export function learnerContext(
  user: Record<string, unknown>,
  extra: { weakTopics?: string[]; focusSubject?: string; focusTopic?: string } = {},
): string {
  const subjects = (user.subjects as string[]) || [];
  const bits = [
    `Year ${user.year} ${user.department} student at ${user.institution}`,
    `subjects: ${subjects.join(", ")}`,
    `prefers ${user.learning_style ?? user.learningStyle} explanations`,
  ];
  if (extra.weakTopics?.length) bits.push(`currently weak at: ${extra.weakTopics.join(", ")}`);
  if (extra.focusSubject) {
    bits.push(
      `has explicitly scoped this question to subject "${extra.focusSubject}"${
        extra.focusTopic ? `, topic "${extra.focusTopic}"` : ""
      } — answer strictly within that scope`,
    );
  }
  return bits.join("; ");
}

/** Cheap keyword match against a question/title -- reused so both the AI path
 *  and the offline path attach the same safe, curated resources. Returns null
 *  when nothing matches, so irrelevant messages get no resources block. */
export function detectTopicKeyword(text: unknown): string | null {
  const s = String(text || "").toLowerCase();
  if (/recurs|factorial|fibonacci|base case/.test(s)) return "recursion";
  if (/dynamic programming|\bdp\b|memoiz/.test(s)) return "dynamic programming";
  if (/\bgraph\b|\bbfs\b|\bdfs\b|dijkstra/.test(s)) return "graph";
  if (/\btree\b|binary tree|\bbst\b/.test(s)) return "tree";
  if (/stack|queue|deque/.test(s)) return "stack";
  if (/big-?o|complexity\b|asymptotic/.test(s)) return "big-o";
  if (/\bjoin\b|\bsql\b|dbms|inner join|left join|normalization/.test(s)) return "sql";
  if (/react|javascript|\bjs\b|\bhtml\b|\bcss\b|frontend|front-end|node\.?js/.test(s)) return "web development";
  if (/\bpython\b|django|flask|numpy|pandas/.test(s)) return "python";
  if (/operating system|\bos\b\W|process|thread|deadlock|scheduling algorithm|semaphore/.test(s)) return "operating systems";
  if (/network|\btcp\b|\budp\b|\bhttp\b|osi model|routing|subnet/.test(s)) return "networks";
  if (/machine learning|neural|regression|classification|\bml\b/.test(s)) return "machine learning";
  if (/aptitude|profit and loss|time and work|percentage problem/.test(s)) return "aptitude";
  if (/loop|for |while|iterat|range\(/.test(s)) return "loop";
  return null;
}

export const tutorSystem = (
  user: Record<string, unknown>,
  extra: { weakTopics?: string[]; focusSubject?: string; focusTopic?: string },
) => `
You are the AI Tutor inside EduMind AI, a personalized learning platform.
The learner is a ${learnerContext(user, extra)}.

Explain the concept in this order:
1. A one-line plain-English definition.
2. How it actually works, step by step.
3. One short runnable code example in a fenced block (use Python unless the question implies another language).
4. One sentence on the mistake students most often make with this.

Rules: keep it under 250 words, use markdown (**bold**, - bullets, fenced code
blocks), never use headings, and never apologise for being an AI. If the learner
is weak at a topic you touch, connect the explanation back to it. Do not add
your own links or resource list — the app attaches verified resources
separately based on the topic.
`.trim();

const RESOURCE_RULES =
  `Only set "url" when it is a stable, canonical link you are completely certain is correct (an official docs homepage, a LeetCode tag page such as https://leetcode.com/tag/recursion/, MDN, W3Schools) — otherwise set "url" to null and rely on "searchQuery" instead. Never invent a specific course, certificate, or article URL. "kind" must be one of: docs, tutorial, course, practice, video, article.`;

export const quizPrompt = (
  topic: string,
  difficulty: string,
  count: number,
  user: Record<string, unknown>,
) => `
Write ${count} multiple-choice questions on "${topic}" at ${difficulty} difficulty
for a ${learnerContext(user)}.

Return ONLY a JSON object of this exact shape, with no preamble and no markdown fences:
{"questions":[{"q":"question text","options":["a","b","c","d"],"answerIndex":0,"explanation":"one sentence on why that option is correct"}]}

Requirements:
- Exactly 4 options per question.
- answerIndex is the 0-based index of the correct option.
- Wrong options must be plausible misconceptions, not obviously silly.
- Where the topic is code, include a small snippet inside the question text.
`.trim();

export const gradingPrompt = (
  assignment: Record<string, unknown>,
  submissionText: string,
) => `
Grade a student's submission against this assignment's brief and marking scheme.

--- Assignment ---
${assignment.content}

--- Student's submission ---
${submissionText}
--- end submission ---

Return ONLY this JSON, no fences or preamble:
{"score":78,"feedback":"two to three sentences of overall, specific feedback","strengths":["...","..."],"improvements":["...","..."]}

score is 0-100, weighted the way the marking scheme above weights it. Be
honest and specific — cite what the submission actually did or missed, don't
inflate the score to be encouraging, and don't give a perfect score unless
the submission genuinely earns it.
`.trim();

export const suggestTopicPrompt = (
  user: Record<string, unknown>,
  weakTopics: string[],
  kind: string,
) => `
Suggest ONE specific, well-scoped ${kind} topic for a ${learnerContext(user, { weakTopics })}.

${
  weakTopics.length
    ? `They are weakest on: ${weakTopics.join(", ")}. Prefer one of these, phrased more specifically than the raw topic name — e.g. "SQL joins" becomes "SQL: writing correct multi-table JOIN queries".`
    : `No weak-topic data yet — pick something foundational and useful from their subjects: ${(user.subjects as string[]).join(", ")}.`
}

Return ONLY this JSON, no fences or preamble:
{"topic":"...","subject":"...","reason":"one short sentence on why this topic, tied to their data"}
`.trim();

export const plannerPrompt = (
  user: Record<string, unknown>,
  weakTopics: string[],
  days: number,
) => `
Build a ${days}-day study plan for a ${learnerContext(user, { weakTopics })}.
They can study about ${user.daily_target_minutes ?? user.dailyTargetMinutes} minutes a day.

Weak topics, hardest first: ${weakTopics.length ? weakTopics.join(", ") : "none recorded yet"}.

Put the weakest topics earliest and give them more time. Mix in one revision
block and one mixed-practice block.

Return ONLY this JSON, no fences or preamble:
{"tasks":[{"title":"...","subject":"...","topic":"...","dayOffset":0,"durationMinutes":45,"priority":1,"note":"one line on why this is scheduled here","resources":[{"name":"...","provider":"...","kind":"tutorial","url":null,"searchQuery":"..."}]}]}

dayOffset 0 means today. priority 1 is highest, 3 lowest. Only fill "resources"
(1-2 items) for tasks built around a weak topic — leave it as an empty array
for routine practice/revision blocks, so recommendations stay tied to what the
student actually struggles with. ${RESOURCE_RULES}
`.trim();

export const careerPrompt = (
  user: Record<string, unknown>,
  interests: string[],
  strengths: string[],
  perf: { subject: string; average: number }[],
) => `
Give career guidance to a ${learnerContext(user)}.
Stated interests: ${interests.join(", ") || "not specified"}.
Self-declared strengths: ${strengths.join(", ") || "not specified"}.
Measured quiz performance by subject: ${perf.map((p) => `${p.subject} ${p.average}%`).join(", ") || "no attempts yet"}.

Suggest 4 realistic roles for an Indian engineering graduate, grounded in the
performance data above rather than generic advice.

Return ONLY this JSON, no fences or preamble:
{"recommendations":[{"role":"...","match":85,"why":"two sentences tied to their actual data","skillsToLearn":["...","...","..."],"firstSteps":["...","...","..."],"resources":[{"name":"...","provider":"...","kind":"course","url":null,"searchQuery":"..."}],"certifications":[{"name":"...","provider":"Coursera|Microsoft|Meta|Google|AWS|IBM"}]}]}

match is 0-100. firstSteps must be things they can start this month. Fill
"resources" (2-3 items per role) with a mix of courses/certifications,
technologies to learn, practice-problem sets, or project ideas relevant to
that specific role. Fill "certifications" (1-2 items per role) with real,
well-known industry certifications from major platforms — Coursera, Microsoft,
Meta, Google, AWS, or IBM — naming the certification and which of those
providers it's from; never include a "url" for these, the app links to the
provider's real site itself. ${RESOURCE_RULES}
`.trim();

export const assignmentPrompt = (
  brief: string,
  type: string,
  subject: string,
  difficulty: string,
  user: Record<string, unknown>,
) => `
Create a ${difficulty} ${type} assignment on "${brief}" for the subject ${subject},
aimed at a ${learnerContext(user)}.

Write it in markdown with these sections:
- A one-paragraph scenario or brief
- Learning objectives (3-4 bullets)
- Tasks, numbered, increasing in difficulty
- Deliverables
- A marking scheme table with marks adding to 100
- Two hints that guide without giving answers

Return the markdown only. No preamble, no outer code fence.
`.trim();

export const doubtAnswerPrompt = (
  title: string,
  body: string,
  subject: string,
  user: Record<string, unknown>,
) => `
A student posted this doubt in the EduMind community forum.

Subject: ${subject}
Title: ${title}
Question: ${body}

Answer it directly and practically for a ${learnerContext(user)}. Under 200 words,
markdown, include a code example if it helps. If the question is ambiguous, answer
the most likely reading and say in one line what you assumed.
`.trim();
