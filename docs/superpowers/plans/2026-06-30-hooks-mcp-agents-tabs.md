# Hooks MCP Agents Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Hooks, MCP, and Agents as cross-tool main navigation tabs that aggregate Claude and Codex configuration fields without removing the original Claude / Codex file pages.

**Architecture:** Reuse the existing `VisualConfigEditor` by adding a thin `CapabilityConfigEditor` wrapper that filters a schema to selected field paths while preserving the full parsed config object on save. Add three focused page components for Hooks, MCP, and Agents, each composing `CapabilityConfigEditor` and `ConfigEditor`. Wire the pages into `NAV_ITEMS` and `App.renderPage`.

**Tech Stack:** Tauri 1.5, React 18, TypeScript 5.3, Tailwind CSS, Vitest, React Testing Library, smol-toml.

## Global Constraints

- 与用户交流始终使用中文。
- 函数/方法必须添加注释说明用途和关键参数含义，每个函数/方法都要加。
- 变量必须添加注释说明该变量用来存储什么数据，每个变量都要加。
- 分支条件逻辑非显而易见时，注释说明该分支处理的业务场景。
- 复杂算法或 workaround 注释说明 WHY，而不是 WHAT。
- 主导航新增 `Hooks`、`MCP`、`Agents` 三个 tab。
- 新 tab 必须复用现有配置读写、语法校验、Finder / VSCode 打开、可视化 / 原始文本编辑能力。
- Claude / Codex 原页面继续保留完整配置文件编辑，避免能力页遗漏时用户无路可走。
- 任一工具配置读取或解析失败时，只影响对应区块，不阻断同页其他工具区块。
- 第一版不新增后端命令；继续通过已有 `readConfigFile`、`saveConfigFile`、`openInVscode`、`revealInFinder` 能力操作文件。
- 第一版不实现结构化新增 hook 事件、MCP server 或 agent 的专用向导；复杂对象仍使用现有大窗口 JSON / TOML 编辑器。
- 按 TDD 实施：先写失败测试，确认失败，再写最小实现，再跑通过。

---

## File Structure

- `src/components/CapabilityConfigEditor.tsx`: Create a schema-filtering wrapper around `VisualConfigEditor`.
- `src/components/CapabilityConfigEditor.test.tsx`: Test field filtering and preservation of unshown config values.
- `src/pages/HooksPage.tsx`: Create Hooks capability page.
- `src/pages/HooksPage.test.tsx`: Test Claude and Codex Hooks sections and `hooks.json` presence.
- `src/pages/McpPage.tsx`: Create MCP capability page.
- `src/pages/McpPage.test.tsx`: Test Claude and Codex MCP fields.
- `src/pages/AgentsPage.tsx`: Create Agents capability page.
- `src/pages/AgentsPage.test.tsx`: Test `CLAUDE.md`, `AGENTS.md`, and agent config fields.
- `src/App.tsx`: Import and route the three new pages.
- `src/App.test.tsx`: Mock and verify the three new tabs and update existing slider assertion.
- `src/config.ts`: Add the three new navigation entries.

---

### Task 1: Navigation And Routes

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/config.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `NAV_ITEMS` and `prefs.last_active_tab`.
- Produces: route ids `hooks`, `mcp`, and `agents`.

- [ ] **Step 1: Write failing navigation tests**

Add mocks for the new pages in `src/App.test.tsx`:

```typescript
vi.mock("./pages/HooksPage", () => ({
  default: () => <div>Hooks 页面</div>,
}));

vi.mock("./pages/McpPage", () => ({
  default: () => <div>MCP 页面</div>,
}));

vi.mock("./pages/AgentsPage", () => ({
  default: () => <div>Agents 页面</div>,
}));
```

Add a test:

