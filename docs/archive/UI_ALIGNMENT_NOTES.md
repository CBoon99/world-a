# World A UI Alignment Notes

**Date:** 2026-02-14  
**Goal:** Match Embassy Trust Protocol visual style — clean, neutral, professional, agent-first

---

## Pages Changed

| Page | Path | Changes |
|------|------|---------|
| **Homepage** | `public/index.html` | Full rebuild with shared CSS, nav, Embassy-family design |
| **Shared CSS** | `public/styles.css` | NEW — design system extracted |

---

## Design Rules

### Colors
- Background: `#fafafa` (off-white)
- Cards: `#ffffff` with `1px solid #d1d5db` border
- Accent: `#2563eb` (blue)
- Text: `#24292f` (near-black)
- Muted: `#57606a` (gray)
- Success banners: green tint (`#f0fdf4`)
- Info banners: blue tint (`#eff6ff`)

### Typography
- System UI stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...`
- Body: 1.65 line-height
- Headings: -0.02em letter-spacing, 700-800 weight

### Layout
- Container: max-width 1120px, centered
- Sections: alternating white/off-white backgrounds
- Cards: 10px radius, subtle shadow, 1px border
- Grid: auto-fit with minmax for responsive

### Navigation
- Sticky top nav, white background, bottom border
- Brand left, links right
- Links: 0.9rem, 500 weight, subtle hover background
- Mobile: wraps/stacks cleanly

### Buttons
- Primary: solid accent blue, white text
- Secondary: light gray background, dark text, subtle border

### Components
- `.card` — bordered card with shadow
- `.flow-step` — numbered step with circle
- `.banner` — callout (success/info variants)
- `.endpoint-list` — API endpoint display
- `.grid-2`, `.grid-3`, `.grid-4` — responsive grids

---

## Remaining UI Debt

1. **`/for-agents` page** — Still uses inline styles, not shared CSS. Should be migrated to use `styles.css` + nav.
2. **`/safety`, `/founding`, `/docs` index pages** — Each has its own inline styles. Could be migrated but are functional.
3. **Admin pages** — `admin/index.html`, `admin/embassy.html` — Internal tools, lower priority.
4. **Archive pages** — `archive/` — Historical, functional, low priority.
5. **Dark mode** — Not implemented. Could be added via `prefers-color-scheme` media query.
6. **Templates page** — `templates/index.html` — SPC remnant. Content updated but not visually aligned.

---

## CSS File

All shared styles are in `public/styles.css`. Pages link it with:
```html
<link rel="stylesheet" href="/styles.css">
```

No build step required. Pure CSS. Fast loading.

---

**Status:** Homepage aligned. Shared CSS created. Other pages can be migrated incrementally.
