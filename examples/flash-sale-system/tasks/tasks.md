# Flash Sale System -- Task Breakdown

## Task Organization

Six implementation waves, respecting dependency order from the plan. Each task is a concrete unit of work (~30min-2hr). Tasks within a wave can be parallelized; waves are sequential.

---

## Wave 1: Foundation (infra-foundation)

> Establishes the project skeleton, infrastructure wiring, and cross-cutting concerns that all downstream modules depend on.

- [ ] T-001: **Scaffold project monorepo structure** -- Initialize Node.js/TypeScript monorepo (or multi-service repo) with shared tsconfig, eslint, prettier, and a `packages/` directory for each of the 10 modules. Set up `npm workspaces` or equivalent. (deps: none | module: infra-foundation | US-001, US-004, US-006)

- [ ] T-002: **Docker Compose orchestration** -- Write `docker-compose.yml` with services: PostgreSQL (port 5432), Redis (port 6379), RabbitMQ (ports 5672/15672). Configure health checks, volume mounts for dev persistence, and a shared network. (deps: T-001 | module: infra-foundation | US-001, US-004, US-006)

- [ ] T-003: **Configuration validation on startup** -- Implement a config loader that reads all settings from `process.env`, validates required vars (`JWT_SECRET`, `REDIS_URL`, `DATABASE_URL`, `RABBITMQ_URL`), and exits with code 1 + structured error log if any are missing or invalid. Export a typed config object. (deps: T-001 | module: infra-foundation | US-001, US-004, US-006)

- [ ] T-004: **Correlation ID middleware** -- Implement Express/Koa middleware that generates a UUID v4 correlation ID per request (or reads `X-Correlation-Id` header), attaches it to the request context and response header, and makes it available to all downstream middleware/handlers via `AsyncLocalStorage` or equivalent. (deps: T-001 | module: infra-foundation | US-001, US-004, US-006)

- [ ] T-005: **Structured JSON logging** -- Configure a JSON logger (pino or winston) with fields: `level`, `message`, `timestamp` (ISO 8601), `correlationId`. Ensure the correlation ID is automatically included in every log line. Provide a `logger` singleton injectable into all modules. (deps: T-004 | module: infra-foundation | US-001, US-004, US-006)

- [ ] T-006: **Global error handler** -- Implement an Express/Koa error-handling middleware that catches all unhandled exceptions, logs the stack trace at `error` level, and returns `{ "error": { "code", "message", "correlationId" } }` with appropriate HTTP status codes (400/401/403/404/409/422/429/500/503). Map known error types to codes; unknown errors become `INTERNAL_ERROR` (500). (deps: T-005 | module: infra-foundation | US-001, US-004, US-006, US-007)

- [ ] T-007: **Health check endpoint with graceful shutdown** -- Implement `GET /health` returning `{ "status": "healthy"|"unhealthy"|"shutting_down", "redis": bool, "mq": bool, "uptime" }`. Probe Redis PING and RabbitMQ connection. On SIGTERM: stop accepting connections, drain in-flight requests within configurable timeout (default 30s), close all connections, exit code 0. (deps: T-005 | module: infra-foundation | US-006, US-007)

- [ ] T-008: **Shared repository base class** -- Define a repository interface/abstract class with common CRUD methods. Implement a PostgreSQL repository base using a connection pool (pg or knex). Expose transaction support. This is consumed by user-auth, product-crud, flash-sale-config, and order-payment modules. (deps: T-002 | module: infra-foundation | US-001, US-004, US-006)

- [ ] T-009: **Database migrations framework** -- Set up a migration runner (knex or node-pg-migrate) with a `migrations/` directory. Create the initial migration that creates the common schema. Wire migration execution into the startup sequence (run before HTTP server starts). (deps: T-008 | module: infra-foundation | US-001, US-004, US-006)

- [ ] T-010: **Redis client singleton** -- Implement a Redis client wrapper (ioredis) with connection pooling, reconnection logic with exponential backoff (max 5 retries), and a health-check method (`ping()`). Export as a singleton injectable into inventory-deduction, queue-system, rate-limiting, api-security, and order-payment. (deps: T-002 | module: infra-foundation | US-001, US-004, US-006)

- [ ] T-011: **RabbitMQ client singleton** -- Implement a RabbitMQ client wrapper (amqplib) with connection management, channel pooling, automatic reconnection, and methods for `publish(queue, message)` and `consume(queue, handler)`. Export as a singleton for queue-system and order-payment. (deps: T-002 | module: infra-foundation | US-001, US-004, US-006)

- [ ] T-012: **HTTP server bootstrap** -- Wire up the Express/Koa app with middleware stack in order: correlation ID (T-004), structured logging (T-005), JSON body parsing, and global error handler (T-006). Mount health endpoint (T-007). Run config validation (T-003) before server starts. Export `createApp()` for testing. (deps: T-003, T-004, T-005, T-006, T-007 | module: infra-foundation | US-001, US-004, US-006)

---

## Wave 2: Authentication, Product Catalog, and Rate Limiting Base

> Establishes user identity (required by all protected endpoints), the product data store (referenced by flash-sale-config), and the rate-limiting infrastructure.

- [ ] T-013: **User migration and model** -- Create the `users` table migration: `id` (UUID PK), `email` (unique, indexed), `password_hash` (text, not null), `role` (enum: buyer/admin/operator, default buyer), `created_at`, `updated_at`. Define the User entity/type in the shared types package. (deps: T-009 | module: user-auth | US-001, US-004)

