---
name: sebastien-lempens-typography
description: >
  Font families, weights, and type scale details.
---

# Typography System — sebastien-lempens

This skill provides the typography scale and font declarations for the sebastien-lempens design.

## Font Families
- **radikalthin**
- **zen dots**

## Google Fonts / Typography Imports
Use these fonts in your projects:
```css
@import url('https://fonts.googleapis.com/css2?family=Zen+Dots:wght@400&display=swap');
/* Add other family imports if found in CSS: */
/* Google Fonts import candidate for: radikalthin */
/* Google Fonts import candidate for: zen dots */
```

## Typography Scale Table
| Font Size | Weight | Line Height | Letter Spacing | Font Family | Element Count |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 13.3333px | 400 | normal | normal | zen dots | 2 |
| 16px | 400 | normal | normal | radikalthin | 14 |
| 24px | 400 | normal | normal | zen dots | 1 |

## Font Style Guidelines
- Headings (h1-h6) should match the sizes, weights, and line-heights listed in the scale.
- Tightly-tracked display text (e.g. `letter-spacing: -0.02em` or negative ems) should be used for large hero headers.
- Wide letter-spacing (`letter-spacing: 0.1em` or more) combined with `text-transform: uppercase` should be used for small caption labels, eyebrows (e.g. "PROJECTS", "AWARDS").
- Body text should use a clean sans-serif with a line height of `1.5` to `1.625` to ensure readability.
