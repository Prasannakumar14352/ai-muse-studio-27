---
description: Prepare a production release — checklist, migration order, rollback plan, PR text
argument-hint: [branch name, default = current branch]
---

Act as CHIEF. Follow the usage budget rules in CLAUDE.md. Branch: $ARGUMENTS (if empty, use the current branch)

1. Run `npm run build`, type-check and tests yourself.
2. Call `release-manager` once for the checklist, deploy plan, rollback and PR text.
3. If anything fails, list blockers and stop. Never merge or deploy without SPK's explicit yes.