- [ ] T-014: **Refresh token migration and model** -- Create the `refresh_tokens` table migration: `id` (UUID PK), `user_id` (FK -> users), `token_hash` (text, indexed), `family_id` (UUID, indexed for rotation detection), `expires_at` (timestamp), `revoked_at` (timestamp, nullable), `created_at`. (deps: T-013 | module: user-auth | US-001, US-004)

- [ ] T-015: **Password hashing and verification utility** -- Implement `hashPassword(plaintext)` and `verifyPassword(plaintext, hash)` using bcrypt with cost factor 12. Ensure plaintext passwords are never logged. Unit-test both functions. (deps: T-013 | module: user-auth | US-001, US-004)

- [ ] T-016: **JWT issuance and verification** -- Implement `generateAccessToken(user)` (15 min expiry, HS256, payload: sub, email, role) and `generateRefreshToken(user)` (7 day expiry, HS256, payload: sub, familyId). Implement `verifyToken(token)` returning decoded payload or throwing. Use `JWT_SECRET` from config (T-003). Unit-test round-trip. (deps: T-003 | module: user-auth | US-001, US-004)

- [ ] T-017: **POST /auth/register** -- Implement registration endpoint: validate email (RFC 5322), password (min 8 chars). Check email uniqueness. Hash password, insert user with role `buyer`, return 201 with token pair (access + refresh). Return 409 on duplicate email. Apply rate limiting (delegate to rate-limiting module). (deps: T-015, T-016, T-012 | module: user-auth | US-001, US-004)

- [ ] T-018: **POST /auth/login** -- Implement login endpoint: validate credentials, compare password hash, issue token pair. Store refresh token hash in `refresh_tokens` table. Return 401 on bad credentials. Apply IP-based rate limiting (5 req/min per IP). (deps: T-014, T-015, T-016, T-012 | module: user-auth | US-001, US-004)

- [ ] T-019: **POST /auth/refresh** -- Implement token refresh: verify refresh token, check it exists and is not revoked in DB, rotate (revoke old, issue new access + new refresh with same familyId). If a revoked token from the same family is replayed, revoke ALL tokens in that family (detect token theft). Return 401 on invalid/expired/revoked token. (deps: T-014, T-016, T-012 | module: user-auth | US-001, US-004)

- [ ] T-020: **JWT authentication middleware** -- Implement middleware that extracts Bearer token from `Authorization` header, verifies it, and attaches `req.user = { sub, email, role }` to the request. Return 401 on missing/invalid/expired token. This middleware is consumed by all protected endpoints across all modules. (deps: T-016 | module: user-auth | US-001, US-004)

- [ ] T-021: **Role-based authorization middleware** -- Implement `requireRole(...roles)` middleware factory that checks `req.user.role` and returns 403 if not in the allowed set. Used by product-crud (admin for writes), flash-sale-config (admin), and monitoring-dashboard (operator). (deps: T-020 | module: user-auth | US-001, US-004)

- [ ] T-022: **Products migration and model** -- Create `products` table: `id` (UUID PK), `name` (text, not null), `description` (text), `base_price` (decimal, not null), `image_url` (text), `category` (text, indexed), `created_at`, `updated_at`. Create `skus` table: `id` (UUID PK), `product_id` (FK), `sku_code` (text, unique), `attributes` (jsonb), `price_modifier` (decimal, default 0), `created_at`. Define TypeScript types. (deps: T-009 | module: product-crud | US-001, US-004)

- [ ] T-023: **Product repository** -- Implement `ProductRepository` with methods: `create(data)`, `findById(id)`, `update(id, data)`, `delete(id)`, `search({ query, minPrice, maxPrice, category, page, limit })`. Search uses ILIKE on name + description, range filter on `base_price`, with pagination (OFFSET/LIMIT + COUNT for total). Return `{ items, totalCount, page, totalPages }`. (deps: T-022, T-008 | module: product-crud | US-001, US-004)

- [ ] T-024: **GET /products (search with pagination)** -- Implement product list/search endpoint. Accept query params: `search`, `minPrice`, `maxPrice`, `category`, `page` (default 1), `limit` (default 20, max 100). Requires authentication (T-020). Return paginated results from T-023. (deps: T-023, T-020, T-012 | module: product-crud | US-001, US-004)

- [ ] T-025: **GET /products/:id** -- Implement single product retrieval. Returns product with all SKU variants. Requires authentication. Return 404 if not found. (deps: T-023, T-020, T-012 | module: product-crud | US-001, US-004)

- [ ] T-026: **POST /products (admin create)** -- Implement product creation. Validates required fields (name, base_price). Accepts optional SKU array. Requires `admin` role (T-021). Return 201 with created product. (deps: T-023, T-021, T-012 | module: product-crud | US-001, US-004)

- [ ] T-027: **PUT /products/:id and DELETE /products/:id (admin write)** -- Implement update and delete. Requires `admin` role. Update does partial merge. Delete returns 204. Both return 404 if not found. (deps: T-023, T-021, T-012 | module: product-crud | US-001, US-004)

