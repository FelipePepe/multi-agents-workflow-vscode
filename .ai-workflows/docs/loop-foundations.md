# Loop Foundations — Theory and Implementation

> This document maps the theoretical model of AI loops to the concrete architecture of this workflow.
> Read this before modifying the orchestrator, the review loop, or the verification gate.

---

## The Core Model

Every real loop has exactly three required parts. Everything else is implementation detail.

```
VERIFY   — a gate that cannot be gamed. Binary: pass or fail.
STATE    — memory that survives between iterations. Without it, every pass starts from zero.
STOP     — two exits: success, and a hard limit. One exit means infinite billing.
```

A workflow that lacks any one of these three is not a loop. It is an LLM repeating itself with confidence.

The other steps — discover, plan, execute, iterate — are useful structure, but they are not what makes a loop work. **Verify is the mechanism. State is the continuity. Stop is the contract.**

---

## The Five Loop Primitives

A production loop is assembled from five building blocks. This workflow implements all five.

| Primitive | What it does | This workflow's implementation |
|-----------|-------------|-------------------------------|
| **Automation** | The trigger that makes it recurring | VS Code tasks + cron-ready scripts |
| **Skill** | Reusable instructions the loop reads each run | `.ai-workflows/agents/*.md` |
| **Sub-agents** | Separate maker from checker | `implementer (qwen3-coder-next)` ≠ `verifier (deepseek-r1:70b)` |
| **Connectors** | Lets the agent act, not just suggest | `run-validation.sh`, `run-build.sh`, `run-tests.sh` |
| **Verifier** | The gate that rejects bad work automatically | Build + test + lint output → PASS / FAIL |

The single most important insight from this list: **the verifier must be deterministic**. A script that runs tests and returns exit code 0 or 1 is a real verifier. An LLM scoring its own work 1–10 is not — a model that produced mediocre output will score it 7.5 and declare success. Use binary gates.

---

## Maker ≠ Checker: Why Models Are Assigned This Way

The model assignment in `models.json` is not arbitrary. It follows a deliberate principle: **the agent that writes the code must not be the agent that approves the code.**

```
implementer → qwen3-coder-next    (fast, code-generation optimized)
verifier    → deepseek-r1:70b     (chain-of-thought, catches gaps the coder skipped)
design      → deepseek-r1:70b     (reasoning-heavy, catches architectural errors early)
spec        → qwen3-coder-next    (precision: converts language into testable requirements)
```

The reasoning model (`deepseek-r1:70b`) is placed at the two most critical quality gates — design and verification — precisely because its chain-of-thought process surfaces assumptions that a code-generation model treats as settled. Complementary cognition, not redundancy.

Changing both implementer and verifier to the same model defeats the architecture.

---

## State: What Persists Across Iterations

`state.json` in each change directory is the loop's memory. It answers three questions every iteration:

1. **What phase are we in?** (never re-run a complete phase)
2. **What has already failed?** (stop repeating the same fix)
3. **How many iterations have we spent?** (enforce the stop condition)

Without this file, the loop has amnesia. Each pass costs the same but learns nothing from the last one. This is the source of the "Ralph Wiggum" failure mode: the agent declares success on a half-finished job because it has no memory of what the goal actually required.

`06-apply-progress.md` is the iteration-level state — what changed in this pass. `state.json` is the session-level state — where the change stands overall.

---

## The Stop Condition

Two exits. Both are mandatory.

**Exit 1 — Success:** `verifyVerdict` in `state.json` is `PASS` or `PASS_WITH_WARNINGS`, AND build passes, AND tests pass (or absence of tests is documented).

**Exit 2 — Hard limit:** `reviewLoopIteration` reaches `maxIterations` (default: 5 in `workflow.json`). On hard stop, the orchestrator reports what passed, what failed, and why it could not converge. It does NOT silently mark the change complete.

A loop with only one exit — success — will run until it succeeds, breaks the context window, or charges you into silence. The hard limit is not a failure. It is the loop honestly reporting that the problem is harder than the current approach can solve.

---

## Convergence Failure: What the Articles Don't Mention

Most writing on loops assumes the loop will eventually converge. It will not always converge. Common reasons:

- The spec contradicts the design (no implementation can satisfy both)
- The test suite tests the wrong thing (tests pass, spec is not met)
- The model cannot produce the required abstraction (capability ceiling)
- The codebase has an architectural constraint the loop cannot change

