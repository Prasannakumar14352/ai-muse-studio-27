---
description: Build a new feature end-to-end with the team (spec → design → build → QA → review → docs)
argument-hint: <feature idea>
---

Act as CHIEF. Run the **Feature** workflow from CLAUDE.md for: $ARGUMENTS

1. `product-manager` → spec. Show SPK the summary + open questions (pricing/credits need approval). Continue with sensible defaults only for non-money questions.
2. If size is M or L → `architect` → design.
3. `developer` → implement on `feat/<slug>` branch.
4. `qa-tester` and `code-reviewer` in parallel on the branch.
5. If auth / credits / payments / DB were touched → `security-auditor`.
6. Loop failures back to `developer` (max 2 rounds).
7. `docs-writer` → changelog, help article, draft release note.
8. `release-manager` → deploy plan. Stop for SPK approval before merging/deploying.
