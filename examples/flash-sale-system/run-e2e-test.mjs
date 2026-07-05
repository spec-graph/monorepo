/**
 * run-e2e-test.mjs
 *
 * Walks through the complete 8-stage spec-graph workflow for the flash sale system.
 * Produces each artifact as a sub-agent would, then submits.
 *
 * Usage: node run-e2e-test.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const SESSION_ID = 'build-a-flash-sale-system-with-6-independent-modules-auth-jwt-pr';
const SPEC_GRAPH_DIR = '.spec-graph';
const SESSION_DIR = path.join(SPEC_GRAPH_DIR, 'sessions', SESSION_ID);

function runSpecGraph(cmd) {
  try {
    const result = execSync(`spec-graph ${cmd}`, {
      encoding: 'utf-8',
      cwd: process.cwd(),
      timeout: 30000,
    });
    return result.trim();
  } catch (err) {
    console.error(`Error running: spec-graph ${cmd}`);
    console.error(err.stdout || err.stderr);
    throw err;
  }
}

function submitArtifacts(artifacts) {
  // Read each file content and build JSON
  const artifactJson = artifacts.map(({ path, file }) => {
    const content = fs.readFileSync(file, 'utf-8');
    return { path, content };
  });

  // Write JSON to a temp file to avoid shell escaping issues
  const tmpFile = path.join(process.cwd(), '.spec-graph', 'tmp-result.json');
  fs.writeFileSync(tmpFile, JSON.stringify({ artifacts: artifactJson }), 'utf-8');

  return runSpecGraph(`submit --session ${SESSION_ID} --result-file ${tmpFile}`);
}

function writeArtifact(stage, filename, content) {
  const dir = path.join(SESSION_DIR, stage);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

console.log('═══════════════════════════════════════');
console.log('  Flash Sale System E2E Test');
console.log('═══════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════════
// Stage 1: specify
// ═══════════════════════════════════════════════════════════════════
console.log('━━━ Stage 1: specify ━━━');

const proposalContent = `# Flash Sale System — Proposal

## Why

Build a production-ready flash sale system that handles high-concurrency purchasing events with anti-scaling measures, inventory protection, and queue management.

## What Changes

New system with 6 independent modules:
1. **Auth Module**: JWT-based authentication with registration, login, token validation
2. **Product Module**: CRUD operations for product catalog
3. **Sale Module**: Flash sale lifecycle management (create, start, end)
4. **Order Module**: Order processing with idempotency and payment
5. **Inventory Module**: Stock reservation with TTL and atomic deduction
6. **Queue Module**: FIFO purchase queue for thundering herd protection

## User Personas

- **Shopper**: Browses flash sales, registers intent, purchases during sale window
- **Admin**: Creates products, configures flash sales, monitors orders
- **System**: Manages inventory, processes queue, handles concurrent access

## Capabilities

- **auth**: JWT authentication (register, login, validate, middleware)
- **product**: Product CRUD and catalog search
- **sale**: Flash sale lifecycle management
- **order**: Order creation, payment processing, status tracking
- **inventory**: Stock reservation, atomic deduction, expired cleanup
- **queue**: FIFO queue, thundering herd protection, timeout handling

## Impact

- 6 new TypeScript modules
- Express API server
- Test suite covering all modules
`;

const proposalPath = writeArtifact('specify', 'proposal.md', proposalContent);
console.log('✓ proposal.md written');

const submitResult1 = submitArtifacts([{ path: `.spec-graph/sessions/${SESSION_ID}/specify/proposal.md`, file: proposalPath }]);
console.log(`Submit result: ${submitResult1}\n`);

// ═══════════════════════════════════════════════════════════════════
// Stage 2: design
// ═══════════════════════════════════════════════════════════════════
console.log('━━━ Stage 2: design ━━━');

const designContent = `# Flash Sale System — Design

## Context

High-concurrency e-commerce flash sale system handling thousands of concurrent purchase requests.

## Goals / Non-Goals

**Goals:**
- Support 10k+ concurrent requests during flash sale
- Prevent overselling (inventory accuracy)
- Fair purchase allocation (FIFO queue)
- Anti-scaling (per-user purchase limits)

**Non-Goals:**
- Real-time payment integration (mock payment)
- Distributed deployment (single server)
- UI implementation (API only)

## Decisions

### Decision 1: JWT-based authentication
- Stateless tokens for scalability
- Short-lived access tokens (15min) + refresh tokens (7d)

### Decision 2: In-memory inventory with TTL
- Stock reservation expires after 5min (configurable)
- Atomic operations prevent overselling

### Decision 3: FIFO queue for purchase requests
- Requests queue when sale starts
- Queue drains in order, first come first served

### Decision 4: Idempotency for orders
- Each purchase has unique idempotency key
- Prevents duplicate orders from retries

## Risks / Trade-offs

- In-memory inventory lost on crash → use Redis/DB in production
- Single server is single point of failure → scale horizontally later
- FIFO queue adds latency → trade-off for fairness

## Alternatives Considered

- Redis for inventory (rejected: added dependency)
- Database-backed queue (rejected: overkill for test)
`;

const designPath = writeArtifact('design', 'design.md', designContent);
console.log('✓ design.md written');

const submitResult2 = submitArtifacts([{ path: `.spec-graph/sessions/${SESSION_ID}/design/design.md`, file: designPath }]);
console.log(`Submit result: ${submitResult2}\n`);

// ═══════════════════════════════════════════════════════════════════
// Stage 3: tasks
// ═══════════════════════════════════════════════════════════════════
console.log('━━━ Stage 3: tasks ━━━');

const tasksContent = `# Flash Sale System — Tasks

## 1. Authentication Module
- [ ] 1.1 Implement User interface and in-memory user store (auth)
- [ ] 1.2 Implement registerUser with email validation (auth)
- [ ] 1.3 Implement loginUser with password check and JWT generation (auth)
- [ ] 1.4 Implement validateToken for JWT verification (auth)
- [ ] 1.5 Implement authMiddleware for Express (auth)

## 2. Product Module
- [ ] 2.1 Implement Product interface and in-memory store (product)
- [ ] 2.2 Implement createProduct and getProduct (product)
- [ ] 2.3 Implement listProducts with search filter (product)
- [ ] 2.4 Implement updateProduct and deleteProduct (product)

## 3. Sale Module
- [ ] 3.1 Implement FlashSale interface and in-memory store (sale)
- [ ] 3.2 Implement createFlashSale with validation (sale)
- [ ] 3.3 Implement getFlashSale and listFlashSales (sale)
- [ ] 3.4 Implement startFlashSale and endFlashSale lifecycle (sale)
- [ ] 3.5 Implement getUserPurchaseCount for anti-scaling (sale)

## 4. Order Module
- [ ] 4.1 Implement Order interface and in-memory store (order)
- [ ] 4.2 Implement createOrder with idempotency key check (order)
- [ ] 4.3 Implement getOrder and listOrders (order)
- [ ] 4.4 Implement processPayment and cancelOrder (order)

## 5. Inventory Module
- [ ] 5.1 Implement Reservation interface and in-memory store (inventory)
- [ ] 5.2 Implement reserveStock with TTL expiry (inventory)
- [ ] 5.3 Implement commitReservation and releaseReservation (inventory)
- [ ] 5.4 Implement getStock query (inventory)
- [ ] 5.5 Implement cleanupExpiredReservations (inventory)

## 6. Queue Module
- [ ] 6.1 Implement QueueEntry interface and FIFO queue (queue)
- [ ] 6.2 Implement enqueue and dequeue (queue)
- [ ] 6.3 Implement getQueueLength and getUserPosition (queue)
- [ ] 6.4 Implement processQueue to drain waiting requests (queue)
`;

const tasksPath = writeArtifact('tasks', 'tasks.md', tasksContent);
console.log('✓ tasks.md written');

const submitResult3 = submitArtifacts([{ path: `.spec-graph/sessions/${SESSION_ID}/tasks/tasks.md`, file: tasksPath }]);
console.log(`Submit result: ${submitResult3}\n`);

// ═══════════════════════════════════════════════════════════════════
// Stage 4: implement
// ═══════════════════════════════════════════════════════════════════
console.log('━━━ Stage 4: implement ━━━');
console.log('6 parallel sub-agents would run here.\nFor this test, we simulate by writing code directly.\n');

// The actual source files are already stub files with "Not implemented" errors.
// We'll write marker files to simulate implement stage completion.

for (const module of ['auth', 'product', 'sale', 'order', 'inventory', 'queue']) {
  const markerPath = path.join(SESSION_DIR, 'implement', `${module}.md`);
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, `# ${module} module implemented\n\nImplementation complete.\n`, 'utf-8');
}
console.log('✓ 6 module markers written');

// Submit with all 6 artifacts
const implementSubmit = ['auth', 'product', 'sale', 'order', 'inventory', 'queue'].map(m => ({
  path: `.spec-graph/sessions/${SESSION_ID}/implement/${m}.md`,
  file: path.join(SESSION_DIR, 'implement', `${m}.md`),
}));

const submitResult4 = submitArtifacts(implementSubmit);
console.log(`Submit result: ${submitResult4}\n`);

// ═══════════════════════════════════════════════════════════════════
// Stage 5: review
// ═══════════════════════════════════════════════════════════════════
console.log('━━━ Stage 5: review ━━━');

const reviewContent = `# Code Review Report

## Summary
Reviewed 6 modules: auth, product, sale, order, inventory, queue.

## Findings

### auth module
- ✓ JWT implementation uses proper HS256 algorithm
- ✓ Password hashing with bcrypt
- ! Rate limiting not implemented (should be added)

### product module
- ✓ CRUD operations complete
- ! No pagination for listProducts (performance concern)

### sale module
- ✓ Lifecycle management correct
- ✓ Per-user purchase limit enforced
- ! No sale time window validation

### order module
- ✓ Idempotency keys prevent duplicates
- ! Payment processing is mock (expected for test)

### inventory module
- ✓ TTL-based reservations
- ✓ Atomic stock operations
- ! Concurrent access could be improved with Redis locks

### queue module
- ✓ FIFO ordering maintained
- ! No queue timeout (entries can wait forever)

## Resolutions
All findings are acceptable for test scope. Production deployment should address rate limiting, pagination, and Redis integration.
`;

const reviewPath = writeArtifact('review', 'review.md', reviewContent);
console.log('✓ review.md written');

const submitResult5 = submitArtifacts([{ path: `.spec-graph/sessions/${SESSION_ID}/review/review.md`, file: reviewPath }]);
console.log(`Submit result: ${submitResult5}\n`);

// ═══════════════════════════════════════════════════════════════════
// Stage 6: test
// ═══════════════════════════════════════════════════════════════════
console.log('━━━ Stage 6: test ━━━');

const testContent = `# Test Report

## Coverage
- auth: 85% (5 tests)
- product: 90% (4 tests)
- sale: 88% (5 tests)
- order: 92% (4 tests)
- inventory: 80% (5 tests)
- queue: 75% (4 tests)
- Overall: 85%

## Test Results
- 27 tests passed
- 0 tests failed
- 0 tests skipped

## Test Categories
- Unit tests: 20
- Integration tests: 5
- Edge cases: 2 (concurrency, timeout)

## Known Issues
- Concurrent inventory reservation test is flaky (timing-dependent)
- Queue timeout test requires manual intervention (5s sleep)
`;

const testPath = writeArtifact('test', 'test.md', testContent);
console.log('✓ test.md written');

const submitResult6 = submitArtifacts([{ path: `.spec-graph/sessions/${SESSION_ID}/test/test.md`, file: testPath }]);
console.log(`Submit result: ${submitResult6}\n`);

// ═══════════════════════════════════════════════════════════════════
// Stage 7: accept
// ═══════════════════════════════════════════════════════════════════
console.log('━━━ Stage 7: accept ━━━');

const verificationContent = `# Acceptance Verification

## User Stories Verified

### As a Shopper
- ✓ Can register and login
- ✓ Can browse products
- ✓ Can create flash sale purchase intent
- ✓ Can receive fair queue position

### As an Admin
- ✓ Can create and manage flash sales
- ✓ Can monitor order status
- ✓ Cannot oversell (inventory accurate)

### As the System
- ✓ Handles 100 concurrent requests (test)
- ✓ Queue processes in FIFO order
- ✓ Expired reservations cleaned up
- ✓ Idempotent order creation

## Acceptance Criteria
All acceptance criteria from proposal are met.

## Recommendation
**ACCEPT** — Flash sale system is ready for deployment.
`;

const verificationPath = writeArtifact('accept', 'verification.md', verificationContent);
console.log('✓ verification.md written');

const submitResult7 = submitArtifacts([{ path: `.spec-graph/sessions/${SESSION_ID}/accept/verification.md`, file: verificationPath }]);
console.log(`Submit result: ${submitResult7}\n`);

// ═══════════════════════════════════════════════════════════════════
// Stage 8: integrate
// ═══════════════════════════════════════════════════════════════════
console.log('━━━ Stage 8: integrate ━━━');

const prContent = `# Pull Request: Flash Sale System

## Summary
Implements a production-ready flash sale system with 6 independent modules:
- auth (JWT authentication)
- product (CRUD operations)
- sale (flash sale lifecycle)
- order (payment processing)
- inventory (stock reservation)
- queue (FIFO purchase queue)

## Test Plan
- Unit tests for all modules (27 tests)
- Integration tests for concurrent scenarios
- Load test with 100 concurrent requests
- Anti-scaling test (per-user limits)
- Idempotency test for duplicate orders

## Checklist
- [x] All modules implemented
- [x] All tests pass
- [x] Code review complete
- [x] Acceptance criteria met
- [x] Documentation updated
- [x] Ready for deployment
`;

const prPath = writeArtifact('integrate', 'pr.md', prContent);
console.log('✓ pr.md written');

const submitResult8 = submitArtifacts([{ path: `.spec-graph/sessions/${SESSION_ID}/integrate/pr.md`, file: prPath }]);
console.log(`Submit result: ${submitResult8}\n`);

// ═══════════════════════════════════════════════════════════════════
// Final verification
// ═══════════════════════════════════════════════════════════════════
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  FINAL STATUS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const finalStatus = runSpecGraph(`status --session ${SESSION_ID} --json`);
console.log(finalStatus);

// Verify all artifacts exist
const expectedArtifacts = [
  'specify/proposal.md',
  'design/design.md',
  'tasks/tasks.md',
  'implement/auth.md',
  'implement/product.md',
  'implement/sale.md',
  'implement/order.md',
  'implement/inventory.md',
  'implement/queue.md',
  'review/review.md',
  'test/test.md',
  'accept/verification.md',
  'integrate/pr.md',
];

console.log('\n━━━ Artifact Verification ━━━');
let allExist = true;
for (const art of expectedArtifacts) {
  const exists = fs.existsSync(path.join(SESSION_DIR, art));
  console.log(`  ${exists ? '✓' : '✗'} ${art}`);
  if (!exists) allExist = false;
}

console.log(allExist ? '\n✓ All artifacts present' : '\n✗ Some artifacts missing');

// Verify machine-state
console.log('\n━━━ Machine State ━━━');
const msPath = path.join(SPEC_GRAPH_DIR, 'machine-state.yaml');
if (fs.existsSync(msPath)) {
  console.log(`✓ machine-state.yaml exists`);
  const content = fs.readFileSync(msPath, 'utf-8');
  const completedCount = (content.match(/status: completed/g) || []).length;
  console.log(`  Completed artifacts: ${completedCount}`);
}

// Verify state.yaml
console.log('\n━━━ State File ━━━');
const statePath = path.join(SESSION_DIR, 'state.yaml');
if (fs.existsSync(statePath)) {
  const stateContent = fs.readFileSync(statePath, 'utf-8');
  if (stateContent.includes('state: "completed"')) {
    console.log('✓ Session state = completed');
  }
  if (stateContent.includes('readyForArchive: true')) {
    console.log('✓ Session ready for archive');
  }
}

console.log('\n═══════════════════════════════════════');
console.log('  E2E TEST COMPLETE');
console.log('═══════════════════════════════════════');
