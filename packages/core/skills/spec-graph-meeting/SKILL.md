---
name: spec-graph-meeting
description: "Multi-agent meeting protocol: ad-hoc or pack-declared meetings with structured rounds, dynamic convergence, and expert invite protocol."
---

# spec-graph meeting

Multi-agent collaborative discussion.

## Usage

```bash
spec-graph meeting init <id> --purpose "..." --participants "agent:perspective,..."
spec-graph meeting record <id> --participant <agent> --type statement|question|challenge
spec-graph meeting advance <id>
spec-graph meeting complete <id> --summary "..."