```typescript
it("renders Hooks MCP and Agents as main navigation tabs", async () => {
  // rendered 存储 App 渲染结果，供 mock store 在页签切换时触发重渲染。
  const rendered = render(<App />);
  rerenderApp = () => rendered.rerender(<App />);

  // nav 存储主导航区域，用于限定按钮查询范围。
  const nav = screen.getByRole("navigation", { name: "主导航" });
  expect(within(nav).getByRole("button", { name: "Hooks" })).toBeInTheDocument();
  expect(within(nav).getByRole("button", { name: "MCP" })).toBeInTheDocument();
  expect(within(nav).getByRole("button", { name: "Agents" })).toBeInTheDocument();

  fireEvent.click(within(nav).getByRole("button", { name: "Hooks" }));
  expect(screen.getByText("Hooks 页面")).toBeInTheDocument();

  fireEvent.click(within(nav).getByRole("button", { name: "MCP" }));
  expect(screen.getByText("MCP 页面")).toBeInTheDocument();

  fireEvent.click(within(nav).getByRole("button", { name: "Agents" }));
  expect(screen.getByText("Agents 页面")).toBeInTheDocument();
});
```

Update the plugin slider assertion to `translateX(500%)` because `插件` becomes the sixth visible tab.

- [ ] **Step 2: Run navigation test and verify RED**

Run: `npm test -- src/App.test.tsx`

Expected: FAIL because `Hooks` / `MCP` / `Agents` modules or navigation entries do not exist.

- [ ] **Step 3: Implement routes and nav entries**

Add nav items in `src/config.ts`:

```typescript
export const NAV_ITEMS: NavItem[] = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "hooks", label: "Hooks" },
  { id: "mcp", label: "MCP" },
  { id: "agents", label: "Agents" },
  { id: "plugins", label: "插件" },
  { id: "skills", label: "技能" },
];
```

Add imports and cases in `src/App.tsx`:

```typescript
import HooksPage from "./pages/HooksPage";
import McpPage from "./pages/McpPage";
import AgentsPage from "./pages/AgentsPage";
```

```typescript
case "hooks":
  return <HooksPage />;
case "mcp":
  return <McpPage />;
case "agents":
  return <AgentsPage />;
```

- [ ] **Step 4: Run navigation test and verify GREEN**

Run: `npm test -- src/App.test.tsx`

Expected: PASS.

---

### Task 2: Capability Config Editor

**Files:**
- Create: `src/components/CapabilityConfigEditor.tsx`
- Create: `src/components/CapabilityConfigEditor.test.tsx`

**Interfaces:**
- Consumes: `ConfigFileSpec`, `VisualConfigSchema`, and field path strings.
- Produces:
  - `filterSchemaByFieldPaths(schema: VisualConfigSchema, fieldPaths: string[]): VisualConfigSchema`
  - `CapabilityConfigEditor(props: CapabilityConfigEditorProps): JSX.Element`

- [ ] **Step 1: Write failing capability editor tests**

Create tests that render a filtered schema and assert:

- Included field titles render.
- Excluded field titles do not render.
- Editing an included field and saving preserves unrelated config in the serialized output.

- [ ] **Step 2: Run capability editor test and verify RED**

Run: `npm test -- src/components/CapabilityConfigEditor.test.tsx`

Expected: FAIL because `CapabilityConfigEditor` does not exist.

- [ ] **Step 3: Implement schema filtering wrapper**

Create `CapabilityConfigEditor.tsx` with a `filterSchemaByFieldPaths` pure helper and default component that passes a filtered schema plus title/description override into `VisualConfigEditor`.

- [ ] **Step 4: Run capability editor test and verify GREEN**

Run: `npm test -- src/components/CapabilityConfigEditor.test.tsx`

Expected: PASS.

---

### Task 3: Hooks Page

**Files:**
- Create: `src/pages/HooksPage.tsx`
- Create: `src/pages/HooksPage.test.tsx`

**Interfaces:**
- Consumes: `CapabilityConfigEditor`, `ConfigEditor`, `CLAUDE_SETTINGS_SCHEMA`, `CODEX_CONFIG_SCHEMA`, `CLAUDE_CONFIG_FILES`, `CODEX_CONFIG_FILES`.
- Produces: `HooksPage`.

- [ ] **Step 1: Write failing Hooks page test**

Mock `CapabilityConfigEditor` and `ConfigEditor`, render `HooksPage`, and assert the Claude section, Codex section, `hooks`, `disableAllHooks`, and `hooks.json` appear.

- [ ] **Step 2: Run Hooks page test and verify RED**

Run: `npm test -- src/pages/HooksPage.test.tsx`

Expected: FAIL because `HooksPage` does not exist.

- [ ] **Step 3: Implement Hooks page**

Compose:

