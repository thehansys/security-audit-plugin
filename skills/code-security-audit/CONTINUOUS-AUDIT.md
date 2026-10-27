# Continuous Audit

#### When to use this file

Use this file when the plugin runs on a regular schedule (daily unless the user sets another cadence) against a repository and must keep a durable record on the branch. It extends the repeat-run rules in `SKILL.md`: each run audits only what changed since the last run, updates two tracked files, and commits them.

- **`AUDIT.md`** – what has been audited, up to which commit, and what remains open as coverage.
- **`FINDINGS.md`** – every finding, sorted by severity, with its current status.

Run it through the `/security-audit:perform-continuous-audit` command, which also sets up the recurring schedule (see the command for the cadence rule). The cadence does not change the procedure: each run audits everything since the last audited commit, however long ago that was. A run needs no user input unless a rule below says to ask.

## Core discipline (include in every agent prompt for continuous runs)

```
- The state files are the memory. Read AUDIT.md and FINDINGS.md first; trust them over your own recollection, and never re-report a known finding as new.
- Audit the delta and everything it touches: changed files, their callers and callees, the data and config they read or write, their tests, and every input they receive. Unchanged files whose dependencies did not change stay covered.
- Trace every new or changed input to every destination (INPUT-TRACING.md), including stored copies and their later readers. A change to validation, authorization, sanitization, or a limit is a change to every input that passes through it.
- Humans edit these files. Preserve their edits (a Skipped status, a reason, a note) and never overwrite them silently.
- Commit only AUDIT.md and FINDINGS.md. Never modify source, never rewrite history, never push without explicit permission.
```

## Run procedure

1. **Preflight.** Confirm a git repository and the current branch. Read `AUDIT.md` and `FINDINGS.md` if they exist. If the working tree has uncommitted changes, audit only committed state (`HEAD`) and say so in the run history.
2. **Find the baseline.** Take `Last audited commit` from `AUDIT.md`.
   - **`AUDIT.md` or `FINDINGS.md` is missing:** this is the first run. There is no trusted baseline, so do a full scan of the whole repository (full audit mode, `standard` profile, every in-scope file), not a diff. Keep and dedupe against any findings already in an existing `FINDINGS.md`. Then create or rewrite both files with the baseline commit.
   - **Baseline is an ancestor of `HEAD`** (`git merge-base --is-ancestor <last> HEAD`): continue.
   - **Baseline is not an ancestor** (rebase, force-push, history rewrite): use the merge-base of the baseline and `HEAD` if one exists, otherwise treat the run as a baseline audit of the files changed on this branch. Record the reason in the run history.
   - **`HEAD` equals the baseline** and no finding status changed: record nothing, commit nothing, and report "no changes since last run".
3. **Collect the delta.** `git log --oneline <last>..HEAD`, `git diff --name-status -M <last>..HEAD` (added, modified, renamed, deleted), and the diff itself. A renamed file keeps its history in `AUDIT.md`; a deleted file closes its findings as Fixed (file removed) after you confirm the vulnerable code is gone and not moved.
4. **Read the deleted and changed lines first.** In the diff, review removed lines before added ones: a deleted or weakened validation, authorization check, limit, guard clause, or early return, a guard narrowed with `only:`/`except:`, a loosened or deleted test, or a flipped default. Each is a new surface for every input behind it (see "Validation or checks removed by an earlier change" in [COMMON-VULNERABILITIES.md](COMMON-VULNERABILITIES.md)). Also flag wrong early returns and numeric or money handling in changed code.
   Then **expand to everything touched.** For each changed file and each changed function, find callers, callees, the models, schema, migrations, routes, jobs, templates, and config it reads or writes, and its tests. Include dependency and lockfile changes, CI and deployment files, and shared helpers whose behavior changed. These become the audit scope, together with the changed files.
