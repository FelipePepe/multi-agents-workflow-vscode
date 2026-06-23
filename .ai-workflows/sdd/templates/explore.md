# Explore: <change-name>

**Date:** <!-- ISO 8601 date, e.g. 2024-01-15 -->
**Change Name:** <!-- kebab-case change name, must match the directory name -->
**Agent:** Explorer
**Model:** qwen3.6:35b-a3b
**Status:** <!-- draft | complete -->

---

> **Instructions for the Explorer agent:**
> Read the repository broadly before filling in any section. Prioritize understanding
> structure over reading every file. Focus on what is relevant to the change request.
> Mark anything uncertain with a confidence level. Leave no section blank — write
> "N/A" or "Not detectable from codebase" if truly not applicable.

---

## Repository Overview

<!-- 2-4 sentences describing what this repository does and its main purpose.
     Include: primary domain, intended users, deployment context (SaaS/CLI/library/etc.),
     team size if inferable from git log. Be factual, not promotional. -->

## Detected Stack

<!-- Scan package.json / Cargo.toml / go.mod / pyproject.toml / pom.xml etc.
     Confidence: High = explicit in config, Medium = inferred from imports, Low = guessed -->

| Category | Detected | Version | Confidence |
|----------|----------|---------|------------|
| Language | <!-- e.g. TypeScript 5.3 --> | | <!-- High/Medium/Low --> |
| Runtime | <!-- e.g. Node.js 20 LTS --> | | |
| Framework | <!-- e.g. Express, Next.js, NestJS, none --> | | |
| Build System | <!-- e.g. tsc, esbuild, webpack, vite --> | | |
| Test Framework | <!-- e.g. Vitest, Jest, Mocha, pytest --> | | |
| ORM / DB Client | <!-- e.g. Prisma, Drizzle, TypeORM, none --> | | |
| Database | <!-- e.g. PostgreSQL, SQLite, none --> | | |
| CI/CD | <!-- e.g. GitHub Actions, GitLab CI, none --> | | |
| Package Manager | <!-- e.g. pnpm, npm, yarn, cargo --> | | |
| Container | <!-- e.g. Docker, none --> | | |

## Important Files

<!-- List every file relevant to this change request.
     Include entry points, config files, and any file that will likely need modification.
     "Relevance to Change" column: HIGH / MEDIUM / LOW -->

| File | Purpose | Relevance to Change |
|------|---------|---------------------|
| <!-- path/to/file --> | <!-- what it does --> | <!-- HIGH/MEDIUM/LOW --> |

## Existing Patterns

<!-- Bullet list of architectural and code-style patterns found in the repository.
     Be specific: name the pattern AND give a concrete example file path.
     Examples:
     - Clean Architecture: domain logic in src/domain/, infra in src/infra/
     - Repository pattern: IUserRepository interface + UserRepository implementation
     - Error handling: Result<T, E> type, no thrown exceptions in service layer
     - DTO validation: Zod schemas co-located with route handlers
     - Naming: PascalCase classes, camelCase functions, kebab-case files -->

- <!-- Pattern: description (example: src/path/to/example.ts) -->

## Dependencies

<!-- Only list packages directly relevant to the change request.
     Skip dev-only tools (prettier, eslint) unless the change affects tooling itself. -->

| Package | Version | Purpose | Relevance |
|---------|---------|---------|-----------|
| <!-- package-name --> | <!-- ^x.y.z --> | <!-- what it does --> | <!-- why it matters for this change --> |

## Test Coverage

<!-- Describe the current testing state as found in the repository.
     Include: test framework, test file location convention, rough coverage % if a
     coverage report is present, test style (unit / integration / e2e / none). -->

- **Framework:** <!-- e.g. Vitest with @testing-library/react -->
- **Test location:** <!-- e.g. co-located *.test.ts, or tests/ directory -->
- **Coverage:** <!-- e.g. ~68% lines per last coverage report in coverage/lcov-report/, or "not configured" -->
- **Style:** <!-- e.g. unit tests only, no integration tests, e2e with Playwright -->
- **Gaps relevant to this change:** <!-- areas with missing coverage that this change touches -->

## Risks

<!-- Surface risks that will affect the approach chosen in the Proposal phase.
     Severity: High = could block the change, Medium = needs mitigation, Low = worth noting -->

| Risk | Severity | Notes |
|------|----------|-------|
| <!-- description --> | <!-- High/Medium/Low --> | <!-- context or mitigation hint --> |

## Unknowns

<!-- Bullet list of open questions that must be resolved before work begins.
     These become explicit inputs to the Proposal agent.
     Format: "Unknown: [question]  —  Impact: [what decision it affects]" -->

- <!-- Unknown: ...  —  Impact: ... -->

## Recommended Next Step

<!-- Clear, direct instruction to the orchestrator.
     State: (1) whether exploration is sufficient to proceed, (2) what the Proposal agent
     should focus on, (3) any clarifications to request from the human before proceeding.
     Example: "Exploration is complete. Proposal agent should focus on the token refresh
     strategy — the existing auth flow in src/auth/jwt.service.ts is the primary touch
     point. No human clarification needed." -->
