/**
 * Planning Schema — JSON Schema for validating LLM-generated plans.
 *
 * The planning module produces a structured plan with capabilities, dependencies,
 * complexity estimates, and risks. When dispatched to an LLM agent, the agent
 * returns a JSON that must conform to this schema.
 */

// ---------------------------------------------------------------------------
// JSON Schema (as a TypeScript object for runtime validation)
// ---------------------------------------------------------------------------

export const PLAN_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['capabilities', 'order', 'complexity'],
  properties: {
    capabilities: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'description', 'dependsOn'],
        properties: {
          id: {
            type: 'string',
            pattern: '^[a-z][a-z0-9-]*$',
          },
          description: {
            type: 'string',
            minLength: 10,
          },
          dependsOn: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      minItems: 1,
      maxItems: 15,
    },
    order: {
      type: 'array',
      items: { type: 'string' },
    },
    complexity: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
    },
    risks: {
      type: 'array',
      items: { type: 'string' },
    },
    openQuestions: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// TypeScript types (mirror the schema)
// ---------------------------------------------------------------------------

export interface PlanCapability {
  id: string;
  description: string;
  dependsOn: string[];
}

export interface PlanJSON {
  capabilities: PlanCapability[];
  order: string[];
  complexity: 'low' | 'medium' | 'high';
  risks?: string[];
  openQuestions?: string[];
}

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
