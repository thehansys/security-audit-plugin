# CWE Overview

#### When to use this file

Optional. Use it in Phases 3 to 6 (or when answering a guidance question) to label a candidate or finding with a CWE. Put the label in the `title` or `description` text: `report-schema.json` has no CWE field. Do not use it to choose what to hunt.

Short map of common CWEs to the problem they describe and where this skill covers them. Details and fixes are in [COMMON-VULNERABILITIES.md](COMMON-VULNERABILITIES.md) and the domain companions listed in [ATTACK-CLASSES.md](ATTACK-CLASSES.md).

How to use:
- A CWE is a label for a report, never evidence. The finding still needs a traced source, sink, and result.
- Pick the most specific CWE that fits (for example CWE-89, not CWE-20). Use CWE-20 only when no child describes the flaw.
- For chains, list the root cause first and the resulting weakness second (for example CWE-20 then CWE-78).
- IDs and names come from memory of cwe.mitre.org; check them there before publishing a report.

## Injection and input handling

| CWE | Name | Problem | See |
|---|---|---|---|
| 20 | Improper Input Validation | Input not checked for the properties needed to process it safely | [INPUT-TRACING.md](INPUT-TRACING.md) |
| 74 | Injection (generic) | Input changes the structure of a command, query, or message | Injection |
| 77 / 78 | Command / OS Command Injection | Input reaches a shell or process API | Injection |
| 89 | SQL Injection | Input becomes query structure | Injection |
| 943 | NoSQL / data-query injection | Operators or filters injected into a query | Injection |
| 90 / 643 | LDAP / XPath Injection | Input alters a directory or XPath query | Injection |
| 94 / 95 | Code / Eval Injection | Input is evaluated as code | Injection |
| 1336 | Template Injection (SSTI) | Input is evaluated by a template engine | Injection |
| 79 | Cross-site Scripting | Input rendered as script in another user's browser | Injection, [CLIENT-SIDE.md](CLIENT-SIDE.md) |
| 22 / 23 / 73 | Path Traversal / External Control of File Name | Input escapes the intended directory or picks the file | Injection |
| 59 / 61 | Link / Symlink Following | A link redirects a file operation | Injection |
| 434 | Unrestricted Upload of Dangerous File | Uploaded file stored or executed unsafely | Injection, Availability |
| 918 | Server-Side Request Forgery | Server fetches an attacker-chosen URL, reaching localhost, private IPs, or metadata | Injection (SSRF and unsafe outbound requests) |
| 522 / 201 | Credentials or sensitive data sent to an unintended destination | Secrets attached to requests for caller-chosen or redirected hosts | Injection (SSRF and unsafe outbound requests) |
| 601 | Open Redirect | Redirect target taken from input, for example after login | Open redirect |
| 611 / 776 | XXE / XML Entity Expansion | XML parser reads files or expands without bound | Injection |
| 502 | Deserialization of Untrusted Data | Parsing a blob instantiates objects or runs code | Injection |
| 117 / 113 | Log / HTTP Header Injection | Control characters forge logs or split headers | Injection |
| 1236 | CSV Injection | Cell values become spreadsheet formulas | Injection |
| 444 | HTTP Request Smuggling | Parsers disagree on message boundaries | [WEB-PROTOCOL-AND-AUTH.md](WEB-PROTOCOL-AND-AUTH.md) |
| 436 / 180 | Interpretation Conflict / Validate Before Canonicalize | Two components read the same input differently, or it is checked before decoding | Parser differentials and canonicalization |
| 524 / 525 | Sensitive Information in Cache | Private or personalized responses stored in a shared cache | Web cache poisoning and deception |
| 294 | Authentication Bypass by Capture-replay | A captured request, token, or webhook event is replayed | Webhook authenticity and replay |
| 441 | Unintended Proxy or Intermediary (confused deputy) | A privileged component acts for a caller who lacks that authority | AI agents and tools, Multi-tenant isolation |
| 1427 | Improper Neutralization of Input Used for LLM Prompting | Untrusted content steers a model's actions | AI agents and tools |
| 1321 | Prototype Pollution | Input writes to an object's prototype | Examples by language (Node.js) |
| 15 | External Control of Configuration Setting | Input sets system or config values | Injection |

