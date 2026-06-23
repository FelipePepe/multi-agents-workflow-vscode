# Design: <change-name>

**Date:** <!-- ISO 8601 date, e.g. 2024-01-15 -->
**Agent:** Design
**Model:** deepseek-r1:70b
**Status:** <!-- draft | complete -->
**Based on:** 01-explore.md, 02-proposal.md, 03-spec.md

---

> **Instructions for the Design agent:**
> Read all three prior artifacts before writing. Your job is to define HOW the
> system will be built — not to restate what was already decided. Every component
> section must reference a real file path from the explore report. Use Mermaid
> diagrams where a visual representation is clearer than prose. Every open question
> must have a concrete impact statement — the Implementer will resolve them and
> document the decision in apply-progress.md.

---

## Architecture Changes

<!-- Describe what changes at the architectural level.
     Reference the existing architecture from the explore report.
     Answer: does this change introduce a new layer, new dependency, new pattern,
     or new integration point? How does it fit into the existing structure?
     Use a Mermaid diagram if the change affects multiple system components. -->

```mermaid
<!-- Optional: C4 context, component, or sequence diagram showing the architecture change.
     Remove this block if a diagram adds no clarity. -->
graph TD
    A[Component A] --> B[Component B]
```

---

## Component Responsibilities

<!-- One subsection per component that is added or significantly changed.
     Use the actual class/module name as the heading.
     "File" must be a real path from the explore report — never invented.
     "Interfaces" must use the project's actual language syntax. -->

### <!-- ComponentName, e.g. TokenRefreshService -->

- **File:** <!-- actual file path, e.g. src/auth/token-refresh.service.ts -->
- **Responsibility:** <!-- what this component does after the change, in one sentence -->
- **Changes:** <!-- specifically what changes: new methods, removed methods, changed behavior -->
- **Interfaces:**
  ```
  <!-- Method signatures, function types, or event contracts in the project's language.
       Example:
       refreshAccessToken(refreshToken: string): Promise<Result<TokenPair, AuthError>>
       onTokenRefreshed: Observable<TokenPair> -->
  ```

<!-- Add more component sections as needed. -->

---

## Data Flow

<!-- Describe the primary data flow for this change from input to output.
     Use a Mermaid sequence diagram for flows involving multiple components or async steps.
     If the flow is simple (2-3 steps), a numbered list is sufficient. -->

```mermaid
sequenceDiagram
    <!-- Example:
    participant Client
    participant AuthController
    participant TokenRefreshService
    participant TokenRepository

    Client->>AuthController: POST /auth/refresh {refreshToken}
    AuthController->>TokenRefreshService: refreshAccessToken(token)
    TokenRefreshService->>TokenRepository: findByToken(token)
    TokenRepository-->>TokenRefreshService: TokenRecord | null
    TokenRefreshService-->>AuthController: Result<TokenPair, AuthError>
    AuthController-->>Client: 200 {accessToken, refreshToken} | 401 {error} -->
```

---

## Interfaces and Contracts

<!-- All new or changed function signatures, types, request/response schemas,
     event payloads. Use the project's actual language.
     Group by: Types / Functions / HTTP Contracts / Events / Config -->

### Types

```typescript
<!-- New or changed types/interfaces. Use the project's actual language. -->
```

### Functions

```typescript
<!-- New or changed function signatures. Include parameter types and return types. -->
```

### HTTP Contracts

<!-- Only if this change adds or modifies HTTP endpoints. -->

```
<!-- Method, path, request schema, response schema (success + error).
     Example:
     POST /auth/refresh
     Request:  { refreshToken: string }
     Response: 200 { accessToken: string, refreshToken: string, expiresIn: number }
               401 { error: "token_expired" | "token_invalid" | "token_not_found" }
               429 { error: "rate_limit_exceeded", retryAfter: number } -->
```

### Events / Messages

<!-- Only if this change produces or consumes events/messages. -->

```
<!-- Event name, payload schema, producer, consumer. -->
```

---

## Failure Modes

<!-- Every realistic failure scenario for this change.
     "Detection" = how we know it happened (log pattern, metric, alert).
     "Handling Strategy" = what the code does when this failure occurs.
     "Recovery" = how the system returns to normal (automatic / manual / N/A). -->

| Failure | Root Cause | Detection | Handling Strategy | Recovery |
|---------|-----------|-----------|------------------|----------|
| <!-- e.g. "DB connection lost during token lookup" --> | <!-- e.g. "Network partition or DB crash" --> | <!-- e.g. "ConnectionError exception + DB health metric" --> | <!-- e.g. "Return 503, circuit breaker opens after 5 failures" --> | <!-- e.g. "Automatic reconnect after 30s" --> |

---

## Security Concerns

<!-- Specific security measures this implementation MUST include.
     Do not write generic advice — reference the actual inputs, endpoints, and data.
     Every item here should become a security check in 07-verify-report.md. -->

- <!-- e.g. "Refresh tokens MUST be stored as bcrypt(token) — never plaintext. Use src/crypto/hash.ts" -->
- <!-- e.g. "Rate limit POST /auth/refresh to 10 req/min per IP using existing RateLimiter in src/middleware/rate-limit.ts" -->
- <!-- e.g. "Validate refreshToken is a non-empty string, max 512 chars, before any DB query" -->

---

## Performance Concerns

<!-- Concrete performance design decisions.
     Reference actual data volumes, latency targets from NFRs, and existing infrastructure. -->

- <!-- e.g. "Token lookup MUST use the existing token_hash index on tokens table — no full scan" -->
- <!-- e.g. "Cache validated tokens in Redis (TTL = token expiry - 30s) to avoid DB on every request" -->
- <!-- e.g. "Refresh is synchronous — no background job needed at current scale (<1000 req/min)" -->

---

## Logging and Observability

<!-- What to log, at what level, and what NOT to log.
     Reference the project's existing logging pattern from the explore report. -->

| Event | Level | Fields to Log | Must NOT Log |
|-------|-------|--------------|--------------|
| <!-- e.g. "Token refresh success" --> | <!-- INFO --> | <!-- userId, tokenFamily, duration_ms --> | <!-- token value, password --> |
| <!-- e.g. "Token refresh failure: expired" --> | <!-- WARN --> | <!-- userId, tokenFamily, reason --> | <!-- token value --> |
| <!-- e.g. "Token refresh failure: not found" --> | <!-- WARN --> | <!-- reason, ip_address --> | <!-- any token fragment --> |
| <!-- e.g. "Rate limit exceeded" --> | <!-- WARN --> | <!-- ip_address, endpoint, count --> | <!-- <!-- ... --> |

---

## Rollback Strategy

<!-- How to reverse this change if it causes problems after deployment.
     Be concrete: what env var to flip, what migration to reverse, what feature flag to toggle. -->

- <!-- e.g. "Set FEATURE_TOKEN_REFRESH=false env var to disable the new endpoint (routes guarded by feature flag)" -->
- <!-- e.g. "Migration 20240115_add_token_family.sql is additive — rollback by running 20240115_rollback.sql" -->
- <!-- e.g. "No cache invalidation needed — Redis TTL will expire within 5 minutes of rollback" -->

---

## Open Questions

<!-- Unresolved decisions the Implementer must make during Apply.
     Each question must include: (1) what the question is, (2) the impact of the decision,
     (3) the two or more options to choose from.
     The Implementer MUST document their decision in 06-apply-progress.md. -->

- <!-- Open: [question]
       Impact: [what changes depending on the answer]
       Options: (a) [option] — trade-off; (b) [option] — trade-off -->