- Claude `CapabilityConfigEditor` for `hooks`, `disableAllHooks`, `allowManagedHooksOnly`, `allowedHttpHookUrls`, `httpHookAllowedEnvVars`.
- Codex `CapabilityConfigEditor` for `hooks`.
- Codex `ConfigEditor` for `codex-hooks`.

- [ ] **Step 4: Run Hooks page test and verify GREEN**

Run: `npm test -- src/pages/HooksPage.test.tsx`

Expected: PASS.

---

### Task 4: MCP Page

**Files:**
- Create: `src/pages/McpPage.tsx`
- Create: `src/pages/McpPage.test.tsx`

**Interfaces:**
- Consumes: `CapabilityConfigEditor`, `CLAUDE_SETTINGS_SCHEMA`, `CODEX_CONFIG_SCHEMA`, `CLAUDE_CONFIG_FILES`, `CODEX_CONFIG_FILES`.
- Produces: `McpPage`.

- [ ] **Step 1: Write failing MCP page test**

Mock `CapabilityConfigEditor`, render `McpPage`, and assert Claude and Codex MCP field paths are passed through.

- [ ] **Step 2: Run MCP page test and verify RED**

Run: `npm test -- src/pages/McpPage.test.tsx`

Expected: FAIL because `McpPage` does not exist.

- [ ] **Step 3: Implement MCP page**

Compose:

- Claude `CapabilityConfigEditor` for `mcpServers`, project MCP switches, and managed MCP fields.
- Codex `CapabilityConfigEditor` for `mcp_servers`, callback port/url, and credentials store.

- [ ] **Step 4: Run MCP page test and verify GREEN**

Run: `npm test -- src/pages/McpPage.test.tsx`

Expected: PASS.

---

### Task 5: Agents Page

**Files:**
- Create: `src/pages/AgentsPage.tsx`
- Create: `src/pages/AgentsPage.test.tsx`

**Interfaces:**
- Consumes: `CapabilityConfigEditor`, `ConfigEditor`, `CLAUDE_SETTINGS_SCHEMA`, `CODEX_CONFIG_SCHEMA`, `CLAUDE_CONFIG_FILES`, `CODEX_CONFIG_FILES`.
- Produces: `AgentsPage`.

- [ ] **Step 1: Write failing Agents page test**

Mock `CapabilityConfigEditor` and `ConfigEditor`, render `AgentsPage`, and assert `CLAUDE.md`, `AGENTS.md`, `agent`, and `agents` appear.

- [ ] **Step 2: Run Agents page test and verify RED**

Run: `npm test -- src/pages/AgentsPage.test.tsx`

Expected: FAIL because `AgentsPage` does not exist.

- [ ] **Step 3: Implement Agents page**

Compose:

- Claude `ConfigEditor` for `claude-md`.
- Claude `CapabilityConfigEditor` for `agent`, `teammateDefaultModel`, `availableModels`, `enforceAvailableModels`.
- Codex `ConfigEditor` for `codex-agents`.
- Codex `CapabilityConfigEditor` for `agents`, `model`, `model_provider`, `hide_agent_reasoning`, `show_raw_agent_reasoning`.

- [ ] **Step 4: Run Agents page test and verify GREEN**

Run: `npm test -- src/pages/AgentsPage.test.tsx`

Expected: PASS.

---

### Task 6: Final Verification

**Files:**
- Modify only if verification exposes a defect in files touched by previous tasks.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified implementation.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/App.test.tsx src/components/CapabilityConfigEditor.test.tsx src/pages/HooksPage.test.tsx src/pages/McpPage.test.tsx src/pages/AgentsPage.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: PASS, unless unrelated pre-existing tests fail; if so, record exact failures.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Inspect diff**

Run: `git diff -- src/App.tsx src/App.test.tsx src/config.ts src/components/CapabilityConfigEditor.tsx src/components/CapabilityConfigEditor.test.tsx src/pages/HooksPage.tsx src/pages/HooksPage.test.tsx src/pages/McpPage.tsx src/pages/McpPage.test.tsx src/pages/AgentsPage.tsx src/pages/AgentsPage.test.tsx docs/superpowers/plans/2026-06-30-hooks-mcp-agents-tabs.md`

Expected: Diff only contains the planned feature changes.
