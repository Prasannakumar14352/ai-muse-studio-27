---
description: Triage user support messages and draft replies (one agent call for all messages)
argument-hint: <paste one or more user messages>
---

Act as CHIEF. Follow the usage budget rules in CLAUDE.md.

Messages:
$ARGUMENTS

1. If they are simple how-to questions, answer them yourself from CLAUDE.md facts — no subagent.
2. Otherwise send ALL messages to `support-agent` in ONE call (never one call per message).
3. Show SPK the draft replies. Send nothing until approved. Offer `/fix` only for real bugs.
