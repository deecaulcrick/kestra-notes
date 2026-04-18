# STYLES.md — Visual Design Reference

This file defines the visual language for the app. Every UI decision should be checked against this document before implementation. The primary visual reference is the Udara/research app UI (see design screenshots).

---

## Design philosophy

**Clean, airy, color-coded.** The app should feel like a well-organized physical desk — everything has a place, categories have personality through color, and the interface recedes behind the content.

Four principles:
1. **White is the base** — backgrounds are white or near-white, never gray-tinted panels
2. **Color lives in the content, not the chrome** — UI controls are neutral; category colors bring warmth through content cards
3. **Density is a choice** — the user can switch between grid and list views; both must feel equally considered
4. **macOS-native feel** — floating window, rounded corners, system fonts, no web-app energy

---

## Color system

### Background palette

```css
:root {
  --bg-window:      #FFFFFF;      /* main window background */
  --bg-sidebar:     #FFFFFF;      /* sidebar — pure white, no tint */
  --bg-content:     #F5F4F0;      /* content area — very subtle warm off-white */
  --bg-card:        #FFFFFF;      /* card base before category tint */
  --bg-hover:       rgba(0,0,0,0.04);  /* hover state on list items, sidebar items */
  --bg-selected:    rgba(0,0,0,0.06);  /* selected sidebar item */
  --bg-panel:       #FFFFFF;      /* floating panels (metadata, annotations) */
  --bg-tooltip:     #1C1C1E;      /* tooltip background */
}
```

### Text palette

```css
:root {
  --text-primary:   #1C1C1E;      /* titles, primary content */
  --text-secondary: #6B6B6B;      /* metadata, authors, timestamps */
  --text-tertiary:  #AEAEB2;      /* placeholder, muted counts */
  --text-inverse:   #FFFFFF;      /* text on dark backgrounds */
  --text-link:      #007AFF;      /* links, active states */
}
```

### Border palette

```css
:root {
  --border-subtle:  rgba(0,0,0,0.06);  /* card edges, dividers */
  --border-medium:  rgba(0,0,0,0.12);  /* panel edges, inputs */
  --border-strong:  rgba(0,0,0,0.20);  /* focused inputs, selected cards */
}
```

### Category color system

Each category is assigned one color from the palette below. The color does three things:
- `--cat-dot` — filled dot in the sidebar (same in light and dark mode)
- `--cat-card` — card background tint (medium-light in light mode, dark-saturated in dark mode)
- `--cat-badge` — tag chip background inside the card (slightly darker/richer than `--cat-card`)

The card backgrounds are **intentionally visible** — not a whisper of color. Think 20–30% saturation on a white base, so the color reads clearly at a glance.

**Color palette — 11 colors derived from the brand swatch:**

The dot colors are taken directly from the provided palette. Card and badge are mixed-down versions of the same hue — never a different color family.

```css
/* ── LIGHT MODE ── */

/* Orange-red  #FF340C */
.cat-vermillion {
  --cat-dot:   #FF340C;
  --cat-card:  #FFD0C2;   /* ~25% sat mix of #FF340C on white */
  --cat-badge: #FFB8A0;   /* slightly richer */
}

/* Deep red  #E0070F */
.cat-crimson {
  --cat-dot:   #E0070F;
  --cat-card:  #FFCCCF;
  --cat-badge: #FFB0B5;
}

/* Hot pink  #F03172 */
.cat-hotpink {
  --cat-dot:   #F03172;
  --cat-card:  #FFCADB;
  --cat-badge: #FFB0CB;
}

/* Soft pink  #E990A2 */
.cat-blush {
  --cat-dot:   #E990A2;
  --cat-card:  #FADADF;
  --cat-badge: #F5C4CC;
}

/* Amber  #FFAE00 */
.cat-amber {
  --cat-dot:   #FFAE00;
  --cat-card:  #FFE8A0;
  --cat-badge: #FFD96B;
}

/* Acid yellow-green  #CAC307 */
.cat-citrus {
  --cat-dot:   #CAC307;
  --cat-card:  #ECEA9A;
  --cat-badge: #DDD870;
}

/* Dark teal  #0F4A42 */
.cat-teal {
  --cat-dot:   #0F4A42;
  --cat-card:  #B8D8D4;
  --cat-badge: #96C4BE;
}

/* Periwinkle blue  #AABFE8 (lightened from #FFAE00 row — using the screenshot's sky blue) */
/* Note: the blue swatch in row 3 col 2 appears to be a light periwinkle ~#A8C0E8 */
.cat-periwinkle {
  --cat-dot:   #5580C8;   /* saturated version of the swatch for the dot */
  --cat-card:  #C8D8F5;
  --cat-badge: #AABFE8;
}

/* Navy  #181A4D */
.cat-navy {
  --cat-dot:   #181A4D;
  --cat-card:  #B8BADC;
  --cat-badge: #9698C8;
}

/* Royal blue  #273287 */
.cat-cobalt {
  --cat-dot:   #273287;
  --cat-card:  #BCC0E8;
  --cat-badge: #9EA4D8;
}

/* Dark brown  #441B07 */
.cat-espresso {
  --cat-dot:   #441B07;
  --cat-card:  #D4BCA8;
  --cat-badge: #C0A48C;
}
```

