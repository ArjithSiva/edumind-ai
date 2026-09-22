/**
 * Resource recommendations, ported verbatim from server/src/services/resources.js.
 *
 * Two safety rules, because a model asked for "a course link" will occasionally
 * invent one that looks plausible and doesn't exist:
 *   1. sanitizeResources only keeps a `url` when its hostname is on
 *      TRUSTED_HOSTS. Everything else keeps the resource (name + provider) but
 *      drops the url, so the frontend renders it as a search prompt.
 *   2. STATIC_RESOURCES is a curated set used when there's no AI, or when the
 *      AI returns nothing usable -- never a fabricated one.
 */

const TRUSTED_HOSTS = new Set([
  "leetcode.com",
  "developer.mozilla.org",
  "docs.python.org",
  "www.w3schools.com",
  "react.dev",
  "geeksforgeeks.org",
  "www.geeksforgeeks.org",
  "www.freecodecamp.org",
  "docs.oracle.com",
  "nodejs.org",
  "expressjs.com",
  "git-scm.com",
  "www.postgresql.org",
  "www.mongodb.com",
  "en.wikipedia.org",
  "www.w3.org",
  "www.coursera.org",
  "coursera.org",
  "learn.microsoft.com",
  "grow.google",
  "aws.amazon.com",
]);

const KINDS = new Set(["docs", "tutorial", "course", "practice", "video", "article"]);

function safeUrl(url: unknown): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return TRUSTED_HOSTS.has(u.hostname) ? url : null;
  } catch {
    return null;
  }
}

/** Cleans a model-supplied resource list into a safe, consistent shape. */
export function sanitizeResources(list: unknown, { limit = 4 } = {}): Record<string, unknown>[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && (r as Record<string, unknown>).name)
    .slice(0, limit)
    .map((r) => {
      const x = r as Record<string, unknown>;
      return {
        name: String(x.name).slice(0, 80),
        provider: x.provider ? String(x.provider).slice(0, 60) : "",
        kind: KINDS.has(x.kind as string) ? x.kind : "article",
        url: safeUrl(x.url),
        searchQuery: x.searchQuery
          ? String(x.searchQuery).slice(0, 120)
          : `${x.name} ${x.provider || ""}`.trim(),
      };
    });
}

/** Verified, stable top-level landing pages -- never a specific course page. */
const CERT_PLATFORM_HOMEPAGE = [
  { match: /meta/i, url: "https://www.coursera.org/meta" },
  { match: /microsoft/i, url: "https://learn.microsoft.com/en-us/credentials/" },
  { match: /google/i, url: "https://grow.google/certificates/" },
  { match: /aws|amazon/i, url: "https://aws.amazon.com/certification/" },
  { match: /ibm|coursera/i, url: "https://www.coursera.org/" },
];

function certHomepage(provider: unknown): string | null {
  const hit = CERT_PLATFORM_HOMEPAGE.find((p) => p.match.test(String(provider || "")));
  return hit ? hit.url : null;
}

/** Same shape as sanitizeResources, but the url is never taken from the model. */
export function sanitizeCertifications(list: unknown, { limit = 3 } = {}): Record<string, unknown>[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && (r as Record<string, unknown>).name)
    .slice(0, limit)
    .map((r) => {
      const x = r as Record<string, unknown>;
      return {
        name: String(x.name).slice(0, 90),
        provider: x.provider ? String(x.provider).slice(0, 40) : "",
        kind: "course",
        url: certHomepage(x.provider),
        searchQuery: `${x.name} ${x.provider || ""} certification`.trim(),
      };
    });
}

