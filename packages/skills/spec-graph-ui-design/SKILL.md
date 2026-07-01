---
name: spec-graph-ui-design
description: Guide the host agent to design user interfaces (wireframes, component tree, design system) before implementation. Ensures consistency, accessibility, and user-centered design.
license: MIT
compatibility: Requires spec-graph v2+.
metadata:
  author: spec-graph
  version: "2.0"
---

Design user interfaces before implementation.

## When to use

- Before implementing UI features
- When adding new components to the design system
- When redesigning existing flows

## Steps

### 1. Document user flows

For each user-facing flow:
- Entry point (how user arrives)
- Steps (what user does)
- Decision points (branches)
- Error states
- Empty states
- Loading states
- Success state (how user exits)

### 2. Define component tree

Organize components:
- **Atomic**: button, input, label, card
- **Molecular**: search-bar (input + button), form-field (label + input + error)
- **Organisms**: header, footer, sidebar
- **Pages**: route-level components

### 3. Specify design tokens

```yaml
colors:
  primary: '#0066cc'
  secondary: '#666666'
  background: '#ffffff'
  text: '#333333'
  error: '#cc0000'

typography:
  h1: '24px / 1.4'
  body: '14px / 1.5'
  small: '12px / 1.4'

spacing:
  small: '8px'
  medium: '16px'
  large: '24px'

borderRadius:
  small: '4px'
  medium: '8px'
```

### 4. Accessibility requirements

- WCAG AA compliance (contrast ratio ≥ 4.5:1 for text)
- Keyboard navigation (Tab, Enter, Escape)
- Screen reader support (ARIA labels, semantic HTML)
- Focus management (visible focus indicator)
- Alt text for images
- Form labels associated with inputs

### 5. Responsive design

- Mobile-first (320-768px)
- Tablet (768-1024px)
- Desktop (1024+)
- Breakpoints and grid system
- Touch targets ≥ 44x44px on mobile

## Edge cases

- **User research needed**: For complex features, recommend research before design
- **No existing design system**: propose a minimal token set
- **Accessibility constraints**: design for keyboard from the start, not as an afterthought
- **Mobile vs desktop**: design mobile-first, then enhance for desktop

## Self-check questions

- Are all user flows documented?
- Is the component tree consistent?
- Are design tokens defined and used?
- Are accessibility requirements met?
- Is the design responsive?