**Dark mode — same dot colors, darker card tints:**

In dark mode, card backgrounds become dark saturated versions of the hue — not near-black, but clearly colored against the dark window background. The dot color never changes.

```css
/* ── DARK MODE ── */
[data-theme="dark"] .cat-vermillion {
  --cat-card:  #5C1A08;
  --cat-badge: #7A2410;
}
[data-theme="dark"] .cat-crimson {
  --cat-card:  #580610;
  --cat-badge: #740A18;
}
[data-theme="dark"] .cat-hotpink {
  --cat-card:  #5C1030;
  --cat-badge: #7A1840;
}
[data-theme="dark"] .cat-blush {
  --cat-card:  #542030;
  --cat-badge: #6E2C40;
}
[data-theme="dark"] .cat-amber {
  --cat-card:  #5C3E00;
  --cat-badge: #7A5400;
}
[data-theme="dark"] .cat-citrus {
  --cat-card:  #484600;
  --cat-badge: #5E5C00;
}
[data-theme="dark"] .cat-teal {
  --cat-card:  #082820;
  --cat-badge: #0E3A2E;
}
[data-theme="dark"] .cat-periwinkle {
  --cat-card:  #1C2C50;
  --cat-badge: #263A68;
}
[data-theme="dark"] .cat-navy {
  --cat-card:  #10122E;
  --cat-badge: #181A40;
}
[data-theme="dark"] .cat-cobalt {
  --cat-card:  #101840;
  --cat-badge: #182054;
}
[data-theme="dark"] .cat-espresso {
  --cat-card:  #200E04;
  --cat-badge: #301608;
}
```

**Cycle order for new categories** (assign in this order by default):
`vermillion → amber → teal → cobalt → hotpink → citrus → navy → blush → crimson → periwinkle → espresso`

**How category colors are assigned:**
- New categories cycle through the palette in the order above
- The user can change a category's color via right-click → Change color
- Color is stored in the `tags` table as `color_id TEXT` (e.g. `"cat-amber"`)
- All cards in a category use `--cat-card` as their background
- The sidebar dot uses `--cat-dot` — identical in light and dark mode
- Tag badges/chips inside cards use `--cat-badge`

---

## Typography

```css
/* Base — system font everywhere, no external fonts in v1 */
body {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}

/* Scale */
--text-xs:   11px;   /* counts, badges, timestamps */
--text-sm:   12px;   /* metadata, authors, secondary labels */
--text-base: 13px;   /* body, sidebar items, list rows */
--text-md:   14px;   /* card titles in list view */
--text-lg:   15px;   /* card titles in grid view, panel headings */
--text-xl:   17px;   /* editor body text */
--text-2xl:  22px;   /* editor H3 */
--text-3xl:  28px;   /* editor H2 */
--text-4xl:  34px;   /* editor H1 */

/* Weights */
--weight-regular: 400;
--weight-medium:  500;
--weight-semibold: 600;
--weight-bold:    700;
```

