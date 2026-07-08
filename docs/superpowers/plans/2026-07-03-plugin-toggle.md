# Plugin Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-plugin enable/disable controls for Claude Code and Codex plugins on the existing Plugins page.

**Architecture:** The renderer shows a switch per plugin and delegates persistence through the existing preload API boundary. Claude uses `claude plugin enable/disable`; Codex writes `[plugins."<id>"].enabled` in `config.toml` using `smol-toml` plus `atomicWrite`.

**Tech Stack:** Electron IPC, React 18, TypeScript, Zustand, Ant Design `Switch`, Node.js core modules, `smol-toml`, Vitest.

## Global Constraints

- 与用户交流始终使用中文。
- 每个函数/方法、每个变量都必须加注释。
- 非显而易见的 if/switch 分支需要注释业务场景。
- 复杂逻辑或 workaround 注释 WHY。
- 容易阻塞的任务需要异步处理，需要增加 loading，统一 loading。
- 新增功能必须更新 `功能清单.md`、`CHANGELOG.md`、`package.json` 版本号。
- 首版只实现 Plugin 单项开关，不实现 MCP、Hook、Skill 单项开关。

---

## File Structure

- Modify `src/core/plugins.js`: add pure backend toggle functions and TOML persistence helpers.
- Modify `test/core/plugins.test.js`: cover Codex config writes and Claude command argument building.
- Modify `electron/ipcChannels.js`: add `SET_PLUGIN_ENABLED`.
- Modify `electron/ipcHandlers.js`: register the new handler.
- Modify `electron/preload.cjs`: expose `setPluginEnabled`.
- Modify `src/electron-api.d.ts`: type the new preload method.
- Modify `src/api.ts`: add renderer API wrapper.
- Modify `src/store.ts`: add toggle feedback and per-plugin Promise state.
- Modify `src/pages/PluginsPage.tsx`: render the switch and feedback alert.
- Modify `src/pages/PluginsPage.test.tsx`: test rendering/click/loading/error.
- Modify `功能清单.md`: add the feature row.
- Modify `CHANGELOG.md`: add a top entry.
- Modify `package.json`: bump minor version from `0.6.2` to `0.7.0`.

### Task 1: Backend Plugin Toggle

**Files:**
- Modify: `src/core/plugins.js`
- Test: `test/core/plugins.test.js`

**Interfaces:**
- Produces: `setClaudePluginEnabled(pluginName, scope, enabled, claudeHome?) => Promise<string>`
- Produces: `setCodexPluginEnabled(codexHome, pluginId, enabled) => string`
- Produces: `buildClaudePluginToggleArgs(pluginName, scope, enabled) => string[]`

- [ ] **Step 1: Write failing backend tests**

Add tests that assert:

```js
expect(buildClaudePluginToggleArgs("superpowers@superpowers-dev", "user", true)).toEqual([
  "plugin",
  "enable",
  "superpowers@superpowers-dev",
  "-s",
  "user",
]);
expect(buildClaudePluginToggleArgs("superpowers@superpowers-dev", "project", false)).toEqual([
  "plugin",
  "disable",
  "superpowers@superpowers-dev",
  "-s",
  "project",
]);
```

Add Codex tests that write `config.toml`, call `setCodexPluginEnabled`, parse the file with `TOML.parse`, and assert `root.plugins["browser@openai-bundled"].enabled` changes to `false` and can be created as `true`.

- [ ] **Step 2: Run failing backend tests**

Run: `npx vitest run test/core/plugins.test.js`

Expected: FAIL because the new exports do not exist.

- [ ] **Step 3: Implement backend toggle functions**

Add `writeFileSync` import only if needed; prefer current `atomicWrite`. Implement:

```js
export function buildClaudePluginToggleArgs(pluginName, scope, enabled) {
  const normalizedPluginName = String(pluginName || "").trim();
  const normalizedScope = String(scope || "").trim();
  if (!normalizedPluginName) {
    throw new Error("插件名称不能为空");
  }
  const args = ["plugin", enabled ? "enable" : "disable", normalizedPluginName];
  if (normalizedScope) {
    args.push("-s", normalizedScope);
  }
  return args;
}
```

Implement `setClaudePluginEnabled` by calling `runPluginCli("claude", args, "CLAUDE_HOME", claudeHome || process.env.CLAUDE_HOME || "~/.claude")`.

Implement `setCodexPluginEnabled` by reading `config.toml`, parsing TOML, ensuring `root.plugins` and `root.plugins[pluginId]`, assigning `enabled`, and writing `TOML.stringify(root)` through `atomicWrite`.

- [ ] **Step 4: Run backend tests**

Run: `npx vitest run test/core/plugins.test.js`

Expected: PASS.

### Task 2: IPC And API Boundary

**Files:**
- Modify: `electron/ipcChannels.js`
- Modify: `electron/ipcHandlers.js`
- Modify: `electron/preload.cjs`
- Modify: `src/electron-api.d.ts`
- Modify: `src/api.ts`

