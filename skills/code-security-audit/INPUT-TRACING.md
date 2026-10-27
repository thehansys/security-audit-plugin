# Input Tracing

#### When to use this file

Use this file in Phase 1 (reconnaissance) to inventory every way untrusted data enters the target, and in Phase 2 (hunting) to trace each input to every place it can end up. Pair it with [COMMON-VULNERABILITIES.md](COMMON-VULNERABILITIES.md), which says what a dangerous destination looks like for each vulnerability class, and with [ATTACK-CLASSES.md](ATTACK-CLASSES.md) for the hunter roles.

Tracing is how you earn a finding: a candidate needs a named source, a named sink, and the path between them. A scanner-style match on a dangerous function with no source is a lead, not a finding.

## Working notes and output

The worksheet and destination ledger below are scratch notes. Hunters and verifiers report only through the structured results in [HUNTING.md](HUNTING.md) and [VALIDATION-AND-REPORTING.md](VALIDATION-AND-REPORTING.md): the verdicts map to unit dispositions (`covered`, `candidate`, `blocked`), and the traced path goes into the finding's `trace` as `entrypoint`, `propagation`, and `sink` steps. Do not add fields to records.

## Core discipline (include in every agent prompt for tracing work)

```
- Start from inputs, not from dangerous functions. Enumerate sources first, then follow each one forward to every sink it reaches.
- Trace forward until the value is consumed, stored, or provably discarded. Stopping at the first validation call is not a trace: check what the validator actually permits.
- "Trusted" and "internal" are claims to verify. A value is internal only if no lower-trust principal can influence it through any earlier write, import, header, or upstream service.
- A control counts only if it matches the sink's context. HTML escaping does not protect a shell command; a length check does not protect a query.
- Account for every input. In a branch-diff run, every new or changed input in the diff gets an ID and a verdict. An input with no verdict is a coverage gap, not a clean result.
- A trace ends only at a terminal destination: discarded, one-way hashed, or consumed by a sink with a control that fits. Storing a value (database, disk, cache, queue, log) is not an end: the stored copy has readers, and each reader is a new source.
- Follow the value to every destination, not just the first. One input commonly lands in the database, a log line, an error tracker, a search index, an export file, and an email.
- Record the trace as entrypoint, propagation steps, and sink with repository-relative paths, matching the trace shape in [VALIDATION-AND-REPORTING.md](VALIDATION-AND-REPORTING.md).
```

## Step 0: Find every input, especially the new ones

Do this before tracing, and redo it for every changed file. Do not rely on memory of the code or on one grep.

1. **Enumerate by access pattern**, per language and framework, across the in-scope code:
   - Ruby/Rails: `params[`, `params.require/permit`, `request.headers`, `cookies`, `session[`, `request.body`, `ENV[`, `ARGV`, `$stdin`, `ActionCable` `data`, job `perform(` arguments, `@request`, route segments.
   - Python: `request.args/form/json/files/headers/cookies/data`, `sys.argv`, `os.environ`, `input()`, framework route parameters and Pydantic/serializer fields, Celery task arguments, consumer `message.body`.
   - JS/TS and others: `req.params/query/body/headers/cookies/files`, `process.argv/env`, `location`, `postMessage` `event.data`, GraphQL/RPC arguments, message handlers.
2. **Enumerate by interface definition**, which catches inputs that have no obvious access call: the route table, API schema/OpenAPI, GraphQL schema, strong-parameter permit lists, serializer and form field lists, model columns and `attr_accessor`s that are assignable from requests, queue/webhook handlers, CLI option parsers, scheduled-job and import entry points, and webhook/callback URLs.
3. **Diff the interface** in a branch-diff or repeat run: new routes, new permitted params, new columns or JSON keys, new job arguments, new headers read, new files parsed, new third-party responses consumed, changed validation, and removed checks. A line that previously rejected a value and no longer does is a new input surface.
4. **Give each input an ID** (`<surface>:<name>`, for example `POST /projects#name`, `job:ExportJob#platform`, `env:WEBHOOK_URL`). The parent seeds ledger units from this inventory in reconnaissance; a hunter that finds an input not in its units returns it under `uncovered` for the next wave. Include inputs from other principals' stored data and from third parties.
5. **Completeness check.** Compare the inventory with the diff: every added or modified line that reads from a source in the table below must map to an input ID. Anything left over is an unexplained input. Resolve it or record it as an unresolved gap.

## Step 1: Inventory the sources

List every source for the in-scope surface, then give each a stable name so ledger units and traces can refer to it.

| Source family | Examples |
|---|---|
| HTTP request | path and path params, query string, body (JSON, form, multipart, XML), headers (`Host`, `X-Forwarded-*`, `Referer`, `Origin`, `Cookie`, custom), uploaded file contents and filenames, content type |
| Identity-bearing tokens | JWT claims, session contents, API key metadata, OAuth callback params (`state`, `redirect_uri`, `code`) |
| Non-HTTP entry | CLI args, environment variables, stdin, config files users can edit, files read from user-writable paths |
| Messaging and events | queue and webhook payloads, pub/sub messages, RPC and GraphQL arguments, WebSocket frames |
| Stored data | database rows, cache entries, search indexes, files written earlier by a lower-trust principal (second-order input) |
| Third-party data | responses from external APIs, imported spreadsheets/CSV, package metadata, LLM output, scraped pages, email contents |
| Browser-only | URL fragment, `window.name`, `postMessage`, `localStorage`, `document.referrer` |

