#!/usr/bin/env bash
# Generate the single deployable supabase/functions/api/index.ts from the
# modules under shared/ and routes/.
#
# WHY THIS EXISTS: Enter Cloud's deploy step bundles only the function's
# index.ts -- sibling files and subdirectories are never uploaded, so relative
# imports between files fail at bundle time ("Module not found ... shared/cors.ts").
# Rather than keep one ~2000-line file, the real code stays in small modules and
# this script flattens them into the artifact that actually deploys.
#
# USAGE: edit the modules, then run scripts/build-function.sh and redeploy.
set -euo pipefail

FUNC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../supabase/functions/api" && pwd)"
OUT="$FUNC_DIR/index.ts"

# Concatenation order: no-import helpers first, then things that depend on them.
MODULES=(
  "shared/cors.ts"
  "shared/db.ts"
  "shared/serialize.ts"
  "shared/serialize-doubts.ts"
  "shared/auth.ts"
  "shared/ratelimit.ts"
  "shared/ai.ts"
  "shared/ai-ping.ts"
  "shared/prompts.ts"
  "shared/fallbacks-tutor.ts"
  "shared/fallbacks-assignment.ts"
  "shared/resources.ts"
  "shared/aggregate.ts"
  "shared/router.ts"
  "routes/health.ts"
  "routes/auth.ts"
  "routes/progress.ts"
  "routes/planner.ts"
  "routes/quiz.ts"
  "routes/tutor.ts"
  "routes/doubts.ts"
  "routes/assignments.ts"
  "routes/career.ts"
  "routes/assessment.ts"
  "routes/dispatch.ts"
)

PRESENT=()
for m in "${MODULES[@]}"; do
  if [ -f "$FUNC_DIR/$m" ]; then
    PRESENT+=("$m")
  else
    echo "warning: skipping $m (not written yet)" >&2
  fi
done
MODULES=("${PRESENT[@]}")
[ "${#MODULES[@]}" -gt 0 ] || { echo "no modules found" >&2; exit 1; }

HEADER='/**
 * EduMind AI api -- ONE backend function reproducing the old Express router.
 *
 * Same paths, same methods, same JSON as server/src/routes/*, mounted under
 * /api, so the React client keeps calling /api/... unchanged and no page needs
 * editing for data shape.
 *
 * verify_jwt is false for this function (supabase/config.toml) because the app
 * uses its own JWT, verified in protect() below -- the platform default would
 * reject every real request before this code ran.
 *
 * ---------------------------------------------------------------------------
 * GENERATED FILE -- DO NOT EDIT DIRECTLY.
 * Built by scripts/build-function.sh from shared/*.ts and routes/*.ts, because
 * the deploy step bundles only index.ts. Edit those modules and re-run:
 *     bash scripts/build-function.sh && redeploy the api function
 * ---------------------------------------------------------------------------
 */'

# 1) Hoist non-relative imports (esm.sh dependencies) to the top of the file.
# 2) Drop relative imports -- their symbols are spliced into this same scope.
# 3) Drop `export` keywords -- everything becomes one module scope.
{
  echo "$HEADER"
  echo
  for m in "${MODULES[@]}"; do
    grep -E '^import .* from "https://' "$FUNC_DIR/$m" || true
  done | sort -u
  echo
  for m in "${MODULES[@]}"; do
    echo "/* ===== $m ===================================================== */"
    sed -E \
      -e '/^import .* from "(\.\.?\/)/d' \
      -e '/^import .* from "https:\/\//d' \
      -e '/^export \{.*\};?$/d' \
      -e 's/^export default //' \
      -e 's/^export //' \
      "$FUNC_DIR/$m"
    echo
  done
} > "$OUT"

echo "wrote $OUT ($(wc -l < "$OUT") lines)"