- [ ] T-028: **Token bucket implementation in Redis** -- Implement a Lua script for the token bucket algorithm: given a key prefix, capacity, and refill rate, atomically check if a token is available, decrement if so, and return remaining tokens + retry-after seconds if empty. Store bucket state as Redis hash with `tokens` and `last_refill` fields. Set key TTL equal to the full-refill interval. Unit-test with a test Redis instance. (deps: T-010 | module: rate-limiting | US-006, US-007)

- [ ] T-029: **Rate limiter middleware factory** -- Implement `createRateLimiter({ type, windowMs, maxRequests, burstSize })` returning Express/Koa middleware. The middleware extracts the rate-limit key (user ID from JWT, IP from `x-forwarded-for` or `req.ip`, or endpoint path), calls the token bucket Lua script (T-028), sets `X-RateLimit-Remaining` and `Retry-After` headers, and returns 429 with `RATE_LIMITED` error code when exhausted. Skip rate limiting for `/health` and `/metrics`. (deps: T-028, T-020, T-005 | module: rate-limiting | US-006, US-007)

- [ ] T-030: **Pre-configured rate limiter instances** -- Wire rate limiter instances with production defaults: per-user 10 req/s (burst 20) for general API, per-IP 5 req/min for login/register, per-endpoint specific limits for queue-join and payment. Make all thresholds configurable via env vars. (deps: T-029, T-003 | module: rate-limiting | US-006, US-007)

---

## Wave 3: Sale Configuration and API Security

> Establishes the flash sale lifecycle, cache warm-up, and the request signing/anti-replay layer that wraps all mutating endpoints.

- [ ] T-031: **Sales migration and model** -- Create `sales` table: `id` (UUID PK), `name` (text), `description` (text), `status` (enum: upcoming/active/ended), `start_time` (timestamp with TZ, not null), `end_time` (timestamp with TZ, not null), `created_by` (FK -> users), `created_at`, `updated_at`. Create `sale_products` table: `id` (UUID PK), `sale_id` (FK), `product_id` (FK), `sale_price` (decimal, not null), `stock_allocated` (integer, not null), `per_user_limit` (integer, default 1). Define types. (deps: T-009, T-013 | module: flash-sale-config | US-004, US-005)

- [ ] T-032: **Sale repository** -- Implement `SaleRepository` with CRUD + `findActive()`, `findUpcoming()`, `transitionStatus(id, from, to)` using optimistic locking (check current status in WHERE clause, throw on mismatch). Implement `SaleProductRepository` for the join table. (deps: T-031, T-008 | module: flash-sale-config | US-004, US-005)

- [ ] T-033: **Sale state machine** -- Implement the `upcoming -> active -> ended` state machine as a pure function: `transition(currentStatus, event)` returning `{ newStatus, allowed }`. Valid events: `activate` (upcoming->active), `end` (active->ended, also upcoming->ended for admin override). Invalid transitions return the current status with `allowed: false`. Unit-test all valid and invalid transitions. (deps: none | module: flash-sale-config | US-004, US-005)

- [ ] T-034: **Cache warm-up scheduler** -- Implement a scheduler that, 60 seconds before each upcoming sale's `start_time`, preloads the sale's products (ID, sale price, allocated stock, per-user limit) into Redis as a hash at key `sale:{saleId}:products`. On failure, retry every 5 seconds with `warn`-level logging until the sale starts. Use `setTimeout` (no external cron dependency for initial version). (deps: T-010, T-032, T-005 | module: flash-sale-config | US-001, US-004, US-005)

- [ ] T-035: **POST /sales (admin create sale)** -- Implement sale creation: validate time window (end > start, start in future), validate referenced products exist, create sale + sale_products in a transaction. Requires `admin` role. Return 201 with sale details. (deps: T-032, T-033, T-021, T-012 | module: flash-sale-config | US-004)

- [ ] T-036: **GET /sales and GET /sales/:id** -- Implement list (with status filter) and detail endpoints. Detail includes sale_products with current stock info. Requires authentication. (deps: T-032, T-020, T-012 | module: flash-sale-config | US-001, US-004, US-005)

- [ ] T-037: **POST /sales/:id/activate and POST /sales/:id/end** -- Implement manual state transitions. Validate transition using T-033. On `activate`: open the purchase queue. On `end`: close queue, flush pending entries with `expired` status, trigger metrics snapshot. Requires `admin` role. Return 409 on invalid transition. (deps: T-032, T-033, T-021, T-012 | module: flash-sale-config | US-004)

- [ ] T-038: **Auto-transition background job** -- Implement a periodic check (every 1 second via `setInterval`) that queries upcoming sales where `start_time <= now()`, transitions them to `active`, and queries active sales where `end_time <= now()`, transitions them to `ended`. Log each transition. This runs within the flash-sale-config service. (deps: T-032, T-033, T-034 | module: flash-sale-config | US-004, US-005)

- [ ] T-039: **HMAC signature utility** -- Implement `generateSignature({ method, path, timestamp, nonce, body }, secret)` and `verifySignature(signature, { method, path, timestamp, nonce, body }, secret)` using HMAC-SHA256. The canonical string is `METHOD|PATH|TIMESTAMP|NONCE|BODY_HASH` where BODY_HASH is SHA256 of the JSON body (or empty string for GET). Unit-test with known vectors. (deps: none | module: api-security | US-008)