Do not skip:
- **Metadata and names**, not just values: field names, JSON keys, header names, filenames, MIME types, column names in sort/filter params.
- **Framework-bound inputs**: params that a framework binds directly onto objects (mass assignment), and auto-parsed formats (YAML, XML, pickled or marshalled data).
- **Indirect inputs**: another user's stored content that this code renders, logs, or executes on a different user's behalf.

## Step 2: Trace each source forward

For each source, follow the value through the code until every use is classified.

1. **Entry point.** The route, handler, consumer, or CLI parser where the value first appears. Note the authentication and authorization state at this point.
2. **Transformations.** Every step that changes the value: parsing, decoding (URL, base64, unicode normalization, JSON, archive extraction), type coercion, concatenation, templating, serialization. Decoding after validation is a common bypass: check the order.
3. **Branches and copies.** Follow the value into helpers, background jobs, caches, other services, and anything it is stored into. Check sibling code paths that do the same job (batch, import, export, admin, legacy API versions): a control in one is not a control in the others.
4. **Sinks.** Every place the value, or a value derived from it, is consumed. Use the sink table below.
5. **Controls on the path.** For each control (validation, encoding, parameterization, allow-list, authorization check) say what it permits and whether it fits the sink's context.

When the trace reaches a store, do not stop. Record the destination in the destination ledger below, then continue from every read side as a new source.

## Step 2b: Follow the value to every destination

A value can be stored, copied, and transformed many times before it does anything. Use this table to list every place it can end, then trace each one. Writing a value to a destination is itself an event to record, and the destination's later readers decide the real impact.

