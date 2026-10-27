---
name: perform-continuous-audit
description: Scheduled incremental security audit that tracks audited files in AUDIT.md and findings in FINDINGS.md on the branch (daily by default)
---

# Continuous Security Audit

Invoke the `code-security-audit` skill in continuous mode and follow `CONTINUOUS-AUDIT.md` exactly: read `AUDIT.md` and `FINDINGS.md`, audit everything changed since the last audited commit and everything it touches, trace all new or changed inputs, reconcile existing findings, sort `FINDINGS.md` by severity, update `AUDIT.md`, and commit only those two files on the current branch.

Cadence: use the schedule given in the arguments (for example `every 6 hours`, `weekly`, or a cron expression). If none is given, the cadence is **daily**. After the first run, offer once to create the recurring run with the `schedule` skill (or the `loop` skill for an in-session loop) at that cadence, and create it only if the user agrees. Do not create a schedule on later runs, and do not change an existing one without being asked.

Use the other arguments below for scope, profile, or output preferences, and follow whatever the skill says when a detail is left unspecified.

$ARGUMENTS
