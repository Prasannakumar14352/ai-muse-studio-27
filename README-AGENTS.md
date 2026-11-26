# CreatorFlow AI — Agent Team

One super agent (**CHIEF**) managing 11 specialists, built for Claude Code.

```
                         SPK (owner, approves money/deploys/user messages)
                                          │
                                  CHIEF (super agent)
                                          │
   ┌──────────────┬──────────────┬────────┴─────┬───────────────┬──────────────┐
 SUPPORT        BUILD           QUALITY        AUDIT           SHIP
 support-agent  product-manager qa-tester      security-auditor docs-writer
                architect       code-reviewer  performance-     release-manager
                developer                      auditor
                bug-fixer
```

## Install (2 minutes)
1. Copy `CLAUDE.md`, `README-AGENTS.md` and the `.claude/` folder into the root of the `ai-muse-studio-27` repo.
   - If the repo already has a `CLAUDE.md`, paste this one's content at the top of it.
2. Add `.claude/settings.local.json` to `.gitignore` if it isn't there already.
3. Commit: `git add CLAUDE.md .claude README-AGENTS.md && git commit -m "Add CreatorFlow agent team"`
4. Open the repo in Claude Code (terminal, desktop or web) and type `/agents` — you should see all 11 agents.

## Daily use
| Command | What happens |
|---|---|
| `/chief <anything>` | CHIEF figures out the type of work and runs the right workflow |
| `/standup` | What changed, open issues, top backlog items, today's focus |
| `/support <paste user messages>` | Triage + draft replies + bugs raised + refunds flagged |
| `/fix <error or report>` | Root cause → fix → regression test → QA → review → deploy plan |
| `/feature <idea>` | Spec → design → build → QA → review → docs → deploy plan |
| `/audit [focus]` | Security + credits/payments + performance + AI cost margins + code quality |
| `/release` | Full QA + checklist + rollback plan + PR text |

You can also call any specialist directly: "Use the security-auditor to check the Razorpay webhook."

## Safety built in
- CHIEF always stops for your approval before: deploying/merging to main, production migrations, price/credit changes, messaging real users, deleting data, re-enabling hidden features.
- `.claude/settings.json` blocks force-push, push to main, `supabase db reset`, `rm -rf`, and reading `.env` files; asks before any push/merge/install/supabase/vercel command.
- Every agent protects the 7 invariants in `CLAUDE.md` (credits, auth, secrets, RLS, plan gating, Razorpay, rate limits).

## Files
```
CLAUDE.md                     CHIEF's operating manual + product facts + rules
.claude/agents/*.md           11 specialist subagents
.claude/commands/*.md         7 slash commands (workflows)
.claude/team/handoff.md       brief format CHIEF uses to delegate
.claude/team/backlog.md       feature requests (support + PM keep it updated)
.claude/team/logbook.md       history of completed work
.claude/team/specs|designs|audits/   created automatically as the team works
.claude/settings.json         safety permissions
```

## Tune it
- **Usage:** agents run on Sonnet (coding, review, security) or Haiku (support, docs, QA, release, PM). Small tasks are done directly with no agents. Check usage with `/usage` and clear long chats with `/clear`.
- **Facts change** (plans, credits, hidden features): update the "The product" section of `CLAUDE.md` and the "Facts" list in `support-agent.md`.

## Next level (optional)
- **Auto-support:** connect the Telegram bot to call Claude with `support-agent.md` as its system prompt; keep a human approval step for refunds.
- **Scheduled audits:** run `/audit` weekly and `/standup` every morning as scheduled tasks.
- **GitHub Action:** run code-reviewer automatically on every PR with `anthropics/claude-code-action`.