---

## Spacing and layout

```css
/* Base unit: 4px */
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;

/* Border radius */
--radius-sm:  6px;    /* badges, small chips */
--radius-md:  10px;   /* cards, inputs, buttons */
--radius-lg:  14px;   /* panels, modals */
--radius-xl:  20px;   /* window, large containers */
--radius-full: 9999px; /* pills, dots */
```

---

## Window and shell

The app window is a floating macOS-style window — not full-screen by default:

```css
.app-window {
  border-radius: var(--radius-xl);
  overflow: hidden;
  background: var(--bg-window);
  /* macOS handles the actual window chrome */
}
```

**Title bar:**
- macOS native title bar (use Tauri's `decorations: true`)
- Traffic lights (red/yellow/green) in the top left
- Breadcrumb in the center: `My Library / ● Category Name` — the dot uses `--cat-dot` color
- Right side: `+` add button, grid/list toggle icon, settings icon
- Title bar background matches the sidebar: `var(--bg-sidebar)`

**Breadcrumb format:**
```
My Library  /  ● Sort        ← category selected
My Library  /  Recent        ← system section selected  
My Library  /  ● Sort  /  Note Title   ← note open
```

---

## Sidebar

```css
.sidebar {
  width: 220px;
  min-width: 180px;
  max-width: 280px;
  background: var(--bg-sidebar);   /* pure white */
  border-right: 0.5px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  padding: var(--space-3) 0;
  user-select: none;
}
```

### System section items (top of sidebar)

```
Recent
Bookmarks
Discover
```

Plain text, no dot, no count. `var(--text-secondary)` color. `var(--text-sm)` size.

### "My library" section header

```css
.sidebar-section-header {
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: var(--space-4) var(--space-4) var(--space-2);
}
```

### Category items

```css
.sidebar-category-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-4);
  height: 28px;
  border-radius: var(--radius-sm);
  margin: 0 var(--space-2);
  cursor: pointer;
  font-size: var(--text-base);
  color: var(--text-primary);
}

.sidebar-category-item:hover {
  background: var(--bg-hover);
}

.sidebar-category-item.selected {
  background: var(--bg-selected);
  font-weight: var(--weight-medium);
}

/* The colored dot */
.sidebar-category-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--cat-dot);
  flex-shrink: 0;
}

/* Note count */
.sidebar-category-count {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
```

### "New category +" button

```css
.sidebar-new-category {
  padding: var(--space-1) var(--space-4);
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  cursor: pointer;
  margin-top: var(--space-1);
}
.sidebar-new-category:hover {
  color: var(--text-secondary);
}
```

### Bottom of sidebar

Pin to bottom:
- AI usage (special icon, muted)
- Trash (trash icon, muted)

```css
.sidebar-footer {
  margin-top: auto;
  border-top: 0.5px solid var(--border-subtle);
  padding-top: var(--space-2);
}
```

---

## Content area — grid view

The default view. Masonry-style columns, each card tinted by its category color.

```css
.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-3);
  padding: var(--space-4);
  align-items: start;   /* masonry feel — cards are natural height */
  overflow-y: auto;
}
```

### Card

```css
.note-card {
  background: var(--cat-card);   /* category pastel tint */
  border-radius: var(--radius-md);
  padding: var(--space-3);
  cursor: pointer;
  border: 0.5px solid transparent;
  transition: border-color 0.1s, transform 0.1s;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.note-card:hover {
  border-color: var(--border-medium);
  transform: translateY(-1px);
}

.note-card.selected {
  border-color: var(--border-strong);
  outline: 2px solid var(--cat-dot);
  outline-offset: -1px;
}
```

### Card anatomy (top to bottom)

```
┌─────────────────────────────┐
│  2018  ● Category name      │  ← year (muted) + category badge
│                             │
│  Bold note title here       │  ← title, 2-3 lines, semibold
│  that can wrap to multiple  │
│  lines naturally            │
│                             │
│  Author name, Second Auth…  │  ← authors, muted, truncated
│                             │
│                             │  ← flexible space (card grows)
│                             │
│  ♥ 3           ○            │  ← like count + progress/status icon
└─────────────────────────────┘
```

```css
.card-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.card-year {
  font-variant-numeric: tabular-nums;
}

.card-category-badge {
  background: var(--cat-badge);
  color: var(--text-secondary);
  padding: 1px var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
}

.card-title {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-authors {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}

.card-likes {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
```

**"NEW" badge:** Notes created recently (within 7 days) show a `NEW` pill before the year:
```css
.card-new-badge {
  background: var(--cat-badge);
  color: var(--cat-dot);
  font-size: 9px;
  font-weight: var(--weight-bold);
  padding: 1px 5px;
  border-radius: var(--radius-full);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
```

---

## Content area — list view

Toggled by the grid/list icon in the title bar. Same data, compact single-row layout.

```css
.content-list {
  display: flex;
  flex-direction: column;
  padding: 0 var(--space-4);
}

.list-row {
  display: flex;
  align-items: center;
  padding: var(--space-3) var(--space-2);
  border-bottom: 0.5px solid var(--border-subtle);
  cursor: pointer;
  border-radius: var(--radius-sm);
  gap: var(--space-3);
}

.list-row:hover {
  background: var(--bg-hover);
}
```

### List row anatomy

```
Title text here — bold               Category • Year • Author names…      ♥ count
```

```css
.list-row-title {
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-row-meta {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 340px;
}

.list-row-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-left: auto;
  flex-shrink: 0;
}
```

---

## Context menu

Standard macOS-style dropdown. Appears on right-click on a card or list row.

```css
.context-menu {
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 0.5px solid var(--border-medium);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08);
  padding: var(--space-1) 0;
  min-width: 180px;
  z-index: 1000;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-base);
  color: var(--text-primary);
  cursor: pointer;
}

.context-menu-item:hover {
  background: var(--bg-hover);
}

.context-menu-item.destructive {
  color: #FF3B30;
}

.context-menu-divider {
  height: 0.5px;
  background: var(--border-subtle);
  margin: var(--space-1) 0;
}
```

Context menu items for a note card:
- Open item
- Open item notes
- Move to category → (submenu with colored dots)
- Open item folder
- Regenerate metadata
- ── divider ──
- Move to trash (destructive)

**Submenu (Move to category):**
Slides out to the right. Lists all categories with their colored dots. Same styling as the sidebar category items.

---

## Floating panels

### Metadata panel

Appears when clicking the info icon on an open note. Floats over the content.

```css
.metadata-panel {
  position: absolute;
  top: var(--space-12);
  right: var(--space-4);
  width: 320px;
  background: var(--bg-panel);
  border: 0.5px solid var(--border-medium);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  padding: var(--space-4);
  z-index: 100;
}
```

Fields shown: Category (colored pill button), Title, Year, Authors (list with +/− row controls), Abstract (textarea).

Author row:
```css
.author-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: var(--space-2);
  align-items: center;
}
/* first name | last name | − button */
```

### Annotations / Notes panel

Right-side panel, same width as the right panel in the 3-pane layout.

Tab bar at top: `Notes` · `Annotations`

**Notes tab:** Free-form editor. "Start your notes here..." placeholder. Below: AI summary button.

**Annotations tab:** Lists highlighted passages. Each annotation:
```css
.annotation-item {
  background: var(--cat-card);  /* tinted by note's category */
  border-left: 3px solid var(--cat-dot);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  padding: var(--space-3);
  margin-bottom: var(--space-3);
  font-size: var(--text-sm);
  line-height: 1.6;
}
```

Below each annotation: `Annotation` / `Page` tabs + comment input + `Ask AI` / `Save` buttons.

---

## Empty state

When a category has no notes:

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--space-4);
  color: var(--text-tertiary);
}

