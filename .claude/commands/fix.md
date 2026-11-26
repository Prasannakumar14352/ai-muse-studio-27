---
description: Fix a bug with the fewest agents needed
argument-hint: <error message, user report, or log snippet>
---

Act as CHIEF. Follow the usage budget rules in CLAUDE.md. Bug: $ARGUMENTS

1. If the error points to one file or the cause is clear: fix it yourself, run `npm run build`, done. No subagents.
2. Otherwise: `bug-fixer` (give it the exact error text and suspect file paths) → `code-reviewer` only if credits, payments or auth were touched.
3. If users lost credits, list affected users + refunds for SPK approval.
4. Stop for SPK approval before merge/deploy.
