# Fix Build / Test Errors

**Purpose**: Applies minimal, targeted fixes for build, test, or lint failures. Addresses only reported errors — no refactoring, no opportunistic cleanup, no speculative changes.

**Model / Agent role**: `devstral-small-2` — Fix Agent

**Use in**: Claude Code, Cline, Continue, OpenCode, Codex

---

## Step 1 — Read the error logs

Read the following files (all that exist — note which are absent):

- `.ai-workflows/logs/build.log`
- `.ai-workflows/logs/tests.log`
- `.ai-workflows/sdd/changes/<name>/07-verify-report.md` (if it exists — read CRITICAL findings)

If BOTH `build.log` and `tests.log` are missing or empty, ask the user:

> "No build or test logs found. Please paste the error output directly, or run the build and ensure logs are written to `.ai-workflows/logs/`."

---

## Step 2 — Enumerate all errors

List every distinct error found across all logs. Group them by type:

```
Build errors (3):
  [1] src/services/UserService.ts:42 — TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'
  [2] src/di/container.ts:17 — TS2304: Cannot find name 'UserRepositoryImpl'
  [3] src/routes/userRoutes.ts:8 — TS2307: Cannot find module '../services/UserService'

Test failures (1):
  [4] UserService.spec.ts — FAIL: "should return null when user not found" — TypeError: Cannot read properties of undefined (reading 'findById')
```

Do NOT fix anything yet — enumerate first.

---

## Step 3 — Diagnose root causes

For each error, determine the root cause. Distinguish between:

- **Symptom errors** — errors that cascade from a single root cause (fix the root, these disappear).
- **Independent errors** — each requires its own fix.

State the diagnosis explicitly before touching any code:

```
Root cause analysis:
  [2] is the root cause — UserRepositoryImpl was not exported from its module.
  [1] cascades from [2] — UserService cannot construct without the repository.
  [3] is a circular import path — unrelated to [1] and [2].
  [4] cascades from [2] — test cannot inject the repository.
```

---

## Step 4 — Read each affected file

Before modifying any file, read it completely:

> "Reading `src/repositories/InMemoryUserRepository.ts` before modifying."

Do this for every file you will change. No exceptions.

---

## Step 5 — Apply the minimal fix

Fix errors in root-cause-first order (fixing a root cause may resolve cascading errors automatically).

For each fix:

1. State the exact error message being fixed.
2. State the root cause in one sentence.
3. Apply the MINIMAL change that resolves the error — do not rewrite surrounding code.
4. Show exactly what changed:

```
Fix [2]: Added missing export to InMemoryUserRepository.ts
  Before: class InMemoryUserRepository implements UserRepository {
  After:  export class InMemoryUserRepository implements UserRepository {
```

5. After applying, check whether this fix resolves any cascading errors. If yes, mark those as resolved.

---

## Step 6 — State re-validation command

After all fixes are applied, print the exact command to re-run validation:

```
Re-validation command:
  npx tsc --noEmit && npm test

Run VS Code task 'SDD: Run Validation' if configured, then check .ai-workflows/logs/ for updated output.
```

---

## Step 7 — Update the progress log

Read `.ai-workflows/sdd/changes/<name>/06-apply-progress.md` and append to the "Fixes Applied" section:

```markdown
## Fixes Applied

| Error | Root Cause | Fix | File | Applied At |
|-------|-----------|-----|------|-----------|
| TS2304: Cannot find name 'UserRepositoryImpl' | Missing export | Added `export` keyword | src/repositories/InMemoryUserRepository.ts | <ISO timestamp> |
```

---

## Step 8 — Handle cascading discoveries

If fixing one error reveals a NEW error that was not in the original log:

1. Stop the current fix sequence.
2. Document the new error in `06-apply-progress.md` under "Blockers".
3. Report to the user:

> "Fixing `<original error>` revealed a new issue: `<new error>`. I have documented it. This likely requires reviewing `<relevant file or phase>` before continuing."

Fix them sequentially — do NOT fix the new error silently without reporting it first.

---

## Hard Constraints

- **NEVER modify `.env`, `*.key`, `*.pem`, `secrets.*`, `appsettings.Production.json`, `*.p12`, `*.pfx`**.
- **NEVER install new dependencies** without explicit user approval. If a missing package is the root cause, ask before running any install command.
- **NEVER rewrite a function** that is not directly causing the error. Apply the smallest possible change.
- **NEVER suppress a warning** by disabling the lint rule, adding `// eslint-disable`, `#pragma warning disable`, or similar — unless the user explicitly requests it and explains why.
- **NEVER delete a failing test** to make the test suite pass. A failing test is information.
- **NEVER use a workaround** when the correct fix requires a design change. Document the situation and stop:
  > "This error reveals a design issue in `04-design.md` — the fix requires architectural input. I cannot resolve it here."
- **If the fix touches more than 3 files**: stop, document what you found, and report to the user for orchestrator-level decision.
- **NEVER assume the fix is correct** — always state the re-validation command and require the user to confirm it passes.

---

## Expected Outputs

| File | When updated |
|------|-------------|
| Modified source files (max 3) | Step 5 |
| `.ai-workflows/sdd/changes/<name>/06-apply-progress.md` | Step 7 |
