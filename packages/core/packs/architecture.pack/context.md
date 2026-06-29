# Architecture Pack Context

## When This Pack Activates
- Profile dimension `criticality` != `prototype`
- All non-trivial projects need architecture decisions

## What This Pack Provides
- C4 architecture diagrams (Context, Container, Component)
- ADR (Architecture Decision Records)
- Architecture readiness gate

## Key Artifacts
- `design/c4` — C4 model diagrams
- `design/adr` — Architecture Decision Records
- `design/readiness` — Architecture readiness checklist

## Agent Guidance
- Architecture documents must be produced BEFORE implementation
- Every significant technical decision should have an ADR
- C4 Level 1 (Context) is minimum; Level 2 (Container) for multi-service
- Architecture review gate blocks implementation until approved