| Destination | Examples | Ask |
|---|---|---|
| Database | text and JSON columns, names, labels, settings blobs, encrypted columns, audit rows | Who reads this row later, in what context (HTML, shell, SQL, export, email, another tenant's view)? Is a length or type limit enforced at write? |
| Disk | uploaded files, temp files, generated exports, staging directories, logs, cache files, archives | Is the path or filename influenced by input? Who reads, serves, executes, or extracts it later? Is it cleaned up? Is it within quota? |
| Object storage and CDN | blobs, presigned URLs, public buckets | Can another principal fetch or overwrite it? Does the content type come from the client? |
| Cache and session | Redis, memcache, cookies, `session[]`, signed/encrypted tokens | Is the key influenced by input? Can one principal read or poison another's entry? |
| Queue and jobs | job arguments, webhook payloads, scheduled tasks | Does the worker run with higher privilege than the requester? Are arguments re-validated? Is authority re-checked at run time? |
| Search and analytics | search indexes, metrics labels, event streams | Is another tenant's index or dashboard reachable? Can labels explode in cardinality? |
| Logs, traces, error trackers | application logs, APM, Sentry breadcrumbs, request/response capture | Can control characters forge lines? Do secrets, tokens, or bodies get captured? |
| Outbound messages | email subject and body, Slack and webhook posts, SMS, push, third-party APIs | Is the text escaped for that channel? Does it reach other users or staff? Does it carry secrets or links built from input? |
| Generated artifacts | PDF, DOCX, CSV/XLSX, SQL or shell scripts, config files, HTML pages | Is it opened by a more privileged person or tool that interprets formulas, meta-commands, markup, or macros? |
| Child processes and environment | argv, env vars, stdin, `/proc` visibility | Are values visible to other local users? Are they split or interpreted by a shell? |
| Interpreters and templates | `eval`, template engines, regex, query languages, LLM prompts | Is input treated as code or instructions? |
| Memory only | local variables, in-process caches | Does it size an allocation or loop? Is it logged on error? |

### Destination ledger

For each input, keep a ledger of where it ends. One row per destination:

```
input:        <ID>
destination:  <table.column | path | cache key | queue | log | email | artifact | ...>
written at:   <path:line>, transformation applied: <none | encode | truncate | hash | ...>
readers:      <path:line each>, context at read: <html | sql | shell | path | json | email | export | ...>
reader trust: <same principal | other principal | staff | automation | third party>
control:      <what stands between the stored value and the reader's sink, fits context? yes/no>
verdict:      <candidate | needs_validation | covered | terminal (hashed/discarded) | not a finding>
```

Rules:
- **Every write needs at least one reader entry, or an explicit "no reader found" with the search you did** (grep for the column, key, path, or queue name, including serializers, exports, admin and staff screens, mailers, background jobs, and other services).
- **The reader's context sets the vulnerability class, not the writer's.** A name accepted as harmless text becomes XSS in a staff view, shell injection in an export script, a formula in a CSV, a path in a download, or a header in a response.
- **Raise the trust level on the way out.** If the reader is a more privileged principal (owner, staff, admin, an automated job, another tenant), the finding is stronger. Staff and admin views are frequent readers that were never considered when the field was added.
- **Check writes that skip validation.** Import, bulk, API-v2, admin, console, migration, seed, and background-job paths often write the same column without the controller's validation.
- **Check what survives.** Does the value persist after the principal is removed, the record is deleted, or the tenant is closed (backups, search indexes, logs, caches, derived exports)?
- **Terminal states.** A value is terminal when it is discarded, replaced by a one-way hash that is never reversed or displayed, or consumed by a sink with a control that fits. Say which, and cite the line.

Examples of a stored value reaching a different sink than the one it was written for:

```ruby
# Written as harmless text, read later as a shell argument and a filename
project.update!(name: params[:name])                       # validated for presence only
Engine.run("export --name #{project.name}")                # reader 1: shell
send_file Rails.root.join("exports", "#{project.name}.csv")  # reader 2: path
```
```python
# Written to a log, an error tracker, and a template, three different contexts
logger.info("created %s", request.json["title"])           # destination: log (forgeable lines)
sentry_sdk.capture_message(request.json["title"])          # destination: error tracker (body captured)
Template(f"<h1>{item.title}</h1>").render()                # reader: template (SSTI/XSS)
```

## Step 3: Classify the sinks

| Sink | Vulnerability class | Safe pattern to verify |
|---|---|---|
| SQL, NoSQL, ORM raw fragments, dynamic identifiers | SQL/NoSQL injection | Bound parameters; identifiers from a fixed allow-list |
| Shell, process spawn, `eval`, dynamic import | Command and code injection | Argument arrays with no shell; allow-listed commands and arguments |
| HTML output, DOM APIs, templates, Markdown rendering | XSS | Context-aware output encoding; auto-escaping templates; no raw-HTML escape hatches |
| File paths, archive extraction, file serving | Path traversal, zip slip | Canonicalize, then verify containment in the allowed root; random server-chosen names |
| Outbound HTTP, DNS, URL fetchers, webhooks | SSRF | Allow-list of hosts; resolved-IP checks; no redirects to internal ranges |
| Redirects, `Location` headers | Open redirect | Relative paths only, or an allow-list of destinations |
| Deserializers, XML parsers, YAML loaders | Insecure deserialization, XXE | Data-only formats; safe loaders; external entities disabled |
| Object assignment, merge, `update(params)` | Mass assignment, prototype pollution | Explicit field allow-list; null-prototype or schema-validated objects |
| Authorization decisions, ownership lookups | Broken access control | Server-side check against the authenticated principal for each resource |
| Log lines, headers, email bodies, CSV cells | Log/header/CSV injection | Strip or encode control characters; prefix formula characters |
| Regexes, parsers, loops, allocations, queries | Resource exhaustion | Bounded size, depth, count, and time at the point of use |
| Crypto and token verification inputs | Crypto and auth flaws | Verified algorithm and key; constant-time compare; no attacker-chosen algorithm |
| LLM prompts, tool calls | Prompt injection, confused deputy | See [AI-AND-LLM.md](AI-AND-LLM.md) |

A value can reach several sinks. Report each distinct source-to-sink pair that crosses a boundary as its own candidate, unless one fix clearly closes all of them (then link them in one finding).

## Step 4: Decide what you have

Before reporting a trace, state each of these, for the direct path and for every stored or forwarded copy:

- **Source and principal.** Who controls it, and is that principal lower-trust than the sink's owner?
- **Sink and consequence.** What the value does at the sink and who is harmed.
- **Controls.** What lies on the path, and why it does or does not hold for this sink.
- **Reachability.** Whether the path is reachable in the deployed configuration: feature flags, auth requirements, network exposure.
- **Persistence and egress.** Every destination the value was written or sent to, and who reads each copy later.

Outcomes:
- Complete path, no effective control, concrete consequence: a `candidate` for independent validation.
- Complete path but a deployment fact is missing: still a `candidate`, with the missing fact stated; validation settles it as `confirmed` or `needs_validation`.
- Control is context-appropriate and applied on every path: record it as covered, with the control cited.
- Source is internal and no lower-trust write reaches it: not a finding. Say how you established that.
- Input with no verdict, or a destination with no reader search: record it as an unresolved gap: a `blocked` unit with the unresolved fact, or `deferred`. Never report an input as covered because its first sink looked safe.

## Tracing worksheet (per source)

```
source:            <name, e.g. GET /search?sort>
entrypoint:        <path:line>, auth state: <anon | user | admin>
transformations:   <decode/parse/coerce steps, path:line each>
copies/stores:     <where the value is stored or forwarded>
stored in:         <destination ledger rows: db column, file path, cache key, queue, log, ...>
readers:           <who reads each stored copy, context at read, trust level>
sinks reached:     <sink, class, path:line> ...  (direct and via each stored copy)
controls:          <control, what it permits, fits the sink? yes/no>
verdict:           <candidate | needs_validation | covered | not a finding> + reason
```
