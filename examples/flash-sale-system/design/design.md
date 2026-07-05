# Flash Sale System -- Design

## Context

The flash sale system is a greenfield, high-concurrency distributed platform purpose-built for limited-time promotional events. Unlike general-purpose e-commerce platforms, flash sales concentrate massive traffic (up to 100,000 concurrent users) into narrow time windows -- often minutes. The system must guarantee zero overselling, maintain fair FIFO ordering, and remain partially available under extreme load through graceful degradation.

The business domain involves four personas: Flash Sale Shoppers competing for limited inventory, Merchant Admins configuring promotional events, Operations Engineers monitoring system health during peak traffic, and Security Auditors detecting and blocking automated bot activity.

Ten capability modules span the entire lifecycle: infrastructure foundation, user authentication, product catalog, sale configuration, atomic inventory deduction, FIFO queuing, rate limiting, API security, order/payment processing, and real-time monitoring. The architecture adopts a microservices decomposition aligned with these bounded contexts, each owning its data and communicating through well-defined interfaces.

The system targets 100K req/s sustained throughput on the health/metrics path with 4 stateless instances, P95 read latency under 100ms at 10K concurrent users, and sub-millisecond Redis Lua script execution for inventory operations. All state resides in Redis and PostgreSQL -- application instances are fully stateless, enabling horizontal scaling by simply adding instances pointed at the same backing stores.

## Goals / Non-Goals

### Goals

1. **Zero overselling invariant**: Under all concurrency scenarios, the system must never sell more inventory than allocated. This is the single most critical correctness guarantee.
2. **Fair FIFO queuing**: Users joining the purchase queue must be served in arrival order with transparent position tracking and wait-time estimates.
3. **Multi-dimensional rate limiting**: Per-user, per-IP, and per-endpoint token bucket enforcement to protect the system from both malicious actors and accidental traffic surges.
4. **Request authenticity and integrity**: HMAC-signed requests with nonce-based replay protection and idempotency keys on all mutating endpoints to prevent duplicate operations.
5. **Observability at scale**: Every request carries a correlation ID propagated through all services, surfaced in structured JSON logs, and the metrics endpoint must respond within 50ms regardless of traffic load.
6. **Graceful degradation**: When Redis is unavailable, stateful endpoints return 503 while stateless endpoints (health, metrics) continue serving. Circuit breaking prevents cascading failures.
7. **Stateless horizontal scaling**: Adding capacity requires no code changes, no sticky sessions, and no instance-specific configuration beyond Redis/MQ endpoint addresses.

### Non-Goals

- Real third-party payment gateway integration (mock payment processor with configurable success rate)
- Multi-region geographic deployment with CDN edge caching
- Machine learning-based fraud detection for sophisticated bot patterns
- WebSocket push notifications for real-time countdown updates
- Multi-tenant SaaS isolation between merchants
- Comprehensive disaster recovery with cross-region failover

## Architecture Overview

### Bounded Contexts

The system decomposes into ten bounded contexts, each an independently deployable service with its own data ownership and ubiquitous language:

| Context | Core Responsibility | Primary Data Store |
|---|---|---|
| **Infra Foundation** | Health checks, config validation, graceful shutdown, Docker Compose orchestration, correlation ID middleware | N/A (cross-cutting) |
| **User Auth** | Registration, login, JWT issuance/refresh/revocation, role-based access control (buyer, admin, operator) | PostgreSQL (users, refresh_tokens) |
| **Product CRUD** | Product catalog CRUD, SKU variant management, search with pagination and price-range filtering | PostgreSQL (products, skus, categories) |
| **Flash Sale Config** | Sale event lifecycle state machine (`upcoming -> active -> ended`), promotional pricing, stock allocation, cache warm-up scheduling | PostgreSQL (sales, sale_products) + Redis (warm cache) |
| **Inventory Deduction** | Atomic Redis Lua check-and-decrement, reservation-commit-release pattern (300s TTL), per-user purchase limits, eventual consistency sync to PostgreSQL | Redis (primary, authoritative during sale) + PostgreSQL (eventual backing store) |
| **Queue System** | FIFO purchase queue via Redis sorted sets, RabbitMQ async order processing pipeline, queue depth monitoring, dead letter queue | Redis (queue entries) + RabbitMQ (order processing messages) |
| **Rate Limiting** | Redis-backed token bucket algorithm, per-user/per-IP/per-endpoint configuration tiers, automatic 429 response with Retry-After headers | Redis (token bucket state) |
| **API Security** | HMAC-SHA256 request signature verification, timestamp-based replay protection (5 min window), nonce deduplication cache, parameter sanitization | Redis (nonce cache, shared across instances) |
| **Order Payment** | Order state machine (`pending -> paid | cancelled`), idempotency-key-gated creation, mock payment processor, timeout-based auto-cancel (15 min) with inventory rollback | PostgreSQL (orders) + Redis (idempotency keys, 24h TTL) |
| **Monitoring Dashboard** | Real-time QPS gauge, inventory drain rate, queue depth, order conversion funnel, per-endpoint latency histogram | In-memory metrics registry + periodic Redis snapshots |

