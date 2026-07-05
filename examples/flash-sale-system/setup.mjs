/**
 * setup-flash-sale-session.mjs
 *
 * Creates a spec-graph session for the flash sale system with exactly
 * 6 independent capabilities (all dependsOn: [] for parallel Wave 0).
 */

import { automator } from '../../packages/core/dist/index.js';

const intent = 'Build a flash sale system with 6 independent modules: auth (JWT), product (CRUD), sale (flash sale management), order (payment), inventory (stock reservation), queue (FIFO purchase queue)';

const sessionId = intent
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 64);

const plan = {
  sessionId,
  intent,
  capabilities: [
    { id: 'auth', description: 'JWT authentication module — register, login, validateToken, authMiddleware for Express', dependsOn: [] },
    { id: 'product', description: 'Product module — CRUD operations, catalog search, stock management', dependsOn: [] },
    { id: 'sale', description: 'Flash sale module — sale CRUD, start/end lifecycle, per-user purchase limit, status tracking', dependsOn: [] },
    { id: 'order', description: 'Order module — order creation from sale, payment processing, status tracking, idempotency keys', dependsOn: [] },
    { id: 'inventory', description: 'Inventory module — stock reservation with TTL, atomic deduction, expired cleanup', dependsOn: [] },
    { id: 'queue', description: 'Queue module — FIFO purchase queue, thundering herd protection, timeout handling', dependsOn: [] },
  ],
  order: ['auth', 'product', 'sale', 'order', 'inventory', 'queue'],
  complexity: 'high',
  risks: ['High concurrency during flash sale', 'Anti-scaling requires careful design'],
  openQuestions: [],
};

// Create session
const draftPlan = automator.startSession(intent, process.cwd());
console.log('sessionId:', sessionId);

// Override with exact plan
automator.intervene(sessionId, 'modify-plan', plan, process.cwd());

// Confirm
automator.confirmPlan(sessionId, plan, process.cwd());

const status = automator.status(sessionId, process.cwd());
console.log('');
console.log('═══════════════════════════════════════');
console.log('  FLASH SALE SESSION READY');
console.log('═══════════════════════════════════════');
console.log(`  Session: ${sessionId}`);
console.log(`  Stage:   ${status.stage}`);
console.log(`  State:   ${status.state}`);
console.log(`  Caps:    ${plan.capabilities.length} (all independent)`);
for (const c of plan.capabilities) {
  console.log(`    - ${c.id} (dependsOn: [])`);
}
console.log('');
console.log('Next: spec-graph dispatch --session ' + sessionId);
console.log('═══════════════════════════════════════');
