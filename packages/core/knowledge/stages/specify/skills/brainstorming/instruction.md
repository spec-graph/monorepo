# Brainstorming — specify stage methodology (BMAD style)

## Purpose

Use structured brainstorming techniques to explore the problem space BEFORE writing a proposal. Brainstorming prevents premature commitment to a single solution and surfaces options that a linear approach would miss.

## Stance

- **Defer judgment.** Generate ideas first, evaluate later. Criticism during brainstorming kills creativity.
- **Quantity over quality (initially).** The goal is many options. Refinement comes after.
- **Combine and build.** "Yes, and..." rather than "No, but..."
- **Challenge assumptions.** Ask "what if the opposite were true?" and "what are we taking for granted?"

## 36 Techniques (7 categories)

### 1. Collaborative (group-oriented)
- **Brainwriting**: Each person writes ideas silently, then shares
- **Round-robin**: Each person contributes one idea in turn
- **Starbursting**: Generate questions about Who/What/Where/When/Why/How

### 2. Structured (methodical)
- **SCAMPER**: Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse
- **Attribute Listing**: List attributes of the problem, vary each
- **Morphological Analysis**: Break into dimensions, combine variants

### 3. Creative (lateral thinking)
- **Random Word**: Pick a random word, force connection to the problem
- **Reverse Brainstorm**: Think of ways to make the problem WORSE, then reverse
- **Analogies**: "How would X solve this?" (e.g., "How would an airline solve this?")

### 4. Deep (analytical)
- **Five Whys**: Ask "why" 5 times to reach root cause
- **Fishbone (Ishikawa)**: Categorize causes by type
- **Pareto Analysis**: Focus on 20% of causes that create 80% of effects

### 5. Theatrical (role-play)
- **Role Storming**: Adopt a persona (CEO, user, competitor) and brainstorm
- **Reverse Role**: Brainstorm from the perspective of the "opponent"
- **Six Thinking Hats**: De Bono's 6 perspectives (facts, emotions, caution, optimism, creativity, process)

### 6. Wild (unconstrained)
- **Worst Possible Idea**: Generate intentionally bad ideas to unlock creative space
- **Fantasy Fulfillment**: Imagine the magic solution, then work backward
- **Absurd Constraints**: "What if we had unlimited budget?" / "What if it had to be done in 1 day?"

### 7. Introspective (reflective)
- **Mind Mapping**: Visual idea mapping from a central concept
- **Free Association**: Write every word that comes to mind about the problem
- **Journaling**: Write continuously for 10 minutes without stopping

## Recommended Brainstorming Process

### Before writing a proposal, spend 15-30 minutes:

1. **Define the problem** (1 sentence)
   - What problem are we solving?

2. **Generate options** (10 min, 15-20 ideas)
   - Use 2-3 techniques from different categories
   - Write every idea, even bad ones

3. **Cluster and theme** (5 min)
   - Group similar ideas
   - Name each cluster

4. **Evaluate top 3** (10 min)
   - Pick the 3 most promising clusters
   - For each: what's the user benefit? what's the risk?

5. **Choose approach** (5 min)
   - Pick the best approach OR
   - Combine elements from multiple approaches

## Common Pitfalls

- **Pitfall: Jumping to the first idea.** The first idea is rarely the best. Force yourself to generate alternatives.
- **Pitfall: Premature evaluation.** Don't judge ideas while generating. Separate generation from evaluation.
- **Pitfall: Brainstorming alone.** Even solo, pretend you're in a group. Write from different perspectives.
- **Pitfall: Skipping brainstorming.** The time spent (15-30 min) saves hours of rework later.

## When to Skip Brainstorming

- Very small changes (1-2 files, obvious solution)
- Bug fixes with clear root cause
- Routine maintenance (dependency updates, config changes)
- When the problem is well-understood from prior analysis

## How to Include in Proposal

After brainstorming, add a brief section to the proposal:

```markdown
## Alternatives Considered

**Approach A (chosen)**: JWT authentication with refresh tokens
- Pros: Standard, stateless, mobile-friendly
- Cons: More complex token management

**Approach B**: Session-based auth
- Pros: Simpler implementation
- Cons: Not stateless, harder to scale

**Approach C**: OAuth only
- Pros: Industry standard
- Cons: Requires third-party dependency, overkill for this use case
```

This shows the decision was considered, not arbitrary.

## Self-Check Questions

- Did I generate at least 3 distinct approaches?
- Did I evaluate each approach against user benefit?
- Is my chosen approach the best fit for the constraints?
- Did I document alternatives in the proposal?