### Context Map

```
                    ┌──────────────┐
                    │  User Auth   │
                    └──────┬───────┘
                           │ JWT validation (shared consumer)
              ┌────────────┼────────────┐
              v            v            v
    ┌────────────┐  ┌───────────┐  ┌──────────────┐
    │ Product    │  │ Flash Sale│  │ Rate Limiting│
    │ CRUD       │  │ Config    │  │              │
    └─────┬──────┘  └─────┬─────┘  └──────────────┘
          │               │ Product reference (read)
          │               │ Stock allocation (write)
          │               v
          │       ┌───────────────┐
          └──────>│ Inventory     │
                  │ Deduction     │
                  └───────┬───────┘
                          │ Reservation lifecycle
                          v
                  ┌───────────────┐     ┌──────────────┐
                  │ Queue System  │────>│ Order Payment│
                  └───────┬───────┘     └──────┬───────┘
                          │                    │
                          │ Async messages     │ Compensation on cancel
                          v                    v
                  ┌───────────────┐     ┌──────────────┐
                  │ RabbitMQ      │     │ Inventory    │
                  │ (transport)   │     │ Deduction    │
                  └───────────────┘     └──────────────┘
```

**API Security** wraps all mutating endpoints across every context (shared kernel pattern for request signing).

**Monitoring Dashboard** reads metrics from all contexts via in-process metric registries aggregated through Redis snapshots (open host service pattern).

**Key relationships:**

- **User Auth -> All contexts**: Shared kernel -- JWT validation logic consumed by every service via middleware. Each service independently verifies tokens; no call to Auth service on every request.
- **Flash Sale Config -> Inventory Deduction**: Customer-supplier -- Config writes stock allocation; Deduction enforces it. Config triggers cache warm-up into Redis 60s before sale start.
- **Flash Sale Config -> Product CRUD**: Conformist -- Sale config references product IDs but does not own product data. Read-only relationship.
- **Queue System -> Inventory Deduction**: Customer-supplier -- Queue worker calls Deduction's reserve API on dequeue; Inventory is upstream.
- **Queue System -> Order Payment**: Customer-supplier -- Worker creates orders after successful reservation; Order Payment is downstream.
- **Order Payment -> Inventory Deduction**: Customer-supplier -- Payment timeout triggers compensating transaction (release reservation); Inventory is upstream.
- **API Security -> All mutating endpoints**: Shared kernel -- HMAC verification and nonce dedup are middleware applied uniformly.

### Data Flow: Happy-Path Purchase

```
1. User joins queue  POST /queue/{saleId}/join
2. Queue System assigns position via Redis ZADD (score = timestamp)
3. Worker dequeues via ZPOPMIN, publishes to RabbitMQ
4. Worker calls Inventory Deduction: POST /inventory/reserve
   └─ Redis Lua: CHECK stock > 0 AND user_count < limit THEN DECR stock, INCR user_count, SET reservation:{id} with 300s TTL
5. On success: Worker calls Order Payment: POST /orders (idempotency key = queueEntryId)
6. User calls POST /orders/{id}/pay
   └─ Mock gateway: configurable success rate
   └─ On success: Inventory Deduction POST /inventory/commit
   └─ On failure: order stays pending, user may retry
7. 15-min timeout job: any order still pending -> auto-cancel + release reservation
```

## Key Decisions

### ADR-001: Redis Lua Scripts for Atomic Inventory Operations

**Decision**: Implement inventory deduction as a single Redis Lua script that atomically checks stock availability, verifies per-user limits, decrements inventory, increments user purchase count, and creates a time-limited reservation -- all in one Redis command execution.

