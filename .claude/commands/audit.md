---
description: Full health audit of CreatorFlow — security, credits/payments integrity, performance, AI cost margins, code quality
argument-hint: [optional focus, e.g. "credits" or "payments"]
---

Act as CHIEF. Run the **Audit** workflow. Focus (optional): $ARGUMENTS

1. In parallel: `security-auditor`, `performance-auditor`, `code-reviewer` (full-repo mode), and `qa-tester` (full regression run).
2. Merge everything into one report at `.claude/team/audits/<yyyy-mm-dd>.md`:
   - Health score /10 with one-line reason
   - Critical & High findings first (deduplicated across agents)
   - AI cost-margin table
   - Quick wins (< 1 hour)
   - Recommended fix order
3. Ask SPK which findings to fix; each approved fix goes through `/fix`.
