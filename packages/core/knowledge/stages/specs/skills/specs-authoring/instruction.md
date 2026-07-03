# Specs Authoring — design stage methodology (spec files)

## Purpose

Create specification files that define WHAT the system should do. One spec per capability listed in the proposal's Capabilities section.

## Stance

- **Requirements, not implementation.** Specs say "what" — implementation says "how". Keep the boundary.
- **Testable.** Every requirement must have at least one scenario. Scenarios are potential test cases.
- **Deterministic language.** Use SHALL/MUST for normative requirements. Avoid should/may except when explicitly describing optional behavior.
- **Traceability.** Each requirement links back to a capability in the proposal.

## Delta operations (for modifying existing specs)

Use these headers to express changes to existing specs:

- **ADDED Requirements**: new capabilities
- **MODIFIED Requirements**: changed behavior — MUST include the full updated content (partial modifications lose detail at archive time)
- **REMOVED Requirements**: deprecated features — MUST include Reason and Migration sections
- **RENAMED Requirements**: name changes only — use FROM:/TO: format

## Common pitfalls

- **Pitfall: 3-hashtag scenarios.** Scenarios MUST use exactly 4 hashtags (`#### Scenario:`). Using 3 hashtags or bullets will fail silently during archive.
- **Pitfall: Partial MODIFIED content.** When using MODIFIED, copy the ENTIRE requirement block and edit. Partial modifications lose details.
- **Pitfall: "should" instead of "shall".** "The system should..." is ambiguous. Use "The system SHALL...".
- **Pitfall: Requirement without scenario.** Every requirement MUST have at least one scenario. If you can't write a scenario, the requirement is too vague.

## MODIFIED requirements workflow

1. Locate the existing requirement in the project's existing specs
2. Copy the ENTIRE requirement block (from `### Requirement:` through all scenarios)
3. Paste under `## MODIFIED Requirements` and edit to reflect new behavior
4. Ensure header text matches exactly (whitespace-insensitive)

## Self-check questions

- Does every requirement have a scenario?
- Are all scenarios 4-hashtag level?
- Are normative statements using SHALL/MUST?
- Do MODIFIED requirements include the full updated content?
