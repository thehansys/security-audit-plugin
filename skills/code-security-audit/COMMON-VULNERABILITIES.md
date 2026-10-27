# Common Vulnerabilities

#### When to use this file

A language-neutral field guide to classes found in most codebases: the problem, what to look for, and the fix. Ruby examples are in [Examples by language](#examples-by-language). It is a general reference, not a domain companion: use it while hunting (Phase 2), when answering a guidance-mode question, or to sanity-check a candidate's class. It complements [ATTACK-CLASSES.md](ATTACK-CLASSES.md) (hunter roles), [INPUT-TRACING.md](INPUT-TRACING.md) (source-to-sink tracing), and [CWE-OVERVIEW.md](CWE-OVERVIEW.md) (CWE labels). Use the domain companions listed in `ATTACK-CLASSES.md` for browser, auth, protocol, cloud, and native depth.

Examples are leads, not proof. Every candidate still needs the evidence bar in `SKILL.md`: a real boundary, a lower-trust principal, a traced path, a concrete result.

## Core discipline (include in every agent prompt using this file)

```
- Match the pattern, then trace it: name the source, the sink, and every control between them. A pattern match alone is not a finding.
- Check the framework first. Parameterized queries, auto-escaping templates, and built-in CSRF protection are real controls; verify they apply on this path and are not bypassed by a raw escape hatch.
- Fixes must close the class at the sink (parameterize, encode for context, allow-list, authorize), not filter known-bad input, and must hold on every sibling path.
- Audit invariants, not just functions: one tenant never reads another's data, a token is consumed at most once, a balance never goes negative, a lower role never grants a higher one.
- Where security depends on ordering or uniqueness, establish what makes the operation atomic (transaction, lock, constraint) and test competing requests locally.
- Follow the whole request path (proxy, cache, middleware, normalization, serialization, jobs, downstream services): a check can be right in isolation and ineffective in the deployed path.
- Audit trust transitions: where external data becomes an identity, command, authorization decision, config value, cache entry, or stored record. Treat webhooks, provider responses, package metadata, retrieved documents, tool output, and AI-generated content as untrusted.
- Compare alternate paths to the same resource (REST, GraphQL, WebSocket, admin, jobs, imports, exports, internal APIs), and check failure behavior (timeouts, retries, partial writes, stale caches) fails closed.
- A dangerous API, missing header, old dependency, or theoretical race is a lead, not a finding: require attacker control, the boundary, the runtime behavior, and the impact.
```

## OWASP Top 10 mapping

Use the category as a label in reports, never as evidence. This maps to the OWASP Top 10:2025 list; check owasp.org for the current edition if the labels matter for your report.

| OWASP category | Where to look in this skill |
|---|---|
| A01 Broken Access Control (includes SSRF) | Access control, privilege escalation, IDOR, SSRF below; [DATA-ISOLATION-AND-LIFECYCLE.md](DATA-ISOLATION-AND-LIFECYCLE.md) |
| A02 Security Misconfiguration | Misconfiguration below; [CLOUD-AND-DEPLOYMENT.md](CLOUD-AND-DEPLOYMENT.md) |
| A03 Software Supply Chain Failures | [SUPPLY-CHAIN-AND-RELEASE.md](SUPPLY-CHAIN-AND-RELEASE.md) |
| A04 Cryptographic Failures | Secrets and cryptography, weak ciphers, hashes and protocols below |
| A05 Injection | SQL injection, command injection, XSS, path traversal, deserialization below |
| A06 Insecure Design | Business logic and chained vulnerabilities in `ATTACK-CLASSES.md` |
| A07 Authentication Failures | Account takeover and CSRF below; [WEB-PROTOCOL-AND-AUTH.md](WEB-PROTOCOL-AND-AUTH.md) |
| A08 Software or Data Integrity Failures | Deserialization below; supply chain companion |
| A09 Security Logging and Alerting Failures | Log injection and missing audit trails below |
| A10 Mishandling of Exceptional Conditions | Error handling below |

Other coverage references: the OWASP API Security Top 10 (object- and property-level authorization, sensitive business flows, unsafe consumption of APIs) and, for AI-enabled applications, the OWASP Top 10 for LLM Applications (excessive agency, unbounded consumption, vector and embedding weaknesses, system-prompt leakage). Use them as coverage checks, not exhaustive catalogs.

---

## Injection

**SQL / NoSQL injection.** Request data becomes query structure instead of a bound value.
- Look for: concatenation, f-strings, `%`, `#{}` in SQL, including ORM `raw`/`extra`/`where("...")`/`order`/`from`/`Arel.sql`; dynamic **identifiers** (column, table, sort, `LIMIT`) that parameters cannot protect; stored values reused in later queries (second-order); NoSQL operator injection (`{"$ne": null}`), `$where`.
- Trace each raw fragment: request-derived or internal? Only request-derived is a finding (see `ATTACK-CLASSES.md`).
- Fix: bound parameters; identifiers from a fixed allow-list. Least-privilege DB accounts limit blast radius but do not fix the bug.

**Command / code injection.** Input reaches a shell, process API, or evaluator.
- Look for: `shell=True`, `system`, backticks, `exec`, `popen`, `eval`, `Runtime.exec` with one string; argument injection without a shell (value starting with `-`: `--upload-pack=`, `-o ProxyCommand=`); filenames, URLs, branch names passed to git, ImageMagick, ffmpeg, curl, tar; SSTI; dynamic `require`/`import`/`constantize`; pre-joined command strings.
- Fix: argv arrays with no shell, `--` before untrusted positionals, allow-listed commands, flags, and classes; prefer a library.

**XSS.** Attacker data rendered as HTML/script in another user's session (self-XSS is not a finding; DOM sinks: [CLIENT-SIDE.md](CLIENT-SIDE.md)).
- Look for: escape hatches (`innerHTML`, `dangerouslySetInnerHTML`, `v-html`, `|safe`, `html_safe`, `raw`, `mark_safe`, `{{{ }}}`); unsafe contexts even when escaped (`javascript:` in `href`, event handlers, `<script>`, CSS, unquoted attributes); unsanitized Markdown/rich text; SVG/HTML uploads on the app origin; stored content shown to admins or staff (highest impact). Missing CSP is hardening, not the bug.
- Trace to a page another principal views; name the victim and session at risk.
- Fix: framework auto-escaping, no escape hatches, a maintained allow-list sanitizer, URL scheme checks, uploads from a separate origin or `attachment`, CSP as defense in depth.

**Open redirect and unvalidated forwards.** A redirect target comes from the request (`next`, `return_to`, `redirect_uri`, `url`, `Referer`, `state`) and is not validated, so a trusted link sends the victim to an attacker's site. After login it is a phishing and token-theft step; in OAuth/SSO it can leak codes and tokens.
- Look for: redirects after login, logout, signup, password reset, and language or tenant switch built from a parameter; `redirect_uri` matched by prefix, substring, or wildcard; checks that only test `startsWith("/")` (`//evil.com` and `/\evil.com` pass) or only look for the expected host in the string (`evil.com/trusted.com`, `trusted.com@evil.com`); `javascript:` or `data:` targets in client-side `location` or `href`; server-side forwards and `X-Forwarded-Host`/`Host`-built absolute URLs; redirects that carry tokens in the query string.
- Fix: redirect only to relative paths parsed and re-built by the server, or to an exact-match allow-list of full URLs; reject anything with a scheme, host, or backslash; for OAuth compare `redirect_uri` exactly; keep tokens out of redirect URLs; a no-redirect default when the target is invalid.

**Content Security Policy and insecure transport.** A weak or missing CSP, or mixed and plaintext HTTP, removes a layer that limits what injected or hijacked content can do. Report it as a finding only when it is the control that decides an actual abuse path (for example an XSS or injection that the CSP should contain), and otherwise as hardening.
- Look for: `script-src` with `'unsafe-inline'`, `'unsafe-eval'`, `*`, `data:`, bare `https:`, or whole CDNs that host attacker-uploadable content; no `object-src 'none'`, `base-uri`, `frame-ancestors`, or `form-action`; a CSP set by a `<meta>` tag only, set only on some routes, or in report-only mode forever; a reflected nonce or a nonce reused across responses; `http://` subresources, forms, or WebSocket (`ws://`) endpoints on HTTPS pages (mixed content); no HTTPS redirect, no HSTS, cookies without `Secure`; `connect-src`/`img-src` open to any host so data can leave.
- Fix: nonce- or hash-based `script-src` with `'strict-dynamic'` and no `unsafe-inline`/`unsafe-eval`; `object-src 'none'`, `base-uri 'none'`, `frame-ancestors` and `form-action` set; enforce HTTPS everywhere with HSTS and `Secure` cookies; no `http://` or `ws://` resources; test the policy in report-only first, then enforce.

**Third-party scripts and dynamic imports.** The page loads code from a CDN or another origin with no fixed version and no integrity check, so whoever controls (or compromises) that origin runs code in your origin with your users' sessions. This is the browser-side supply chain (see [SUPPLY-CHAIN-AND-RELEASE.md](SUPPLY-CHAIN-AND-RELEASE.md)).
- Look for: `<script src>` or `<link rel="stylesheet">` from a CDN without `integrity="sha384-..."` and `crossorigin`; floating versions (`@latest`, `@3`, no version, `/dist/` of a branch, unpinned `esm.sh`/`unpkg`/`cdn.jsdelivr.net`/`cdnjs` URLs); dynamic `import("https://...")`, `importScripts`, `eval`-loaded remote code, and script tags injected at runtime from a remote URL; tag managers and analytics snippets that load further scripts at will; remote modules in Deno, import maps, or `fetch`-then-`eval`; scripts included on pages that handle credentials, payments, or admin actions; a CSP that allows the whole CDN.
- Fix: self-host and vendor the dependency from your own origin where possible; otherwise pin an exact version and add Subresource Integrity (`integrity` hash plus `crossorigin="anonymous"`) so a changed file is refused; lock remote module versions and hashes in the lockfile or import map; avoid third-party scripts on sensitive pages (or isolate them in a sandboxed iframe); restrict `script-src` to your origin and specific hashes; review and monitor any script you cannot pin.

**Dependency pinning, release age, and abandoned packages.** Application and UI dependencies (npm and any other package manager) are pulled in at versions nobody reviewed, the moment they are published, or long after anyone maintained them. One compromised or malicious release then runs in your build, your server, or your users' browsers. Deeper treatment: [SUPPLY-CHAIN-AND-RELEASE.md](SUPPLY-CHAIN-AND-RELEASE.md).
- **Unpinned versions.** `package.json` ranges (`^`, `~`, `*`, `latest`, `x`, `>=`), git or URL dependencies on a branch or tag instead of a commit, no committed lockfile (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Gemfile.lock`), or CI that runs `npm install` and rewrites the lockfile instead of `npm ci` / `--frozen-lockfile`; lockfile changes not reviewed; integrity hashes removed; the same gaps in `requirements.txt`, `Gemfile`, Docker base image tags (`:latest`), GitHub Actions (`@main`, tags instead of commit SHAs), and CDN imports.
- **No wait after release.** Updates are adopted the moment a version is published, so a hijacked maintainer account or a malicious release lands before the community notices and yanks it. Look for auto-merged dependency PRs, `npm update` in CI, and no minimum release age. A cooldown of at least 48 hours (longer for major or low-reputation packages) gives time for removal. Tools: Renovate `minimumReleaseAge`, Dependabot `cooldown`, pnpm `minimumReleaseAge`, Yarn `npmMinimalAgeGate`, npm `--before=<date>`; names vary by version, so check yours.
- **Install-time code.** `preinstall`/`install`/`postinstall` scripts of dependencies run with the developer's or CI's privileges and secrets; look for scripts allowed by default, tokens present in the install environment, and no `--ignore-scripts` (with an explicit allow-list for the few packages that need them).
- **Name and source confusion.** Typosquats, dependency confusion (an internal package name also published publicly, no scoped registry or `.npmrc` mapping), packages whose maintainer changed or whose repo is not the one claimed, and dependencies added without review.
- **Old and unmaintained packages.** Packages with no release for roughly 5 to 10 years or more, archived or read-only repositories, packages marked deprecated, abandoned forks, or runtime or framework versions past end of life. They receive no security fixes, often carry known CVEs, and are easy takeover targets. Judge by the last release, the repository state, open security advisories, and whether a maintained replacement exists, not by age alone: a small stable library with no known issues is hardening, while an unmaintained package on a sensitive path (parsing untrusted input, auth, crypto, build tooling, code that runs in the browser with user sessions) is a finding.
- **Reachability and weight.** Report by what the package can do (runs in the browser with sessions, in the build with secrets, on the server with data), not just that it is old. A vulnerable dev-only dependency that never ships is low.
- Trace: manifest and lockfile → how installs run (CI, Docker, developer machines) → what the package executes (install scripts, build plugins, runtime code, browser bundle) → what secrets and sessions it can reach.
- Fix: exact versions and a committed lockfile enforced with `npm ci` (or the manager's frozen mode); reviewed lockfile diffs; a minimum release age of at least 48 hours before adopting a new version (and no auto-merge of major updates); `--ignore-scripts` by default; scoped registries and verified package names and maintainers; provenance and signature checks where available (`npm audit signatures`); pin actions and images by commit SHA or digest; replace or fork abandoned packages on sensitive paths and add dependency review and SBOM or audit steps (`npm audit`, `osv-scanner`) to CI.

**Path traversal / unsafe files.** A caller path or filename escapes the directory, or an upload is stored or executed unsafely.
- Look for: `join` with input (absolute path replaces base), serving by name, archive extraction (zip slip), symlinks, client-chosen filenames/extensions/content types, template or include chosen by input.
- Fix: server-generated names; resolve the real path then check containment; reject symlinks; validate type server-side; store uploads outside the web root.

**SSRF and unsafe outbound requests.** The server makes an HTTP, DNS, or socket request to a destination the caller influences, or makes outbound requests unsafely. Covers anything that fetches: URL fetchers, webhooks, preview/PDF/image generators, import-from-URL, OIDC/OAuth discovery and token URLs, LLM base URLs, database or broker hosts, package and update checks, email and DNS lookups.
- **Reaching internal targets.** `localhost`, `127.0.0.0/8`, `::1`, `0.0.0.0`, private ranges (`10/8`, `172.16/12`, `192.168/16`), link-local and cloud metadata (`169.254.169.254`, `fd00:ec2::254`, metadata hostnames), IPv6-mapped IPv4, internal DNS names and ports, container and Kubernetes service addresses. Alternate encodings bypass naive checks (decimal, octal, hex, short forms like `127.1`, userinfo `evil@host`, trailing dots, Unicode lookalikes). Metadata exposure compounds with IMDSv1 and a high hop limit.
- **Check-versus-use gaps.** The allow-list is checked on the URL before interpolation or redirect; the validator parses a different host than the client dials; DNS is resolved once to check and again to connect (rebinding); a redirect leads to an internal host.
- **Redirect and loop abuse.** Auto-followed redirects with no hop cap (redirect loops hang or exhaust workers); a URL that points back at the app or another internal endpoint that fetches again, creating an infinite request loop or amplification between services; fetch-triggered fetches (a preview of a page that triggers more previews); webhook retries with no limit or backoff. Fix: cap hops (a few), cap depth and recursion, detect self and internal targets, and give outbound requests an idempotency or loop-guard header the app refuses to follow.
- **Unbounded resource use in the fetch itself.** No connect/read/total timeout, no response size cap (a slow or endless body fills memory or disk), no cap on decompressed size, unbounded concurrent fetches per caller, and blocking DNS lookups in the request thread. Unbounded or attacker-chosen DNS lookups can also be used for DNS exfiltration of data in subdomain labels.
- **Dangerous schemes and protocols.** `file://`, `gopher://`, `ftp://`, `dict://`, and custom schemes; `http` where only `https` is expected; Ruby `open`/`URI.open` treating `|cmd` as a command on old versions.
- **TLS not verified.** Certificate or hostname verification disabled (`verify=False`, `VERIFY_NONE`, `rejectUnauthorized: false`, `InsecureSkipVerify`, `danger_accept_invalid_certs`), validation callbacks that return true, plaintext HTTP fallback, and trust of any proxy set by environment variables. An attacker on the path reads or alters the traffic, including the secrets in it.
- **Secrets sent to untrusted URLs.** Authorization headers, cookies, API keys, OAuth client secrets, signed tokens, or request bodies sent to a caller-chosen URL or to a host reached by redirect (307/308 re-send body and headers); client credentials replayed to a token URL read from untrusted configuration or discovery; secrets embedded in outbound URLs and so logged by the destination. Fix: attach credentials only to the exact allow-listed host, strip sensitive headers on cross-host redirects, and never put secrets in URLs.
- **Response handling.** Full-read SSRF returns the response to the caller; blind SSRF leaks through timing or errors; fetched content is trusted (parsed as HTML, XML, or an archive) without limits.
- Trace: caller input → URL or host construction → validation → DNS → connection → redirect handling → headers and credentials attached → response use. Name what an attacker reaches and what secrets leave.
- Fix: destination allow-list (scheme, host, port); resolve DNS once, reject loopback, private, link-local, and metadata addresses, then connect to that resolved IP (or pin it); redirects off, or re-validate every hop with a small cap; short timeouts, response size and concurrency caps; TLS verification on; credentials only to the intended host; egress firewall and IMDSv2 as defense in depth; no fetches of the app's own origin.

**Deserialization / XXE.** Parsing attacker-supplied serialized data runs code or reads files.
- Look for: `pickle`, `marshal`, unsafe `yaml.load`/`YAML.load`, `Marshal.load`, `ObjectInputStream`, `BinaryFormatter`, `unserialize`, `Oj.load` in default object mode, `node-serialize`; XML with DTDs/external entities; polymorphic type fields.
- Fix: data-only formats with schema validation, safe loaders (`mode: :strict`), DTDs off, authenticate blobs before parsing.

**Connection-string / config-format injection.** Values concatenated into a delimiter format (libpq key=value, DB URIs, Oracle Easy Connect, headers, generated scripts, `psql` `\set`) let the caller add parameters or break out.
- Look for: concatenated DSNs/URIs, `Content-Disposition` built from names, exports a customer later loads with a tool that interprets meta-commands or backticks.
- Fix: structured driver arguments or an escaping builder; strict per-component patterns; quote or reject names reaching scripts.

**Log / header / CSV injection.** CR/LF or control characters forge log lines or split headers; `=`,`+`,`-`,`@` cell prefixes become formulas.
- Fix: strip or encode control characters, structured logging, prefix formula characters on export.

---

## Access control and accounts

**Broken access control / IDOR / privilege escalation.** A caller reads or changes what they should not: other users' or tenants' records, admin functions, fields.
- Look for: authentication without authorization, UI-only checks; lookups by ID with no owner or tenant scope; list/export/search/bulk paths skipping per-item checks; multiple paths to one action (REST vs GraphQL, v1 vs v2, admin vs user, job) with inconsistent checks; mass assignment of `role`, `is_admin`, `owner_id`, `tenant_id`, `plan`; granting roles above the actor's; client-supplied identity (`X-User-Id`, unverified JWT claims); verb tampering, unlinked admin routes, state-changing GET; viewers able to call write actions because only a view check runs.
- Trace entry point → check (or absence) → data access; compare checks across every route to the same resource.
- Fix: server-side authorization on every request, centrally (policy layer, scoped queries like `current_user.invoices.find(id)`); deny by default; allow-list assignable fields; identity and tenant from the session; test other-user, other-tenant, lower-role cases.

**Sensitive data in serialized output.** Secrets or fields reach viewers because masking sits in one serializer hook but not the one used.
- Look for: masking in `as_json` but not `serializable_hash`/`to_h`/`toJSON` (nested `include:` skips it); broadcasts and WebSocket payloads sending whole records to every subscriber (read-only members, staff); credentials, tokens, connection parameters, IPs in view payloads, debug endpoints, errors; plaintext stored secrets.
- Fix: per-audience field allow-lists, masking where every path passes, a test serializing each sensitive model through a parent's `include:`, encrypt secrets at rest.

**Sensitive data in logs.** Passwords, tokens, API keys, session cookies, payment card data (PAN, CVV), national ID or social security numbers, health and other personal data are written to logs, error trackers, APM, analytics, or audit trails. Logs have a wider audience, longer retention, backups, and third-party processors than the data store, so one logged value becomes a leak (and a compliance failure: PCI DSS forbids storing CVV and unprotected full card numbers).
- Look for: request or parameter dumps (`logger.info(params)`, `request.body`, `inspect`/`to_s`/`repr` of objects holding secrets); missing or incomplete framework filters (Rails `filter_parameters`, Django `SENSITIVE_POST_PARAMETERS`); logged `Authorization` and `Cookie` headers; SQL or ORM debug logs with bound values; exception messages that embed values; tokens, reset links, and API keys in URLs and query strings (proxy and access logs keep them); job and queue arguments logged by the worker; error trackers and APM capturing bodies, breadcrumbs, headers, or default PII (`send_default_pii`); analytics and session replay; audit logs storing before/after values of sensitive fields; webhook and LLM prompt or response logs; client-side `console.log` of tokens or form data.
- Trace: treat logs and trackers as destinations in [INPUT-TRACING.md](INPUT-TRACING.md). For every sensitive input (credentials, card, ID number, personal data), list every log, tracker, and audit sink it reaches, who reads them, and how long they are kept.
- Fix: do not log the value at all; log an ID, a hash, or the last four characters. Where a value can still reach a sink, redact before it is written, centrally and by allow-list (log chosen fields, not whole objects), by key name and by value pattern (card numbers with a Luhn check, ID-number formats, bearer tokens, JWTs). Keep secrets out of URLs. Configure framework filters, job-argument redaction, and tracker scrubbing (`before_send`, PII off). Restrict log access, shorten retention, and add a test that captures logs for a sample sensitive request and asserts the secrets are absent.

**Session and token lifecycle.** Credentials or sessions outlive the event that should end them.
- Look for: credential changes without re-authentication; other sessions, remember-me cookies, API/OAuth tokens, WebSocket connections not revoked on password change, logout, demotion, removal; non-expiring invitation/reset tokens, tokens in URLs on pages with third-party scripts; queued jobs keeping a removed submitter's authority; impersonation outliving the operator's role.
- Fix: re-authenticate for credential changes, revoke everything on those events, expire single-use tokens, re-check authority when queued work runs.

**Account takeover.** Attacker controls someone else's account or session via sign-up, confirmation, reset, email change, linking, or sessions. Treat these as one surface (protocol detail: [WEB-PROTOCOL-AND-AUTH.md](WEB-PROTOCOL-AND-AUTH.md)).
- **Confirmation/reset links consumed by GET**: scanners, link previewers, antivirus gateways, and browser prefetch/autopreview fetch the URL before the user clicks, burning the token or performing the state change; an attacker can also trigger a GET-completed confirmation via an image or redirect. Landing page + POST to consume the token; GET has no side effects.
- **Pre-registration (pre-hijack)**: attacker signs up first with the victim's email (unconfirmed, attacker's password); victim later confirms or uses SSO and the attacker's password or session still works. Also invitations attaching roles to unconfirmed rows and merges on unverified email.
- **Unverified identity claims**: linking by OAuth/OIDC `email` without `email_verified`.
- **Credential change without re-authentication**, no notification to the old address, other sessions left alive.
- **Reset-link poisoning**: URL built from `Host`/`X-Forwarded-Host`; links sent or BCC'd to a different mailbox.
- **Weak tokens**: predictable, short, non-expiring, reusable, plaintext at rest, non-constant-time compare, leaked via `Referer`.
- **No brute-force control**: unlimited login/reset/MFA/current-password attempts, non-atomic counters, lockout usable against others.
- **Enumeration**: different responses or timing for known vs unknown emails.
- **MFA/recovery bypass**: recovery weaker than login, MFA only in the UI, immortal remember-device cookies, SSO-enforced domains accepting passwords.
- Trace every route to a session or credential change (sign-up, confirm, login, SSO callback, reset, email change, invitation, impersonation, API key creation): what proves identity, is it single-use and bound to the requester, what survives.
- Fix: CSPRNG tokens stored as digests, minutes-to-hours expiry, invalidated on use or reissue, rotate any pre-set password on first confirmation, canonical host in links, re-authentication and old-address notification on changes, revoke sessions, attempt limits with atomic counters, identical responses for unknown emails, `Referrer-Policy: no-referrer` on token pages.
- Report the combined chain (victim, attacker steps, missing proof, what the attacker ends up holding); link the parts.

**Multi-tenant isolation.** A tenant identifier or scope is lost in a secondary subsystem (details: [DATA-ISOLATION-AND-LIFECYCLE.md](DATA-ISOLATION-AND-LIFECYCLE.md)).
- Look for: global lookups by ID; cache keys without tenant identity; background jobs that load records without the originating tenant; object-storage keys from client input; shared exports and temp files; search indexes and vector stores queried without tenant filters; connections or transaction context reused across tenants; reads and writes in exports, async processing, retries, and cleanup jobs.
- Fix: derive tenant from trusted context, enforce scope centrally, composite keys or database-level isolation, tenant in every cache key, cross-tenant tests on every path.

**WebSocket, SSE, and long-lived sessions.** A connection keeps data or actions after its authorization changes.
- Look for: authorization only at the handshake; none per message or subscription; client-chosen rooms or channels; cross-tenant subscriptions; permissions revoked in the database but not on live connections; whole-record broadcasts; reconnects restoring old subscriptions or credentials.
- Fix: authorize each sensitive operation and subscription, scope channels to the principal, revalidate or drop connections when permissions change, serialize per recipient.

**GraphQL and object-property authorization.** Nested resolvers, aliases, and alternate fields expose data or actions that REST would block (see [PROTOCOLS-RPC-AND-MESSAGING.md](PROTOCOLS-RPC-AND-MESSAGING.md)).
- Look for: object-level checks missing in resolvers; sensitive fields reachable through nested associations; mutations bypassing REST rules; introspection where schema disclosure matters; unbounded depth, aliases, batching, fan-out, and pagination; request JSON bound straight onto models; response-side fields (internal notes, tokens, billing, other tenants' data) leaking through nested objects.
- Fix: enforce object- and field-level authorization at the resolver or data layer, per-role readable and writable field allow-lists, depth and complexity limits, query timeouts, separate public and persistence models.

**OAuth/OIDC and JWT validation.** Login, linking, or API access relies on incomplete validation (protocol depth: [WEB-PROTOCOL-AND-AUTH.md](WEB-PROTOCOL-AND-AUTH.md)).
- Look for: missing or unbound `state` and `nonce`; no PKCE or unchecked verifier; wrong `iss`/`aud`/`azp`; an ID token accepted as an access token; tokens from another tenant or IdP; weak redirect URI matching; IdP mix-up; code reuse; account linking on an unverified email; trusted `jku`/`jwk`; algorithm taken from the token, signature checks off, HS/RS confusion, weak HMAC secrets, expired tokens accepted, a token for one service or purpose replayed against another, key rotation leaving revoked keys valid.
- Trace authorization request → session binding → callback → code exchange → token validation → account selection or linking → session. Confirm what the library validates by default and what the app overrides.
- Fix: maintained OIDC library; validate issuer, audience, signature, expiry, and purpose; fixed server-side algorithms and keys; bind `state`/`nonce` to the session; PKCE; exact redirect matching; separate token types and audiences.

**SSO federation: trusting third-party tenants and unverified identity claims.** The app accepts an identity from an IdP or tenant it does not control, or keys an account on a claim the IdP does not guarantee, so an attacker with their own tenant or IdP signs in as someone else. Typical with Microsoft Entra ID (Azure AD), Google Workspace, Okta, and customer-configured SAML/OIDC.
- Look for:
  - **Any-tenant acceptance.** Multi-tenant Entra endpoints (`common`, `organizations`, `consumers`) with no check that `tid` and `iss` belong to an allowed tenant; issuer validation done by prefix or pattern; accepting tokens from any tenant of a multi-tenant app registration; guest, B2B, or personal Microsoft accounts treated like employees.
  - **Mutable or unverified claims as identity.** Keying or linking accounts on `email`, `preferred_username`, `upn`, `name`, or `mail` (in Entra the `email` claim can be set by a tenant admin or user and is not verified, so an attacker creates a user with the victim's address in their own tenant); missing `email_verified`; Google `hd` or domain suffix checks done on a string. Use the immutable pair (`iss`/`tid` + `sub`/`oid`) as the account key.
  - **Domain trust without proof.** Auto-join, role assignment, or SSO enforcement by email domain when the domain is not verified as owned by the tenant (no DNS TXT or similar proof); a customer who can register a domain they do not own and so claim its users, or take over existing accounts; unverified domains accepted for IdP configuration.
  - **Customer-configured IdPs.** A tenant admin can set the issuer, client ID/secret, metadata URL, or domain claims for their own org and so mint identities for emails in another org; shared callback URLs without tenant binding; staff or low-privilege roles allowed to edit SSO settings; IdP metadata fetched from an attacker URL (see SSRF).
  - **SAML specifics.** Unsigned assertions or only the response signed, signature wrapping, audience or recipient not checked, `InResponseTo` not bound to the request, replay without `NotOnOrAfter`, the NameID taken from the wrong element, XML parser differentials.
  - **Enforcement bypass.** Password or magic-link login still allowed for SSO-enforced domains, invitations or OAuth linking that bypass SSO, IdP-initiated flows with no state, and a second login path with weaker rules.
  - **Account linking and takeover.** First login by an unverified email creates a confirmed account; linking an IdP identity to an existing local account by email alone; deprovisioned or removed IdP users keeping sessions, API keys, or refresh tokens.
- Trace: IdP response → issuer and tenant validation → which claim becomes the account key → domain and tenant allow-list → account create or link → SSO enforcement and session. Compare every login path.
- Fix: validate `iss`, `aud`, and `tid` against an explicit per-customer allow-list (never "any tenant"); key accounts on the immutable (`iss`/`tid`, `sub`/`oid`) pair; use email only as an attribute, and only when verified; require proof of domain ownership before any domain-based trust; bind IdP config to the owning tenant and restrict who can edit it; enforce SSO on every login path; revoke sessions and tokens on deprovisioning; use a maintained SAML/OIDC library and check what it validates by default.

**CSRF.** A third-party page makes the victim's browser perform a state change with their cookies. It also forces logins into an attacker's account or tenant and completes OAuth/SSO or account links on the victim's behalf.
- Look for: cookie-authenticated changes without token, `SameSite`, or origin check; CSRF protection disabled; **state-changing GET** (confirm, downgrade, switch tenant, approve, SSO authorize/callback); login CSRF (no `state`/nonce bound to the browser); OAuth link confirmation not tied to the pending request; JSON endpoints accepting `text/plain`/form types, CORS `*` or reflected `Origin` with credentials; tokens not session-bound, still valid after login, or accepted from the query string; `SameSite=Lax` treated as complete (top-level GET still sent).
- Fix: framework CSRF tokens on all non-GET, mutations never on GET, `SameSite` Lax/Strict, `Origin` checks, per-session `state` for every SSO/OAuth flow, strict CORS, re-authentication for sensitive actions.

---

## Availability (denial of service)

A missing rate limit alone is hardening. A finding shows cheap caller input, a missing effective bound, and impact on others (see [RESOURCE-EXHAUSTION-AND-AVAILABILITY.md](RESOURCE-EXHAUSTION-AND-AVAILABILITY.md)). Never stress-test a shared or live service; use asymptotic analysis, small local fixtures, and strict local limits. State attacker cost, service cost, exhausted resource, who else is affected, and recovery.

| Resource | Look for (cap missing) | Fix |
|---|---|---|
| **Slow and held connections (Slowloris, slow body)** | small fixed worker pool without a buffering proxy; no header, body, idle, keep-alive, or total-request timeout; a client that sends the headers and most of the body but never the last chunk (or never finishes a chunked body), or reads the response slowly, so the worker or socket stays held; no per-client or total connection cap; unlimited idle WebSocket/SSE/long-poll connections with no ping or idle timeout; body read before auth; `Expect: 100-continue` waits | buffering proxy that reads the whole request before passing it on, short header and body-read timeouts, a total request deadline, idle and keep-alive timeouts (and WebSocket ping/idle limits), per-IP and total connection caps, async workers, authenticate before reading bodies |
| **Connections / pools / FDs / threads / job concurrency** | DB pool smaller than the sum of web threads, job workers, and consoles that share it (requests then queue on checkout and time out); Redis, cache, or broker connections opened per request or per job with no pool or `maxclients` headroom; job concurrency set higher than the DB or Redis pool or the downstream rate, with no per-queue or per-tenant cap, so one tenant's burst starves all others; connections not released on error or held across slow calls; open transactions or sessions with no `idle_in_transaction_session_timeout`, `statement_timeout`, or lock timeout; outbound calls without timeouts; thread/process/job per item; retries without backoff; FDs and sockets not capped (`ulimit`); WebSocket/ActionCable subscriptions with no cap | pools sized to the real concurrency (web threads + job concurrency + headroom <= DB `max_connections`), Redis and DB pools with checkout timeouts, a connection pooler where needed, bounded job concurrency per queue and per account with rate limits and bounded retries with backoff, statement, lock, and idle-in-transaction timeouts, timeouts on every outbound call, `ensure`/context managers, per-account caps |
| **Memory** | `read`/`all`/`to_a`/`json()` on caller-sized data; whole-file import or export; N+1 and eager loading; unbounded caches or in-memory output buffers; unlimited JSON/XML depth; no container memory limit | stream and batch (`find_each`, `iterator`), cap sizes before parsing, paginate, memory limits |
| **CPU** | ReDoS and user-supplied regex; superlinear loops on request-sized input; caller-chosen hash cost or slow hashes exposed unauthenticated; deep nesting, entity expansion, decompression bombs; heavy work in the request thread; event-loop/GIL/GVL blocking | size and depth caps, linear regex engines or timeouts (`Regexp.timeout`, RE2), queue with concurrency limits, never let callers choose work factors |
| **Disk** | uploads/exports/imports with no per-file, per-account, or total quota; logs with no rotation or logged bodies; unbounded rows or JSON columns per account; caches keyed by request input; temp files never purged; shared tool caches; sandbox staging without count/size limits; unbounded queues, dumps, archives; spawned tools writing caller-sized output (`ATTACH`, `VACUUM INTO`) | size/count/quota checks before writing, log rotation and truncation, TTLs, purge jobs, separate volumes, alerts |
| **Request size: headers, URL, body, fields** | no cap on the number of headers, a single header's size, total header size, cookie size, request line or URL length, number of query parameters or form fields, multipart parts, JSON/XML nesting, or total POST body size, at the proxy, the server, and the app (limits set only in the app are reached after the data is read); caps left at huge defaults; a header or field that is copied, logged, or reflected per request so one large value is multiplied; `Content-Length` trusted or chunked bodies unchecked | cap each at the edge and in the server (nginx `client_max_body_size`, `client_header_buffer_size`, `large_client_header_buffers`; Gunicorn `limit_request_line`, `limit_request_fields`, `limit_request_field_size`; Node `server.maxHeadersCount` and `--max-http-header-size`; Rack/Rails multipart and param-count limits), reject early with 413/431/414, and bound JSON/XML depth and field counts |
| **Uploads and POST bodies** | no limit on upload size, POST body size, part size, or file count (app and proxy), no cap on how much one user may write in total, size trusted from `Content-Length` or client metadata, unauthenticated direct-upload or presigned URLs without size cap or expiry, archive and image bombs | cap at proxy and app, stream to storage, quotas, bound decompressed size, entry count, image dimensions |
| **Archives, compression, recursion** | archive or compressed upload extracted or read with no cap on expanded size, ratio, entry count, name length, nesting, or time; declared sizes trusted; nested archives and documents unpacked recursively; symlink or directory cycles; XML entity expansion; huge image dimensions or frame counts; parsers with no recursion depth cap; expanded bytes not counted against the quota | stream with byte counters on real output, hard caps on expanded size, ratio, entries, depth, pixels, and time, no recursive unpacking, refuse links, sandbox with CPU, memory, and disk limits (see "Archive, compression bomb, and recursion attacks") |
| **Expensive endpoints** | cost scales with caller parameters (page size, date range, expand, GraphQL depth); cache-busting parameters; repeated polling; synchronous reports, PDFs, previews, LLM or paid-API calls; shared renderer without per-render limits | cap parameters, authenticate expensive work, queue with per-account and global concurrency, bound caches, per-render time and memory limits |
| **Money / quota** | unauthenticated or free-tier access to metered APIs, email/SMS, LLM | per-account budgets |

---

## Protocol, caching, parsing, and files

For deployed-path depth see [WEB-PROTOCOL-AND-AUTH.md](WEB-PROTOCOL-AND-AUTH.md), [PROTOCOLS-RPC-AND-MESSAGING.md](PROTOCOLS-RPC-AND-MESSAGING.md), and [DATA-ISOLATION-AND-LIFECYCLE.md](DATA-ISOLATION-AND-LIFECYCLE.md).

**HTTP request smuggling and desync.** Proxy, CDN, or load balancer and the backend disagree on where a request ends, so one request can prefix another user's request or bypass proxy controls.
- Look for: conflicting `Content-Length` and `Transfer-Encoding`, duplicate headers, malformed chunking, whitespace and normalization differences, HTTP/2 to HTTP/1.1 downgrade and conflicting `:authority`/`Host`, connection reuse after a rejected request, custom HTTP parsers.
- Trace client → CDN/proxy → protocol translation → backend parser → connection reuse; name which components disagree and what another request can be made to do.
- Fix: patched, supported proxy and server versions; reject ambiguous requests at the edge; no unsafe reuse or translation; test the real deployed combination. Report only with concrete impact.

**Web cache poisoning and deception.** The cache key and the application interpret a request differently, so attacker-influenced content is served to others or a private response is stored and shared.
- Look for: unkeyed inputs that change or are reflected in the response (`Host`, `X-Forwarded-Host`, `X-Original-URL`, content-negotiation headers, query parameters); cache rules by file extension or path that disagree with routing (`/account/x.css`); authenticated or personalized responses cacheable; cacheable errors and redirects; normalization differences (encoded separators, trailing slashes, query order).
- Trace attacker request → cache key → response → storage → victim request; identify the exact response that crosses users.
- Also application and data caches (`Rails.cache`, Redis, memcache, in-process memoization): keys built from attacker input (collisions, key flooding, delimiter tricks like `user:1` vs `user:1:admin`), keys missing the tenant or user, values written from unvalidated request or third-party data and read later as trusted (cache poisoning), a poisoned entry that persists after the bad request, no TTL or size cap, serialized objects loaded from a shared cache (deserialization), and cache stampedes on expensive misses.
- Fix: no caching of sensitive responses; `private`/`no-store`; keys that include every response-varying input and the tenant; validate data before it is stored; TTLs and size caps; consistent normalization. A missing directive alone is not proof: show a shared cache stores and serves it.

**Parser differentials and canonicalization.** Validation approves a representation that a downstream component interprets differently.
- Look for: validation before decoding or normalization; double URL decoding; encoded slashes and backslashes; Unicode normalization and case folding; trailing dots, IDNA/punycode in hosts; duplicate JSON keys; conflicting headers; different handling of empty, missing, null, and zero; path normalization differences between proxy, router, and filesystem.
- Trace raw input → validated form → transformations → downstream parser → sensitive operation.
- Fix: parse once with the standard library, validate the parsed form, use one canonical representation, reject ambiguous or conflicting input.

**Webhook authenticity and replay.** A forged or replayed event triggers a privileged action.
- Look for: JSON fields trusted without a signature; signature checked on a parsed body instead of the raw bytes; no timestamp or replay window; a secret shared across integrations; duplicate delivery repeating a payment, refund, or account change; event account, tenant, and object not validated independently of the signature.
- Fix: verify with the provider's documented scheme on the exact signed bytes, check freshness, dedupe on durable event IDs or idempotency, and validate the event against the affected account. A valid signature alone does not make an event safe to execute.

**Unsafe consumption of third-party APIs.** An external response is trusted more than the boundary allows.
- Look for: responses used to authorize a user, pick a tenant, set a price, or assign privileges without validation; external IDs mapped to local accounts incorrectly; no schema validation or size limit; HTML or URLs from external services rendered or followed; redirects that carry credentials to another host; identity-provider, payment, registry, search, and AI-provider outputs.
- Fix: validate schemas and expected identities, enforce local authorization and business rules, timeouts and size caps, treat the data as untrusted.

**Archives, media parsers, and temporary files.** Complex parsers and the filesystem are reached with attacker-controlled input.
- Archives and compressed uploads: see "Archive, compression bomb, and recursion attacks" below for path traversal (`../`, absolute paths, drive prefixes, symlinks, hard links, duplicate names) and for size, ratio, entry-count, and recursion limits.
- Image, PDF, document, and media parsers (ImageMagick, FFmpeg, PDF renderers, converters, OCR, XML): outdated versions, processing in the main app process, unbounded dimensions, pages, frames, or decompression, external references or embedded scripts. Fix: patch, run in a low-privilege sandbox without network, set file, dimension, page, memory, and time limits. A vulnerable library is not exploitable until the version and code path are reachable with attacker content.
- Temporary files: predictable names, check-then-open, shared writable directories, symlink following, loose permissions, cleanup of paths derived from input, exports readable by other tenants. Fix: secure temp APIs, exclusive creation, restrictive permissions, descriptor-based operations.

**Archive, compression bomb, and recursion attacks.** An upload, import, or downloaded file expands far beyond its size, nests, or loops, exhausting CPU, memory, disk, or file descriptors, or writes where it should not. Applies to ZIP, TAR, GZIP, BZ2, XZ, ZSTD, 7z, Office/ODF documents (ZIP inside), images, PDFs, XML, JSON, and `Content-Encoding` on request bodies.
- **Compression bombs.** A tiny archive expands to gigabytes (very high ratio, `42.zip`-style nesting, overlapping entries that reuse the same data, sparse or zero-filled files, ZIP64 and tar headers declaring sizes that do not match the data, multi-layer gzip). Check for extraction or reading that trusts declared sizes, reads the whole result into memory (`read`, `extractall`, `decompress`), or has no output byte counter.
- **Recursion and nesting.** Archives inside archives, documents embedding archives, recursive includes or references, symlink and directory cycles during extraction or directory walks, deeply nested XML/JSON/YAML/PDF object trees, XML entity expansion (billion laughs, external entities), image formats with huge dimensions (pixel floods) or many frames, parsers that recurse per level with no depth cap (stack exhaustion), and "unpack everything" jobs that re-queue themselves.
- **Entry and file floods.** Millions of tiny entries, huge directory fan-out, entries with enormous names, many uploads in parallel, or a quota that counts the compressed size but not the expanded size; temp or staging directories with no file-count or total-size cap (a cap bypassed by special names counts as no cap).
- **Path and link attacks inside archives.** `../` and absolute paths, Windows drive prefixes and backslashes, symlink or hard-link entries pointing outside the target, duplicate names that overwrite earlier files, device and special files, permission bits (setuid) preserved on extract.
- **Where the cost lands.** Request thread (blocks workers), background job (starves queues), shared tool cache, disk, or a conversion sidecar that serves all tenants.
- Trace: upload endpoint → size and type checks → decompression or parse → destination path → what runs on the result (indexing, thumbnail, conversion, virus scan) and who is affected when it exhausts.
- Fix: stream extraction with counters on actual bytes written, not declared sizes; cap total expanded size, compression ratio, entry count, entry name length, nesting depth (do not extract nested archives, or allow one level), recursion depth, pixel count, and elapsed time; abort when any cap is hit; resolve every destination path and verify it stays inside the target; refuse symlinks, hard links, and special files; strip permission bits; extract into an isolated, quota-limited directory or sandbox with no network; run in a job with CPU, memory, and disk limits; count expanded bytes against the account's disk quota; disable external entities and DTDs in XML.

## JavaScript-specific

**Prototype pollution.** Untrusted keys (`__proto__`, `constructor`, `prototype`) reach a recursive merge, deep assignment, or generic setter and change inherited properties used by security checks, templates, command options, or serialization (`mergeDeep(defaultOptions, req.body)`).
- Trace attacker object → merge or assignment → prototype or inherited property → sensitive consumer; the risk depends on the library and a reachable gadget.
- Fix: maintained merge libraries, schema validation, reject dangerous keys, `Map` or null-prototype objects for attacker-keyed data, no merging untrusted objects into privileged configuration.

**Dynamic code loading and module resolution.** Input or compromised config picks the code that is loaded (`require`/`import` of request-derived paths or package names, writable plugin directories, untrusted search paths, loaders that resolve outside the root). Fix: allow-list module identifiers, resolve only trusted paths, keep executable directories non-writable, separate plugin installation from runtime input.

**Inherited-property authorization bypass.** `in` checks on attacker-influenced objects, permission decisions from inherited flags, spread or merge that copies unexpected fields. Fix: own-property checks and explicit permission schemas.

## Build, CI/CD, and runtime isolation

See [SUPPLY-CHAIN-AND-RELEASE.md](SUPPLY-CHAIN-AND-RELEASE.md) and [CLOUD-AND-DEPLOYMENT.md](CLOUD-AND-DEPLOYMENT.md).

**CI/CD and build pipeline compromise.** Untrusted code or config runs in a trusted build with secrets, signing keys, or deploy rights.
- Look for: pull-request workflows exposing secrets to forked code; privileged triggers (`pull_request_target`, `workflow_run`) that check out untrusted revisions; mutable action references; release credentials in general-purpose jobs; deploys from untrusted branches or tags; package lifecycle scripts and build plugins; self-hosted runners shared across trust levels; artifacts from untrusted workflows reused without provenance; untrusted inputs (branch names, PR titles, tags) interpolated into shell steps.
- Trace untrusted contributor or dependency → trigger → runner permissions and secrets → artifact or deployment.
- Fix: isolate untrusted builds; short-lived least-privilege credentials; pin actions by SHA; separate build and release permissions and protect release environments; verify provenance; never expose secrets to untrusted code. Treat the build system as a security-sensitive runtime.

**Container and runtime isolation failures.** A compromised app or worker reaches host resources or neighbors.
- Look for: privileged containers, host PID or network namespaces, writable host mounts, exposed runtime sockets, extra capabilities, root execution, permissive seccomp/AppArmor, secrets mounted into unrelated containers, shared runtime identities, over-broad Kubernetes service accounts and automounted tokens, weak namespace or admission policy, open access to control-plane endpoints.
- Fix: least privilege, non-root, drop capabilities, restrict mounts and egress, isolate workloads, scope service accounts, apply runtime policy.

## AI agents and tools

See [AI-AND-LLM.md](AI-AND-LLM.md). A prompt injection is a vulnerability only with a concrete impact through the tools and permissions the model actually has.

- **Indirect prompt injection.** Web pages, uploads, emails, issues, code comments, repository files, retrieved chunks, or tool results reach a model that can call tools or see sensitive context. Treat model output and retrieved instructions as untrusted; enforce authorization outside the model; constrain tool arguments and destinations; require approval for sensitive actions; keep secrets out of contexts that do not need them.
- **Excessive agency and confused deputy.** The agent uses its own broad privileges for something the requesting user may not do: tools running as a service account, no per-user check on tool calls, unrestricted shell, SQL, or filesystem tools, tenant or resource IDs accepted without an ownership check, approval enforced only in the prompt, one tool's output used to bypass another's restrictions. Authorize inside each tool, scope credentials to the requesting principal, allow-list operations and destinations, audit calls with redaction.
- **Unsafe tool output and generated code.** Model-generated commands or SQL executed without validation, tool output interpolated into commands, agent-chosen paths, generated code run in the app process. Use strict schemas, constrained APIs instead of shells, sandboxes with time, memory, filesystem, and network limits, and separate read and write privileges.
- **Data leakage through context and retrieval.** Retrieval without tenant filters, shared memory, caches keyed only by prompt, results reused across users, secrets in prompts and traces, authorization after retrieval, external logging or model providers receiving too much. Authorize before retrieval and tool use, isolate conversation state, scope caches and indexes by principal.
- **Cost and resource exhaustion.** Recursive tool calls, unbounded agent steps and retries, unlimited ingestion or context, uncontrolled fan-out, per-request paid calls with no per-account budget. Cap tokens, time, tool calls, concurrency, and spend; deadlines; idempotent side effects.

---

## Logic, regressions, and numeric correctness

**Wrong early return and control-flow flaws.** A branch returns, skips, or exits before a check, cleanup, or side effect that should have happened, so a guard is bypassed or a failure is treated as success.
- Look for: a `return`/`next`/`break`/`continue` placed before authorization, validation, locking, logging, or cleanup; inverted conditions (`unless`/`if`, `!`, `<` vs `<=`); guard clauses that return `true`, `nil`, or a success response on a failed check; a helper that returns a boolean or error list that the caller ignores (`can?` vs `authorize!`, `valid?` vs `validate!`); `return` inside `rescue`, `ensure`, or a loop that skips the rest; an empty `rescue`, `rescue nil`, or `catch` that swallows the error and falls through; `before_action`/middleware that does not halt the chain; precedence mistakes (Ruby `and`/`or`, `a && b || c`); loose comparison and type coercion (`==` vs `===`, strings vs numbers, `nil` or empty treated as allowed); a default of "allow" when the lookup returns nothing; off-by-one in limits and ranges; a branch that handles only one of several roles or states.
- Trace: for every access check and validation, list each path out of the function and confirm the protected action cannot be reached on any path that skipped the check; compare with sibling endpoints that do the same job.
- Fix: fail closed (deny by default, raise on failure), one authorization point that cannot be bypassed by an early return, check return values or use raising variants, put cleanup in `ensure`/`finally`, and add tests for the denied and edge branches.

**Validation or checks removed by an earlier change.** A previous commit deleted, moved, or weakened a validation, authorization check, limit, or early return, and no one noticed because nothing failed. This needs focused review of the diff, not only the current code.
- Look for (in `git log -p`, `git diff <base>..HEAD`, and blame on the lines around a gap): deleted lines (`^-`) that contain `validate`, `authorize`, `permit`, `sanitize`, `escape`, `verify`, `check`, `raise`, `return`, `unless`, `before_action`, `limit`, `timeout`, `max`, `size`, `length`; a check present in sibling code but absent here; refactors and file moves where a check was not carried over; merge-conflict resolutions that kept one side; lint- or "cleanup"-driven deletions; reverted security fixes; guards changed from all routes to `only:`/`except:`; feature flags or env switches that disable a check; tests deleted, skipped (`skip`, `xit`, `pending`, `.only`), or loosened in the same change; CI, scanner, or lint rules removed; defaults flipped from safe to unsafe.
- Treat each removed or weakened control as a new surface: re-trace every input that passes through it (see [INPUT-TRACING.md](INPUT-TRACING.md)) and every sink behind it, and ask whether anything else still enforces the rule.
- Fix: restore the control at the right layer, add a regression test that fails without it, and where possible a CI check (a policy test or lint rule) that fails when the protection disappears.

**Suspicious places to check first.** Cheap signals that a control may be missing or bypassed: comments such as `TODO`, `FIXME`, `HACK`, `XXX`, "temporary", "skip auth", "for testing", "remove before prod"; commented-out checks; `skip_before_action`, `skip_authorization`, `skip_forgery_protection`, `verify: false`, `|| true`, `if Rails.env.test?` or `if debug` branches that grant access; hardcoded bypass users, tokens, or IPs; `rescue nil`; `permit!`; `send`/`eval`/`constantize` on input; `unscoped`/`find` without scope; `html_safe`/`raw`; unusually large or recently changed functions on auth, money, and data-export paths; code copied between files with one copy missing a check; and code paths with no test.

**Money, floats, and numeric handling.** Financial and quantity math done in binary floating point or with inconsistent rounding produces wrong amounts that an attacker, or ordinary use, can exploit or that silently lose money.
- Look for: `float`/`Float`/`double`, `to_f`, JavaScript `Number` for prices, totals, balances, tax, or discounts (`0.1 + 0.2 != 0.3`); comparing floats with `==`; rounding at different steps or in different places (client vs server vs payment provider; the sum of rounded line items versus the rounded total); a rounding direction that favors one side and can be repeated (salami attacks); mixing minor units (cents) and major units, or currencies, without conversion; negative, zero, fractional, or huge quantity, price, discount, or refund values; integer overflow or truncation when converting; a client-supplied price, total, discount, or currency trusted instead of recomputed on the server; coupon or credit stacking and reuse; refunds larger than the charge; a payment webhook amount not compared with the expected amount; check-then-update on balances without a lock or constraint (race, double spend); no idempotency key on charge and refund calls.
- Fix: store money as integer minor units (or an exact decimal type such as `BigDecimal`, `Decimal`) together with a currency code; one documented rounding rule applied once, in one place; compute prices, totals, taxes, and discounts on the server from trusted data; validate ranges (positive, maximum, allowed currency); use database constraints, row locks, or atomic updates for balances; idempotency keys; reconcile against the provider's amount; and test edge amounts (0, 1 cent, very large, negative, rounding boundaries).

**Race conditions and TOCTOU.** A check and the operation it protects are not atomic, or concurrent requests violate an invariant (two requests each see one remaining seat and both reserve it).
- Look for: balance, quota, or inventory checks before the update; authorization before modifying an object that can change; checking a token is unused then consuming it separately; file permission check then open; `SELECT` then `UPDATE` without a transaction or lock; read-modify-write counters; uniqueness enforced only in application code; duplicate job execution; concurrent invitation acceptance or reset-token use; async work that repeats side effects.
- Trace initial state → check → competing operation → state change → final invariant, and decide whether the database, framework, or lock really makes it atomic.
- Fix: transactions, unique constraints, conditional updates (`UPDATE ... WHERE`), row locks, compare-and-swap, idempotency keys, distributed coordination where needed; revalidate authorization when mutable state affects it. Verify with a controlled local concurrency test that the invariant holds.

**Business logic and workflow abuse.** Legitimate operations are reordered, repeated, or skipped to break a business rule.
- Look for: payment before approval; refunds above the payment; repeated coupon or credit redemption; roles granted before identity verification; missing transitions in approval flows; changing an object's owner after authorization but before execution; replaying completed operations; downgrading while keeping paid features; security that depends on the frontend (a disabled button, hidden field, order of steps).
- Trace initial state → permitted operation → expected transition → resulting state, comparing every route that can create the same transition.
- Fix: enforce state transitions and invariants server-side, make operations idempotent, bind approvals to the exact object and version, use atomic accounting. A missing rule is a finding only when the intended invariant and its security or financial impact can be established.

**Unrestricted access to sensitive business flows.** An API lets an attacker automate an operation that needs abuse controls: mass sign-up, referral or reward farming, ticket or inventory hoarding, repeated free trials, coupon abuse, reset flooding, reservations without limits, vote or reputation manipulation.
- Check whether plain rate limits fail because the attacker can rotate accounts, IPs, tokens, or identities.
- Fix: per-identity and global limits, quotas, idempotency, eligibility checks, risk-based friction. Do not rely only on IP limits.

---

## Secrets, cryptography, configuration

**Secrets and cryptographic failures.** Look for: hardcoded keys, tokens, passwords, webhooks in source, config, images, history; secrets in logs and errors; MD5/SHA-1/bare SHA-256 for passwords; non-CSPRNG tokens; non-constant-time secret compares; missing expiry or rotation. Fix: secret store or environment, rotate exposed secrets, argon2id/bcrypt/scrypt, CSPRNG tokens, constant-time compare.

**Weak ciphers, hashes, and protocols.** Report only where the protected data or decision matters; weak crypto on non-sensitive data is hardening.
- Ciphers: DES, 3DES, RC4, RC2, 64-bit-block Blowfish, home-made or XOR "encryption".
- Modes: ECB; CBC without a MAC (padding oracle, bit flipping); static, zero, or reused IVs/nonces (CTR/GCM); encryption without authentication. Use an AEAD (AES-GCM, ChaCha20-Poly1305).
- Hashes and keys: MD5/SHA-1 for passwords, signatures, or download integrity; RSA/DH below 2048, curves below 224; passwords used as keys with no KDF; keys from `time`/`random`; hardcoded or reused keys.
- TLS: SSLv3/TLS 1.0/1.1 allowed, NULL/export/RC4/3DES suites, verification or hostname checks disabled (`verify=False`, `VERIFY_NONE`, `rejectUnauthorized: false`, `danger_accept_invalid_certs`), validation callbacks returning true, plaintext fallback (`sslmode=prefer`).
- Tokens: JWT `alg: none` or algorithm taken from the token, HS/RS confusion, weak HMAC secrets, no signature verification.
- Config: weak proxy/load-balancer cipher policies.
- Trace: where the sensitive value is created, what protects it at rest and in transit, who holds the key, what an attacker with the ciphertext or network position recovers or forges.
- Fix: high-level libraries (libsodium, `cryptography` AEAD recipes, Rails `MessageEncryptor`/`ActiveRecord::Encryption`, Fernet); AEAD with a unique nonce; 256-bit CSPRNG or KDF keys; TLS 1.2+ with verification on, `sslmode=verify-full`; fixed server-side signature algorithm.

**Security misconfiguration.** Debug mode and verbose errors in production, default credentials, permissive CORS, open admin or metrics endpoints, public buckets, missing headers on sensitive responses (hardening only), overly broad IAM and container privileges. Fix: secure defaults per environment, least privilege, explicit allow-lists.

**Error handling.** Stack traces or SQL errors to callers, fail-open checks (`except: allow`), swallowed errors skipping authorization or validation, partial failures leaving inconsistent state. Fix: fail closed, generic caller errors, detail in logs, atomic or compensating multi-step work.

**Logging gaps.** No audit trail for logins, permission changes, sensitive reads or exports; secrets or personal data in logs; forgeable logs. Report only when the gap blocks detecting or investigating a concrete abuse path.

---

## Examples by language

The classes above are language-neutral and apply to any stack. Concrete examples are Ruby only for now: each line is a vulnerable pattern with its fix (`# fixed:`). Confirm source, sink, and controls with [INPUT-TRACING.md](INPUT-TRACING.md) before reporting. To add a language, add a subsection in the same style.

### Ruby (Rails, Sinatra, Rack)

```ruby
User.where("name = '#{params[:n]}'")                     # fixed: User.where(name: params[:n])
Post.order(params[:sort])                                # fixed: Post.order(SORTS.fetch(params[:sort], :created_at))
system("convert #{f} out.png"); `git clone #{u}`         # fixed: system("convert", "--", f, "out.png")
Open3.popen3("#{engine} #{args.join(' ')}")              # fixed: Open3.popen3(engine, *args)
params[:type].constantize.new; obj.public_send(m)        # fixed: ALLOWED.fetch(params[:type]); allow-list methods
eval(params[:expr])                                      # fixed: never evaluate input
render html: msg.html_safe; <%= raw bio %>              # fixed: plain text or sanitize(bio, tags: %w[b i])
send_file Rails.root.join("up", params[:f])              # fixed: File.basename + start_with? containment check
URI.open(params[:url]); Net::HTTP.get(uri)               # fixed: host allow-list, IP check, timeouts, no redirects
Faraday.get(url, nil, "Authorization" => "Bearer #{key}") # fixed: send the key only to the allow-listed host; strip it on redirects
Faraday.new(url) { |f| f.response :follow_redirects }    # fixed: limit: 3 and re-validate every hop (loops hang workers)
IPAddr.new(host).private? check, then connect later      # fixed: resolve once, reject loopback/private/link-local, connect to that IP
redirect_to params[:next]                                # fixed: redirect_to(safe_path(params[:next]) || root_path), safe_path accepts only "/..." parsed by URI, rejecting "//", "\\", and schemes
redirect_back(fallback_location: params[:return_to])     # fixed: allow_other_host: false and an exact allow-list
<script src="https://cdn.jsdelivr.net/npm/lib@latest/x.js"></script>   # fixed: self-host, or lib@1.2.3 with integrity="sha384-..." crossorigin="anonymous"
import("https://esm.sh/some-lib")                        # fixed: vendor the module, or pin the version and hash
policy.script_src :self, :unsafe_inline, :unsafe_eval    # fixed: policy.script_src :self, :strict_dynamic; config.content_security_policy_nonce_generator
config.force_ssl = false                                 # fixed: true (HTTPS redirect, HSTS, Secure cookies)
return true if params[:force]; return unless user.admin? # fixed: deny first; raise on a failed check; one authorization point
before_action :authenticate!, only: [:show]              # was all actions in an earlier commit; fixed: restore the default, add a test that every route requires auth
user.update(params[:user]) if user.valid?                # fixed: check the result and halt; use update!/authorize!
price = params[:price].to_f * qty                        # fixed: Money/BigDecimal or integer cents, price from the server, validate qty > 0
total = items.sum { |i| (i.price * 1.2).round(2) }       # fixed: one rounding rule, applied once, in integer minor units
balance -= amount if balance >= amount                   # fixed: atomic UPDATE ... WHERE balance >= amount inside a transaction with a lock
if quota.available?; quota.consume!; end                 # race; fixed: one atomic reservation (UPDATE ... WHERE remaining > 0) in a transaction
Record.find(params[:id])                                 # fixed: current_user.records.find(params[:id]) where the scope is the real policy
User.find_or_create_by(email: auth.info.email)           # fixed: key on [provider, tid, sub/oid]; require email_verified; allow only configured tenants
JWT.decode(t, key, true, algorithms: ["RS256"])          # signature ok but no tid/iss allow-list; fixed: check claims["tid"] and claims["iss"] against the customer's configured tenant
process_event(request.body.read)                         # fixed: verify the signature on the raw body, check the timestamp, dedupe on event id
Rails.cache.fetch(params[:key])                          # fixed: key from trusted tenant/user context plus the resource id
AI tool: system(model_output)                            # fixed: a constrained tool API with strict schema, per-user authorization, sandbox, approval
Zip::File.open(path) { |z| z.each { |e| e.extract(File.join(dir, e.name)) } }   # fixed: check e.size and a running total, expanded cap, no ".."/absolute/symlink entries, verify the resolved path is inside dir
Zlib::GzipReader.open(f) { |gz| gz.read }                # fixed: read in chunks and stop at a byte limit
Rails.cache.write("report:#{params[:name]}", data)       # fixed: tenant in the key, bounded key space, TTL and size cap
"left-pad": "^1.3.0", "lib": "latest"                     # fixed: exact "1.3.0"; commit the lockfile; CI runs npm ci --ignore-scripts
gem "rails", ">= 7"; gem "tool", git: "https://github.com/x/tool", branch: "main"   # fixed: pin a version or a commit SHA; commit Gemfile.lock
uses: some/action@main                                   # fixed: some/action@<full commit sha>
FROM node:latest                                         # fixed: a version tag plus digest, rebuilt on a schedule
Marshal.load(b); YAML.load(s); Oj.load(s)                # fixed: JSON.parse; YAML.safe_load; Oj.load(s, mode: :strict)
"host=#{h} dbname=#{d}"                                  # fixed: PG.connect(host: h, dbname: d)
Invoice.find(params[:id])                                # fixed: current_user.invoices.find(params[:id])
User.new(params.permit!); user.update(params[:user])     # fixed: params.require(:user).permit(:name, :locale)
as_json masks only (nested include skips it)             # fixed: mask in serializable_hash; only: on includes
skip_before_action :verify_authenticity_token            # fixed: protect_from_forgery with: :exception
get "/account/downgrade"                                 # fixed: post (mutations never on GET)
get "/confirm/:token" -> user.confirm; sign_in(user)     # fixed: GET renders button; POST consumes token, rotates password
reset URL from request.headers["X-Forwarded-Host"]       # fixed: canonical host from config
rand(36**8).to_s(36); params[:t] == t                    # fixed: SecureRandom.urlsafe_base64(32); secure_compare
Digest::MD5.hexdigest(pw)                                # fixed: BCrypt::Password.create(pw, cost: 12)
OpenSSL::Cipher.new("aes-128-ecb")                       # fixed: "aes-256-gcm" + random iv + auth_data
verify_mode: OpenSSL::SSL::VERIFY_NONE                   # fixed: keep default verification
JWT.decode(t, nil, false)                                # fixed: JWT.decode(t, key, true, algorithms: ["RS256"])
Item.all.each { ... }                                    # fixed: find_each(batch_size: 500)
Faraday.get(url)                                         # fixed: request: { timeout: 5, open_timeout: 2 }
Sidekiq concurrency: 50 with an AR pool of 5            # fixed: pool >= concurrency + headroom; per-queue limits and per-tenant throttles
Redis.new(url: ...) inside each request or job          # fixed: a shared ConnectionPool with a checkout timeout; size to maxclients
ActiveRecord pool: 5 with Puma threads 5, workers 4      # fixed: DB max_connections >= workers x pool + jobs; pgbouncer if it does not fit
persistent_timeout, first_data_timeout (Puma), no proxy  # fixed: set them, and put a buffering proxy in front for slow clients
Regexp.new(params[:pat]).match?(t)                       # fixed: no user regex; Regexp.timeout = 1.0
File.binwrite(path, request.body.read)                   # fixed: size cap, per-account quota, purge job
request.headers.to_h.each { |k, v| logger.info "#{k}=#{v}" }  # fixed: cap header count/size at the proxy; log an allow-list of headers
JSON.parse(request.body.read)                            # fixed: reject bodies over a size cap first; max_nesting: 20
params[:ids].split(",").each { |id| lookup(id) }        # fixed: cap list length (e.g. 100) before looping
Rails.cache.write("q:#{params[:q]}", r)                  # fixed: bounded keys, expires_in
Rails.logger.info "q: #{params[:q]}"                     # fixed: params[:q].to_s.inspect
Rails.logger.info "login #{params.inspect}"              # fixed: log user.id only; config.filter_parameters += %i[password token card_number cvv ssn]
Sentry.init { |c| c.send_default_pii = true }            # fixed: false; scrub in before_send
logger.info "charge card=#{card.number} cvv=#{card.cvv}"  # fixed: never log; at most card.last4
```

---

## Suggested hunting order

When the scope is large or the budget is limited, take classes in this order (a starting point; the ledger priority rules in [HUNTING.md](HUNTING.md) decide ties):

1. Authorization and tenant isolation (object and property level, jobs, exports, caches, WebSockets, alternate routes).
2. Injection and trust-boundary failures (SSRF, command execution, parser differentials, deserialization, file processing).
3. Races and business logic (payments, invitations, quotas, token consumption, privilege changes, state transitions).
4. Identity and sessions (OAuth/OIDC, JWT, account linking, recovery, revocation).
5. Supply chain and build integrity (dependencies, CI workflows, release artifacts, credentials, deploy permissions).
6. Protocol and caching attacks (smuggling, cache poisoning and deception) where the repository controls proxy or cache behavior.
7. AI agent security, if the application uses AI or agentic workflows.
8. Availability and parser robustness (resource exhaustion, archives, image and PDF processing, concurrency limits).

## Report each class consistently

Follow [VALIDATION-AND-REPORTING.md](VALIDATION-AND-REPORTING.md) and `report-schema.json` for the record format. Make sure each record covers:

1. **Problem** (`title`, `description`): the boundary crossed and who is harmed.
2. **Evidence** (`trace`, `evidence`): source → propagation → sink with repository-relative file and line.
3. **Controls checked** (`description`): what exists on the path and why it does not hold.
4. **Fix** (`remediation`): the smallest change that closes the class at the sink, plus sibling paths checked.
5. **Verification**: the safe local check or test showing the fix works.