.empty-state-pill {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--bg-hover);
  border-radius: var(--radius-full);
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--text-primary);
  border: 0.5px solid var(--border-medium);
}

.empty-state-label {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

.empty-state-delete {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  cursor: pointer;
}
.empty-state-delete:hover {
  color: #FF3B30;
}
```

Shown content:
```
● Category Name     ← pill with colored dot
This category is empty start by importing an item.   ← muted text
× delete    ← destructive action, very small
```

---

## Note open state

When a note is opened from the grid, it expands or navigates to a full reader view.

```css
.note-reader {
  background: var(--bg-window);
  flex: 1;
  overflow-y: auto;
  padding: var(--space-10) var(--space-8);
  max-width: 720px;
  margin: 0 auto;
}
```

The note reader has its own title bar showing the breadcrumb: `My Library / ● Category / Note Title`.

Reading progress indicator: a thin bar or arc icon on the card (bottom right) showing % read.

---

## Progress / status icons (card bottom right)

Small circular icons at the bottom right of each card indicate status:
- Empty circle `○` — not started
- Half-filled `◑` — in progress (with % tooltip on hover showing "45% • 1h 1m 55s")  
- Filled circle `●` — completed
- Play button `▶` — has audio/video content

These are SVG icons, ~16px, `var(--text-tertiary)` color.

---

## Buttons and controls

```css
/* Primary button */
.btn-primary {
  background: var(--text-primary);
  color: var(--text-inverse);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  border: none;
  cursor: pointer;
}

/* Ghost button */
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 0.5px solid var(--border-medium);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-base);
  cursor: pointer;
}
.btn-ghost:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Icon button (title bar, toolbar) */
.btn-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  border: none;
  background: transparent;
}
.btn-icon:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Add item button (top right, filled) */
.btn-add-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  background: var(--text-primary);
  color: var(--text-inverse);
  border-radius: var(--radius-full);
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
}
```

---

## Input fields

```css
.input {
  background: var(--bg-content);
  border: 0.5px solid var(--border-medium);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-base);
  font-family: inherit;
  color: var(--text-primary);
  width: 100%;
  outline: none;
}