**Rationale**: Redis executes Lua scripts atomically; no other Redis command can interleave. This eliminates the classic read-check-write race condition that would exist with separate Redis GET/SET operations or with PostgreSQL SELECT FOR UPDATE under high concurrency. A single Lua script guarantees that the check-and-decrement is serialized at the Redis thread level, making "exactly one of N concurrent requests succeeds for the last unit" a mathematical certainty rather than a probabilistic outcome.

**Consequences**:
- Positive: Zero overselling is guaranteed at the Redis level without distributed locks or two-phase commit.
- Positive: Sub-millisecond execution regardless of load since the script runs entirely within the Redis process.
- Negative: The Lua script is a critical piece of logic stored as a standalone `.lua` file. It must be version-controlled and tested independently.
- Negative: Debugging Lua scripts is harder than debugging application code; comprehensive test coverage (unit tests for the script loaded into a test Redis instance) is mandatory.

### ADR-002: Reservation-Commit-Release Pattern Over Immediate Deduction

**Decision**: Inventory moves through a three-phase lifecycle: reserve (temporary hold with 300s TTL), commit (permanent deduction on successful payment), release (return stock on cancellation or TTL expiry). The reservation is stored in Redis with automatic expiry.

**Rationale**: Immediate deduction would deduct stock at queue time, but orders can fail during payment processing or users can abandon the flow. Without a reservation pattern, deducted-but-unpaid stock would be permanently lost, reducing effective sell-through. The reservation pattern decouples the purchase intent (queue join) from the purchase confirmation (payment), allowing the system to reclaim inventory for abandoned or failed orders automatically via TTL expiry.

**Consequences**:
- Positive: No stock is permanently lost due to abandoned purchases or payment failures.
- Positive: TTL-based automatic cleanup means no scheduled job needed for reservation expiry -- Redis handles it natively.
- Negative: Brief periods of "reserved but not sold" inventory create a discrepancy between Redis (authoritative) and PostgreSQL (eventual). The monitoring dashboard must read from Redis, not PostgreSQL, during active sales.
- Negative: A Redis crash during an active sale loses all in-flight reservations. The mitigating factor is that unpaid orders in PostgreSQL can be reconciled, but the reservation state itself is ephemeral.

### ADR-003: Redis Sorted Sets for FIFO Queue, RabbitMQ for Worker Dispatch

**Decision**: The purchase queue uses a two-layer architecture. Layer 1 (user-facing): Redis sorted set with timestamp scores provides FIFO ordering, O(log N) insert/remove, and position lookup via ZRANK. Layer 2 (internal dispatch): RabbitMQ durable queues transport dequeue events to order-processing workers, providing reliable delivery, acknowledgements, and dead letter handling.

**Rationale**: Redis sorted sets are ideal for position tracking because ZRANK returns the user's queue position in O(log N) without scanning. Users can poll their position cheaply. RabbitMQ is better suited for the worker dispatch layer because it provides message acknowledgements, consumer prefetch limits (backpressure control), and dead letter exchanges for failed processing -- capabilities Redis streams could provide but with more operational complexity. Separating the user-facing queue (Redis, fast position lookups) from the internal work queue (RabbitMQ, reliable message delivery) lets each store do what it does best.

**Consequences**:
- Positive: Users get fast position lookups (ZRANK) without loading the message broker.
- Positive: RabbitMQ provides reliable worker dispatch with retry and dead-letter semantics out of the box.
- Negative: Two infrastructure components (Redis + RabbitMQ) must be available for the queue path. If RabbitMQ is down but Redis is up, users can join the queue but orders won't be processed.
- Negative: Queue entry expiration (10-min timeout) requires a periodic cleanup job to remove stale entries from the sorted set.

### ADR-004: Token Bucket Algorithm for Multi-Dimensional Rate Limiting

**Decision**: Use the token bucket algorithm (not leaky bucket, not fixed window) for all rate limiting, implemented in Redis with per-user, per-IP, and per-endpoint configuration tiers. Bucket state is stored as Redis keys with TTL equal to the refill interval.

**Rationale**: Token bucket allows bursts up to the bucket capacity while enforcing a long-term average rate. This matches real-world traffic patterns where users may issue several requests in quick succession (page load) followed by idle periods. Fixed window counters suffer from boundary conditions (double burst at window edges). Leaky bucket smooths traffic too aggressively, introducing artificial latency. Token bucket provides the best balance of burst tolerance and sustained rate enforcement for flash sale scenarios where traffic is inherently bursty at sale start.

