---
name: code-audit
description: General code-review workflow covering correctness, races, resource cleanup, consistency, dead code and stale comments, API clarity, test coverage, efficiency, and security — for reviewing a diff, branch, PR, or set of files. Use code-security-audit directly instead when the request is security-only (a dedicated security audit, vulnerability research, or pen test) with no interest in general quality findings.
---

# Code Review

Find defects that make code behave wrong, leak resources, or drift from its siblings — then give the owner the source evidence, the concrete failure scenario, and the smallest effective fix. This is the same source-grounded, independently-verified discipline as [code-security-audit](../code-security-audit/SKILL.md), retargeted from security vulnerabilities to general code-quality defects.

**This skill is a thin extension of code-security-audit.** It does not duplicate the phase machinery. Read `code-security-audit/SKILL.md` first — its core principles, phase structure, and agent-role rules (`research` vs `general`) all apply here except where this file says otherwise.

## What's different from code-security-audit

| | code-security-audit (run standalone) | code-audit |
|---|---|---|
| Finding classes | [ATTACK-CLASSES.md](../code-security-audit/ATTACK-CLASSES.md) + domain companions | both [ATTACK-CLASSES.md](../code-security-audit/ATTACK-CLASSES.md) (run as a track, see below) and [CODE-QUALITY.md](../code-security-audit/CODE-QUALITY.md) |
| Framing | lower-trust principal crosses a trust boundary | code produces a wrong, leaked, inconsistent, or untested result |
| Severity anchors | exploit impact (critical = unauthenticated RCE, ...) | see Severity below |
| Execution sandbox | mandatory OS-enforced sandbox for any target-controlled execution | ordinary local test/build commands are fine (existing test suite, `cargo build`, `rspec`); no adversarial payload execution, so the full sandbox/promotion apparatus in code-security-audit's "Universal execution safety" is not required — still never run against shared/live infrastructure |
| Output schema | `findings.json` validated against `report-schema.json` (`root_cause`/`intended_behavior`/`conditions.kind` are security-specific fields) | quality-track findings are written directly in the **Report format** below, skipping `validate-findings.cjs`/`validate-coverage-ledger.cjs` — those validators enforce the security schema; the security track (see below) still runs both validators as code-security-audit's Phase 4 requires |
| Coverage ledger, hunter/verifier roles, prior-run carry-forward, budget gates | as written in [RECONNAISSANCE.md](../code-security-audit/RECONNAISSANCE.md) and [HUNTING.md](../code-security-audit/HUNTING.md) | same mechanics, same files, substituting `CODE-QUALITY.md` wherever those files say `ATTACK-CLASSES.md` |

Everything else — write isolation, scratch/artifacts separation, fingerprinting, `confirmed`/`needs_validation`/`rejected` verdicts, independent Phase 3 and Phase 5 verification, severity separated from certainty, smallest-effective-fix remediation — carries over unchanged.

## code-audit includes a security pass

A code review that skips security is incomplete, so this skill always runs [code-security-audit](../code-security-audit/SKILL.md) as one of its tracks rather than treating it as a separate, opt-in skill:

- **Guidance-mode reviews** run code-security-audit in its own guidance mode (see that skill's Operating modes) scoped to the same diff/files, alongside the `CODE-QUALITY.md` classes below. Both tracks read the same diff; they do not block on each other.
- **Full-review-mode reviews** run code-security-audit's complete six-phase workflow (`ATTACK-CLASSES.md` + selected domain companions) and this skill's coverage-led workflow (`CODE-QUALITY.md`) as two parallel tracks against the same reconnaissance and coverage ledger — Phase 1 (`architecture.md`) is shared and built once; Phase 2 hunting waves assign each ledger unit to either an attack-class hunter or a quality-class hunter per that unit's `attack_class`/companion selection; Phase 3–5 validation and verification run per the owning track's rules (security candidates get security's stricter execution-sandbox and schema treatment, quality candidates get this skill's).
- Merge both tracks' final records into **one** report using this skill's **Report format** below — a security finding is just a row with a 🔴/🟠/🟡/🔵 severity like any other, not a separate section. Do not produce two reports.

Skip the security track only when the user explicitly asks for quality-only review (e.g. "just check for dead code and races, not security") or the diff provably touches nothing but comments/docs/tests with no reachable behavior change.

## Inputs in the diff

In a branch-diff review, list every new or changed input (route, permitted param, column, job argument, header, file) using [INPUT-TRACING.md](../code-security-audit/INPUT-TRACING.md) Step 0, and follow each to its destinations, including stored copies and their later readers. Pattern references: [COMMON-VULNERABILITIES.md](../code-security-audit/COMMON-VULNERABILITIES.md).

## Subagent spawning

Follow [Subagent spawning](../code-security-audit/SKILL.md#subagent-spawning) in code-security-audit: at most 4 agents in flight, never a higher-tier model than the parent, smaller models and smaller units for mechanical or narrow work, and no agents for work the parent can do in a read or two.

## Review scope: branch diff vs. whole repository

Before starting either mode — guidance or full review — resolve what to review. This applies identically to both the quality track and the security track: one scope decision, asked once, not per-track.

- **Ask the user** whether to review only the current branch's changes against `main` (a scoped run: the diff, plus the source each changed line touches — callers, callees, sibling tests) or the whole repository. Ask this once, before reconnaissance or the first agent launches, combined with the output-destination question below into a single prompt.
- **Skip the question and default to branch-diff-only** when told not to ask (standing instruction, "don't ask, just review," non-interactive invocation, or a request that already states the branch). Never default to whole-repository.
- A **branch-diff run** is a scoped run: `git diff main...HEAD` (or the user's stated base) defines the seed paths; record everything outside it as `out_of_scope` in full-review mode and state plainly in the report that this is a partial pass. "The code it touches" means: for each changed method/function, its callers and callees, the migration/model/schema it reads or writes, and its existing tests — not the whole file it lives in and not unrelated files nearby.
- A **whole-repository run** covers the full target per the chosen profile, same as an ordinary full audit.

### Repeat runs on the same branch

When this skill runs again for a branch it has already reviewed (a prior `coverage-ledger.json`/`findings.json`/`FINDINGS.md` or PR comment from this skill exists for this repo and branch):

1. Diff the current branch tip against the source ref of the most recent prior run (not against `main`) to get the newly-changed commits and files since that run.
2. Scope the new run to that incremental diff, plus — same as any branch-diff run — the code it touches (callers, callees, schema, tests).
3. Carry forward same-source `confirmed`/`covered` results from the prior run instead of re-deriving them (per code-security-audit's Coverage and prior runs), and only open new work for what's actually new or changed.
4. State in the report that this is an incremental run against the prior run's source ref, and name that ref.

If no prior run exists for this branch, treat it as a first branch-diff run against `main`.

## GitHub PR integration and output destination

Before starting work, check whether `gh` is usable and whether this branch has an open PR:

1. Run `gh auth status`. If `gh` is not installed or not authenticated, skip straight to asking the output-destination question below with only the **chat** and **`FINDINGS.md`** options — there is no PR to post to or read from.
2. If `gh` is available, run `gh pr view --json number,title,body,baseRefName,headRefName,comments,reviews` (or equivalent) for the current branch. If it errors because no PR exists for this branch, proceed the same as step 1 but mention that no PR was found.
3. If a PR exists, read its description, inline review comments (`gh api repos/{owner}/{repo}/pulls/{number}/comments` — `gh pr view` alone omits inline comments), and its recent commits (`gh pr view --json commits`). Use this as extra context alongside the source: a reviewer comment can point at a spot worth a focused look, and the PR description can clarify the change's intent when judging whether behavior is a bug or deliberate. This context informs the review; it does not replace reading the actual diff and source.
4. **Ask the user** where to put results: **post as a PR comment** (`gh pr comment`), **write to `FINDINGS.md`** in the repo root, or **print in chat only**. Ask this together with the branch-diff-vs-whole-repo question above, as one combined question.
5. **Skip the question and default to writing `FINDINGS.md`** when told not to ask, unless a standing instruction already states a different destination (e.g. "always post to the PR"). Never post to GitHub (comment on a PR) without either an explicit user instruction to do so for this run or a standing instruction that already covers it — posting is a visible, hard-to-reverse action other reviewers will see, same as the existing `/review-pr` command's rule of never posting without approval.
6. If the user picks `FINDINGS.md`, write this skill's **Report format** output there, overwriting any prior run's `FINDINGS.md` for the same branch unless the user asked to append or keep history.
7. If the user picks a PR comment, post the same **Report format** body via `gh pr comment {number} --body "..."` after showing it to the user in chat first — never post silently without the user having seen the content that's about to go on the PR.
8. If the user picks chat only, print the **Report format** output directly and write nothing to disk or GitHub.

## Always-check focus areas

These get checked on every review that touches the relevant code, regardless of coverage-ledger selection or run size — do not let hunter assignment or a `quick` profile drop them. Each one maps to a class above or in [ATTACK-CLASSES.md](../code-security-audit/ATTACK-CLASSES.md); this section exists to make sure they're never skipped, not to define new evidence rules.

- **API permission checks** (Access control). For every new or changed controller action, tool, or endpoint: confirm it checks the *right* permission for the *right* resource, not just that a check exists. Check bulk/batch/export/import variants separately — a per-item check that the single-item path has can be missing on the bulk path.
- **Auth gaps and privilege escalation** (Access control). Trace every path that changes a role, permission, plan, or ownership. Can a lower-privileged caller reach it directly, via a different endpoint that shares the same underlying write, or by supplying a field the permission system didn't expect to be settable?
- **Migration safety.** For every `db/migrate/*` file in the diff:
  - **Prefer raw SQL (`execute("...")`) over ActiveRecord model/query calls inside a migration.** A migration that loads and saves AR model instances runs app-level validations, callbacks, and (with a large table) one query per row — flag any migration that does this instead of a set-based `UPDATE`/`INSERT ... SELECT`.
  - **N+1 in a migration is a production incident, not just slow code**, because it runs once against real production data volumes with no request timeout to bound it. Flag any per-row loop (`Model.find_each { |r| r.other_thing.update! }`) that could instead be one SQL statement or a batched `update_all`.
  - Missing `disable_ddl_transaction!` around a concurrent index (`add_index ... algorithm: :concurrently`), or a backfill with no batching that will hold a long lock or long-running transaction against a large table.
  - A column/table drop or rename with no expand/contract safety for in-flight deploys (old code still reading a column this migration removes).
- **SQL injection — trace to source.** For every raw SQL string, interpolated query fragment, or dynamic `ORDER BY`/`WHERE` column name: trace the value back to its origin and classify it explicitly as **user-controlled input** (request param, header, uploaded file content, another tenant's stored data rendered into this context) or **internal/constant** (hardcoded, from a fixed enum, from trusted config). Only the first is a confirmed injection finding; state which one it is and show the trace, don't just flag the raw-SQL call site itself as suspicious.
- **Unvalidated user input.** Any place a request body, query param, header, or uploaded file reaches a sink (SQL, shell, file path, template, external URL) without going through the validation/sanitization the sibling code paths use.
- **Resource exhaustion / DDoS potential** (see [RESOURCE-EXHAUSTION-AND-AVAILABILITY.md](../code-security-audit/RESOURCE-EXHAUSTION-AND-AVAILABILITY.md)). An unauthenticated or low-cost caller triggering unbounded work: unbounded query results, unbounded file/upload size, a recursive or fan-out operation with no depth/count cap, a job that retries without backoff.
- **Concurrency.** Check-then-act races on shared state (see Concurrency and races in [CODE-QUALITY.md](../code-security-audit/CODE-QUALITY.md)) — especially where the race has a security consequence (a permission check and the action it gates are not atomic) as well as where it's a plain correctness bug.

## Operating modes

Same as code-security-audit:

- **Guidance mode** (default): a focused review question, "review this diff," or "review PR #N" without asking for a full audit. Use only the relevant parts of this skill; do not spin up the full ledger/hunter/verifier machinery unless the size and stakes of the change warrant it. For most PR-sized diffs, a single careful read plus targeted `general` agents per class in [CODE-QUALITY.md](../code-security-audit/CODE-QUALITY.md), plus the code-security-audit guidance pass above, is enough — reserve the full coverage-ledger workflow for large or high-stakes reviews.
- **Full review mode**: the user explicitly asks for a full, comprehensive, or end-to-end code review, or requests report artifacts on disk. Run reconnaissance → coverage-led hunting waves (quality + security tracks) → candidate validation → independent verification, per code-security-audit's six phases, using this file's **Report format** in place of code-security-audit's Phase 6.

If the request could mean either, ask one focused question before starting the full workflow.

## Clean-code and style passes

After the review, or alongside it in guidance mode, optionally use the existing Claude Code cleanup skills and agents (`simplify`, `code-simplifier`, and the `pr-review-toolkit` agents) per [CLEAN-CODE-PASSES.md](CLEAN-CODE-PASSES.md). Read that file before launching any of them.

## Severity

Calibrate against the concrete failure scenario, not against how the code looks:

- 🔴 **Critical** — a caller can mutate or delete data they don't own: another user's or another tenant's records, or any user's records via a path with no ownership/authorization check at all. Also use Critical for privilege escalation that grants delete/mutate rights the caller shouldn't have. This is the same bar as code-security-audit's `critical`/`high` anchors for cross-tenant read/write and takeover — a security-track finding that meets it stays Critical here too, not downgraded because this is the quality report.
- 🟠 **High** — silent data loss/corruption, a permanent orphaned/inconsistent record, a race with real business impact, or a resource cap that's bypassed entirely.
- 🟡 **Medium** — a real bug with a bounded blast radius: a transient race window, a cleanup gap that leaks but doesn't corrupt, a missing gate that's inconsistent with siblings.
- 🔵 **Low** — real but narrow: a latent gap not currently reachable, a naming/consistency mismatch, a missing purge that only affects storage bookkeeping.
Severity has exactly four levels: critical, high, medium, low. Observations that are true but not defects (a naming or terminology note, a stale or misleading comment, dead or unreachable code, leftover debug scaffolding, a positive pattern, a note for future work) are not findings: list them in a short `## Notes` section after the findings, without severity. Promote one to Low only when the staleness or dead branch actually misleads a reader into a wrong change, or the dead path is reachable after all.

Only `confirmed` findings get a severity. `needs_validation` means a specific fact (runtime behavior, data shape, deployment config) is blocked, not a low-confidence finding.

## Report format

Always structure the final output exactly like this — the header block is mandatory on every run, in this exact order and these exact labels, followed by a findings summary table, then each finding expanded with the same properties as the security report (Severity, File, Exploitable since, Status, Problem, Impact, Suggested fix; see [VALIDATION-AND-REPORTING.md](../code-security-audit/VALIDATION-AND-REPORTING.md) Phase 6):

```markdown
## {Scope name} - Code Review Summary

**Branch**: `{branch}` → `{base}`
**Reviewed up to commit**: `{full 40-character sha}` — "{commit subject line}"
**Changes**: +{additions} −{deletions} in {N} files (scope: {paths or globs reviewed})
**Recommendation: {Approve / Approve with minor cleanup / Request changes}{; short trailing clause when it adds information, e.g. "; no blockers found" or "; N blocker(s) below must be fixed first"}**

{One or two sentences on overall quality.}

---

## Findings summary

| # | Severity | Status | Finding | Origin |
|---|---|---|---|---|
| 1 | 🟡 Medium | Open | {one-line finding} | Exploitable since {YYYY-MM-DD}; new in this branch |

---

## Findings

### 🟡 N. {Short finding title}

**Severity:** {level}
**File:** [{file}:{line}]({file}#L{line}), `{other_file}:{line}`
**Exploitable since:** {YYYY-MM-DD} ({New in this branch / Pre-existing})
**Status:** {Open | Fixed on branch ({sha}) | Partly fixed on branch ({sha}); the remaining gap is Finding {N} | Needs validation}

**Problem.** {Plain, simple technical English: what's wrong, using the smallest code excerpt needed to show it.}

**Impact.** {The concrete failure scenario: what triggers it, who is affected, and what goes wrong.}

**Suggested fix.** {The smallest effective source change, stated concretely.}
```

Header block rules — every run, guidance or full-review mode, PR-scoped or whole-repo:

- **Title**: `## {Scope name} - Code Review Summary`. `{Scope name}` is a short human name for what was reviewed (e.g. a component/subsystem/feature name derived from the reviewed paths, or the PR title) — never the literal word "Scope" and never just a path.
- **Branch**: the branch under review → its base (`main` unless the user stated otherwise), exactly as `` `{branch}` → `{base}` ``.
- **Reviewed up to commit**: the full, untruncated 40-character SHA (not a short hash) reviewed by this run, an em dash, then that commit's subject line in quotes. On a branch-diff run this is the branch tip; on an incremental repeat run it's the new tip, and the report separately states the prior run's ref per Repeat runs on the same branch above.
- **Changes**: `+{additions} −{deletions} in {N} files`, then in parens the scope actually reviewed — the paths/globs, not a restatement of "branch diff."
- **Recommendation**: one of the three words, plus a short trailing clause stating the practical upshot — "no blockers found," "N blocker(s) below must be fixed first," or similarly concrete. Never leave the recommendation line bare.
- **Never omit or reorder these fields.** A guidance-mode review of a single file still produces this header, scaled to what was actually reviewed.

Findings rules:

- **Problem, explained simply.** State the concrete failure scenario — what input or timing triggers it, and what goes wrong — not an abstract description of the pattern. Use short code excerpts, not prose paraphrases of code.
- **One finding, one entry.** Don't bundle unrelated defects under one number even if they're in the same file.
- **Order by severity**, critical to low. Notes come after the findings and carry no severity.
- **Only independently-verified findings go in this table.** A finding must pass independent verification (Phase 3/5 in full-review mode, or a second read-through in guidance mode) before it's reported. An unverified lead goes to `needs_validation` framing instead of the table, whichever branch it's from.
- **Origin is honest, not assumed.** The date is the commit date of the lines that introduced the defect (`git log -S`, `git blame`); omit it rather than guess. Mark **New in this branch** only when `git log -1 -- {file}` (or `git blame` on the offending lines) shows the defect's lines were introduced or changed by a commit on this branch past the base — not merely that the finding lives in a file the branch touches. Otherwise mark **Pre-existing**. On a whole-repository run, every finding is **Pre-existing** unless the run also covers uncommitted/branch changes; state that plainly rather than guessing.
- **Pre-existing findings still get reported**, but they don't gate the Recommendation on their own — a 🔴 Critical or 🔴 High pre-existing finding is worth surfacing prominently (and still forces **Request changes** if it's newly *reachable* because of this branch's changes), but a pre-existing finding wholly unrelated to what the branch touches shouldn't block an otherwise-clean branch; say so explicitly in the summary sentence rather than leaving the reader to infer it from the table.
- Any 🔴 Critical or 🔴 High confirmed finding that is **New in this branch** means the recommendation is **Request changes**, never Approve or Approve with minor cleanup.

## Anti-patterns

Same nine from code-security-audit's Anti-patterns list, plus:

1. Style/formatting preferences with no concrete wrong behavior, presented as findings — that belongs in a linter, not this report.
2. Reporting a hypothetical defect ("this *could* race") without naming the concrete two actors and ordering that produce it.
3. Treating "different from how I'd write it" as a finding when the existing code is internally consistent with its siblings.
