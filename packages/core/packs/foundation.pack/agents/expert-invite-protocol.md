# Expert Invitation Protocol

> How the meeting facilitator identifies and invites domain experts to participate.

## When to Invite

During a meeting round, if any participant identifies a **knowledge gap** —
something they don't know but need to know to produce good requirements —
the facilitator considers inviting a domain expert.

Signals that an expert is needed:

- A participant says "I don't know the regulatory requirements for..."
- A participant asks "What are the industry standards for..."
- A participant challenges with "In domain X, this is usually done by..."
- The discussion reaches a topic that no core participant has expertise in

## How to Invite

### Step 1: Identify the Expertise Needed

The facilitator extracts the domain from the knowledge gap:

- "regulatory requirements for financial data" → need: **financial compliance expert**
- "accessibility standards for government sites" → need: **a11y compliance expert**
- "performance characteristics of this database" → need: **database performance expert**

### Step 2: Check Available Experts

The facilitator checks:

1. **Agent-based experts**: Does any active pack provide an agent with this expertise?
   - ddd.pack provides `domain-expert` for DDD domain modeling
   - Future packs may provide other domain experts
2. **Human experts**: Is there a human expert the user can contact?
   - The facilitator pauses the meeting and asks the user

### Step 3: Invite to the Meeting

The expert joins as an `invite_only` participant:

- They receive the **full discussion history** as context
- They receive a **specific prompt**: "Here's the discussion. The team needs your expertise on [topic]. Please share your knowledge."
- They contribute a `statement` in the next round

### Step 4: Integration

After the expert contributes:

- Core participants can ask the expert questions in the next round
- The expert may participate in multiple rounds if needed
- Once their expertise is integrated, they can be dismissed

## Expert Declaration in Packs

Domain packs can declare experts as agents:

```yaml
# ddd.pack/pack.yaml
agents:
  - id: domain-expert
    description: "DDD Domain Expert — provides domain modeling knowledge"
    prompt_ref: agents/domain-expert-agent.md
    model_tier: capable
    input_artifact_kinds: [requirement/*]
    output_artifact_kinds: [design/*]
    actions: [specify, design]

# When a requirements-meeting needs DDD expertise,
# the facilitator can invite domain-expert to join
```

The meeting declaration's `expert_invite_protocol` field points to this
document, which the facilitator reads to know how to identify and invite
available experts.
