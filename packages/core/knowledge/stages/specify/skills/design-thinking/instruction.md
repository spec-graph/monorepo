# Design Thinking — specify stage methodology (BMAD style)

## Purpose

Apply human-centered design thinking to understand users deeply before writing a proposal. Design thinking prevents building technically correct but user-hostile features.

## Stance

- **Empathize first.** Understand who the user is before deciding what to build.
- **Reframe the problem.** The initial problem statement is rarely the real problem.
- **Bias toward action.** Build prototypes, don't just theorize.
- **Embrace iteration.** Design thinking is cyclical, not linear.

## 5 Phases

### 1. Empathize

Understand the users and their context.

**Techniques:**
- **User Interviews**: Talk to 2-3 users (or personas if no real users)
- **Observation**: Watch users interact with the current system
- **Empathy Mapping**: What do users SAY, THINK, DO, FEEL?

**Output:**
- 1-3 user personas with clear goals and pain points
- Context of use (when/where/how users interact with the feature)

### 2. Define

Reframe the problem based on empathy insights.

**Techniques:**
- **Point of View Statement**: "User [type] needs [need] because [insight]"
- **How Might We questions**: "How might we [solve the re-framed problem]?"
- **Problem Statement**: Clear, actionable, user-centered

**Output:**
- A re-framed problem statement
- 2-3 "How Might We" questions

### 3. Ideate

Generate many solutions.

**Techniques:**
- **Brainstorming** (see brainstorming skill)
- **Crazy 8s**: 8 ideas in 8 minutes
- **Sketching**: Visual ideas, not just text

**Output:**
- 10-20 potential solutions
- 3-5 shortlisted for prototyping

### 4. Prototype

Build low-fidelity representations of top ideas.

**Techniques:**
- **Paper Prototypes**: Sketch UI flows on paper
- **API Mockups**: Sketch API request/response pairs
- **Data Flow Diagrams**: Sketch data movement
- **User Journey Sketches**: Visualize user interaction

**Output:**
- 1-3 low-fidelity prototypes
- User flow diagrams

### 5. Test

Validate prototypes with users (or mentally simulate user interaction).

**Techniques:**
- **User Testing**: Walk through the prototype with a user
- **Heuristic Evaluation**: Check against usability principles
- **Mental Walkthrough**: Imagine being the user at each step

**Output:**
- Validated solution (or iterate back to earlier phase)
- Key learnings

## Application to Proposal Writing

Before writing a proposal, complete at least phases 1-2:

### Phase 1: Empathize → User Personas

```markdown
## User Personas

### Primary: Customer
- Has an email address and wants to save order history
- Values security and convenience
- Pain point: Can't access past orders from different devices

### Secondary: Admin
- Manages user accounts
- Values audit logs and compliance
- Pain point: Can't see who did what
```

### Phase 2: Define → Problem Statement

```markdown
## Problem Statement

**Point of View**: Customers need a way to securely access their account data because they want to see order history from multiple devices.

**How Might We**:
- How might we let customers authenticate securely?
- How might we make login convenient without sacrificing security?
- How might we handle forgotten passwords gracefully?
```

### Incorporate into Proposal

After completing phases 1-2, write the proposal. The proposal's User Personas and User Stories sections should directly reflect the empathy and define phases.

## When to Skip Design Thinking

- **Pure refactoring**: No user impact, skip empathy
- **Bug fixes with clear repro**: The problem is already well-defined
- **Infrastructure changes**: User perspective is indirect
- **Well-understood features**: Prior research already done

## Common Pitfalls

- **Pitfall: Skipping empathy.** If you don't know the user, you'll build for yourself.
- **Pitfall: Over-investing in design thinking.** For simple changes, 5 minutes of empathy is enough.
- **Pitfall: Treating design thinking as linear.** It's iterative — go back to earlier phases as you learn.
- **Pitfall: Not testing.** Prototypes without testing are guesses.

## Self-Check Questions

- Did I identify 1-3 specific user personas?
- Did I reframe the problem from the user's perspective?
- Are the User Stories in my proposal based on empathy insights?
- Did I test my mental model against real user scenarios?
