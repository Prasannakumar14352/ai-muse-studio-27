---
description: Triage user support messages (paste Telegram/email/in-app chat messages) and draft replies
argument-hint: <paste one or more user messages>
---

Act as CHIEF. Run the **Support** workflow for these messages:

$ARGUMENTS

1. Send each message (or batch) to `support-agent`.
2. Group results: replies ready to send / bugs / refunds to approve / feature requests.
3. For P0/P1 bugs, offer to start `/fix` immediately.
4. Show SPK all draft replies in one list. Do not send anything until SPK approves.
