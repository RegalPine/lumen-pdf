---
name: Telemetry Dark Cyber-Terminal
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1b1b1c'
  surface-container: '#202020'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e5e2e1'
  on-surface-variant: '#bbcabe'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#303030'
  outline: '#869489'
  outline-variant: '#3c4a41'
  surface-tint: '#4bdf99'
  primary: '#4bdf99'
  on-primary: '#003921'
  primary-container: '#0dbc79'
  on-primary-container: '#004429'
  inverse-primary: '#006d43'
  secondary: '#9fcaff'
  on-secondary: '#003258'
  secondary-container: '#3a95e8'
  on-secondary-container: '#002b4d'
  tertiary: '#eac32d'
  on-tertiary: '#3c2f00'
  tertiary-container: '#c5a100'
  on-tertiary-container: '#473900'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6cfcb3'
  primary-fixed-dim: '#4bdf99'
  on-primary-fixed: '#002111'
  on-primary-fixed-variant: '#005232'
  secondary-fixed: '#d1e4ff'
  secondary-fixed-dim: '#9fcaff'
  on-secondary-fixed: '#001d36'
  on-secondary-fixed-variant: '#00497d'
  tertiary-fixed: '#ffe07e'
  tertiary-fixed-dim: '#eac32d'
  on-tertiary-fixed: '#231b00'
  on-tertiary-fixed-variant: '#564500'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353535'
typography:
  headline-xl:
    fontFamily: Space Mono
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Mono
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Mono
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Space Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Space Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0.06em
  code-inline:
    fontFamily: Space Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
spacing:
  gutter: 1px
  gutter-loose: 0.5rem
  margin: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.375rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

The design system projects an uncompromising, high-precision telemetry and developer-tooling aesthetic. Built for power users, software engineers, and systems architects, the visual identity fuses the tactical discipline of a dark code editor with a zero-radius, razor-sharp cybernetic terminal. 

The emotional response is calculated, razor-sharp, and deeply functional: immediate responsiveness, structural honesty, and high information density without visual clutter. Drawing inspiration from modern integrated development environments (IDEs) and terminal emulators, the system leans into an unyielding brutalist-minimalism: pure angular structures, zero border radii, monospaced diagnostic signaling, and a deep void canvas balanced by electric telemetry green accents.

## Colors

The palette directly models the hierarchical surfaces of a modern development environment while substituting standard indicators with hyper-lucid telemetry greens.

- **Primary (`#0dbc79`)**: High-visibility terminal green. Applied strictly to active execution states, focus rings, primary action buttons, git insertions, and positive telemetry pulses.
- **Secondary (`#007acc`)**: Classic IDE status blue. Applied to secondary controls, active tab underlines, informational badges, and auxiliary tooling accents.
- **Tertiary (`#cca700`)**: Cautionary telemetry amber. Reserved for warnings, diagnostic alerts, modified file indicators, and breakpoint triggers.
- **Neutral Palette (`#121212` to `#3c3c3c`)**:
  - Deep Canvas (`#121212`): Shell background, workbench gutters, terminal host.
  - Editor Canvas (`#1e1e1e`): Document viewport, code panes, standard card backgrounds.
  - Surface Mid (`#252526`): Sidebars, tool windows, docked panels.
  - Surface Raised (`#2d2d2d`): Header bars, tab headers, context menus, toolbars.
  - Surface Border (`#3c3c3c`): Structural dividing rules, pane dividers, inactive outlines.
  - High-Contrast Text (`#f1f1f1`): Active file names, command text, terminal logs.
  - Muted Text (`#858585`): Line numbers, inactive breadcrumbs, parameter tags.

## Typography

The typography couples the clinical exactitude of `Space Mono` for navigational anchors, diagnostic metrics, and structural titles with the fluid legibility of `Space Grotesk` for sustained prose, settings documentation, and descriptive inputs.

- **Headlines & Display**: Rendered exclusively in `Space Mono` uppercase or strict camel-casing to reinforce an executable code mindset.
- **Body & Explanatory Context**: Rendered in `Space Grotesk` to guarantee rapid vertical scanning across dense technical documentation and multi-line properties without ocular fatigue.
- **Labels & Metadata**: `Space Mono` is enforced across all status indicators, toolbar shortcuts, breadcrumbs, and telemetry readouts. Letter spacing is subtly expanded to preserve terminal legibility at 11px and 12px.

## Layout & Spacing

The layout model simulates multi-pane IDE docks. Rather than floating cards separated by loose spatial margins, panes abut each other directly, separated by crisp `1px` borders or gutter rules.

