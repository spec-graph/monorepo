# Test Strategy — test stage methodology

## Purpose

Verify the implementation through tests. Tests are the objective evidence that the code does what the spec says.

## Stance

- **Test behavior, not implementation.** Tests should verify what the code DOES, not how it does it.
- **Test the spec.** Each spec requirement should have at least one corresponding test.
- **Test edge cases.** The happy path is necessary but not sufficient. Test boundary conditions, error cases, null inputs.
- **Readable tests.** Tests are documentation. Someone should be able to read the tests to understand what the code does.

## Test pyramid

- **Unit tests**: Test individual functions/methods in isolation. Fast, numerous.
- **Integration tests**: Test interactions between components. Slower, fewer.
- **E2E tests**: Test the whole system from the outside. Slowest, fewest.

Aim for many unit tests, some integration tests, a few critical e2e tests.

## Writing tests

### Structure

Use Arrange-Act-Assert (AAA) or Given-When-Then:

```typescript
describe('UserService', () => {
  it('should reject duplicate emails', async () => {
    // Arrange
    const service = new UserService();
    await service.createUser({ email: 'a@b.com', ... });

    // Act + Assert
    await expect(service.createUser({ email: 'a@b.com', ... }))
      .rejects.toThrow('Email already exists');
  });
});
```

### Naming

Test names should describe the behavior:
- ✓ `should reject duplicate emails`
- ✗ `test1` or `test create user`

## Common pitfalls

- **Pitfall: Testing implementation details.** Don't assert on internal state — assert on behavior.
- **Pitfall: Brittle tests.** Tests that break when you rename a variable are too tightly coupled.
- **Pitfall: Happy-path-only.** The bug is always in the edge case. Test edge cases.
- **Pitfall: Untested error paths.** If you catch an error, test that the error is caught correctly.
- **Pitfall: Slow tests.** If your test suite takes 5 minutes, developers will stop running it. Keep tests fast.

## Self-check questions

- Does every spec requirement have a test?
- Do I test edge cases and error paths?
- Are test names descriptive?
- Does the test suite run in reasonable time?
- If I delete a line of code, does a test fail?
