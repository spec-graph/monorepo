/**
 * Flash Sale System - Main Entry Point
 *
 * Express API server exposing flash sale functionality.
 *
 * TO BE IMPLEMENTED by spec-graph sub-agent during the implement stage.
 */

export const VERSION = '1.0.0';

// Re-export all modules
export * from './auth/index.js';
export * from './product/index.js';
export * from './sale/index.js';
export * from './order/index.js';
export * from './inventory/index.js';
export * from './queue/index.js';
