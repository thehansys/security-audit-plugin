# Code Quality Classes

#### Quality classes — choose and split based on Phase 1

Select quality classes relevant to the changed or reviewed code. Not every class applies to every diff. Frame work as finding, validating, fixing, and prioritizing defects — not vulnerabilities. Keep validation to source review and bounded local fixtures/tests; do not develop exploit chains or test against live/shared services.

Use `confirmed` only when source evidence and (where applicable) a bounded local check establish a concrete wrong behavior, leak, or inconsistency. Use `needs_validation` when a specific runtime, deployment, or data fact is unavailable; state the missing fact and the safe local or owner-observed check that resolves it.

**Correctness and logic** (subagent_type: `general`)
Read the diff against its stated intent, not just for syntax validity.
- Does the code do what the surrounding tests, comments, PR description, or call sites imply it should?
- Off-by-one, inverted conditionals, wrong operator, wrong variable captured in a closure/block.
- Edge cases: empty collections, nil/null, zero, negative, duplicate, max-length, unicode.
- Does error handling change control flow correctly, or does a caught exception silently continue with bad state?

**Concurrency and races** (subagent_type: `general`)
- Check-then-act sequences that are not atomic (a flag set before the operation it describes has completed, as opposed to after).
- Shared mutable state read/written from more than one job, thread, or request without synchronization.
- Ordering assumptions between async operations (background job scheduled before its prerequisite transaction commits).
- Idempotency: what happens if the same job/request runs twice?

**Resource lifecycle and cleanup** (subagent_type: `general`)
- Every acquire (file handle, connection, temp file, upload, lock, transaction) has a matching release on every exit path, including exceptions.
- Orphaned records: a partial failure midway through a multi-step create leaves rows/files that nothing ever cleans up.
- Duplicated storage: data copied from a source that is never purged or detached afterward.
- Caps and limits: a downstream limit (quota, size cap, rate limit) that is bypassed because this new path doesn't go through the code that enforces it.

**Consistency with sibling code** (subagent_type: `general`)
- Compare the new code against its closest siblings (other tools in the same family, other controllers in the same resource, other jobs in the same queue). Same gating (feature flags, skill/permission requires), same validation, same error shape?
- Naming and vocabulary: does this introduce a second term for a concept the UI/domain already names consistently (e.g., a new "attach" when the rest of the product says "import")?
- Leaked authoring artifacts: draft notes, meta-instructions, or placeholder text that made it into shipped strings, docs, or prompts.

**Stale comments, dead code, and illogical code** (subagent_type: `general`)
Report these even when they don't change behavior — they mislead the next reader, which is its own defect. Usually a note without severity unless the staleness itself causes a wrong decision, which makes it Low (see Severity in SKILL.md).
- **Stale/misleading comments**: a comment that describes an older version of the code below it — a renamed parameter it still refers to by the old name, a condition it says is impossible that the code now allows, a "TODO" for work that's already done, a rationale that no longer matches what the code does.
- **Dead code**: unreachable branches (a condition that can never be true/false given its guards), functions/methods/exports nothing calls, commented-out code left in, a feature flag whose both branches now do the same thing.
- **Leftover scaffolding**: debug logging, `console.log`/`binding.pry`/`puts`/print-debugging, commented-out blocks, TODO/FIXME/HACK left from the change itself rather than pre-existing.
- **Nonlogical/contradictory code**: a condition that contradicts an earlier check on the same value (an `if` whose branch can't be reached because an earlier guard already excluded it), duplicated logic that's diverged from its original copy, a variable assigned and never read, a loop whose body can't change its own exit condition.

**API and interface clarity** (subagent_type: `general`)
- Does a tool/method/endpoint's name and description match what it actually does, and what a caller would plausibly search for?
- Are parameters documented accurately (required vs optional, units, defaults)?
- Breaking changes: does this change a public method signature, serialized format, or stored data shape in a way that breaks an existing caller or existing rows?

**Test coverage** (subagent_type: `general`)
- Does the diff add tests for its new behavior, including the failure/edge paths it introduces?
- Do existing tests still assert the right thing, or did the diff change behavior without updating an assertion that should have caught it?
- Is a race, cleanup, or ordering bug found above actually testable, or does it need a regression test added as part of the fix?

**Performance and efficiency** (subagent_type: `general`)
- N+1 queries, unnecessary allocations in hot paths, repeated work that could be cached or hoisted out of a loop.
- Unbounded reads (loading a whole table/file into memory where a streaming or paginated approach exists elsewhere in the codebase).

**Database migrations** (subagent_type: `general`)
Every `db/migrate/*` file in scope, checked independently of whether the migration also touches application code:
- ActiveRecord model/query calls in place of raw SQL: a migration that instantiates and saves model rows runs validations/callbacks and issues one query per row instead of one set-based statement — flag it and suggest `execute("...")` or `update_all`/`insert_all`.
- N+1 per-row loops (`Model.find_each { |r| ... }` doing a query or write per iteration) — a migration runs once against full production data volume with no request timeout, so this is a production-incident risk, not just inefficiency.
- A concurrent index (`algorithm: :concurrently`) without `disable_ddl_transaction!`, or any backfill against a large table with no batching that holds a long transaction/lock.
- A column/table rename or drop with no expand/contract safety for code from the previous deploy that's still running.

**Wildcard** (subagent_type: `general`)
You are not given a category. Find defects outside the standard classes already assigned.

Read code that looks boring or mechanical. Follow incomplete, experimental, or bolted-on features.
- What is the strangest code in this diff? Why does it exist?
- What assumption does this code make about a caller, an ordering, or an environment that isn't guaranteed?
- If a comment explains why something is safe or correct, verify the explanation still holds after this change.
- Look at what the tests do NOT cover, compared to what the diff actually changed.

Pursue anomalies inside your assigned scope until the question is settled. Report each result with the same evidence bar as every other class: a concrete file:line, the wrong behavior it produces, and the input/state that triggers it — not a stylistic preference.
