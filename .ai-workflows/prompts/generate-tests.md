# Generate Tests

**Purpose**: Generates or updates tests for the current change. Derives test cases directly from spec acceptance criteria and edge cases. Matches the existing test framework, conventions, and style exactly.

**Model / Agent role**: `devstral-small-2` — Tester

**Use in**: Claude Code, Cline, Continue, OpenCode, Codex

---

## Step 1 — Identify the change

Ask for the change name if not provided.

---

## Step 2 — Read planning artifacts

Read:

1. `.ai-workflows/sdd/changes/<name>/03-spec.md` — acceptance criteria, edge cases, data contracts, non-functional requirements.
2. `.ai-workflows/sdd/changes/<name>/06-apply-progress.md` — list of files modified (source files to test).

If `03-spec.md` is missing, stop:

> "Cannot generate tests: spec not found. Complete the `sdd-spec` phase first."

---

## Step 3 — Inspect existing test infrastructure

Before writing a single line of test code, survey the test setup:

1. **Framework detection**: look for `jest.config.*`, `vitest.config.*`, `pytest.ini`, `*.csproj` with xUnit/NUnit/MSTest, `pom.xml` with JUnit, etc.
2. **Test file location**: are tests colocated with source (`*.spec.ts` next to `*.ts`) or in a separate directory (`__tests__/`, `tests/`, `spec/`)?
3. **Naming convention**: read 2–3 existing test files to identify the describe/it/test pattern in use.
4. **Mocking style**: how are dependencies mocked? (`jest.mock`, `vi.mock`, `unittest.mock`, `Mockito.mock`, manual stubs in a `__mocks__/` directory, etc.)
5. **Assertion style**: `expect(x).toBe(y)`, `assert.equal(x, y)`, `x.Should().Be(y)`, etc.
6. **Test data patterns**: are factories used? Fixtures? Inline literals?
7. **Async patterns**: how are async tests written? (`async/await`, `done` callbacks, `return Promise`, pytest `asyncio`, etc.)

Read at least 2 existing test files to verify conventions. Do NOT assume — always read.

---

## Step 4 — Handle missing test infrastructure

If NO test framework is detected:

Ask the user:

> "No test framework detected in this project. Would you like to add one?
>
> Based on the detected stack (`<stack>`), I recommend:
> - `<framework name>` — `<one-sentence reason>`
>
> If yes, I will:
> 1. Install the minimum required packages.
> 2. Create a minimal configuration file.
> 3. Create one smoke test to verify the setup works.
>
> I will NOT change any production code."

Wait for the user's response. Do NOT install packages without explicit approval.

---

## Step 5 — Derive the test cases

From `03-spec.md`, extract:

1. Every **acceptance criterion** → at least one test per criterion (happy path).
2. Every **edge case** listed → one test per edge case.
3. Every **error path** implied by the data contracts → null input, missing required field, invalid type, out-of-range value, network failure simulation, empty collection, etc.
4. Every **modified function or method** in the files listed in `06-apply-progress.md` → one test for the happy path if not already covered by acceptance criteria.

Before writing tests, print the derived test list for the user to review:

```
Derived test cases (12 total):

Acceptance criteria:
  AC-01: "should return user object when user exists"           → TASK-003
  AC-02: "should return null when user ID not found"           → TASK-003
  AC-03: "should persist user and return with generated ID"    → TASK-004

Edge cases:
  EC-01: "should return null when ID is empty string"
  EC-02: "should throw when email is already registered"

Error paths:
  EP-01: "should propagate repository error as ServiceError"
  EP-02: "should return empty array when no users match filter"
  ...
```

Ask: "Does this test plan look correct? Confirm or adjust before I generate the code."

Wait for confirmation.

---

## Step 6 — Generate the tests

Write the test code following ALL conventions identified in Step 3.

Requirements for every test:

- **Descriptive name**: `"should return 404 when user not found"` — not `"test1"` or `"works"`.
- **Realistic test data**: use plausible values (e.g., `{ id: "usr_abc123", email: "alice@example.com", name: "Alice" }`) — not `0`, `null`, `"test"`, or `"foo"`.
- **Independence**: each test must be self-contained. No shared mutable state between tests. Use `beforeEach` to reset state.
- **Single assertion per test** (where practical): one test, one failure reason.
- **No execution-order dependencies**: tests must pass in any order.
- **Correct async handling**: match the project's async pattern exactly.

Follow this test structure:

```
// Given — set up initial state and inputs
// When  — call the function under test
// Then  — assert the expected outcome
```

If the project uses `describe`/`it` blocks, use them. If it uses standalone `test()` calls, use those. Match what exists.

---

## Step 7 — Write test files

Write each test file to the correct location (colocated or in the test directory, based on Step 3).

If adding tests to an existing file: read it fully first, then append new test cases — do NOT delete existing tests.

If creating a new test file: use the naming convention observed in Step 3.

---

## Step 8 — Update the progress log

Update `.ai-workflows/sdd/changes/<name>/06-apply-progress.md`:

Append to the "Files Modified" section:

```markdown
- tests/services/UserService.spec.ts — Added 12 tests for UserService (AC-01 through AC-03, EC-01, EC-02, EP-01, EP-02)
```

---

## Hard Constraints

- **NEVER modify production code** — test files only.
- **NEVER delete existing passing tests** — append or update only.
- **NEVER create tests that depend on execution order** — each test must be fully self-contained.
- **NEVER hardcode credentials, API keys, real email addresses, or real user IDs** in test data. Use clearly fake values (`test@example.com`, `usr_test_123`).
- **NEVER use `any` type in TypeScript test files** when the production types are available.
- **NEVER install a new test framework** without explicit user approval (Step 4).
- **NEVER write tests before reading the existing test infrastructure** (Step 3) — convention mismatch causes more problems than no tests.

---

## Expected Outputs

| File | When written |
|------|-------------|
| New or updated test files | Step 7 |
| `.ai-workflows/sdd/changes/<name>/06-apply-progress.md` | Step 8 |
