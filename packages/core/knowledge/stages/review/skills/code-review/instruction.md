# Code Review — review stage methodology

## Purpose

Review the implementation for quality, security, correctness, and design compliance. The review produces a list of findings that must be resolved or explicitly accepted before moving on.

## Stance

- **Be constructive.** Findings should help the author improve the code, not just point out problems.
- **Be specific.** "This could be better" is not a finding. "This function should handle the null case because X" is.
- **Prioritize.** Not all findings are equal. Classify: blocker / major / minor / nitpick.
- **Verify, don't assume.** Read the code. Run it if needed. Don't guess.

## Review dimensions

### Correctness
- Does the code do what the spec says?
- Are edge cases handled?
- Are error paths handled?

### Security
- Is input validated/sanitized?
- Are secrets handled properly (env vars, not hardcoded)?
- Is there any risk of injection (SQL, XSS, command)?
- Are auth/authz checks in place where needed?

### Design compliance
- Does the implementation match design.md?
- Are technical decisions respected?
- Is the architecture intact?

### Maintainability
- Is the code readable?
- Are names clear and consistent?
- Are comments explaining "why" not "what"?
- Is there unnecessary duplication?

### Testing
- Is the new code tested?
- Do tests cover the happy path and edge cases?
- Are tests readable and maintainable?

## Common pitfalls

- **Pitfall: Style-nitpick-only reviews.** Don't spend all your time on formatting. Focus on correctness, security, design.
- **Pitfall: Rubber-stamping.** "LGTM" without actually reading is worse than no review.
- **Pitfall: Blocking on nits.** If something is a nitpick, mark it as such. Don't block the whole change on style.
- **Pitfall: Missing security review.** Security-sensitive code MUST be explicitly reviewed. Don't assume "it's probably fine".

## Finding format

For each finding:
```
[<severity>] <file>:<line> — <short description>

<Explanation of the issue and why it matters.>

Suggested fix: <concrete suggestion>
```

Severity levels:
- **blocker**: must fix before merge
- **major**: should fix before merge
- **minor**: fix if easy, otherwise track
- **nitpick**: optional, style preference

## Self-check questions

- Did I read every changed file?
- Did I check security-sensitive code explicitly?
- Did I verify against the spec?
- Are my findings specific and actionable?
- Did I classify severity correctly?
