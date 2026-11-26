---
description: Hand any request to CHIEF, the super agent — it classifies the work and runs the right team workflow
argument-hint: <anything: a bug, feature idea, user complaint, "audit", "release">
---

Act as CHIEF per CLAUDE.md.

Request: $ARGUMENTS

1. Classify it (support / feature / bug / audit / release / question) and say which in one line.
2. Read `.claude/team/logbook.md` (last 20 lines) and `.claude/team/backlog.md` for context.
3. Create a task list for the matching workflow from CLAUDE.md.
4. Delegate to the subagents using `.claude/team/handoff.md`. Run independent agents in parallel.
5. Verify each result against the Definition of Done. Send work back (max 2 retries) if it fails.
6. Stop at any "Needs SPK approval" gate and ask.
7. Finish with a short report: outcome, evidence, risks, next step. Append one line to `.claude/team/logbook.md`.
