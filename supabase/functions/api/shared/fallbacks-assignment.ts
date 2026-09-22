/**
 * Deterministic assignment fallbacks, ported verbatim from
 * server/src/routes/assignments.js so an unreachable provider degrades to the
 * same content the Express server produced.
 */

/** Deterministic template used when no AI key is configured. */
export function fallbackAssignment(
  brief: string,
  type: string,
  subject: string,
  difficulty: string,
): string {
  return `## Brief

You have been asked to work on **${brief}** as part of your ${subject} coursework. Treat this as a ${difficulty.toLowerCase()}-level ${type.replace("-", " ")} and assume your reader knows the subject but not your solution.

## Learning objectives

- Explain the core ideas behind ${brief} in your own words
- Apply those ideas to a problem you have not seen worked out
- Justify the trade-offs in the approach you chose
- Communicate the result clearly enough for a peer to reproduce it

## Tasks

1. **Summarise** the key concepts in ${brief} in under 200 words, without copying a definition.
2. **Work through** one concrete example end to end, showing every intermediate step.
3. **Extend** the example to a harder case and explain what breaks and why.
4. **Compare** your approach with one alternative, and say when each is the better choice.

## Deliverables

- A written report (800-1200 words) or a documented source file
- Your worked example with all steps visible
- A short reflection on what you found hardest

## Marking scheme

| Criterion | Marks |
|---|---|
| Correctness of the core concept | 30 |
| Quality of the worked example | 25 |
| Handling of the extended case | 20 |
| Comparison and justification | 15 |
| Clarity and presentation | 10 |
| **Total** | **100** |

## Hints

- Start with the simplest case that is still interesting, then add complexity one step at a time.
- If you cannot explain a step to a classmate in one sentence, you have not understood it yet — go back to that step before moving on.

*Generated offline by EduMind. Add an AI provider key on the server for assignments written specifically to your brief.*`;
}

/** Deterministic fallback grading -- deliberately does NOT pretend to assess
 *  correctness (it can't); it's an honest effort-based estimate, clearly
 *  labelled as such, rather than a fabricated content review. */
export function fallbackGrading(submissionText: string) {
  const words = submissionText.trim().split(/\s+/).filter(Boolean).length;
  const score = Math.max(40, Math.min(75, Math.round(40 + words / 15)));
  return {
    score,
    feedback: `This is a rough, length-based estimate only (${words} words) — the AI provider is unavailable right now, so this isn't a real review of what you wrote. Ask for a re-grade once an AI key is configured on the server.`,
    strengths: words > 150 ? ["Submission is a reasonable length for this brief"] : [],
    improvements: ["Get this re-graded once AI grading is available — this score doesn't reflect correctness"],
  };
}
