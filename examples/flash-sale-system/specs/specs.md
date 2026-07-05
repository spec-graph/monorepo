# Flash Sale System -- Specifications

## Introduction

This document specifies a high-concurrency flash sale platform handling traffic from 100 to 100,000+ req/s with zero overselling, FIFO ordering, and replay protection. The system spans ten modules: infra-foundation, user-auth, product-crud, flash-sale-config, inventory-deduction, queue-system, rate-limiting, api-security, order-payment, and monitoring-dashboard. Every request carries a propagated correlation ID in structured JSON logs.

---

## Requirements

### Requirement: Server Health and Graceful Shutdown

The server SHALL expose `/health` reporting Redis and MQ status. On SIGTERM, it MUST stop accepting connections, drain in-flight requests within a configurable timeout, then close all connections.

#### Scenario: Healthy, degraded, and shutdown

- **Given** Redis/MQ are reachable, unreachable, or SIGTERM received
- **When** GET `/health`
- **Then** 200 (`healthy`) or 503 (`unhealthy`/`shutting_down`); shutdown drains requests then exits code 0

---

### Requirement: Structured Logging with Correlation Tracing

Every request SHALL receive a UUID v4 correlation ID (or use `X-Correlation-Id`). The ID MUST appear in all log lines, propagate downstream, and surface in error responses.

#### Scenario: ID propagation and error shape

- **Given** any inbound request or an unhandled exception
- **When** middleware processes it or error handler formats the response
- **Then** correlation ID is on response headers, all JSON logs, and error bodies as `{ "error": { "code", "message", "correlationId" } }`; stack traces logged but never exposed

---

### Requirement: User Registration and JWT Authentication

Users SHALL register with email/password. Passwords MUST be bcrypt-hashed (cost 12) and never logged. Auth MUST issue access (15 min) and refresh tokens (7 days) with rotation; reused refresh tokens SHALL revoke all user tokens. Login endpoints MUST be IP-rate-limited.

#### Scenario: Register, login, refresh

- **Given** unique email, valid credentials, or a refresh token
- **When** POST `/auth/register`, `/auth/login`, or `/auth/refresh`
- **Then** 201 with token pair (role `buyer`); 200 with new pair; refresh rotates and invalidates old token; reused refresh token triggers full revocation

---

### Requirement: Product Catalog CRUD with Roles

Full CRUD SHALL be supported. Writes MUST require `admin` role; reads available to all authenticated users. Search by name, price-range filter, and pagination MUST work.

#### Scenario: Admin writes, buyer blocked, search

- **Given** authenticated admin or buyer
- **When** POST/PUT/DELETE `/products` by buyer, or GET `/products?search=&minPrice=&maxPrice=&page=1&limit=20`
- **Then** buyer writes return 403; admin creates return 201; search returns `{ items, totalCount, page, totalPages }`

---

### Requirement: Flash Sale Lifecycle State Machine

Sales SHALL follow `upcoming -> active -> ended`. Invalid transitions MUST return 409. Cache warm-up MUST fire 60s before start, preloading products into Redis; failures retry every 5s until start.

#### Scenario: Auto-transition, manual end, warm-up

- **Given** sale is `upcoming` with `startTime`/`endTime`
- **When** clock reaches times, admin calls `/sales/{id}/end`, or warm-up fires
- **Then** transitions to `active`/`ended` (queue opens/closes, pending entries flushed); warm-up retries on failure at `warn` level

---

### Requirement: Atomic Inventory Deduction, No Oversell

Deduction SHALL use a Redis Lua script for atomic check-and-decrement. Oversell MUST never occur. A reservation-commit-release pattern (300s TTL) SHALL prevent stock loss. Per-user limits MUST be enforced atomically.

#### Scenario: Reserve, commit, TTL release, concurrent safety

- **Given** 100 units available, user not yet purchased
- **When** reserve, commit, TTL expires, or 1000 concurrent requests hit the final unit
- **Then** reserve returns 201 with ID (stock 99); commit finalizes; TTL expiry returns stock; exactly 1 of 1000 concurrent succeeds, stock never negative

---

### Requirement: FIFO Purchase Queue with Position Tracking

Purchase requests SHALL queue in FIFO order. Users MUST receive position and estimated wait. Duplicates SHALL be rejected. A worker MUST dequeue, reserve inventory, and create orders. Entries MUST expire after configurable timeout (default 10 min).

#### Scenario: Join, track, process, expire

- **Given** sale active, user not queued
- **When** POST `/queue/{saleId}/join`, GET position, worker processes, or entry times out
- **Then** 201 with `{ position, estimatedWaitSeconds, queueEntryId }`; position returns rank; worker reserves and creates order; expired entries removed with status `expired`

---

### Requirement: Token Bucket Rate Limiting

The system SHALL enforce per-user and per-IP limits via Redis-backed token buckets for global consistency. Blocked requests MUST include `Retry-After` and `X-RateLimit-Remaining`.

#### Scenario: Allowed and blocked requests

- **Given** per-user 10 req/s (burst 20) or per-IP login 5 req/min
- **When** bucket has tokens or is empty
- **Then** request proceeds with headers, or 429 (`RATE_LIMITED`) with `Retry-After`

---

### Requirement: HMAC Signing, Nonce, and Idempotency