**Consequences**:
- Positive: Burst allowance (e.g., 20 token capacity with 10 token/sec refill) handles natural request clustering without penalizing legitimate users.
- Positive: Redis-backed implementation provides global consistency across all application instances.
- Negative: Token bucket state in Redis adds ~1ms overhead per rate-limited request. For the health/metrics endpoint, rate limiting is skipped to meet the 50ms response time SLA.
- Negative: Initial bucket capacities and refill rates are based on estimated traffic patterns. Production tuning will require analysis of real traffic data.

### ADR-005: HMAC-SHA256 Request Signing with Nonce-Based Replay Protection

**Decision**: All mutating endpoints require HMAC-SHA256 signatures over the canonical request (method + path + timestamp + nonce + body hash). Nonces are deduplicated in Redis with a TTL matching the timestamp validity window (5 minutes). Stale timestamps, reused nonces, and signature mismatches all return 401 with distinct error codes.

**Rationale**: API key-based authentication alone does not protect against request tampering or replay attacks. HMAC signing ensures request integrity (the body and parameters cannot be modified in transit) and authenticity (the request originated from a client holding the shared secret). Combined with timestamp checks and nonce deduplication, the system defends against: (a) replay attacks (nonce reuse rejected), (b) delayed replay attacks (stale timestamp rejected), (c) man-in-the-middle tampering (signature mismatch rejected), and (d) parameter injection (body hash included in signature).

**Consequences**:
- Positive: Defense in depth -- even if TLS is somehow compromised, request integrity is independently verifiable.
- Positive: Distinct error codes (NONCE_REPLAYED, TIMESTAMP_STALE, INVALID_SIGNATURE) enable precise monitoring of attack patterns.
- Negative: Clients must implement HMAC signing, increasing client-side complexity. SDK or client library wrappers are needed.
- Negative: Nonce deduplication in Redis adds a write operation per mutating request. At extreme scale (100K mutating req/s), the nonce cache could become a bottleneck. Mitigation: nonce TTL is only 5 minutes, bounding the key space.

### ADR-006: Idempotency Keys for All Mutating Operations

**Decision**: Every mutating endpoint (order creation, payment submission, inventory reservation) accepts an `Idempotency-Key` header. The server stores the (key, response) pair in Redis for 24 hours. Replays with the same key return the cached response without re-executing the operation. Keys with different request bodies return 422.

**Rationale**: In a distributed system with network unreliability, clients cannot distinguish between "request processed but response lost" and "request never received." Without idempotency, retrying a successful order creation would create duplicate orders. Idempotency keys give clients a safe retry mechanism: resend with the same key, get the original result. This is critical for payment operations where duplicate charges are unacceptable.

**Consequences**:
- Positive: Safe retry semantics for all mutating operations.
- Positive: Redis-based storage works cross-instance without sticky sessions.
- Negative: 24-hour TTL on idempotency keys requires Redis memory proportional to unique mutation volume. A single high-traffic sale could generate millions of keys.

### ADR-007: Stateless Services with Redis as Shared State Backbone

**Decision**: All application instances are stateless. Session state, rate limit counters, inventory, queue entries, nonce caches, and idempotency keys all live in Redis. PostgreSQL stores durable entity data (users, products, sales configs, orders). No sticky sessions; the load balancer can route any request to any instance.

**Rationale**: Stateless instances enable pure horizontal scaling -- add instances behind the load balancer, point them at the same Redis and PostgreSQL endpoints, and capacity increases linearly. Sticky sessions would create hot spots (all requests from queued users hitting one instance) and complicate scaling (draining an instance requires waiting for all sessions to expire). Redis as the shared state backbone is performant enough (sub-millisecond operations) to serve as the coordination layer for all real-time concerns.

**Consequences**:
- Positive: Simple operational model -- scale up/down by changing instance count.
- Positive: Rolling deployments with zero downtime since any instance can be removed without losing user state.
- Negative: Redis becomes a critical single point of failure. Production deployments require Redis Sentinel or Cluster for high availability.
- Negative: Every rate-limited, secured, or stateful request involves at least one Redis round-trip, adding network latency.

## Risks / Trade-offs

### Redis as Single Point of Failure

Redis holds inventory state, queue entries, rate limit counters, nonce caches, and idempotency keys. If Redis becomes unavailable, the core purchase flow (queue -> reserve -> pay) is entirely blocked. Mitigation: Redis Sentinel for automatic failover in production; stateless endpoints (health, metrics) continue serving; degraded mode returns 503 with clear messaging.

### Eventual Consistency Gap

