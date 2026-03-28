# Theme Token Unification Design

Date: 2026-03-28

## Summary

Refactor the web app theme system so `default` and `business` share one common design system and differ only by color values. Move all theme behavior out of business components and into public design tokens. Apply the new design-spec baseline extracted from the business design file `docs/designs/officeclaw-extracted.pen` across all pages.

This is not a sidebar-only cleanup. The migration must cover all user-facing pages and shared UI surfaces, including chat, models, agents, channels, skills, empty states, cards, lists, inputs, tabs, buttons, menus, and page shells.

## Problem

The current `business` theme is implemented as ad hoc component branching. Components read theme config directly and conditionally switch styles with logic such as `theme === 'business'` and `config.sidebar.bg`. This has three issues:

- Theme concerns leak into business components.
- `default` and `business` do not share one authoritative design system.
- The business design language from the `.pen` file is only partially represented in code, mostly as background colors.

## Goals

- Unify `default` and `business` under one public design-token system.
- Standardize typography, spacing, radius, border width, and control height across both themes using the new design-spec baseline.
- Restrict theme differences to semantic color token values only.
- Remove business-theme conditionals from UI components.
- Cover all pages, not only shell-level surfaces.

## Non-Goals

- Do not redesign product flows or page structure.
- Do not change role colors such as `opus`, `codex`, `gemini`, `dare`, or `cocreator` unless a shared UI surface currently misuses them for general layout styling.
- Do not introduce component-specific theme variants like `variant="business"`.

## Current State

Current theme styling is split between:

- `packages/web/src/stores/themeStore.ts`
- `packages/web/src/hooks/useTheme.ts`
- `packages/web/src/app/globals.css`
- Business components that branch on theme, especially:
  - `packages/web/src/components/ChatContainer.tsx`
  - `packages/web/src/components/ThreadSidebar/ThreadSidebar.tsx`
  - `packages/web/src/components/ThreadSidebar/ThreadItem.tsx`
  - `packages/web/src/components/ChatContainerHeader.tsx`

The store currently acts as both theme state and theme style configuration. That should be split conceptually so runtime state remains in the store while style values live in CSS tokens.

## Design Principles

- Components consume semantic tokens, never theme-specific config.
- Foundation tokens are shared by all themes.
- Theme switching changes color values only.
- The business design file provides the target baseline for shared sizing and spacing rules.
- The final system must scale to additional themes without touching component styling logic.

## Token Architecture

### Foundation Tokens

Foundation tokens are shared across `default` and `business`. They define the new common baseline and do not change per theme.

Recommended groups:

- `--font-family-sans`
- `--font-size-xs`
- `--font-size-sm`
- `--font-size-md`
- `--font-size-lg`
- `--font-size-xl`
- `--font-size-hero`
- `--font-weight-regular`
- `--font-weight-medium`
- `--font-weight-bold`
- `--space-0` through `--space-10`
- `--radius-xs`
- `--radius-sm`
- `--radius-md`
- `--radius-lg`
- `--radius-xl`
- `--radius-2xl`
- `--radius-pill`
- `--border-width-default`
- `--border-width-strong`
- `--control-height-xs`
- `--control-height-sm`
- `--control-height-md`
- `--control-height-lg`
- `--control-height-xl`
- `--control-height-input`

### Semantic Tokens

Semantic tokens are the only theme-specific layer. Components consume these names, while `default` and `business` provide different color values for them.

Recommended groups:

- `--surface-app`
- `--surface-sidebar`
- `--surface-panel`
- `--surface-card`
- `--surface-card-muted`
- `--surface-selected`
- `--surface-inverse`
- `--text-primary`
- `--text-secondary`
- `--text-muted`
- `--text-subtle`
- `--text-inverse`
- `--text-accent`
- `--border-default`
- `--border-soft`
- `--border-strong`
- `--border-accent`
- `--accent-primary`
- `--accent-soft`
- `--accent-soft-strong`
- `--state-success-surface`
- `--state-success-text`
- `--state-warning-surface`
- `--state-warning-text`
- `--state-info-surface`
- `--state-info-text`

## Shared Baseline From Design File

These values become the new cross-theme baseline for both `default` and `business`.

### Typography

- `11px`
- `12px`
- `14px`
- `16px`
- `20px`
- `28px`

Weights:

- `400`
- `600`
- `700`

Font stack recommendation:

- `"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif`

### Spacing

Use the `.pen` spacing rhythm as the shared spacing scale:

- `4px`
- `6px`
- `8px`
- `10px`
- `12px`
- `14px`
- `16px`
- `18px`
- `20px`
- `22px`

### Radius

- `8px`
- `10px`
- `12px`
- `16px`
- `18px`
- `22px`
- `999px`

### Border Width

- `1px`
- `2px`

### Control Heights

- `30px`
- `32px`
- `34px`
- `52px`
- `66px`
- `96px`

## Business Theme Color Mapping

