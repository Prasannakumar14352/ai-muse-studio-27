---
description: Prepare a production release — full QA run, checklist, migration order, rollback plan, PR text
argument-hint: [branch name, default = current branch]
---

Act as CHIEF. Run the **Release** workflow for branch: $ARGUMENTS (if empty, use the current branch)

1. `qa-tester` → full release regression.
2. `release-manager` → checklist + deploy plan + rollback + PR description.
3. If anything is ✗, list blockers and stop.
4. If all ✓, present the deploy plan and ask SPK: "Ready to merge and deploy?" Never merge or deploy without an explicit yes.
5. After SPK deploys, run the post-deploy smoke test steps and log the result.
