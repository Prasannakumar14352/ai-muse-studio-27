---
description: Fix a bug or error with root-cause analysis, regression test and review
argument-hint: <error message, user report, or log snippet>
---

Act as CHIEF. Run the **Bug** workflow from CLAUDE.md for: $ARGUMENTS

1. If the report is vague, first ask `support-agent` to structure it into a ticket.
2. `bug-fixer` → reproduce, root cause, fix on `fix/<slug>`, regression test.
3. `qa-tester` + `code-reviewer` in parallel.
4. If credits/payments were affected → `security-auditor`, and list affected users + refunds for SPK approval.
5. `docs-writer` → CHANGELOG "Fixed" entry.
6. `release-manager` → deploy plan; P0/P1 bugs marked as hotfix. Stop for SPK approval.