- [ ] T-040: **Nonce deduplication in Redis** -- Implement `checkAndStoreNonce(nonce)` that uses `SET NX` with a TTL of 5 minutes (matching the timestamp validity window). Returns `true` if the nonce is new (stored), `false` if it's a replay. The Redis key is `nonce:{nonce}`. (deps: T-010 | module: api-security | US-008)

- [ ] T-041: **HMAC verification middleware** -- Implement middleware that: (1) extracts `X-Signature`, `X-Timestamp`, `X-Nonce` headers; (2) validates timestamp is within +/- 5 minutes of server time (return 401 `TIMESTAMP_STALE`); (3) checks nonce via T-040 (return 401 `NONCE_REPLAYED`); (4) computes expected signature via T-039 (return 401 `INVALID_SIGNATURE` on mismatch). Skip for `/health` and `/metrics`. Apply only to mutating endpoints (POST/PUT/PATCH/DELETE). (deps: T-039, T-040, T-005 | module: api-security | US-008)

- [ ] T-042: **Idempotency key middleware** -- Implement middleware that: (1) reads `Idempotency-Key` header on mutating requests; (2) checks Redis for key `idempotent:{key}`; (3) if found, returns the cached response (status code + body) without executing the handler; (4) if not found, executes the handler and caches the response in Redis with 24-hour TTL; (5) if the key exists but the request body differs (hash comparison), returns 422 `IDEMPOTENCY_MISMATCH`. (deps: T-010 | module: api-security | US-008)

- [ ] T-043: **Parameter sanitization middleware** -- Implement middleware that sanitizes all string inputs: trim whitespace, escape HTML entities, enforce max string lengths from config. Reject requests with body size exceeding configurable limit (default 1MB). Return 400 `VALIDATION_ERROR` on violations. (deps: T-003 | module: api-security | US-008)

- [ ] T-044: **Wire security middleware stack** -- Compose the security middleware in the correct order: (1) body size check, (2) parameter sanitization (T-043), (3) HMAC verification (T-041), (4) idempotency check (T-042). Apply this composed middleware to all mutating routes across all services. Export as `securityMiddleware` for use by all route definitions. (deps: T-041, T-042, T-043 | module: api-security | US-008)

---

## Wave 4: Inventory Deduction and Queue System

> The critical-path modules. Inventory guarantees zero overselling via Lua scripts. Queue provides fair FIFO ordering.

- [ ] T-045: **inventory_deduction.lua script** -- Write the standalone `scripts/inventory_deduction.lua` file. The script atomically:
  1. Reads current stock from `sale:{saleId}:product:{productId}:stock`
  2. Reads user purchase count from `sale:{saleId}:user:{userId}:count`
  3. If stock <= 0, returns `{0, "OUT_OF_STOCK"}`
  4. If user_count >= per_user_limit, returns `{0, "USER_LIMIT_REACHED"}`
  5. Decrements stock, increments user count
  6. Creates reservation `reservation:{reservationId}` as hash with fields: saleId, productId, userId, quantity, expires_at (now + 300s TTL)
  7. Returns `{1, reservationId}`
  Script is loaded at startup via `SCRIPT LOAD`; execution uses `EVALSHA`. (deps: none | module: inventory-deduction | US-002, US-003)

- [ ] T-046: **Lua script loader and executor** -- Implement `loadScript(redisClient, scriptPath)` that reads the `.lua` file, calls `SCRIPT LOAD`, and caches the SHA. Implement `executeScript(redisClient, sha, keys, args)` that calls `EVALSHA` with fallback to `EVAL` on NOSCRIPT error. Export as a utility used by inventory-deduction and rate-limiting (T-028). Unit-test against a test Redis. (deps: T-010 | module: inventory-deduction | US-002, US-003)

- [ ] T-047: **Inventory pre-warming pipeline** -- When cache warm-up fires (T-034), call `SET sale:{saleId}:product:{productId}:stock <allocated>` and `SET sale:{saleId}:product:{productId}:limit <per_user_limit>` for each sale product. Implement this as a pipeline (batch Redis SET commands) for efficiency. Log the number of products preloaded. (deps: T-034, T-010 | module: inventory-deduction | US-002, US-003)

- [ ] T-048: **POST /inventory/reserve** -- Implement reserve endpoint. Accepts `{ saleId, productId, quantity (default 1) }`. Calls the Lua script (T-045). On success, returns 201 with `{ reservationId, expiresAt }`. On out-of-stock, returns 409 `OUT_OF_STOCK`. On user limit, returns 409 `USER_LIMIT_REACHED`. Requires authentication + HMAC signature + idempotency key. (deps: T-045, T-046, T-020, T-044, T-012 | module: inventory-deduction | US-002, US-003)

- [ ] T-049: **POST /inventory/commit** -- Implement commit endpoint. Accepts `{ reservationId }`. Verifies reservation exists in Redis, removes it, writes durable inventory deduction to PostgreSQL (`inventory_deductions` log table). If reservation not found (expired), returns 404 `RESERVATION_NOT_FOUND`. Idempotent: replay with same reservationId returns the original commit result. (deps: T-048, T-010 | module: inventory-deduction | US-002, US-003)

- [ ] T-050: **POST /inventory/release** -- Implement release endpoint. Accepts `{ reservationId }`. Removes the reservation from Redis, increments stock back, decrements user purchase count. Idempotent: if reservation already gone, return 200 (already released). Used by: user cancellation, TTL expiry handler, order auto-cancel. (deps: T-048, T-010 | module: inventory-deduction | US-002, US-003)