/** Curated, hand-verified -- used for fallback mode and as a topic top-up. */
const STATIC_RESOURCES: Record<string, Record<string, unknown>[]> = {
  recursion: [
    { name: "Recursion", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/recursion/", searchQuery: "leetcode recursion problems" },
    { name: "Recursion in Python", provider: "GeeksforGeeks", kind: "tutorial", url: "https://www.geeksforgeeks.org/", searchQuery: "geeksforgeeks recursion in python" },
  ],
  sql: [
    { name: "SQL Joins", provider: "W3Schools", kind: "docs", url: "https://www.w3schools.com/sql/sql_join.asp", searchQuery: "w3schools sql joins" },
    { name: "Database", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/database/", searchQuery: "leetcode database problems" },
  ],
  join: [
    { name: "SQL Joins", provider: "W3Schools", kind: "docs", url: "https://www.w3schools.com/sql/sql_join.asp", searchQuery: "w3schools sql joins" },
  ],
  dbms: [
    { name: "SQL Tutorial", provider: "W3Schools", kind: "docs", url: "https://www.w3schools.com/sql/", searchQuery: "w3schools sql tutorial" },
    { name: "Database", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/database/", searchQuery: "leetcode database problems" },
  ],
  "data structures": [
    { name: "Data Structures", provider: "GeeksforGeeks", kind: "tutorial", url: "https://www.geeksforgeeks.org/", searchQuery: "geeksforgeeks data structures" },
    { name: "Array & Hashing", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/array/", searchQuery: "leetcode array problems" },
  ],
  stack: [{ name: "Stack", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/stack/", searchQuery: "leetcode stack problems" }],
  queue: [{ name: "Queue", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/queue/", searchQuery: "leetcode queue problems" }],
  tree: [{ name: "Binary Tree", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/binary-tree/", searchQuery: "leetcode binary tree problems" }],
  graph: [{ name: "Graph", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/graph/", searchQuery: "leetcode graph problems" }],
  "dynamic programming": [{ name: "Dynamic Programming", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/dynamic-programming/", searchQuery: "leetcode dynamic programming problems" }],
  "big-o": [{ name: "Big-O Cheat Sheet", provider: "GeeksforGeeks", kind: "article", url: "https://www.geeksforgeeks.org/", searchQuery: "geeksforgeeks big o notation" }],
  python: [
    { name: "Python Docs", provider: "python.org", kind: "docs", url: "https://docs.python.org/3/", searchQuery: "python official documentation" },
    { name: "Python Practice", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/", searchQuery: "leetcode python problems" },
  ],
  "web development": [
    { name: "JavaScript", provider: "MDN", kind: "docs", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript", searchQuery: "MDN javascript guide" },
    { name: "React", provider: "react.dev", kind: "docs", url: "https://react.dev/", searchQuery: "react official docs" },
    { name: "Responsive Web Design", provider: "freeCodeCamp", kind: "course", url: "https://www.freecodecamp.org/", searchQuery: "freecodecamp responsive web design" },
  ],
  "operating systems": [{ name: "Operating Systems", provider: "GeeksforGeeks", kind: "tutorial", url: "https://www.geeksforgeeks.org/", searchQuery: "geeksforgeeks operating systems notes" }],
  networks: [{ name: "Computer Networks", provider: "GeeksforGeeks", kind: "tutorial", url: "https://www.geeksforgeeks.org/", searchQuery: "geeksforgeeks computer networks notes" }],
  "machine learning": [{ name: "Machine Learning", provider: "GeeksforGeeks", kind: "tutorial", url: "https://www.geeksforgeeks.org/", searchQuery: "geeksforgeeks machine learning basics" }],
  aptitude: [{ name: "Quantitative Aptitude", provider: "GeeksforGeeks", kind: "practice", url: "https://www.geeksforgeeks.org/", searchQuery: "geeksforgeeks quantitative aptitude" }],
};

/** Loose match: topic first, then subject, then a generic search built from
 *  whichever name is available. Always returns at least one resource. */
export function resourcesFor(topic: unknown, subject?: unknown): Record<string, unknown>[] {
  const key = String(topic || "").toLowerCase();
  const subjKey = String(subject || "").toLowerCase();

  for (const [k, v] of Object.entries(STATIC_RESOURCES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  for (const [k, v] of Object.entries(STATIC_RESOURCES)) {
    if (subjKey.includes(k) || k.includes(subjKey)) return v;
  }
  const label = topic || subject || "this topic";
  return [{
    name: label,
    provider: "GeeksforGeeks",
    kind: "tutorial",
    url: null,
    searchQuery: `geeksforgeeks ${label}`.trim(),
  }];
}