Mutating endpoints SHALL require HMAC-SHA256 over method, path, timestamp, nonce, and body hash. Stale timestamps (outside 5 min) and reused nonces MUST be rejected. Order/inventory endpoints MUST accept an idempotency key; replays SHALL return the original result. Deduplication MUST work cross-instance via Redis.

#### Scenario: Sign, replay, idempotency

- **Given** shared secret, reused nonce, stale timestamp, bad signature, or known idempotency key
- **When** requests arrive
- **Then** valid passes; replays return 401 (`NONCE_REPLAYED`/`TIMESTAMP_STALE`/`INVALID_SIGNATURE`); idempotent repeats return 200 with original result or 422 on body mismatch

---

### Requirement: Order State Machine with Auto-Cancel

Orders SHALL follow `pending -> paid | cancelled`. A job MUST auto-cancel `pending` orders older than 15 minutes, releasing inventory. Payment SHALL use a mock gateway with configurable success rate.

#### Scenario: Pay, cancel, timeout, invalid transition

- **Given** order `pending` with valid reservation
- **When** payment succeeds, user cancels, 15+ min elapsed, or invalid transition attempted
- **Then** paid commits reservation; cancelled releases it; timeout auto-cancels; invalid transitions return 409; payment failure returns 402, order stays `pending`

---

### Requirement: Real-Time Monitoring Metrics

The system SHALL expose `/metrics` with QPS, inventory drain per sale, queue depth, order rates, and uptime. Collection MUST add under 5ms overhead per request at 100K req/s. Response time SHALL stay under 50ms.

#### Scenario: Metrics under load

- **Given** 50,000 req/s with active sales
- **When** GET `/metrics`
- **Then** under 50ms, returns `qps.current`, `inventory[]` (saleId, remainingStock, drainRatePerMinute), `queues[]` (depth, avgWaitSeconds), `orders.creationRatePerMinute`, `orders.paymentSuccessRate`, `uptime`

---

### Requirement: Config Validation on Startup

All config SHALL come from environment variables. Required vars (e.g., `JWT_SECRET`, `REDIS_URL`) MUST be validated at startup. Missing/invalid vars MUST cause exit code 1 with a specific error log, before the HTTP server starts.

#### Scenario: Valid and invalid startup

- **Given** all vars set or `JWT_SECRET` missing
- **When** server starts
- **Then** valid loads and listens; invalid logs error and exits code 1

---

### Requirement: Consistent Global Error Handling

All errors SHALL use `{ "error": { "code", "message", "correlationId" } }`. Unhandled exceptions MUST not crash the server. Stack traces MUST be logged, never returned.

#### Scenario: Validation, auth, internal errors

- **Given** missing fields, no JWT, or unhandled exception
- **When** error reaches global handler
- **Then** 400 (`VALIDATION_ERROR`), 401 (`UNAUTHORIZED`), or 500 (`INTERNAL_ERROR`) with standard shape; stack traces at `error` level, never in body

---

## Non-Functional Requirements

### Performance
- **NFR-P01:** P95 read latency SHALL not exceed 100ms under 10K concurrent; Redis-Lua writes within 200ms P95.
- **NFR-P02:** System MUST sustain 100K req/s on health/metrics with 4 instances.
- **NFR-P03:** Redis Lua deduction MUST execute under 1ms regardless of load.
- **NFR-P04:** Queue worker SHALL process >= 500 entries/sec.

### Security
- **NFR-S01:** Passwords MUST be bcrypt-hashed (cost 12), never in logs, DB, or responses.
- **NFR-S02:** JWTs SHALL be HS256-signed, secret >= 256 bits, env-only.
- **NFR-S03:** Secrets/passwords/keys MUST be redacted from logs.
- **NFR-S04:** Production MUST use HTTPS with HSTS (max-age >= 1 year).
- **NFR-S05:** Input SHALL be validated; emails conform to RFC 5322; strings have max lengths; invalid input MUST not error the server.

### Scalability
- **NFR-SC01:** Instances MUST be stateless (state in Redis); adding instances requires only same Redis/MQ endpoints.
- **NFR-SC02:** System MUST work with single Redis (dev) and Cluster/Sentinel (prod) without code changes.
- **NFR-SC03:** Load balancers SHALL route any request to any instance, no sticky sessions.

### Reliability
- **NFR-R01:** Exactly one reservation MUST succeed for the last unit; overselling is an absolute invariant.
- **NFR-R02:** Redis down: stateful endpoints return 503, stateless return 200; server MUST NOT crash.
- **NFR-R03:** Paid orders MUST survive restarts via Redis persistence or backing store.
- **NFR-R04:** Idempotency keys SHALL be durable >= 24 hours across restarts.

### Observability
- **NFR-O01:** 100% of log lines MUST include correlation ID.
- **NFR-O02:** All logs SHALL be JSON: `level`, `message`, `timestamp` (ISO 8601), `correlationId`.
- **NFR-O03:** `/metrics` MUST respond within 50ms under any load.

### Maintainability
- **NFR-M01:** Data access SHALL use repository interfaces for swappable stores.
- **NFR-M02:** Every tunable parameter (limits, TTLs, timeouts, expiries) MUST be env-configurable with defaults.
- **NFR-M03:** Lua deduction script SHALL be a standalone `.lua` file, loaded at startup.