When the hard limit is reached without convergence, the correct response is escalation to a human with a full report — not another loop pass, not a relaxed stop condition, not removing the failing test.

The orchestrator's job at hard-stop is to write a clear summary of: what was attempted, what the verifier found, and what a human needs to decide to unblock it.

---

## The Cost Problem — and Why It's Different Here

On cloud APIs, loop cost compounds per iteration because every pass re-sends the full growing context. The math is brutal: 10 iterations of a medium task can cost 10× a single pass, not 10× a single prompt, because the context grows each round.

**This workflow runs on local Ollama inference.** On an NVIDIA DGX Spark with 128GB unified memory, the marginal cost per token approaches zero. The cost model is inverted:

| Cost factor | Cloud (GPT-4, Claude API) | Local (Ollama, DGX Spark) |
|-------------|--------------------------|--------------------------|
| Per-token cost | Real money | Hardware amortized |
| Loop iteration cost | Compounds | Flat (memory + time) |
| Parallel agents | Multiplies cost | Multiplies time, not cost |
| Failed iterations | Expensive | Cheap to discard |

The calculus for "is a loop worth it" changes entirely on local inference. The article's guidance — "most people don't need the heavy version" — applies to cloud spend. **On local hardware, the budget constraint is time and context window, not money.**

This shifts the optimization target: minimize total iterations and context growth, not minimize token spend.

---

## The Correct Build Order

This is the sequence that separates loops that survive in production from loops that blow up overnight.

```
1. ONE reliable manual run        — prove the task is doable before automating it
2. Turn it into a skill           — save the instructions, remove them from the loop itself
3. Add the gate + stop condition  — make it verifiable before making it recurring
4. Schedule it                    — only after steps 1–3 are solid
```

Scheduling something unreliable at step 4 means waking up to either a wall of failures or a wall of false successes. Neither is useful.

For this SDD workflow specifically:
- Step 1: run one complete change manually through all 8 phases
- Step 2: agent files in `.ai-workflows/agents/` are the skills
- Step 3: `run-validation.sh` + `verifyVerdict` are the gate
- Step 4: VS Code tasks or cron can schedule recurring validation runs

---

## The Four Criteria: When a Loop Is Worth Building

Before adding loop automation to any task, verify all four conditions are true.

| Criterion | Why it matters | What breaks without it |
|-----------|----------------|------------------------|
| **Task repeats ≥ weekly** | Setup cost must amortize | One-off tasks don't recover setup investment |
| **Something can automatically reject bad output** | Gate must be real, not judgmental | No gate = LLM grading its own homework |
| **Agent can complete it end-to-end** | No human-in-the-loop during execution | Partial automation creates worse coordination cost |
| **"Done" is objective** | Stop condition must be binary | Taste-based quality still requires human judgment |

For software tasks — build pass, test pass, lint clean — all four criteria are almost always met. This is why coding loops work. For open-ended creative tasks, criterion 4 usually fails. A loop that scores its own creative writing against a rubric it also wrote is measuring nothing.

---

## What This Workflow Is, in Loop Terms

```
TRIGGER        → user paste of start-sdd-change.md prompt into AI tool
DISCOVER       → sdd-explore (01-explore.md)
PLAN           → sdd-propose + sdd-spec + sdd-design + sdd-tasks (02–05)
EXECUTE        → sdd-apply in batches (06-apply-progress.md)
VERIFY (GATE)  → run-validation.sh → build.log + tests.log (deterministic)
               + verifier agent → 07-verify-report.md (reasoning model)
ITERATE        → fixer agent → targeted patches → re-run validation
STATE          → state.json (phase progress) + apply-progress.md (iteration detail)
STOP           → PASS/PASS_WITH_WARNINGS OR maxIterations reached
ARCHIVE        → sdd-archive (08-archive-report.md)
```

The critical distinction from a naive chat loop: the verification step has **two layers**. The script layer is deterministic (exit code 0/1). The reasoning layer (`deepseek-r1:70b`) catches what scripts cannot: hallucinated APIs, security holes, spec violations, missing edge cases. Scripts catch what the model can't reliably see. The model catches what scripts can't express. Neither alone is sufficient.

---

## Reference

Core theory sourced from: *"Loops explained: Claude, GPT, Mira and what actually works"* by Anatoli Kopadze.
Key additions not covered in that article: idempotency requirements, local inference cost inversion, convergence failure handling, deterministic vs. LLM-judged verification.
