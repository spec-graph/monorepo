# Security Hardening — review stage methodology

## Purpose

Review the implementation for security vulnerabilities, OWASP Top 10 compliance, and security best practices. Security hardening is distinct from general code review — it focuses specifically on attack surface and defense.

## Stance

- **Think like an attacker.** What would you exploit if you wanted to break this?
- **Defense in depth.** One layer of security is never enough.
- **Assume compromise.** Your API keys WILL leak. Your database WILL be exposed. Design for it.
- **Prefer secure defaults.** If the developer has to remember to "enable security," it's not secure.

## Required Checks

### Input Validation (OWASP A03: Injection)
- [ ] All user input is validated server-side (never trust client-side only)
- [ ] SQL queries use parameterized queries (not string concatenation)
- [ ] File paths are sanitized (prevent path traversal)
- [ ] Command execution uses argument arrays (not string concatenation)

### Authentication (OWASP A07)
- [ ] Passwords hashed with bcrypt (cost ≥ 10) or argon2
- [ ] Passwords never logged or returned in API responses
- [ ] Tokens have expiration (access: 15min, refresh: 7d)
- [ ] Rate limiting on login endpoints (prevent brute force)
- [ ] Session invalidation on logout

### Authorization (OWASP A01)
- [ ] Every protected endpoint checks authorization
- [ ] Default is DENY, not ALLOW
- [ ] Role checks happen server-side (never trust client roles)
- [ ] No IDOR (Insecure Direct Object Reference) — users can't access other users' data by changing IDs

### Secrets Management
- [ ] Secrets from environment variables (never hardcoded)
- [ ] No secrets in logs, error messages, or response bodies
- [ ] `.env` files are in `.gitignore`
- [ ] API keys and tokens are rotated regularly

### Network Security
- [ ] HTTPS enforced (redirect HTTP to HTTPS)
- [ ] CORS configured with explicit origins (not `*`)
- [ ] Security headers: `Helmet` or manual headers
  - Content-Security-Policy
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - Strict-Transport-Security

### Data Protection (OWASP A02)
- [ ] Sensitive data encrypted at rest
- [ ] Passwords not stored in plaintext
- [ ] Personal data subject to GDPR/compliance requirements
- [ ] Database backups encrypted

### Dependency Security
- [ ] Dependencies are up-to-date (`npm audit` clean)
- [ ] No known vulnerable packages
- [ ] Lockfile committed (prevent supply chain attacks)

## Common Pitfalls

- **Pitfall: "It's internal, no need for security."** Internal systems get compromised too. Secure them.
- **Pitfall: Rolling your own crypto.** Use established libraries (bcrypt, jsonwebtoken, crypto). Never invent encryption.
- **Pitfall: Security as an afterthought.** Add security checks at review time, not in production.
- **Pitfall: Trusting user input.** JSON payloads, query parameters, headers — all are attacker-controlled.

## Severity Classification

| Severity | Example | Action |
|----------|---------|--------|
| Blocker | SQL injection, hardcoded secret, no auth on admin endpoint | Must fix before merge |
| Major | Missing CSRF token, weak password policy, plaintext password in log | Should fix before merge |
| Minor | Missing security header, outdated dependency, verbose error messages | Fix in next iteration |
| Nitpick | Using deprecated security API | Optional |

## Self-Check Questions

- Did I check every user input for validation?
- Did I check for hardcoded secrets?
- Did I verify auth/authorization on every protected endpoint?
- Did I check for injection vulnerabilities?
- Are passwords properly hashed?
