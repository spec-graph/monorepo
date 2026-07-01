# UI Design — methodology

## Purpose

Design user interfaces (wireframes, component tree, design system) before implementation. UI design ensures consistency, accessibility, and user-centered design.

## Stance

- **Design from user perspective.** What does the user see and do?
- **Reuse design system components.** Don't reinvent the wheel.
- **Accessibility is not optional.** WCAG compliance from day one.
- **Mobile-first responsive design.**

## Required Sections

### User flows
- Step-by-step user interactions
- Decision points
- Error states
- Empty states
- Loading states

### Component tree
- Atomic components (button, input, card)
- Molecular components (search bar with input + button)
- Organisms (header, footer, sidebar)
- Pages

### Design tokens
- Color palette
- Typography scale
- Spacing scale
- Component variants (primary, secondary, disabled)
- Border radius
- Shadows

### Accessibility
- Color contrast (WCAG AA minimum)
- Keyboard navigation
- Screen reader support (ARIA labels)
- Focus management
- Alt text for images

### Responsive design
- Mobile (320-768px)
- Tablet (768-1024px)
- Desktop (1024+)
- Breakpoints and grid system

## Common Pitfalls

- **Pitfall: Designing without user research.** Don't guess user needs.
- **Pitfall: Ignoring mobile.** Design mobile-first, then scale up.
- **Pitfall: Inconsistent design tokens.** Use a design system, not ad-hoc values.
- **Pitfall: No empty/error states.** Every state needs design.

## Self-Check Questions

- Are all user flows documented?
- Is the component tree consistent (atomic/molecular/organism)?
- Are design tokens defined and used consistently?
- Are accessibility requirements met?
- Is the design responsive across all breakpoints?