- [ ] T-051: **Reservation TTL expiry monitor** -- Implement a background process that listens for Redis keyspace notifications on `EXPIRE` events for keys matching `reservation:*`. On expiry, release the inventory and log at `info` level. Alternatively (if keyspace notifications are not enabled), use a periodic scan every 30 seconds to find and process expired reservations. (deps: T-050, T-010 | module: inventory-deduction | US-002, US-003)

- [ ] T-052: **Inventory eventual-consistency sync** -- Implement a periodic job (every 30 seconds) that reads current Redis stock levels and writes a snapshot to PostgreSQL (`inventory_snapshots` table: sale_id, product_id, redis_stock, synced_at). During active sales, the monitoring dashboard reads from this snapshot for durability. (deps: T-010, T-009 | module: inventory-deduction | US-002, US-003, US-005)

- [ ] T-053: **FIFO queue Redis implementation** -- Implement queue operations: `joinQueue(saleId, userId)` uses `ZADD queue:{saleId} <timestamp> <userId>` (score = Date.now() for FIFO). `getPosition(saleId, userId)` uses `ZRANK` (0-indexed, so position = rank + 1). `getQueueDepth(saleId)` uses `ZCARD`. `dequeue(saleId)` uses `ZPOPMIN` to get the earliest entry. `removeFromQueue(saleId, userId)` uses `ZREM`. All operations are Redis-native, no Lua needed. (deps: T-010 | module: queue-system | US-002, US-003)

- [ ] T-054: **POST /queue/:saleId/join** -- Implement queue join endpoint. Validates: sale is active (check Redis cache from T-047). Checks user is not already in queue (ZSCORE). Calls T-053 joinQueue. Returns 201 with `{ position, estimatedWaitSeconds, queueEntryId }`. `estimatedWaitSeconds = position * avgProcessingTimePerEntry` (configurable, default 0.1s). Requires authentication + HMAC + rate limiting (burst allowance for fair queue join). (deps: T-053, T-020, T-044, T-030, T-012 | module: queue-system | US-002, US-003)

- [ ] T-055: **GET /queue/:saleId/position** -- Implement position lookup endpoint. Calls T-053 getPosition. Returns `{ position, queueDepth, estimatedWaitSeconds, status: "queued"|"processing"|"completed"|"expired" }`. Requires authentication. (deps: T-053, T-020, T-012 | module: queue-system | US-002, US-003)

- [ ] T-056: **Queue worker: dequeue and publish to RabbitMQ** -- Implement a worker (background process within the queue-system service) that: (1) calls `dequeue` (ZPOPMIN), (2) checks if the queue entry has expired (>10 min old, based on timestamp score), if so, set status `expired` and skip, (3) publishes a message to RabbitMQ exchange `flash-sale.orders` with routing key `order.create` and payload `{ queueEntryId, saleId, userId, productId, quantity, timestamp }`. Use consumer prefetch to control throughput (configurable, default 50). (deps: T-053, T-011 | module: queue-system | US-002, US-003)

- [ ] T-057: **Queue expiry cleanup job** -- Implement a periodic job (every 30 seconds) that scans all active sale queues with `ZRANGEBYSCORE` for entries older than the configurable timeout (default 10 min). Remove expired entries with `ZREMRANGEBYSCORE`. Log each removal with queueEntryId and age. Mark expired entries in a status tracking set. (deps: T-053 | module: queue-system | US-002, US-003)

- [ ] T-058: **Duplicate queue entry prevention** -- Before joining, check if the user already has an entry in the queue via `ZSCORE`. If the user's previous entry is still valid (not expired, not processed), return 409 `ALREADY_QUEUED` with their current position. This check is in T-054 but listed separately for emphasis on the no-duplicate invariant. (deps: T-053, T-054 | module: queue-system | US-002, US-003)

- [ ] T-059: **RabbitMQ consumer: process order from queue** -- Implement the RabbitMQ consumer in the queue-system service that: (1) consumes from `flash-sale.orders` queue, (2) calls Inventory Deduction `/inventory/reserve` (T-048), (3) on success, calls Order Payment `/orders` (T-063) with the reservation ID, (4) on reserve failure (OUT_OF_STOCK), mark queue entry as `failed_no_stock` and publish to dead letter queue, (5) on order creation failure, release reservation (T-050) and retry with exponential backoff (max 3 retries, then dead letter). ACK on success or terminal failure, NACK on transient failure. (deps: T-056, T-048, T-050, T-011 | module: queue-system | US-002, US-003)

---

## Wave 5: Order Processing and Payment

> Completes the purchase transaction flow. Depends on inventory reservation and queue dequeue working end-to-end.

- [ ] T-060: **Orders migration and model** -- Create `orders` table: `id` (UUID PK), `user_id` (FK -> users), `sale_id` (FK), `product_id` (FK), `sale_price` (decimal, not null), `status` (enum: pending/paid/cancelled), `reservation_id` (text, nullable), `queue_entry_id` (text), `idempotency_key` (text, unique, indexed), `paid_at` (timestamp, nullable), `cancelled_at` (timestamp, nullable), `cancel_reason` (text), `created_at`, `updated_at`. (deps: T-009, T-013, T-022, T-031 | module: order-payment | US-003, US-005)

