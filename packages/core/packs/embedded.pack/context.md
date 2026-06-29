# Embedded Pack Context

## When This Pack Activates
- Profile dimension `deployment` = `firmware`
- Profile dimension `boundary` = `hardware-iface`

## What This Pack Provides
- Firmware specification template
- HIL (Hardware-in-the-Loop) testing acceptance layer
- Contract federation support (firmware consumes external API contracts)

## Key Artifacts
- `design/firmware-spec` — Firmware specification
- `contract/register-map` — Hardware register definitions
- `implementation/firmware` — Firmware source code

## Agent Guidance
- Memory constraints are hard limits (Flash/RAM), not soft budgets
- Register maps are contracts — changing them breaks hardware compatibility
- HIL testing replaces browser E2E for deployment-level acceptance
- Federated topology: firmware binds to external API contract version
