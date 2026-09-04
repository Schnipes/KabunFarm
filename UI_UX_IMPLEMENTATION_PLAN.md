# Kabun Farm UI/UX Enhancement Implementation Plan

## 1. Overview & Objectives
This document outlines the step-by-step implementation plan for the UI/UX refactoring and accessibility overhaul of **Kabun Farm Intelligence**. The primary objectives are:
- **Field Ergonomics:** Standardize all interactive touch targets to a minimum of 44×44px for gloved and wet-finger field operations.
- **Sunlight Readability & WCAG Compliance:** Eliminate low-contrast grays (`#888`, `#555`) in favor of WCAG AA/AAA compliant tokens (`#4b5563`, `#595959`).
- **Design System Consistency:** Establish centralized typography and spacing scale tokens in CSS variables.
- **Responsive Adaptability:** Enable seamless presentation across mobile, tablet, and desktop viewports without breaking the bottom-sheet paradigm on mobile.
- **Information Architecture:** Remove duplicate navigation triggers and improve form accessibility semantics.

---

## 2. Phased Implementation Roadmap

### Phase 1: CSS Design Tokens & Typography Scale
**Target File:** `KabunFarm/style.css`
- Introduce standardized spacing tokens:
  ```css
  --space-2xs: 2px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-base: 16px;
  --space-lg: 20px;
  --space-xl: 24px;
  --space-2xl: 32px;
  ```
- Introduce standardized font scale tokens:
  ```css
  --font-xs: 11.5px;
  --font-sm: 13.5px;
  --font-base: 15px;
  --font-md: 16px;
  --font-lg: 18px;
  --font-xl: 20px;
  --font-2xl: 24px;
  --font-3xl: 28px;
  ```
- Introduce accessible contrast color tokens:
  ```css
  --color-text-dim: #4b5563;    /* 7.0:1 contrast on white (WCAG AAA) */
  --color-text-muted: #595959;  /* 4.6:1 contrast on white (WCAG AA) */
  --tap-min: 44px;
  ```

---

### Phase 2: High-Contrast Sunlight & Accessibility Fixes
**Target Files:** `KabunFarm/style.css`, `KabunFarm/index.html`, `KabunFarm/js/views.js`
- Replace all hardcoded `#888` and `#555` color values across DOM helper strings, loading placeholders, and CSS classes with `var(--color-text-dim)` or `var(--color-text-muted)`.
- Audit and adjust `.hint`, `.section-label`, `.weather-sub`, `.formula-calc-label`, and placeholder texts to ensure strict WCAG AA/AAA compliance.
- Maintain existing high-contrast warning badges (`#fef3c7` on `#92400e`) and status pills.

---

### Phase 3: Ergonomics & Touch Target Standardization
**Target Files:** `KabunFarm/style.css`, `KabunFarm/index.html`
- **View Toggle Buttons (`.mode-btn`):** Increase minimum bounding box from `28x28px` to `44x44px` with centered icon alignments for easier single-handed mode toggles (Grid vs. List).
- **Date Preset Chips (`.date-pill-btn`):** Set minimum height to `44px` with generous tap padding.
- **Filter Chips (`.filter-chip`, `.bed-filter-chips button`):** Ensure adequate horizontal and vertical tap clearance (minimum 44px height).
- **Close & Action Buttons:** Ensure all `.modal-close`, steppers, and archive drawer links meet 44px minimum target sizes.

---

### Phase 4: Header & Information Architecture Refinements
**Target Files:** `KabunFarm/index.html`, `KabunFarm/style.css`
- **Header De-duplication:** Remove the `.formulas-btn` (`🧪`) from `.app-header` in `index.html`. Since the Formulas view is already persistently accessible in the bottom navigation bar, removing this eliminates redundant navigation cues and visually centers the branding and status badge.
- **Form Group Semantics:** Add `role="group"` and `aria-labelledby` attributes to custom composite inputs (e.g. Formula picker list, Slot pills, Bed batch selection).

---

### Phase 5: Tablet & Desktop Responsive Adaptations
**Target File:** `KabunFarm/style.css`
- Add media queries for `@media (min-width: 768px)`:
  - Constrain `.app-header` and `main` to a comfortable reading container (`max-width: 860px`).
  - Transform modal sheets from full-width mobile bottom sheets into centered, rounded floating dialogs (`max-width: 540px; border-radius: 16px; margin: auto;`).
  - Center and dock the bottom navigation bar with bounded width or adapt it seamlessly.

---

## 3. Affected Files Summary

| File Path | Description of Changes |
|---|---|
| `KabunFarm/style.css` | Typography/spacing tokens, WCAG contrast updates, 44px tap targets, responsive media queries |
| `KabunFarm/index.html` | Remove redundant header formula button, update ARIA attributes, semantic form wrappers |
| `KabunFarm/js/views.js` | Update inline helper text classes and colors from `#888` to semantic text tokens |

---

## 4. Verification & Testing Strategy
1. **Automated Regression Suite:** Run `npm test` to verify that all 101 browser tests and Playwright assertions pass without regression.
2. **Interactive UI Check:** Verify modal open/close transitions, formula selection, date preset toggling, and bed grid/list switches.
3. **Responsive Viewport Testing:** Test viewports at `375px` (mobile), `768px` (tablet), and `1280px` (desktop) to ensure modal layouts and navigation render cleanly.