- [ ] T-061: **Order state machine** -- Implement `pending -> paid | cancelled` state machine. Valid: `pay` (pending->paid), `cancel` (pending->cancelled, with optional reason). From `paid` or `cancelled`, no transitions allowed. Invalid transitions return 409 with `INVALID_TRANSITION`. Unit-test all paths. (deps: none | module: order-payment | US-003, US-005)

- [ ] T-062: **Order repository** -- Implement `OrderRepository` with: `create(data)` (UPSERT on idempotency_key), `findById(id)`, `findByUser(userId, { status, page, limit })`, `findPendingOlderThan(minutes)` (for auto-cancel job), `updateStatus(id, from, to, extra)` with optimistic locking (WHERE status = from). All writes are in transactions. (deps: T-060, T-008 | module: order-payment | US-003, US-005)

- [ ] T-063: **POST /orders (create order)** -- Implement order creation. Accepts `{ saleId, productId, quantity, reservationId, queueEntryId }` + `Idempotency-Key` header. Uses idempotency middleware (T-042). Creates order with status `pending`. Associates the reservation. Returns 201 with order details. Requires authentication + HMAC. (deps: T-062, T-061, T-020, T-044, T-012 | module: order-payment | US-003, US-005)

- [ ] T-064: **Mock payment processor** -- Implement `MockPaymentGateway` with a `processPayment(orderId, amount)` method that simulates payment processing with a configurable success rate (env var `PAYMENT_SUCCESS_RATE`, default 0.95). Adds configurable artificial delay (env var `PAYMENT_LATENCY_MS`, default 200ms). Returns `{ success: bool, transactionId?: string, errorCode?: string }`. Implement as a repository interface so it can be swapped for a real gateway later. (deps: T-003 | module: order-payment | US-003, US-005)

- [ ] T-065: **POST /orders/:id/pay** -- Implement payment submission. Validates order is `pending`. Calls mock payment processor (T-064). On success: commit reservation via `/inventory/commit` (T-049), transition order to `paid`, set `paid_at`. On failure: return 402 `PAYMENT_FAILED`, order stays `pending`, user may retry. Requires authentication (must be the order owner) + HMAC + idempotency key. (deps: T-064, T-062, T-061, T-049, T-020, T-044, T-012 | module: order-payment | US-003, US-005)

- [ ] T-066: **POST /orders/:id/cancel** -- Implement user cancellation. Validates order is `pending` and belongs to the requesting user. Releases reservation via `/inventory/release` (T-050). Transitions order to `cancelled` with reason `user_requested`. Sets `cancelled_at`. Returns 200. Requires authentication + HMAC. (deps: T-062, T-061, T-050, T-020, T-044, T-012 | module: order-payment | US-003, US-005)

- [ ] T-067: **Auto-cancel pending orders job** -- Implement a periodic background job (every 60 seconds) that queries `OrderRepository.findPendingOlderThan(15 minutes)`. For each stale pending order: release reservation (T-050), transition to `cancelled` with reason `timeout`. Log each cancellation with order ID, age, and user ID at `info` level. (deps: T-062, T-061, T-050 | module: order-payment | US-003, US-005)

- [ ] T-068: **GET /orders and GET /orders/:id** -- Implement order list (for current user, with status filter and pagination) and order detail. Detail includes current status, reservation status, and payment info if paid. Requires authentication. (deps: T-062, T-020, T-012 | module: order-payment | US-003, US-005)

- [ ] T-069: **Inventory reconciliation on cancel/timeout** -- Ensure the compensating transaction (release on cancel or timeout) is robust: if the release call fails, retry up to 3 times with exponential backoff. If all retries fail, log at `error` level with full context and add to a `reconciliation_queue` Redis list for manual intervention. (deps: T-050, T-066, T-067 | module: order-payment | US-003, US-005)

---

## Wave 6: Monitoring, Integration, and Hardening

> Observability for all modules, end-to-end integration tests, load testing, and production hardening.

- [ ] T-070: **In-memory metrics registry** -- Implement a `MetricsRegistry` singleton that collects counters, gauges, and histograms in-memory with atomic operations. Expose `incrementCounter(name, value)`, `setGauge(name, value)`, `recordHistogram(name, value)`. All operations must be O(1) and thread-safe. The registry is populated by middleware and handlers across all services. (deps: none | module: monitoring-dashboard | US-005, US-006, US-007)

- [ ] T-071: **Metrics collection middleware** -- Implement middleware (attached in the HTTP bootstrap, T-012) that records: (1) request count per endpoint (counter), (2) response latency per endpoint (histogram), (3) response status code distribution (counter). Use the correlation ID to track request lifecycle. Ensure collection adds under 5ms overhead. (deps: T-070, T-005 | module: monitoring-dashboard | US-005, US-006, US-007)

- [ ] T-072: **Business metrics collectors** -- Implement domain-specific metric collection functions called at the appropriate points:
  - QPS gauge: updated every 1 second via `setInterval` from request counter delta
  - Inventory drain per sale: `inventory.sold.{saleId}.{productId}` counter, incremented on each successful reservation commit (T-049)
  - Queue depth per sale: gauge set from Redis ZCARD on each metrics scrape
  - Order creation rate: counter incremented on POST /orders (T-063)
  - Payment success rate: counters for payment attempts and successes (T-065)
  (deps: T-070, T-049, T-053, T-063, T-065 | module: monitoring-dashboard | US-005, US-006, US-007)

