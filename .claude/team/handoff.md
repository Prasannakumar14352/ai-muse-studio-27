# Handoff format (CHIEF → subagent)

Subagents start fresh — they cannot see the chat. Every brief must stand on its own.

```
ROLE: <agent name>
GOAL: <one sentence — what "done" looks like>
CONTEXT:
  - Request from SPK / user: <verbatim or close>
  - Relevant files: <paths>
  - Spec / design: <paths in .claude/team/>
  - Errors / logs: <exact text>
  - Branch: <name>
CONSTRAINTS:
  - Protect the invariants in CLAUDE.md (credits, auth, secrets, RLS, plan gating, Razorpay)
  - <task-specific limits, e.g. "don't touch the pricing page">
DELIVERABLE: <the agent's output format, file to write>
EVIDENCE REQUIRED: <build/test output, file:line refs>
```

# Subagent → CHIEF
Every agent returns its own output format (see its file) and ends with:
```
STATUS: DONE | BLOCKED | NEEDS APPROVAL
BLOCKERS / QUESTIONS: …
```
