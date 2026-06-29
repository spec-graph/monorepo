# Frontend Pack Context

## When This Pack Activates
- Profile dimension `has_ui` = `web` or `native` or `gui`

## What This Pack Provides
- UX artifacts (wireframes, user flows)
- Frontend implementation track
- System-level acceptance checks (Lighthouse, a11y, E2E browser)

## Key Artifacts
- `design/wireframe` — UI wireframes before implementation
- `design/user-flows` — User journey maps
- `implementation/frontend` — Frontend source code

## Agent Guidance
- Frontend agents should use React/Vue/Svelte based on project config
- Always check `contract/openapi` for API bindings
- Accessibility (a11y) is a first-class concern, not an afterthought
- Performance budget: LCP < 2.5s, FID < 100ms, CLS < 0.1
