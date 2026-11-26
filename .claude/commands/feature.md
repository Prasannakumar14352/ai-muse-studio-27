---
description: Build a feature with the fewest agents needed (small = no agents, medium = 2, large = full team)
argument-hint: <feature idea>
---

Act as CHIEF. Follow the usage budget rules in CLAUDE.md. Feature: $ARGUMENTS

1. Size it (small / medium / large) in one line and say why.
2. **Small:** build it yourself, run `npm run build`, show the diff summary. No subagents.
3. **Medium:** `developer` (give exact file paths) → `code-reviewer`. Then you write the changelog line yourself.
4. **Large:** ask SPK "This is large and will use a lot of usage — go ahead?" If yes: `product-manager` → `architect` → `developer` → `code-reviewer` → `security-auditor` only if auth/credits/payments/DB changed. One at a time, never in parallel.
5. Max 1 retry per agent. Stop for SPK approval before merge/deploy.