5. **Inventory and trace inputs.** Follow [INPUT-TRACING.md](INPUT-TRACING.md): list every new or changed input in the delta, diff the interface (routes, permitted params, columns, job arguments, headers, files), and treat any removed or weakened validation, authorization, encoding, or limit as a new surface for every input behind it. Trace each input to every destination (database, disk, cache, queue, logs, outbound messages, generated artifacts) and each stored copy's readers. Compare with the inputs table in `AUDIT.md` to find what is genuinely new.
6. **Audit the scope.** Run the normal workflow from `SKILL.md` as a scoped, incremental run: reconnaissance limited to the scope, coverage-led hunting, candidate validation by fresh verifiers, independent record verification, per the profile. Carry same-source results forward instead of re-deriving them. Honor the subagent limits in `SKILL.md`. When more than one hunter runs, split the scope into disjoint parts and merge per-hunter `FINDINGS.md` and `AUDIT.md` copies as described in [PARTITIONING-AND-MERGE.md](PARTITIONING-AND-MERGE.md).
7. **Reconcile existing findings.** Every run checks every finding in `FINDINGS.md`, in this order:
   1. **Drop old Fixed findings.** Remove each `Fixed` finding that was marked Fixed in an earlier run (its `Fixed` line names an earlier run). Add it to the `Closed findings` table in `AUDIT.md` first. A finding marked Fixed in this run stays until the next run.
   2. **Open and Partially fixed:** check whether each one has been fixed. If its affected lines, files, or dependencies changed, or the file was moved or deleted, re-verify against source and set it to `Fixed` (record the fix commit and this run), keep `Partially fixed` (state the remaining gap), or leave `Open`. If nothing it depends on changed, leave it as is and keep its `Last verified` value. Do not mark a finding Fixed because the file changed; confirm the vulnerable behavior is actually gone, including on sibling paths.
   3. **Regression:** if a finding listed in `Closed findings`, or a Fixed finding still in the file, is vulnerable again, add it as a new `Open` finding (or set it back to Open) and note "Regression" with the commit.
   4. **Skipped:** never reopen or close it silently. If the affected code changed materially, re-check it and add a note; leave the status for a human to change. Skipped findings are kept until a human removes them.
8. **Record new findings.** Only independently verified findings are added. Dedupe by fingerprint against the whole file (Skipped and recently Fixed included) and the `Closed findings` table, so a known issue is not re-added as new; a closed one that is vulnerable again is a Regression. Unvalidated leads are added as Open with a `Validation` line (blocker and next step) and no severity.
9. **Update the files and sort.** Merge and dedupe any per-hunter copies first. Rewrite `FINDINGS.md` and `AUDIT.md` using the formats below. After every change to the findings, re-sort and renumber `FINDINGS.md`. The order is always: severity (critical, high, medium, low, then unrated), then status (Open, Partially fixed, Skipped, Fixed), then fingerprint.
10. **Commit.** Stage only `AUDIT.md` and `FINDINGS.md` and commit on the current branch with `security-audit: run N, audited <short sha>` (plus the attribution lines the session requires). Do not amend, rebase, or force-push. Push only if the user or the scheduler configuration explicitly allows it.
11. **Report.** Tell the user the baseline and new commit, number of files and inputs examined, new findings by severity, status changes (fixed, reopened, partly fixed), unresolved gaps, and whether anything was committed.

Run artifacts (`findings.json`, `coverage-ledger.json`, scratch) still go to the external output directory defined in `SKILL.md`. `AUDIT.md` and `FINDINGS.md` are the only files written inside the target, and are an explicit exception to the external-output rule.

## `FINDINGS.md` format

The file is derived from the validated records and the previous file. It opens with a header and a summary table, then one section per finding.

```markdown
# Security Findings

**Branch**: `{branch}`
**Last run**: {YYYY-MM-DD} (run {N})
**Reviewed up to commit**: `{full 40-character sha}`
**Totals**: {n} Open · {n} Partially fixed · {n} Skipped · {n} Fixed

## Findings summary

| # | Severity | Status | Finding | File | First found |
|---|---|---|---|---|---|
| 1 | 🔴 Critical | Open | {one-line title} | `{file}:{line}` | Run {N}, {YYYY-MM-DD} |

## Findings

### 🔴 1. {Title}
**ID:** `{fingerprint}`
**Severity:** Critical
**File:** [{file}:{line}]({file}#L{line}), `{other_file}:{line}`
**Status:** Open
**Fixed:** — {or: `{sha}` on {YYYY-MM-DD}; marked Fixed in run {N}}
**First found:** run {N}, commit `{short sha}` · **Last verified:** run {N}, commit `{short sha}`

**Problem.** {what is wrong, with the smallest code excerpt that shows it}

**Impact.** {who is affected and what the attacker gains, with conditions}

**Suggested fix.** {the smallest source change and the regression test}
```