**Interfaces:**
- Consumes: `setClaudePluginEnabled`, `setCodexPluginEnabled`
- Produces: `setPluginEnabled(payload: { tool: "claude" | "codex"; pluginId: string; scope: string; enabled: boolean; claudeHome: string; codexHome: string; }) => Promise<string>`

- [ ] **Step 1: Add IPC channel and handler**

Add `SET_PLUGIN_ENABLED: "set-plugin-enabled"` in both IPC constant maps. Import backend toggle functions in `electron/ipcHandlers.js`. Register a handler that dispatches by `payload.tool`:

```js
ipcMain.handle(IPC.SET_PLUGIN_ENABLED, (_event, payload) => {
  if (payload.tool === "claude") {
    return setClaudePluginEnabled(payload.pluginId, payload.scope, payload.enabled, payload.claudeHome);
  }
  return setCodexPluginEnabled(payload.codexHome, payload.pluginId, payload.enabled);
});
```

- [ ] **Step 2: Expose preload and renderer API**

Expose `setPluginEnabled` in `electron/preload.cjs`, type it in `src/electron-api.d.ts`, and wrap it in `src/api.ts`.

- [ ] **Step 3: Run type check**

Run: `npm run build`

Expected: build may still fail until store/page consumes the API, but there should be no syntax errors in IPC/API files.

### Task 3: Store Toggle State

**Files:**
- Modify: `src/store.ts`

**Interfaces:**
- Consumes: `setPluginEnabled` from `src/api.ts`
- Produces: `pluginPage.toggle`
- Produces: `pluginPage.toggling`
- Produces: `setPluginEnabled(tool, plugin, enabled) => Promise<void>`

- [ ] **Step 1: Extend state types**

Add `PluginToggleFeedback`, `PluginToggleOperation`, `toggle`, and `toggling`, mirroring existing update state.

- [ ] **Step 2: Implement action**

Add a store action that builds the same plugin key, reuses existing Promise if present, validates home path, sets feedback, calls API, refreshes the current tool with `checkPluginUpdates(tool)`, and cleans up `toggling`.

- [ ] **Step 3: Run TypeScript**

Run: `npm run build`

Expected: build may still fail until page tests are updated, but store type errors should be fixed.

### Task 4: Plugins Page UI

**Files:**
- Modify: `src/pages/PluginsPage.tsx`
- Test: `src/pages/PluginsPage.test.tsx`

**Interfaces:**
- Consumes: store `setPluginEnabled`
- Consumes: `pluginPage.toggle`
- Consumes: `pluginPage.toggling`

- [ ] **Step 1: Write failing page tests**

Add tests that:

```ts
expect(await screen.findByRole("switch", { name: "启用 superpowers@superpowers-dev" })).toBeChecked();
await user.click(screen.getByRole("switch", { name: "启用 superpowers@superpowers-dev" }));
expect(invokeMock).toHaveBeenCalledWith("set_plugin_enabled", {
  tool: "claude",
  pluginId: "superpowers@superpowers-dev",
  scope: "user",
  enabled: false,
  claudeHome: "/Users/test/.claude",
  codexHome: "/Users/test/.codex",
});
```

Add a loading test with a deferred Promise and assert only that switch has `aria-busy="true"` or is disabled while pending.

- [ ] **Step 2: Implement page switch**

Import `Switch` from `antd`. Pass `onToggleEnabled` and `isPluginToggling` into `PluginToolSection`. Render:

```tsx
<Switch
  aria-label={`启用 ${plugin.id}`}
  checked={plugin.enabled}
  loading={isPluginToggling(plugin)}
  disabled={isPluginToggling(plugin)}
  onChange={(checked) => onToggleEnabled(plugin, checked)}
/>
```

Render `pluginPage.toggle` feedback alert near existing update alert.

- [ ] **Step 3: Run page tests**

Run: `npx vitest run src/pages/PluginsPage.test.tsx`

Expected: PASS.

### Task 5: Required Docs And Version

**Files:**
- Modify: `功能清单.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: completed plugin toggle behavior.
- Produces: documented feature and version `0.7.0`.

- [ ] **Step 1: Update docs**

Add a top changelog entry for plugin single enable/disable. Add a feature-list row under plugin management.

- [ ] **Step 2: Bump version**

Set `package.json` version to `0.7.0` and update `package-lock.json` consistently with `npm install --package-lock-only --ignore-scripts` or `npm pkg set version=0.7.0`.

- [ ] **Step 3: Run verification**

Run:

```bash
npx vitest run test/core/plugins.test.js
npx vitest run src/pages/PluginsPage.test.tsx
npm test
npm run build
```

Expected: all pass.

## Self-Review

- Spec coverage: backend persistence, IPC boundary, store async state, UI switch, errors, tests, docs, and version are covered.
- Placeholder scan: no TBD/TODO/fill-in-later items.
- Type consistency: `setPluginEnabled` is the renderer API/store action name; backend uses separate Claude/Codex functions; plugin keys reuse existing `tool/id/scope/install_path` shape.
