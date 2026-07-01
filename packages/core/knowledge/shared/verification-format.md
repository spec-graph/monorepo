# Verification Result Format

Standard format for agent-returned verification results (used in accept stage and anywhere else structured verification is needed).

## Format

```json
{
  "scenarios": [
    {
      "name": "<scenario-name>",
      "spec": "<path-to-spec>#<scenario-id>",
      "action": {
        "method": "POST",
        "path": "/login",
        "body": { "email": "test@example.com", "password": "pw" }
      },
      "expected": {
        "statusCode": 200,
        "bodyContains": {
          "token": "<any string>"
        }
      },
      "actual": {
        "statusCode": 200,
        "body": {
          "token": "eyJ..."
        }
      },
      "pass": true,
      "notes": "optional notes from the agent"
    }
  ],
  "summary": {
    "total": 10,
    "passed": 10,
    "failed": 0,
    "duration": "2.3s"
  }
}
```

## Validation Rules

spec-graph validates:
- Every scenario has name, spec, action, expected, actual, pass
- pass must match expected vs actual comparison
- summary counts must match scenario passes/failures
- spec references must point to existing spec scenarios
