# Proposal: <change-name>

**Date:** <!-- ISO 8601 date, e.g. 2024-01-15 -->
**Agent:** Proposal
**Model:** deepseek-r1:70b
**Status:** <!-- draft | complete -->
**Based on:** 01-explore.md

---

> **Instructions for the Proposal agent:**
> Read 01-explore.md in full before writing a single word here. Reference actual
> file paths, class names, and patterns from the explore report — never invent them.
> This document makes a RECOMMENDATION. It does not implement anything. Justify every
> decision. If the explore report surfaces unknowns, address them explicitly here or
> declare them out of scope with a rationale.

---

## Problem Statement

<!-- What problem does this change solve?
     Answer these three questions:
     1. What is currently broken, missing, or inadequate?
     2. Who is affected and how?
     3. What is the cost of NOT making this change?
     Be specific. Avoid vague statements like "improve performance" — say
     "the /api/export endpoint times out for datasets > 10k rows (observed in logs)". -->

## Proposed Approach

<!-- Concrete description of the recommended solution.
     Reference actual files, classes, and patterns from the explore report.
     Structure this as: WHAT changes + WHERE it changes + HOW it integrates with existing code.
     Do NOT write implementation code here. Pseudocode or interface sketches are acceptable
     only if they clarify a non-obvious design decision. -->

## Alternatives Considered

<!-- At minimum 2 alternatives. The first should be "do nothing" if applicable.
     "Why Not Chosen" must reference a concrete constraint: performance, complexity,
     compatibility, risk — not just "it's worse". -->

| Approach | Pros | Cons | Why Not Chosen |
|----------|------|------|----------------|
| <!-- Alternative 1 --> | <!-- ... --> | <!-- ... --> | <!-- concrete reason --> |
| <!-- Alternative 2 --> | <!-- ... --> | <!-- ... --> | <!-- concrete reason --> |

## Files Affected

<!-- Exhaustive list of files this change will touch.
     Change Type: add | modify | delete | rename
     "Reason" column: why this file is involved (don't just say "needs updating"). -->

| File | Change Type | Reason |
|------|-------------|--------|
| <!-- path/to/file --> | <!-- add/modify/delete/rename --> | <!-- specific reason --> |

## API / Data Model Impact

<!-- Breaking change: yes / no
     If yes: describe the migration path and what callers must do.
     Cover: new/changed function signatures, new/changed REST endpoints,
     new/changed database columns, new/changed event payloads, new/changed types.
     If no API or data model changes: state that explicitly. -->

- **Breaking change:** <!-- yes / no -->
- **Migration path:** <!-- describe, or "N/A" -->
- **Changed contracts:** <!-- list, or "none" -->

## Migration Impact

<!-- Be explicit about operational concerns.
     Answer each:
     - Database migrations needed? (yes/no — if yes, describe what)
     - Configuration changes needed? (new env vars, changed defaults)
     - Feature flags required? (yes/no — if yes, why)
     - Deployment sequence constraints? (e.g. "migrate DB before deploying new code")
     - Data backfill needed? (yes/no — if yes, estimated row count and risk) -->

## Security Impact

<!-- Every change has a security posture. Be explicit even if the impact is "none".
     Cover:
     - New attack surface introduced (new endpoints, new file access, new network calls)
     - New inputs that require validation
     - Auth/authz implications (who can trigger this change's functionality)
     - Secrets or credentials involved
     - Sensitive data handled (PII, financial, health)
     If genuinely none: state "No new attack surface. No new inputs. No auth changes." -->

## Testing Strategy

<!-- How will this change be verified?
     Specify: types of tests (unit/integration/e2e), which files, new fixtures or mocks needed.
     If existing tests cover it: name them explicitly.
     If no tests are feasible: explain why and what manual verification looks like. -->

- **Unit tests:** <!-- which components, which files -->
- **Integration tests:** <!-- which flows, which files -->
- **E2E tests:** <!-- which user journeys, or "not applicable" -->
- **New fixtures/mocks needed:** <!-- describe, or "none" -->

## Risks

<!-- Risks specific to this proposal's approach.
     Focus on implementation risks (not project risks already in explore.md).
     Severity: High = could cause production incident, Medium = needs mitigation plan,
     Low = monitor during implementation -->

| Risk | Severity | Mitigation |
|------|----------|------------|
| <!-- risk description --> | <!-- High/Medium/Low --> | <!-- concrete mitigation --> |

## Recommendation

<!-- Final recommendation in 3-5 sentences.
     State: (1) the recommended approach and why it is the right choice given the constraints,
     (2) the most important risk to watch, (3) any prerequisite the Spec agent must address.
     Do NOT hedge with "it depends" — make a call. -->
