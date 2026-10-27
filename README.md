# Security Audit Plugin

A plugin for AI coding agents (Claude Code, Cursor, OpenAI Codex, Google Antigravity) that audits your source code for security vulnerabilities and bugs, then keeps a running record of what it found.

## What it does

- **Security audit.** Reviews a repository, branch, or pull request for vulnerabilities: injection, broken access control and tenant isolation, account takeover, SSRF, unsafe file and archive handling, weak crypto, secrets in code and logs, dependency and CI/CD supply-chain risk, denial of service, and more. Findings are tied to a real trust boundary and a traced path, not a keyword match.
- **Pen-test style vulnerability hunting.** Thinks like an attacker: inventories every input, traces each one to every place it ends up (database, disk, logs, outbound requests), and validates candidates with independent verifiers. It works from source and bounded local checks only, with no live exploitation and no testing of shared or production systems.
- **Bug hunting.** A separate code-audit skill reviews a diff or branch for correctness bugs: wrong early returns, removed validation, race conditions, resource leaks, float errors in money, dead code, stale comments, and missing tests.
- **Continuous tracking.** On a schedule it audits only what changed since the last run and keeps `AUDIT.md` and `FINDINGS.md` up to date on the branch. Run it with `/security-audit:perform-continuous-audit`; details in [CONTINUOUS-AUDIT.md](skills/code-security-audit/CONTINUOUS-AUDIT.md).
- **Fix guidance.** Every finding comes with the smallest source change that closes the problem and a regression test to add. The audit itself never edits your code; applying fixes one reviewable step at a time is planned.

## How it works

1. **Scope.** Map the code, trust boundaries, and entry points; on later runs, start from the last audited commit.
2. **Hunt.** Split the work between focused hunters so no two scan the same files, using attack-class guides and a common-vulnerability field guide.
3. **Trace.** Follow every new or changed input to every destination, including stored copies and their later readers.
4. **Verify.** Fresh verifiers independently check each candidate; unproven leads stay marked "needs validation".
5. **Report.** Findings are rated critical, high, medium, or low, with problem, impact, and suggested fix, sorted by severity.

## Installation

One repository, several plugin manifests. The skills in `skills/` are shared by every tool, and the commands in `commands/` by the tools that support them:

```
.claude-plugin/plugin.json   # Claude Code
.cursor-plugin/plugin.json   # Cursor
.codex-plugin/plugin.json    # OpenAI Codex
skills/                      # code-security-audit, code-audit
commands/                    # perform-code-audit, perform-code-security-audit, perform-continuous-audit
```

Repository: <https://github.com/thehansys/security-audit-plugin>

**Claude Code:** install from the GitHub repo URL (for example `https://github.com/thehansys/security-audit-plugin/tree/main`), or add it as a local plugin.

**Cursor:** install from the same GitHub repo URL, or for local testing clone it to `~/.cursor/plugins/local/security-audit` and run **Developer: Reload Window**. Cursor finds `skills/` and `commands/` by convention.

**OpenAI Codex:** the plugin carries a `.codex-plugin/plugin.json` that points at `skills/`. Codex does not map Markdown commands, so use the skills directly: `code-security-audit` (which also does continuous audits, so ask it for a continuous or incremental audit) and `code-audit`. Install through Codex's plugin flow, or copy the two skill folders into a Codex skills directory.

**Google Antigravity:** Antigravity loads skills, not plugins. Copy or symlink the two folders from `skills/` into `<project>/.agents/skills/` (one project) or `~/.gemini/config/skills/` (all projects). Keep `code-security-audit` and `code-audit` together, because they link to each other by relative path. `npx skills add thehansys/security-audit-plugin` installs to `~/.agents/skills`, which the Antigravity IDE reads but the Antigravity CLI does not; for the CLI, copy the folders to the project or to `~/.gemini/antigravity-cli/skills/`.

Compatibility notes: the skills are written agent-neutral (see "Platform terminology" in `skills/code-security-audit/SKILL.md`). Subagent delegation, the model-tier rule, and scheduling depend on what each tool offers; where delegation is missing the skills fall back to one agent working in order. The Codex and Antigravity paths and manifest fields come from public docs and tutorials, not from a tested install, so check them against each tool's current documentation.

## Credits

The audit skills are based on Cloudflare's [security-audit-skill](https://github.com/cloudflare/security-audit-skill) (MIT)

## License

[MIT](LICENSE)