---
name: sebastien-lempens-layout
description: >
  Grid, spacing, and layout tokens.
---

# Layout & Grid System — sebastien-lempens

This skill provides the structure, spacing scale, box margins, padding patterns, and responsive breakpoints of sebastien-lempens.

## Spacing Scale
The spacing values are snapped and bucketed to standard increments:
- `4px`
- `12px`
- `16px`
- `20px`
- `24px`

## Border-Radius Scale
Including corner radii for cards, buttons, pills, and images:

### Radius Tokens (Categorized)
- **Small (sm)**: `0px`, `3px`, `4px`
- **Medium (md)**: `5px`, `8px`
- **Large (lg)**: `10px`
- **Full (full/pill)**: `25px`, `50px`, `50%`


## Responsive Breakpoints
Breakpoints extracted from stylesheet media queries:
- `430px` breakpoint (derived from stylesheet media query)

## Container Max-Widths
Detected wrapper sizes:
- `1200px` (Standard desktop wrapper max-width)

## Z-Index Elevation Layers
| Value | Suggested Semantic Layer Role |
| :--- | :--- |
| `1` | elevated |

## Layout Guidelines
- Sections should use page gutters matching the spacing scale (typically 1.5rem to 2rem).
- Grid layouts typically collapse from multi-column rows on desktop to 1-column layouts on mobile breakpoints.