- [ ] T-073: **GET /metrics endpoint** -- Implement the metrics endpoint that reads from the registry (T-070) and returns:
  ```json
  {
    "qps": { "current": <number>, "1minAvg": <number>, "5minAvg": <number> },
    "inventory": [{ "saleId": "<id>", "productId": "<id>", "remainingStock": <number>, "drainRatePerMinute": <number> }],
    "queues": [{ "saleId": "<id>", "depth": <number>, "avgWaitSeconds": <number> }],
    "orders": { "creationRatePerMinute": <number>, "paymentSuccessRate": <number> },
    "uptime": <seconds>,
    "latency": { "p50": <ms>, "p95": <ms>, "p99": <ms> }
  }
  ```
  Response time must be under 50ms regardless of load. No authentication required (operator network restriction is a concern for the API gateway, not the service). (deps: T-070, T-072, T-012 | module: monitoring-dashboard | US-005, US-006, US-007)

- [ ] T-074: **Periodic Redis metrics snapshot** -- Implement a background job (every 10 seconds) that snapshots current metric values to Redis keys (`metrics:qps`, `metrics:inventory`, `metrics:queues`, `metrics:orders`) with a 30-second TTL. This enables cross-instance metric aggregation: the /metrics endpoint on any instance merges its local registry with snapshots from other instances found in Redis. (deps: T-073, T-010 | module: monitoring-dashboard | US-005, US-006, US-007)

- [ ] T-075: **Anomaly detection alerts** -- Implement basic threshold-based alerting: (1) queue depth exceeds configurable threshold -> log at `warn` with `ALERT_QUEUE_DEPTH`, (2) payment success rate drops below configurable threshold -> `warn` with `ALERT_PAYMENT_FAILURE_RATE`, (3) p95 latency exceeds threshold -> `warn` with `ALERT_LATENCY_SPIKE`, (4) Redis connection lost -> `error` with `ALERT_REDIS_DOWN`. Check every 30 seconds. (deps: T-073, T-010 | module: monitoring-dashboard | US-006, US-007)

- [ ] T-076: **Integration test: user registration and auth flow** -- Write integration tests covering: register -> login -> access protected endpoint -> refresh token -> access with new token -> replay revoked refresh token (expect 401 + full revocation). Run against a test Docker Compose instance. (deps: T-017, T-018, T-019, T-020 | module: user-auth | US-001, US-004)

- [ ] T-077: **Integration test: product CRUD with role enforcement** -- Write integration tests covering: admin creates product -> buyer reads product -> buyer attempts create (403) -> admin updates -> admin deletes -> search with filters and pagination. (deps: T-024, T-025, T-026, T-027 | module: product-crud | US-001, US-004)

- [ ] T-078: **Integration test: full purchase flow (happy path)** -- Write end-to-end test covering: admin creates sale with product -> sale auto-activates -> user joins queue -> worker dequeues and reserves -> order created -> user pays -> order confirmed -> inventory correctly decremented. Verify no oversell by checking final stock. Run against full Docker Compose stack. (deps: T-035, T-037, T-054, T-056, T-059, T-063, T-065 | modules: flash-sale-config, queue-system, inventory-deduction, order-payment | US-002, US-003, US-004, US-005)

- [ ] T-079: **Integration test: oversell prevention under concurrency** -- Write a concurrent test: 1000 parallel reservation requests against 1 unit of stock. Assert exactly 1 success and 999 OUT_OF_STOCK responses. Stock must never go negative. (deps: T-048, T-045 | module: inventory-deduction | US-002, US-003)

- [ ] T-080: **Integration test: HMAC signing and replay protection** -- Write tests covering: valid signed request passes -> replayed nonce returns 401 -> stale timestamp returns 401 -> bad signature returns 401 -> idempotency key replay returns cached result -> different body with same idempotency key returns 422. (deps: T-041, T-042, T-044 | module: api-security | US-008)

- [ ] T-081: **Integration test: rate limiting enforcement** -- Write tests covering: requests within limit pass -> burst up to capacity passes -> exceeding limit returns 429 with Retry-After -> headers include X-RateLimit-Remaining -> bucket refills after window. (deps: T-029, T-030 | module: rate-limiting | US-006, US-007)

- [ ] T-082: **Integration test: order timeout and auto-cancel** -- Write test: create order -> wait 15+ minutes (use shortened timeout via config for test) -> verify auto-cancel triggered -> inventory released back. (deps: T-067, T-066, T-050 | module: order-payment | US-003, US-005)

- [ ] T-083: **Integration test: graceful degradation under Redis failure** -- Write test: simulate Redis disconnect -> verify `/health` returns 503 (unhealthy) -> verify stateless endpoints still return 200 -> verify stateful endpoints return 503 -> restore Redis -> verify recovery. (deps: T-007, T-012 | module: infra-foundation | US-006, US-007)

- [ ] T-084: **Load test: 100K req/s on health/metrics** -- Write a k6 or artillery load test script targeting `/health` and `/metrics` at 100,000 req/s sustained for 60 seconds with 4 instances. Verify p95 latency < 50ms for metrics and no dropped requests. Document results. (deps: T-073, T-007 | modules: infra-foundation, monitoring-dashboard | US-006, US-007)