## Access control and authentication

| CWE | Name | Problem | See |
|---|---|---|---|
| 284 / 285 | Improper Access Control / Authorization | Caller acts outside their authority | Access control |
| 862 | Missing Authorization | No permission check on an action | Access control |
| 863 | Incorrect Authorization | Check exists but tests the wrong thing | Access control |
| 639 | IDOR (Authorization Bypass via User-Controlled Key) | Object ID from input without an ownership check | Access control |
| 269 | Improper Privilege Management | Roles granted or kept beyond need | Access control |
| 915 | Mass Assignment | Request sets fields it should not | Access control |
| 732 / 276 | Incorrect Permissions on Resource / Default | Files or objects readable or writable by too many | Misconfiguration |
| 287 | Improper Authentication | Identity not proven correctly | Account takeover |
| 306 | Missing Authentication for Critical Function | Sensitive action reachable anonymously | Account takeover |
| 290 | Authentication Bypass by Spoofing | Trust in headers or addresses the caller controls | Account takeover |
| 307 | Excessive Authentication Attempts | No brute-force limit | Account takeover |
| 620 / 640 | Unverified Password Change / Weak Recovery | Credential change or recovery without proof | Account takeover |
| 384 / 613 | Session Fixation / Insufficient Expiration | Sessions not rotated or ended | Session lifecycle |
| 352 | Cross-Site Request Forgery | Victim's browser performs an unwanted action | CSRF |
| 1385 | Missing Origin Validation in WebSockets | Cross-site WebSocket hijacking | [CLIENT-SIDE.md](CLIENT-SIDE.md) |
| 841 | Improper Enforcement of Workflow | Steps skipped or reordered | Business logic in `ATTACK-CLASSES.md` |
| 682 / 1339 | Incorrect Calculation / Insufficient Precision of Real Number | Wrong amounts, for example money computed in floats or rounded inconsistently | Money, floats, and numeric handling |
| 697 / 754 | Incorrect Comparison / Improper Check for Unusual Conditions | Wrong operator, type coercion, or unhandled edge value | Wrong early return and control-flow flaws |
| 696 / 705 | Incorrect Behavior Order / Control Flow Scoping | A check runs after the action, or an early return skips it | Wrong early return and control-flow flaws |

## Data exposure and cryptography

| CWE | Name | Problem | See |
|---|---|---|---|
| 200 | Exposure of Sensitive Information | Data shown to the wrong principal | Serialized output |
| 209 / 532 | Sensitive Info in Error Message / Log | Secrets or internals leaked through errors and logs | Error handling, Sensitive data in logs |
| 359 | Exposure of Private Personal Information | Personal data (ID numbers, card data, health) visible to an unauthorized party, including via logs and trackers | Sensitive data in logs |
| 312 / 319 | Cleartext Storage / Transmission | Sensitive data unprotected at rest or in transit | Secrets, Weak ciphers |
| 798 / 259 / 321 | Hard-coded Credentials / Password / Key | Secrets in source or images | Secrets |
| 522 / 521 | Insufficiently Protected Credentials / Weak Password Policy | Credentials stored or accepted weakly | Secrets |
| 326 / 327 | Inadequate Strength / Risky Algorithm | Broken cipher, mode, or key size | Weak ciphers |
| 328 | Weak Hash | MD5/SHA-1/fast hash where a strong one is needed | Weak ciphers |
| 330 / 338 | Insufficient Randomness / Weak PRNG | Predictable tokens or keys | Weak ciphers |
| 295 / 297 | Improper Certificate / Host Validation | TLS verification skipped | Weak ciphers |
| 347 / 345 | Improper Signature / Authenticity Verification | Forged or unverified data accepted | Weak ciphers, JWT |
| 208 | Observable Timing Discrepancy | Compare or lookup time leaks secrets | Weak ciphers |

