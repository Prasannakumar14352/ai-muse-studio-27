---
description: Health audit — EXPENSIVE. Pick a focus to keep it cheap (credits, payments, security, performance)
argument-hint: <focus: credits | payments | security | performance | full>
---

Act as CHIEF. Focus: $ARGUMENTS

- If no focus was given, ask SPK to pick one: credits, payments, security, performance, or full. Do nothing else.
- **credits / payments / security:** run only `security-auditor`, limited to that area's files.
- **performance:** run only `performance-auditor`.
- **full:** warn "Full audit uses a lot of usage — run it at most once a month. Continue?" Only on yes, run `security-auditor` + `performance-auditor` + `code-reviewer` (full-repo mode).
- Write the report to `.claude/team/audits/<yyyy-mm-dd>.md`: Critical/High first, quick wins, fix order.
