---
name: sebastien-lempens-color-system
description: >
  Brand color palette and semantic tokens.
---

# Brand Color System — sebastien-lempens

This skill provides the color tokens and semantic variables extracted from [sebastien-lempens](https://sebastien-lempens.com/).

## Design Personality Context
Modern web design system

## Color Tokens Table (Light / Base)
| Variable | Hex | HSL | Role | Frequency |
| :--- | :--- | :--- | :--- | :--- |
| None | `#000000` | `hsl(0, 0%, 0%)` | primary | 100 |
| None | `#0000ee` | `hsl(240, 100%, 47%)` | None | 64 |
| None | `#ffffff` | `hsl(0, 0%, 100%)` | inverse-text | 47 |
| None | `#272727` | `hsl(0, 0%, 15%)` | background | 5 |
| None | `#8b7082` | `hsl(320, 11%, 49%)` | None | 5 |
| None | `#d3b3c9` | `hsl(319, 27%, 76%)` | None | 4 |
| None | `#7b5b69` | `hsl(334, 15%, 42%)` | None | 2 |
| None | `#1d1619` | `hsl(334, 14%, 10%)` | None | 2 |
| --france-color | `#e6e6e6` | `hsl(0, 0%, 90%)` | None | 2 |
| None | `#ffbb00` | `hsl(44, 100%, 50%)` | None | 1 |
| None | `#fee8cd` | `hsl(33, 96%, 90%)` | None | 1 |
| None | `#cddcfe` | `hsl(222, 96%, 90%)` | None | 1 |
| None | `#340510` | `hsl(346, 82%, 11%)` | None | 1 |
| None | `#71556b` | `hsl(313, 14%, 39%)` | None | 1 |
| None | `#ac82a3` | `hsl(313, 20%, 59%)` | None | 1 |
| None | `#876473` | `hsl(334, 15%, 46%)` | None | 1 |
| None | `#d4c4cb` | `hsl(334, 16%, 80%)` | None | 1 |
| None | `#7c5b72` | `hsl(318, 15%, 42%)` | None | 1 |
| None | `#bf8c98` | `hsl(346, 28%, 65%)` | None | 1 |
| None | `#5e3f59` | `hsl(310, 20%, 31%)` | None | 1 |
| None | `#f3edf2` | `hsl(310, 20%, 94%)` | None | 1 |
| None | `#644563` | `hsl(302, 18%, 33%)` | None | 1 |
| None | `#f0eff0` | `hsl(300, 3%, 94%)` | None | 1 |
| None | `#5c4655` | `hsl(319, 14%, 32%)` | None | 1 |


## Color Tokens Table (Dark Mode overrides)
| Variable | Hex | HSL | Role | Frequency |
| :--- | :--- | :--- | :--- | :--- |
| None | `#000000` | `hsl(0, 0%, 0%)` | None | 23 |
| None | `#0000ee` | `hsl(240, 100%, 47%)` | None | 16 |
| None | `#ffffff` | `hsl(0, 0%, 100%)` | None | 9 |
| None | `#272727` | `hsl(0, 0%, 15%)` | None | 1 |
| None | `#8b7082` | `hsl(320, 11%, 49%)` | None | 1 |
| None | `#d3b3c9` | `hsl(319, 27%, 76%)` | None | 1 |


## CSS Variables block
```css
:root {
  --france-color: #e6e6e6; /* HSL: hsl(0, 0%, 90%) | Role:  */
}
.dark {
}
```

## Shadows & Elevation Systems
- Flat design; no distinct static box-shadows detected in stylesheets.

## AI Design Guidelines
- Use the **primary** background and foreground colors to establish high contrast.
- Use **accent** and **brand-*** variables sparingly for interactive call-to-actions, buttons, hover states, and highlights.
- Semantic roles indicate typical context: `background`, `foreground`, `muted`, `accent`, `destructive`, and `surface`.