## Availability and resources

| CWE | Name | Problem | See |
|---|---|---|---|
| 400 / 405 | Uncontrolled / Asymmetric Resource Consumption | Cheap input, expensive work | Availability |
| 770 / 789 | Allocation Without Limits / Excessive Size | Memory sized by the caller | Availability |
| 774 / 772 | FD Allocation Without Limit / Missing Release | Handles and connections exhausted or leaked | Availability |
| 1333 | Inefficient Regex Complexity (ReDoS) | Backtracking on crafted input | Availability |
| 409 | Highly Compressed Data (bomb) | Output far larger than input | Archive, compression bomb, and recursion attacks |
| 674 / 776 | Uncontrolled Recursion / XML Entity Expansion | Unbounded nesting or expansion exhausts stack, CPU, or memory | Archive, compression bomb, and recursion attacks |
| 674 / 834 / 835 | Uncontrolled Recursion / Excessive Iteration / Infinite Loop | Unbounded CPU or stack | Availability |
| 755 / 391 | Mishandled / Unchecked Exceptional Condition | Errors crash or are ignored | Error handling |
| 636 | Not Failing Securely | Failure grants access | Error handling |

## Memory safety and concurrency (native code)

| CWE | Name | Problem | See |
|---|---|---|---|
| 119 / 120 | Buffer Errors / Classic Overflow | Access beyond a buffer | [MEMORY-SAFETY-AND-BINARY.md](MEMORY-SAFETY-AND-BINARY.md) |
| 125 / 787 | Out-of-bounds Read / Write | Reads or writes outside an allocation | same |
| 416 / 415 | Use After Free / Double Free | Freed memory reused | same |
| 476 | NULL Pointer Dereference | Crash on a null pointer | same |
| 190 / 191 | Integer Overflow / Underflow | Arithmetic wraps and breaks a size or bounds check | same |
| 134 | Format String | Input used as a format | same |
| 362 / 367 | Race Condition / TOCTOU | Check and use not atomic | same, Code quality |
| 426 / 427 | Untrusted / Uncontrolled Search Path | Loads code or binaries from attacker-writable paths | same |

## Configuration, logging, and supply chain

| CWE | Name | Problem | See |
|---|---|---|---|
| 16 / 1188 | Configuration / Insecure Default | Unsafe settings left on | Misconfiguration |
| 489 | Active Debug Code | Debug features in production | Misconfiguration |
| 942 | Overly Permissive CORS | Any origin may read responses | CSRF, Misconfiguration |
| 614 / 1004 / 1275 | Cookie missing Secure / HttpOnly / SameSite | Session cookie exposed or sent cross-site | Misconfiguration |
| 1021 | Clickjacking (UI layer restriction) | Page framed by another site | [CLIENT-SIDE.md](CLIENT-SIDE.md) |
| 778 / 223 | Insufficient Logging / Omitted Security Info | Abuse cannot be detected or investigated | Logging gaps |
| 494 / 353 | Download of Code / Missing Integrity Check | Unverified code, updates, or CDN scripts (no SRI hash) run | Third-party scripts and dynamic imports, [SUPPLY-CHAIN-AND-RELEASE.md](SUPPLY-CHAIN-AND-RELEASE.md) |
| 693 | Protection Mechanism Failure | A control such as CSP or HTTPS enforcement is missing or too weak to contain an attack | Content Security Policy and insecure transport |
| 829 / 1357 | Untrusted Functionality / Component | Code from an untrusted source included | same |
| 1104 | Unmaintained Third-Party Component | Dependency no longer patched (very old, archived, or deprecated) | Dependency pinning, release age, and abandoned packages |
| 1395 | Dependency on Vulnerable Third-Party Component | A known-vulnerable version is used | same |
| 1357 / 829 (pinning) | Reliance on Insufficiently Trustworthy Component | Unpinned versions or a just-published release run unreviewed | same |