.input:focus {
  border-color: var(--border-strong);
  background: var(--bg-window);
  box-shadow: 0 0 0 3px rgba(0,122,255,0.12);
}

.input::placeholder {
  color: var(--text-tertiary);
}
```

---

## Scrollbars

macOS overlay scrollbars apply automatically. For the sidebar and list view, ensure `overflow-y: auto` is set. Do not style scrollbars manually — let the OS handle it.

---

## Motion

All transitions should feel instantaneous or very fast. No slow animations.

```css
/* Standard transition for interactive elements */
--transition-fast: 80ms ease;
--transition-base: 120ms ease;

/* Apply to */
.note-card       { transition: border-color var(--transition-fast), transform var(--transition-fast); }
.sidebar-item    { transition: background var(--transition-fast); }
.context-menu    { transition: opacity var(--transition-base); }
```

No bounce, no spring physics, no elaborate entrance animations. Content appears immediately.

---

## Dark mode

All CSS variables get overridden via `[data-theme="dark"]`:

```css
[data-theme="dark"] {
  --bg-window:      #1C1C1E;
  --bg-sidebar:     #1C1C1E;
  --bg-content:     #2C2C2E;
  --bg-card:        #2C2C2E;
  --bg-hover:       rgba(255,255,255,0.06);
  --bg-selected:    rgba(255,255,255,0.10);
  --bg-panel:       #2C2C2E;

  --text-primary:   #F2F2F7;
  --text-secondary: #AEAEB2;
  --text-tertiary:  #636366;
  --text-inverse:   #1C1C1E;

  --border-subtle:  rgba(255,255,255,0.06);
  --border-medium:  rgba(255,255,255,0.12);
  --border-strong:  rgba(255,255,255,0.22);
}

/* Category card and badge dark overrides are defined inline
   in the Category color system section above.
   --cat-dot never changes between light and dark. */
```

---

## What NOT to do

- No drop shadows on cards — border only
- No gradients in the UI chrome — flat backgrounds only
- No rounded corners above `--radius-xl` (20px)
- No colored sidebars or tinted panels — sidebar is always white/near-black
- No full-width buttons — buttons should be content-width
- No external fonts — system font only
- No skeleton loaders — show content immediately or nothing
- No page transition animations — navigation is instant
- No hover tooltips on every element — only where genuinely needed (e.g. progress % on hover)