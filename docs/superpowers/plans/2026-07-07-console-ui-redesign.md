# Console UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clean desktop-console UI with a left sidebar, default dark mode, and refreshed theme tokens without changing app functionality.

**Architecture:** Keep the existing Electron, React, Zustand, Tailwind, and Ant Design boundaries. Replace the top navigation shell with a sidebar shell, refresh shared UI primitives and global theme tokens, then update docs and version metadata required by the repository.

**Tech Stack:** Electron, React 18, TypeScript, Tailwind CSS 3, Ant Design 5, Zustand, Vitest.

## Global Constraints

- 与用户交流和项目文档使用中文。
- 新增或修改函数、方法和变量时保留中文注释。
- 前端没有 Node 能力，所有后端能力继续走 `window.api` 和 `src/api.ts`。
- 优先使用 Ant Design 组件；AntD 不满足左侧导航细节时使用自定义按钮。
- 默认主题必须为 `dark`，同时保留 `light` 和 `system`。
- 功能不变化，只调整布局、视觉、交互层次和主题。

---

### Task 1: Red Tests For Shell And Theme

**Files:**
- Modify: `src/App.test.tsx`
- Create: `test/core/preferences.test.js`
- Modify: `scripts/theme-colors.test.mjs`

**Interfaces:**
- Consumes: current `App`, `defaultPreferences`, `src/styles/index.css`.
- Produces: failing tests that describe sidebar layout, default dark mode, and refreshed theme tokens.

- [x] **Step 1: Write failing tests**

Tests assert `data-testid="app-sidebar"`, `data-testid="app-shell"`, `aria-current="page"` on overview, default `prefs.theme === "dark"`, and new CSS token values.

- [x] **Step 2: Run tests and verify they fail**

Run: `npx vitest run src/App.test.tsx test/core/preferences.test.js scripts/theme-colors.test.mjs`

Expected: FAIL because production code still renders the old top navigation, default theme is `system`, and CSS tokens are old values.

### Task 2: App Shell And Sidebar

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `NAV_ITEMS`, `useAppStore`, `SettingsContent`, Ant Design icons and `Drawer`.
- Produces: sidebar navigation buttons that call `updatePrefs({ last_active_tab: id })`.

- [ ] **Step 1: Replace root layout**

`App` root becomes `data-testid="app-shell"` with `flex-row`. `Sidebar` renders before the scrollable `main`; `main` keeps `data-testid="tab-content"` and existing page rendering.

- [ ] **Step 2: Implement sidebar navigation**

`Sidebar` adds a local overview item before `NAV_ITEMS`, maps items to icons, renders `nav aria-label="主导航"`, and sets `aria-current="page"` on the active button.

- [ ] **Step 3: Keep utility actions**

Theme and settings remain outside the nav. Theme cycles through `light -> dark -> system`; with default `dark`, the next mode is `system`.

- [ ] **Step 4: Verify shell tests**

Run: `npx vitest run src/App.test.tsx`

Expected: PASS.

### Task 3: Theme Tokens And Ant Design Provider

**Files:**
- Modify: `src/styles/index.css`
- Modify: `tailwind.config.js`
- Modify: `src/main.tsx`
- Modify: `src/core/preferences.js`

**Interfaces:**
- Consumes: existing CSS variables, Tailwind color extension, AntD `ConfigProvider`.
- Produces: shared semantic tokens for app surfaces and AntD controls.

- [ ] **Step 1: Change default preferences**

`defaultPreferences()` returns `theme: "dark"`.

- [ ] **Step 2: Refresh CSS variables**

Light tokens use `--surface: 247 249 252`, `--sidebar: 255 255 255`, `--accent: 13 148 136`. Dark tokens use `--surface: 15 23 42`, `--sidebar: 11 18 32`, `--accent: 45 212 191`.

- [ ] **Step 3: Extend Tailwind tokens**

Add `panel-soft`, `border-strong`, `success`, `warning`, and `danger` color aliases.

- [ ] **Step 4: Sync AntD token values**

Update `themeTokens` to use the same palette, tighter `borderRadius`, and matching control heights and focus color.

- [ ] **Step 5: Verify theme tests**

Run: `npx vitest run test/core/preferences.test.js scripts/theme-colors.test.mjs`

Expected: PASS.

### Task 4: Shared UI Polish And Page Containers

**Files:**
- Modify: `src/components/ui.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/ClaudePage.tsx`
- Modify: `src/pages/CodexPage.tsx`
- Modify: `src/pages/PluginsPage.tsx`
- Modify: `src/pages/SkillsPage.tsx`

**Interfaces:**
- Consumes: existing `Card`, `PageHeader`, `Button`, `Badge`, `EmptyState`.
- Produces: a `PageShell` wrapper and cleaner cards without changing business props.

- [ ] **Step 1: Add `PageShell`**

`PageShell({ children, className })` wraps page content with consistent max width and padding.

- [ ] **Step 2: Refresh shared components**

Keep AntD components but add project classes for quiet cards, compact page headers, and clear empty states.

- [ ] **Step 3: Use `PageShell` on main pages**

Replace page root `p-6` wrappers with `PageShell`. Keep all data loading and action handlers unchanged.

- [ ] **Step 4: Verify page tests**

Run: `npx vitest run src/pages/Dashboard.test.tsx src/pages/PluginsPage.test.tsx src/pages/SkillsPage.test.tsx src/pages/SettingsPage.test.tsx`

Expected: PASS.

### Task 5: Repository Required Metadata

**Files:**
- Modify: `功能清单.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: repository release rules.
- Produces: version bump to `0.8.0` and visible UI redesign changelog entry.

- [ ] **Step 1: Update feature list**

Add “控制台式侧边导航” and “清爽深浅主题” under public frontend capabilities.

- [ ] **Step 2: Update changelog**

Add `0.8.0 - 2026-07-07` with UI redesign changes and tests.

- [ ] **Step 3: Bump package version**

Set `package.json` and lockfile version fields to `0.8.0`.

- [ ] **Step 4: Verify full test and build**

Run: `npm test` and `npm run build`.

Expected: both exit 0.
