# Security Review

**Purpose**: Performs a focused, evidence-based security review of the current change. Checks all OWASP Top 10 categories plus supply chain and logging risks. Produces only actionable findings backed by specific code evidence.

**Model / Agent role**: `deepseek-r1:70b` — Verifier

**Use in**: Claude Code, Cline, Continue, OpenCode, Codex

---

## Step 1 — Identify the change

Ask for the change name if not provided.

---

## Step 2 — Read the scope

Read:

1. `.ai-workflows/sdd/changes/<name>/06-apply-progress.md` — to get the list of modified files.
2. `.ai-workflows/sdd/changes/<name>/03-spec.md` — to understand the intended behavior, data inputs, and trust boundaries.

Read EVERY file listed under "Files Modified" in `06-apply-progress.md`.

If `06-apply-progress.md` is missing, ask the user to provide a list of files to review.

---

## Step 3 — Systematic security review

Review all modified files against each category below. For each category, state either:

- The findings (with evidence), OR
- "No issues found in reviewed scope."

Do NOT skip a category. Do NOT report theoretical risks with no code evidence.

---

### Category 1 — SQL Injection

Look for:
- String concatenation or interpolation used to build SQL queries.
- Raw query methods (`query()`, `execute()`, `raw()`, `fromRawSql()`, `.Query<T>()` with string interpolation) receiving user-supplied data.
- ORM escape bypasses.

Safe patterns to recognize (do not flag): parameterized queries, prepared statements, ORM query builders without raw segments.

---

### Category 2 — Command Injection