Initial `business` semantic token values should be based on the extracted design values:

- `surface-app: #FFFFFF`
- `surface-sidebar: #F6F7F9`
- `surface-panel: #FFFFFF`
- `surface-card: #FFFFFF`
- `surface-card-muted: #F4F5F7`
- `surface-selected: #F7FBFF`
- `surface-inverse: #111111`
- `text-primary: #1F1F1F`
- `text-secondary: #666666`
- `text-muted: #A1A1A1`
- `text-subtle: #D0D0D0`
- `text-inverse: #FFFFFF`
- `text-accent: #5B6CFF`
- `border-default: #ECEEF2`
- `border-soft: #E8EBF1`
- `border-strong: #E5E8EE`
- `border-accent: #7FB2FF`
- `accent-primary: #5B6CFF`
- `accent-soft: #EEF0FF`
- `accent-soft-strong: #DDEEFF`
- `state-success-surface: #EEF9D9`
- `state-success-text: #6A8F22`

`default` must use the same semantic token names and the same foundation token baseline. Only semantic color values differ.

## Implementation Design

### Global Token Source

Create one authoritative CSS token source, preferably in:

- `packages/web/src/app/globals.css`

Or split into a dedicated token file and import it globally.

Suggested structure:

- `:root` for shared foundation tokens
- `[data-ui-theme="default"]` for default semantic colors
- `[data-ui-theme="business"]` for business semantic colors

### Theme Runtime Model

Keep theme runtime state in the store, but remove style config from JavaScript.

Target runtime behavior:

- `themeStore` keeps `theme`, `isLoaded`, `setTheme`, `toggleTheme`, `initializeTheme`
- CSS variables define all style values
- app shell writes `data-ui-theme` to the root element
- components do not receive or read color config objects

### Component Consumption Rule

Components may use:

- semantic CSS variables directly
- shared utility classes backed by tokens
- shared token-backed component classes such as `.ui-card`, `.ui-input`, `.ui-chip`, `.ui-tab-active`, `.ui-button-primary`

Components may not use:

- `theme === 'business'`
- `config.sidebar.bg`
- `config.content.bg`
- theme-dependent sizing logic
- theme-specific JSX branches for shared UI

## Scope: All Pages

This work must update all pages and shared interface surfaces, not only the currently visible business screens.

Minimum migration coverage:

- chat shell
- chat empty state
- chat content pages
- models page
- agents page
- channels page
- skills page
- sidebar shell
- thread list items
- page headers
- page panels
- cards
- menus
- tabs
- chips
- buttons
- inputs
- dropdown-like controls
- toasts and success notices

If a page uses old hardcoded shell colors, old spacing values, or old radius conventions, it is in scope.

## Migration Plan

### Phase 1: Token Foundation

- Add the shared foundation token scale.
- Add semantic token names for UI colors.
- Add root theme selectors for `default` and `business`.

### Phase 2: Theme Store Simplification

- Remove JS color config from `themeStore`.
- Keep only theme state and persistence.
- Sync theme name to root `data-ui-theme`.

### Phase 3: Shell Migration

Migrate shell-level and layout-level components first:

- `ChatContainer`
- `ThreadSidebar`
- `ChatContainerHeader`

### Phase 4: Shared UI Migration

Migrate components that repeat across pages:

- `ThreadItem`
- shared buttons
- shared cards
- shared inputs
- tabs
- pills
- notices

### Phase 5: Page Sweep

Sweep all pages and panels to replace remaining hardcoded layout colors and non-baseline sizing values.

### Phase 6: Cleanup

- Remove obsolete theme config fields.
- Remove remaining business-theme conditionals.
- Remove dead style paths after verification.

## Verification Strategy

### Code Verification

Search-based checks must confirm:

- no remaining `theme === 'business'` in UI styling code
- no remaining `config.sidebar.bg`
- no remaining `config.content.bg`
- no component changes `padding`, `font-size`, `radius`, `border-width`, or `height` by theme

### Visual Verification

Compare both themes on representative pages:

- chat empty state
- active conversation page
- list-heavy management page

Expected result:

- layout density stays identical
- control sizes stay identical
- typography stays identical
- only color values change between themes

### Testing

Add or update tests for:

- root token application for `default` and `business`
- shell components consuming shared tokens instead of theme branches
- active, hover, selected, and success states resolving through semantic tokens

## Risks

- Partial migration may leave old hardcoded colors mixed with tokens.
- Theme hydration may briefly show wrong values if root theme attributes are applied late.
- Tailwind utility colors may continue to bypass token usage unless actively migrated.

## Acceptance Criteria

- `default` and `business` share one common design-token system.
- Typography, spacing, radius, border width, and control heights are identical across both themes.
- Theme switching changes color values only.
- Business components no longer branch on theme for layout or surface styling.
- All pages and shared interface surfaces use the new baseline.
- The business theme visually matches the extracted office-style design language.