During active sales, inventory truth lives in Redis (Lua scripts, reservations). PostgreSQL holds the durable order records but lags behind the real-time inventory state. If Redis crashes, the reconciliation process must rebuild inventory state from committed orders in PostgreSQL -- a manual, error-prone process. The design accepts this gap because the alternative (synchronous PostgreSQL writes in the hot path) would violate the latency SLA.

### Queue Backpressure Under Extreme Load

At sale start, thousands of users join the queue simultaneously. The queue worker processes entries at a configurable rate (default 500/sec). If the join rate exceeds the process rate, queue depth grows and estimated wait times increase beyond user patience. The auto-expiry mechanism (10 min) caps the damage by removing stale entries, but the user experience degrades. Mitigation: the monitoring dashboard tracks queue depth; operations can increase worker instances if needed.

### Mock Payment Fidelity Gap

The mock payment processor (configurable success rate) cannot simulate real payment gateway behaviors: variable latency (200ms-5s), partial outages, webhook-based async confirmations, or settlement delays. Integration testing with the mock will not surface issues that arise from real payment gateway edge cases. This is an accepted trade-off for the initial release, with the payment interface designed as a repository-style abstraction for future real-gateway swap-in.

### Token Bucket Calibration

Initial rate limit thresholds (10 req/s per user, 20 burst; 5 req/min per IP for login) are based on estimates. Too conservative: legitimate users hit 429 during normal browsing. Too permissive: bots can consume significant resources before triggering limits. Production tuning requires iterative adjustment based on observed traffic patterns and false-positive monitoring.

## Alternatives Considered

### Database Row Locks (SELECT FOR UPDATE) for Inventory

**Considered**: Use PostgreSQL row-level locks for inventory deduction, ensuring serialized access to stock rows.

**Rejected because**: Row locks under high concurrency (thousands of simultaneous UPDATEs on the same row) create massive contention, lock wait queues, and eventual timeouts. PostgreSQL's MVCC model is not designed for the "thousands of writers to one row" pattern that flash sales create. Redis Lua scripts provide true single-threaded serialization without lock overhead.

### Redis Streams Instead of RabbitMQ

**Considered**: Use Redis Streams with consumer groups for the worker dispatch layer, eliminating the RabbitMQ dependency.

**Rejected because**: While Redis Streams provide message persistence and consumer groups, they lack mature dead-letter handling, message TTL/per-message expiry granularity, and the operational tooling (management UI, federation) that RabbitMQ provides. The two-infrastructure cost (Redis + RabbitMQ) is acceptable given RabbitMQ's superior reliability semantics for order processing.

### Leaky Bucket Rate Limiting

**Considered**: Use leaky bucket (constant outflow rate) to enforce a perfectly smooth request rate.

**Rejected because**: Leaky bucket eliminates bursts entirely, which penalizes normal web browsing behavior (multiple resources loaded simultaneously on page navigation). Flash sale traffic is inherently bursty at sale start; the system should allow controlled bursts while enforcing sustained limits. Token bucket provides this flexibility.

### Immediate Inventory Deduction (No Reservation Pattern)

**Considered**: Deduct inventory atomically at queue time and never release it, treating all deductions as final.

**Rejected because**: This would couple purchase intent (queue join) to purchase completion. Abandoned queue entries, failed payments, and user cancellations would permanently reduce available inventory, potentially leaving stock unsold that real buyers wanted. The reservation pattern with TTL-based release maximizes sell-through.

### OAuth2/OpenID Connect Instead of JWT

**Considered**: Use a full OAuth2 authorization server with OpenID Connect for authentication.

**Rejected because**: The system has three simple roles (buyer, admin, operator) and does not need third-party authorization, scoped resource access, or federated identity. OAuth2 brings significant protocol complexity (authorization codes, client registration, scope negotiation) disproportionate to the requirements. HS256-signed JWTs with short-lived access tokens (15 min) and refresh token rotation provide sufficient security with far less operational overhead.

### Synchronous PostgreSQL Writes in the Purchase Hot Path

**Considered**: Write order and inventory state to PostgreSQL synchronously during the purchase flow for immediate durability.

**Rejected because**: PostgreSQL write latency (typically 5-20ms for simple inserts, more under contention) would prevent meeting the P95 latency SLA of 200ms for purchase operations. By deferring PostgreSQL writes to the async worker (post-reservation), the user-facing latency is bounded by Redis operations alone (sub-millisecond). PostgreSQL durability is achieved, just asynchronously, with the acceptable trade-off of brief inventory-state disagreement during active sales.