- [ ] T-085: **Load test: concurrent purchase under load** -- Write a k6/artillery script simulating: 10,000 users joining a queue simultaneously at sale start, 1,000 units of stock, queue worker at 500 entries/sec. Measure: time to complete all purchases, oversell count (must be 0), p95 latency for queue join and order creation. (deps: T-078, T-054, T-059, T-063 | modules: queue-system, inventory-deduction, order-payment | US-002, US-003)

- [ ] T-086: **Production hardening: env var documentation and defaults** -- Audit all env vars across all modules. Ensure every tunable parameter (TTLs, timeouts, rates, burst sizes, limits) is env-configurable with sensible defaults. Create a `.env.example` file documenting all variables with descriptions and defaults. (deps: T-003, T-030, T-064 | module: infra-foundation | US-001, US-004, US-006)

- [ ] T-087: **Production hardening: Redis Sentinel/Cluster config support** -- Extend the Redis client (T-010) to accept Sentinel or Cluster configuration (env vars: `REDIS_MODE=single|sentinel|cluster`, `REDIS_SENTINELS`, `REDIS_MASTER_NAME`). Validate that the existing code works without changes against a Sentinel-managed Redis (ADR-007 requirement). (deps: T-010 | module: infra-foundation | US-001, US-004, US-006)

---

## Traceability: User Story to Task Mapping

| User Story | Description | Tasks |
|---|---|---|
| US-001 | Shopper sees upcoming flash sale events with countdown timers | T-001..T-012, T-013..T-021, T-022..T-027, T-034, T-036, T-076, T-077, T-086, T-087 |
| US-002 | Shopper joins fair purchase queue when sale starts | T-045..T-052, T-053..T-059, T-078, T-079, T-085 |
| US-003 | Shopper receives immediate confirmation of purchase outcome | T-045..T-052, T-053..T-059, T-060..T-069, T-078, T-079, T-082, T-085 |
| US-004 | Merchant Admin configures flash sale events | T-001..T-012, T-013..T-021, T-022..T-027, T-031..T-038, T-076, T-077, T-078, T-086, T-087 |
| US-005 | Merchant Admin sees real-time sales metrics | T-031..T-034, T-036, T-038, T-052, T-060..T-069, T-070..T-074, T-078, T-082 |
| US-006 | Operations Engineer monitors system throughput and error rates | T-001..T-012, T-028..T-030, T-070..T-075, T-081, T-083, T-084, T-086, T-087 |
| US-007 | Operations Engineer wants automatic circuit breaking and graceful degradation | T-006, T-007, T-028..T-030, T-070..T-075, T-081, T-083, T-084 |
| US-008 | Security Auditor reviews request patterns and detects automated bot activity | T-039..T-044, T-080 |

---

## Dependency Graph Summary

```
Wave 1 (Foundation)
T-001 ──> T-002 ──> T-008 ──> T-009
   │                 T-010
   │                 T-011
   └──> T-003 ──> T-004 ──> T-005 ──> T-006
                              └──> T-007
                              └──> T-012 (bootstrap)

Wave 2 (Auth, Products, Rate Limiting)
T-009 ──> T-013 ──> T-014
   │       └──> T-015
   └──> T-016 (JWT) ──> T-017, T-018, T-019, T-020 ──> T-021
T-009 ──> T-022 ──> T-023 ──> T-024, T-025, T-026, T-027
T-010 ──> T-028 ──> T-029 ──> T-030

Wave 3 (Sales Config, API Security)
T-009 ──> T-031 ──> T-032 ──> T-035, T-036, T-037, T-038
                   └──> T-033
                   └──> T-034 (cache warm-up, needs T-010)
T-010 ──> T-040 ──> T-041 ──> T-044
          T-039 ──┘         T-042 ─┘
                            T-043 ─┘

Wave 4 (Inventory, Queue)
T-010 ──> T-046 ──> T-045 (Lua loaded via T-046)
T-034 ──> T-047 ──> T-048 ──> T-049, T-050 ──> T-051, T-052
T-010 ──> T-053 ──> T-054, T-055, T-056, T-057, T-058
                                    T-059 (needs T-048, T-050, T-056, T-011)

Wave 5 (Orders, Payment)
T-009 ──> T-060 ──> T-062
                   └──> T-061
T-062 ──> T-063, T-064 ──> T-065, T-066
                             T-067 (needs T-050, T-062)
                             T-068
                             T-069 (needs T-050, T-066, T-067)

Wave 6 (Monitoring, Integration, Hardening)
T-070 ──> T-071, T-072 ──> T-073 ──> T-074 ──> T-075
All prior waves ──> T-076..T-085 (integration/load tests)
T-010, T-003, T-030, T-064 ──> T-086, T-087
```

## Task Count by Module

| Module | Task IDs | Count |
|---|---|---|
| infra-foundation | T-001..T-012, T-086, T-087 | 14 |
| user-auth | T-013..T-021, T-076 | 10 |
| product-crud | T-022..T-027, T-077 | 7 |
| flash-sale-config | T-031..T-038 | 8 |
| inventory-deduction | T-045..T-052, T-079 | 9 |
| queue-system | T-053..T-059, T-085 | 8 |
| rate-limiting | T-028..T-030, T-081 | 4 |
| api-security | T-039..T-044, T-080 | 7 |
| order-payment | T-060..T-069, T-082 | 11 |
| monitoring-dashboard | T-070..T-075, T-078, T-083, T-084 | 9 |
| **Total** | | **87** |
