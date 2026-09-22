/**
 * Deterministic tutor answers, ported verbatim from the TUTOR_FALLBACK block in
 * server/src/services/prompts.js. Used whenever the AI provider is unreachable,
 * so the demo never breaks.
 */
import { detectTopicKeyword } from "./prompts.ts";

export const TUTOR_FALLBACK: Record<string, string> = {
  recursion: `**Recursion** is when a function solves a problem by calling itself on a smaller version of the same problem.

Every recursive function needs two parts:
- a **base case** — the smallest input, where it stops calling itself
- a **recursive case** — where it calls itself on something smaller

\`\`\`python
def factorial(n):
    if n <= 1:                    # base case — stop here
        return 1
    return n * factorial(n - 1)   # recursive case

print(factorial(5))               # 120
\`\`\`

Each call waits on the call stack until the base case returns, then the answers multiply back up.

The mistake students make most: forgetting the base case, or writing one the input never reaches — which gives you infinite recursion and a \`RecursionError\`.`,

  loop: `A **for loop** repeats a block of code once for every item in a sequence.

\`\`\`python
for fruit in ["apple", "banana", "cherry"]:
    print(fruit)

for i in range(3):        # 0, 1, 2
    print(i)
\`\`\`

\`range(n)\` gives numbers from 0 up to but **not including** n — that off-by-one is the single most common mistake with loops.`,

  stack: `A **stack** is last-in-first-out; a **queue** is first-in-first-out.

- **Stack** — like plates piled up. Add and remove from the same end. Used for undo, browser back, and the function call stack.
- **Queue** — like a line at a counter. Add at the back, remove from the front. Used for task scheduling and BFS.

\`\`\`python
stack = []
stack.append(1); stack.append(2)
print(stack.pop())        # 2 — last in, first out

from collections import deque
queue = deque([1, 2])
print(queue.popleft())    # 1 — first in, first out
\`\`\`

Avoid \`list.pop(0)\` as a queue — it's O(n) because every element shifts. Use \`deque\`.`,

  bigo: `**Big-O notation** describes how an algorithm's work grows as the input grows — not how many seconds it takes.

- **O(1)** — same work regardless of size (dict lookup)
- **O(log n)** — halving each step (binary search)
- **O(n)** — one pass over the input
- **O(n²)** — nested loops over the same list

\`\`\`python
def has_duplicate(nums):      # O(n) — one pass
    seen = set()
    for n in nums:
        if n in seen:
            return True
        seen.add(n)
    return False
\`\`\`

The mistake students make: quoting the best case. Big-O describes the **worst case** unless you say otherwise.`,

  join: `A **SQL join** combines rows from two tables using a matching column.

- **INNER JOIN** — only rows that match in both tables
- **LEFT JOIN** — every row from the left table, plus matches from the right (\`NULL\` where there's no match)

\`\`\`sql
SELECT s.name, m.marks
FROM students s
LEFT JOIN marks m ON s.id = m.student_id;
\`\`\`

With \`LEFT JOIN\` a student who has no marks row still appears, with \`NULL\` marks. With \`INNER JOIN\` they vanish from the result — which is exactly the bug students hit when a count comes out lower than expected.`,

  _default: `Here's the short version.

Break the idea into three questions: **what is it**, **how does it work step by step**, and **when would I actually use it**. Answering those three in order is usually enough to make a concept stick.

\`\`\`python
# Try it, don't just read it — small examples beat long notes
for i in range(3):
    print("iteration", i)
\`\`\`

This is EduMind's offline response. Add an AI provider key on the server to get a full explanation on this exact topic.`,
};

export function fallbackTutorAnswer(question: unknown): string {
  const key = detectTopicKeyword(question);
  const map: Record<string, string> = {
    recursion: "recursion",
    loop: "loop",
    stack: "stack",
    "big-o": "bigo",
    sql: "join",
  };
  return TUTOR_FALLBACK[map[key as string]] || TUTOR_FALLBACK._default;
}