- **High-Density Rhythm**: Base spacing operates on an ultra-compact 4px/6px base scale. Inner padding of buttons, tabs, and table records maintains an intentional compact footprint to optimize vertical and horizontal density.
- **Pane Splitting**: Outer boundaries utilize `0.75rem` padding on mobile viewports. On desktop viewports, content expands edge-to-edge across a multi-panel column system (Activity Bar: 48px fixed; Primary Sidebar: 240px–360px collapsible; Editor Viewport: 1fr flexible; Terminal/Panel: docked bottom or right).
- **Responsive Adaptations**:
  - **Desktop (1024px+)**: Simultaneous multi-panel layout with draggable 1px splitters.
  - **Tablet (768px - 1023px)**: Auto-collapse utility panels to sliding drawers; preserve dual-column editor and file tree.
  - **Mobile (<768px)**: Collapse all panels into single full-viewport views with sticky bottom navigation resembling an activity bar.

## Elevation & Depth

Visual hierarchy is constructed entirely without organic drop shadows. Depth is communicated strictly via tonal shifting, sharp hairline borders, and hard contrasting highlight borders.

- **Tonal Stepping**: The furthest background is `#121212`, rising to `#1e1e1e` for the workspace plane, `#252526` for static panels, and `#2d2d2d` for elevated overlays (such as the Command Palette, menus, and popovers).
- **Hairline Borders**: Surface division relies on `1px solid #3c3c3c`. Floating overlays use `1px solid #0dbc79` or `1px solid #007acc` to signal high-priority modal focus.
- **Hard Terminal Shadows (Optional Accent)**: If depth must be established against overlapping text, utilize an unblurred, hard offset shadow: `box-shadow: 2px 2px 0px 0px #000000`. Blur radii are strictly prohibited.

## Shapes

The shape system enforces pure zero-radius geometry (`roundedness: 0`). 

Every element—including buttons, dropdown menus, text fields, notification toasts, badges, and tabs—features unyielding, 90-degree squared corners. Radii of any kind are forbidden, establishing a direct visual link to early CRT monitors, terminal windows, and mechanical workstation hardware.

## Components

### Buttons
- **Primary**: Background `#0dbc79`, text `#121212`, font `Space Mono` 12px uppercase bold. Zero border radius. Hover shifts background to `#10df90`. Active shifts to `#0a9c63`.
- **Secondary / Action**: Background `#2d2d2d`, border `1px solid #3c3c3c`, text `#f1f1f1`. Hover triggers border color `#0dbc79` with text `#0dbc79`.
- **Ghost / Tool**: 28px × 28px square icon trigger with no initial background. Hover background `#252526`, border `1px solid #3c3c3c`.

### Document Tabs & Activity Bar
- **Tab Header**: Height 36px, background `#2d2d2d`, border-right `1px solid #1e1e1e`, border-top `2px solid transparent`.
- **Active Tab**: Background `#1e1e1e`, border-top `2px solid #0dbc79`, text `#ffffff`. Close icon displays as a crisp 10px `×` that highlights red (`#f14c4c`) on hover.
- **Activity Bar**: 48px fixed column on extreme left (`#181818`), displaying monospaced icons with a `2px` left border in `#0dbc79` on the active icon.

### Form Inputs & Terminal Command Fields
- **Input Box**: Background `#121212`, border `1px solid #3c3c3c`, text `#f1f1f1`, font `Space Mono` 13px. Padding `6px 10px`. Zero radius.
- **Focus State**: Border color `#0dbc79`, with an internal 1px inset ring of `#0dbc79` or hard neon glow (`outline: 1px solid #0dbc79`).

### Checkboxes & Radios
- **Checkbox**: 14px × 14px square box, background `#121212`, border `1px solid #3c3c3c`. Checked state fills the box with `#0dbc79` with a `#121212` sharp checkmark glyph or inverse center block.
- **Radio Button**: 14px × 14px square box (retains 0px radius for mechanical aesthetic). Selected state features a solid 6px × 6px inner square of `#0dbc79`.

### Chips & Status Badges
- **Telemetry Chip**: Height 20px, font `Space Mono` 11px uppercase, padding `2px 6px`. Border `1px solid #3c3c3c`, background `#1e1e1e`. Status variations (e.g., error, sync, ok) employ colored prefixes (`#0dbc79`, `#007acc`, `#cca700`) styled as trailing micro-dots or bracketed counters.

### Lists & Tree Views
- **Tree View Item**: 24px row height. Single-line ellipsis. Indentation staggered by 12px increments via vertical guide lines (`1px solid #2a2d2e`).
- **Selection**: Full-width row highlight with background `#2a2d2e` when inactive; `#04395e` (navy blue) or `#094771` when focused, accompanied by a `2px` left accent line in `#0dbc79`.

### Panels & Cards
- **Panels**: Background `#1e1e1e`, borders `1px solid #3c3c3c`. Headers are strictly delineated with a 32px height, `#252526` surface fill, and uppercase `Space Mono` titles accompanied by status counters.