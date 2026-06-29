---
name: spec-graph-contract
description: "Manage contract registry: publish API/schema contracts, bind consumers to versions, detect drift, and verify currency."
---

# spec-graph contract

Federated contract management.

## Usage

```bash
spec-graph contract list
spec-graph contract publish <id> --ver <v>
spec-graph contract bind <id> --consumer <track> --ver <v>
spec-graph contract drift        # Detect stale/broken consumers
spec-graph contract reverify <id>
