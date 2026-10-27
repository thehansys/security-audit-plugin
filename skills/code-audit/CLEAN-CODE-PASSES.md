# Clean-code and style passes

Loaded from [SKILL.md](SKILL.md). Besides the quality hunters, use these existing Claude Code skills and agents when the host has them. Each is optional: skip any that are missing (on Cursor, for example), and the quality hunters still cover the same classes.

| Concern | Use | When |
|---|---|---|
| Reuse, simplification, efficiency, dead code | `simplify` skill | After the review, to apply approved cleanups to the diff. Quality only; it does not hunt bugs. |
| Clarity and consistency of changed code | `code-simplifier` agent (`code-simplifier:code-simplifier` or `pr-review-toolkit:code-simplifier`) | On recently changed code, preserving behavior |
| Style and project conventions (CLAUDE.md) | `pr-review-toolkit:code-reviewer` agent | Guidance mode on a PR-sized diff |
| Stale or misleading comments | `pr-review-toolkit:comment-analyzer` agent | When the diff adds or changes comments or docstrings |
| Swallowed errors, bad fallbacks | `pr-review-toolkit:silent-failure-hunter` agent | When the diff touches error handling |
| Test coverage gaps | `pr-review-toolkit:pr-test-analyzer` agent | When the diff adds or changes behavior |
| Type design | `pr-review-toolkit:type-design-analyzer` agent | When the diff adds or changes types |

Rules for using them:

- **Findings still follow this skill.** Treat their output as candidates. Verify each against source and give it a severity from [SKILL.md](SKILL.md)'s Severity section before it enters the report, since their anchors differ from ours.
- **Cleanups are not findings.** Style or simplification suggestions with no concrete failure scenario go in the report's Notes, without severity, or are applied by `simplify`, and never inflate the findings table.
- **Don't apply changes during the review.** Run `simplify` or `code-simplifier` only after reporting, and only when the user wants the cleanups applied.
- **Keep them cheap.** These agents count toward the agent budget and the concurrency limit in [Subagent spawning](../code-security-audit/SKILL.md#subagent-spawning). Pick only the rows whose "When" matches the diff, and don't run all of them by default.