Rules:

- **Status values** are exactly `Open`, `Partially fixed`, `Skipped`, and `Fixed`.
  - `Partially fixed`: list the fix commits and the remaining gap (another finding's `ID`, or a description).
  - `Skipped`: a human decision not to fix. The line reads `Skipped ({reason}; {who or when})`. Only a human sets or clears it.
  - `Fixed`: record the commit in the `Fixed` line.
  - An unvalidated lead is `Open` with an extra `**Validation:**` line (blocker and next step); its severity shows "Unrated".
- **Severity** is critical, high, medium, or low, with the icons 🔴 🟠 🟡 🔵. Severity rules are in `SKILL.md`.
- **IDs, not numbers, in text.** The `#` column changes whenever the file is re-sorted, so refer to other findings by `ID`.
- **No exploit detail.** Describe the problem target-neutrally; do not include payloads, working exploit steps, or secrets. The file is committed to the repository.
- **Fixed is short-lived.** A finding stays `Fixed` for exactly one run after the run that marked it Fixed, then is removed from `FINDINGS.md` and logged in `AUDIT.md`. `Skipped`, `Open`, and `Partially fixed` findings stay until their status changes.
- **Mapping to records.** Status comes from `fix_status` (`open`, `partly_fixed`, `fixed`, `skipped`); Problem from `description`, Impact from `impact`, Suggested fix from `remediation.strategy`; First found from `found_by` and run metadata.

## `AUDIT.md` format

```markdown
# Audit State

**Last run**: {YYYY-MM-DD} (run {N})
**Branch**: `{branch}`
**Last audited commit**: `{full 40-character sha}`
**Profile**: {quick | standard | deep}

## Run history

| Run | Date | Commits audited | Files changed | New | Fixed | Reopened | Notes |
|---|---|---|---|---|---|---|---|
| {N} | {YYYY-MM-DD} | `{old7}..{new7}` | {n} | {n} | {n} | {n} | {baseline, rewritten history, dirty tree, budget limits, ...} |

## Audited files

| Path | Last audited commit | Last audited | Result | Findings |
|---|---|---|---|---|
| `{file or dir/**}` | `{short sha}` | {YYYY-MM-DD} | covered | — |

## Inputs

| Input ID | Surface | Last traced commit | Destinations | Verdict | Findings |
|---|---|---|---|---|---|
| `POST /projects#name` | route | `{short sha}` | db (projects.name), log, export script | covered | — |

## Closed findings

| ID | Title | Fixed in | Closed (run) |
|---|---|---|---|
| `{fingerprint}` | {title} | `{sha}` | {N} |

## Open coverage gaps

| Unit or path | Reason | Since run |
|---|---|---|
| `{path}` | {deferred, blocked, out of scope, budget} | {N} |
```

Rules:

- **`Result`** is one of the ledger dispositions: `covered`, `candidate`, `blocked`, `deferred`, `out_of_scope`. List `Findings` by `ID`.
- **Roll up** to a directory (`dir/**`) when every file below it shares the same commit, date, and result. Split the row when any file diverges.
- **Update only what the run examined.** Rows for files outside the run's scope keep their previous commit and date, so a reader can see how stale each area is.
- **Inputs table** records the destinations found by tracing, so the next run can tell new inputs and new destinations from known ones.
- **Closed findings** keeps one row per finding removed from `FINDINGS.md` after its one run as Fixed, so later runs can dedupe against it and flag regressions. The full text stays in git history.
- **Gaps are visible.** Never mark a file `covered` that the run did not review. A budget-limited or incomplete run says so in the run history and lists the gap.

## Safety and privacy

- **Sensitive content.** `FINDINGS.md` describes unfixed vulnerabilities. Before the first commit, ask once whether the repository is private and whether the file may be committed (and pushed). If not, write the files to the external output directory instead, and tell the user.
- **No source changes.** The audit reports and tracks; it does not edit source. Fixes happen separately, and the next run detects them and marks the finding Fixed.
- **Scheduled runs** must not push, open pull requests, or post anywhere unless that was configured explicitly.
- **No churn.** If nothing changed, do not create a commit.