Look for:
- `exec`, `execSync`, `spawn`, `spawnSync` (Node.js)
- `subprocess.run`, `os.system`, `os.popen` (Python)
- `Process.Start`, `Shell.Execute` (C#)
- Shell operators (`|`, `;`, `&&`, `` ` ``, `$()`) in strings built from user input.

---

### Category 3 — LDAP Injection

Look for:
- User input inserted into LDAP filter strings without escaping.
- LDAP search calls (`ldap.search`, `DirectorySearcher.Filter`) with user-controlled segments.

---

### Category 4 — XML / XXE (XML External Entities)

Look for:
- XML parsers with `FEATURE_EXTERNAL_GENERAL_ENTITIES` or `FEATURE_SECURE_PROCESSING` not enforced.
- `XmlDocument`, `XmlReader` (C#) without `XmlReaderSettings.DtdProcessing = DtdProcessing.Prohibit`.
- `lxml`, `xml.etree`, `defusedxml` absence when parsing external XML (Python).
- `DocumentBuilderFactory.setFeature` not hardening Java XML parsers.

---

### Category 5 — Broken Authentication

Look for:
- Hardcoded credentials in source code or config files.
- Weak or fixed session token generation (e.g., `Math.random()`, sequential IDs).
- Missing authentication middleware on routes that handle sensitive data.
- JWT tokens validated without algorithm verification (`alg: "none"` acceptance).
- Passwords stored as plaintext or with MD5/SHA1.

---

### Category 6 — Sensitive Data Exposure

Look for:
- API keys, tokens, connection strings, passwords, or private keys committed in source files or config files checked into the repo.
- PII (names, emails, SSNs, credit card numbers) stored unencrypted.
- Sensitive data returned in API responses that is not needed by the caller.
- HTTP (non-TLS) used for endpoints that transmit credentials or sensitive data.

---

### Category 7 — Broken Access Control

Look for:
- Endpoints that perform sensitive actions without verifying the caller's authorization (missing `authorize`, `requireAuth`, `[Authorize]`, etc.).
- Insecure direct object references: user-supplied IDs used to fetch resources without ownership check.
- Privilege escalation paths: a low-privilege caller can trigger admin actions.

---

### Category 8 — Security Misconfiguration

Look for:
- Debug mode, verbose logging, or stack traces enabled for production paths.
- Default credentials or placeholder secrets (`password123`, `secret`, `changeme`).
- CORS configured as `*` on endpoints that set or read auth cookies.
- Error handlers that return full exception details to the client.

---

### Category 9 — XSS (Cross-Site Scripting)

Look for:
- `innerHTML`, `outerHTML`, `document.write` with user-controlled content (DOM-based XSS).
- `dangerouslySetInnerHTML` in React without sanitization.
- Razor `@Html.Raw(...)` with user input.
- Template engines with unescaped variable output (`{{- }}` in Go, `<%= raw %>` in ERB, `{{ | safe }}` in Jinja2).

---

### Category 10 — SSRF (Server-Side Request Forgery)

Look for:
- HTTP client calls (`fetch`, `axios`, `requests.get`, `HttpClient`, `curl`) where the URL is fully or partially derived from user input.
- URL redirect handlers that follow external URLs without an allowlist.
- Webhook or callback URL registration without domain validation.

---

### Category 11 — Path Traversal

Look for:
- File read/write/delete operations where the path is constructed from user input.
- Missing path normalization (`path.normalize`, `Path.GetFullPath`) before file operations.
- Missing boundary validation (ensuring the resolved path stays within an expected root directory).
- `../` sequences in filenames not stripped or rejected.

---

### Category 12 — Unsafe Deserialization

Look for:
- `pickle.loads` (Python) on untrusted data.
- `eval` or `Function()` constructor (JavaScript) on external input.
- `BinaryFormatter`, `NetDataContractSerializer` (C#) — deprecated and unsafe.
- `JSON.parse` on user input without schema validation (note: JSON.parse itself is safe from RCE, but the resulting structure may not match expected shape).
- `ObjectInputStream` (Java) deserializing from untrusted sources.
- `YAML.load` (not `YAML.safe_load`) on untrusted input.

---

### Category 13 — Sensitive Data in Logs

Look for:
- Log statements that include passwords, tokens, session IDs, API keys, or PII.
- Exception handlers that log the full exception message when it may contain credentials.
- Debug log statements left active in production code paths.

---

### Category 14 — Supply Chain

List every new dependency added in the modified files (new `import`, `require`, `using`, `from`, `#include`, `<dependency>`, etc. that does not appear in the unmodified codebase).

For each new dependency:

- Note the package name and version if specified.
- Flag it for scanning:

> "Run `npm audit` / `pip-audit` / `OWASP Dependency Check` on `<package>` before shipping."

Do NOT block on this — it is an informational flag, not a CRITICAL finding unless a known CVE is cited.

---

## Step 4 — Classify and format all findings

For each finding, output:

```
[SEVERITY] Category: <category name>
File: <path/to/file.ts>
Line: <line number or range, if determinable>
Description: <one clear sentence describing the vulnerability>
Evidence:
  <code snippet showing the vulnerable code>
Remediation:
  <concrete code example showing the fix>
```

Severity levels:
- **CRITICAL** — directly exploitable, high impact (data breach, RCE, authentication bypass, privilege escalation). BLOCKS shipping.
- **HIGH** — exploitable under realistic conditions, significant impact. BLOCKS shipping.
- **MEDIUM** — requires specific conditions or has limited impact. Must be documented; should be fixed before production.
- **LOW** — best-practice improvement, minimal direct exploitability. Document and fix at discretion.

---

## Step 5 — Write the security report

If `.ai-workflows/sdd/changes/<name>/07-verify-report.md` exists:

Append a "Security Review" section to it.

If it does NOT exist:

Write a standalone file: `.ai-workflows/sdd/changes/<name>/security-review.md`

Report structure:

```markdown
# Security Review: <change-name>

**Date**: <ISO timestamp>
**Model**: deepseek-r1:70b
**Scope**: <N files reviewed>
**Overall Risk**: CRITICAL | HIGH | MEDIUM | LOW | NONE

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | X |
| HIGH | X |
| MEDIUM | X |
| LOW | X |

---

## Findings

(one block per finding, using the format from Step 4)

---

## Supply Chain

(list of new dependencies to scan, or "No new dependencies added")

---

## No Issues Found Categories

The following categories were checked and no issues were found in the reviewed scope:

- (list categories with no findings)
```

---

## Hard Constraints

- **NEVER modify any code** — this is a read-only audit.
- **NEVER report theoretical findings** without citing specific code evidence (file + code snippet).
- **NEVER skip a security category** — all 14 must be checked, even if only to report "No issues found."
- **NEVER flag safe patterns as vulnerabilities** (e.g., parameterized SQL queries are safe; do not flag them).
- **NEVER omit the remediation example** for CRITICAL or HIGH findings.
- **NEVER state "this looks fine"** without actually reading the implementation files.

---

## Expected Outputs

| File | When written |
|------|-------------|
| `.ai-workflows/sdd/changes/<name>/07-verify-report.md` (appended) | Step 5 (if exists) |
| `.ai-workflows/sdd/changes/<name>/security-review.md` (created) | Step 5 (if verify report absent) |
