# E2E Verification — accept stage methodology

## Purpose

End-to-end verification that the system works as a whole. This is the last gate before integration — we verify real behavior, not just unit tests.

## Stance

- **Real scenarios.** Use actual HTTP requests (or equivalent), not mocks.
- **Spec-driven.** Every spec scenario should have a corresponding e2e scenario.
- **Objective.** Verification results are structured (status code, response body, pass/fail). No ambiguity.
- **Reproducible.** Anyone can re-run the verification and get the same result.

## Process

1. **Start the application** in a clean environment
2. **Execute scenarios** — for each spec scenario:
   - Perform the triggering action (e.g., POST /login with valid credentials)
   - Capture the actual outcome (status code, response body)
   - Compare against expected outcome (from spec)
3. **Generate structured report** — JSON format:
   ```json
   {
     "scenarios": [
       {
         "name": "login with valid credentials",
         "spec": "specs/auth/spec.md#scenario-login-success",
         "expected": { "statusCode": 200, "hasField": "token" },
         "actual": { "statusCode": 200, "body": { "token": "..." } },
         "pass": true
       }
     ],
     "summary": { "total": 10, "passed": 10, "failed": 0 }
   }
   ```
4. **Validate report** — spec-graph checks each scenario against expected outcomes

## Common pitfalls

- **Pitfall: Mocking in e2e.** E2E means REAL. No mocks. If you need a database, use a real test database.
- **Pitfall: Flaky scenarios.** If a scenario passes sometimes and fails others, it's flaky. Fix it or remove it.
- **Pitfall: Untested spec scenarios.** Every spec scenario MUST have an e2e scenario. If a spec scenario can't be tested e2e, question why.
- **Pitfall: Manual verification.** Verification should be automated and reproducible. "I clicked around and it seemed fine" is not verification.

## Self-check questions

- Does every spec scenario have an e2e scenario?
- Are scenarios using real requests (not mocks)?
- Are results structured (machine-readable)?
- Can I re-run this and get the same result?
- Did the user review and approve the verification report?
