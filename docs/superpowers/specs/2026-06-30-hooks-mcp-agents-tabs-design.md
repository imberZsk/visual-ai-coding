# Hooks MCP Agents Tabs Design

## 背景

当前应用用 Tauri、React 和 TypeScript 管理 Claude Code 与 Codex 的配置、插件、Skills 和工具状态。主导航现有 `Claude Code`、`Codex`、`插件`、`技能` 四个能力入口，概览与应用设置已经收进顶部设置抽屉。

Claude 与 Codex 页面现在按“工具配置文件”组织内容：Claude 页面展示 `settings.json`、`CLAUDE.md`、插件清单和 marketplace；Codex 页面展示 `config.toml`、`AGENTS.md`、`hooks.json` 和 `version.json`。Hooks、MCP、Agents 都已经存在于配置 schema 或配置文件中，但用户必须知道它们分别藏在哪个工具、哪个文件、哪个字段里。

本次目标是新增 `Hooks`、`MCP`、`Agents` 三个主导航 tab，把这些跨 Claude / Codex 的能力按主题聚合出来，同时保留原 Claude / Codex 文件页作为完整配置入口。

## 目标

1. 主导航新增 `Hooks`、`MCP`、`Agents` 三个 tab。
2. `Hooks` tab 汇总 Claude 与 Codex 的 hook 相关配置，并提供原始配置编辑兜底。
3. `MCP` tab 汇总 Claude 与 Codex 的 MCP server 与 MCP OAuth 相关配置。
4. `Agents` tab 汇总 Claude 与 Codex 的 agent 指令文件和 agent 相关配置。
5. 新 tab 必须复用现有配置读写、语法校验、Finder / VSCode 打开、可视化 / 原始文本编辑能力。
6. Claude / Codex 原页面继续保留完整配置文件编辑，避免能力页遗漏时用户无路可走。
7. 任一工具配置读取或解析失败时，只影响对应区块，不阻断同页其他工具区块。

## 非目标

1. 第一版不实现结构化新增 hook 事件、MCP server 或 agent 的专用向导；复杂对象仍使用现有大窗口 JSON / TOML 编辑器。
2. 第一版不扫描项目级 `.mcp.json`、项目级 `AGENTS.md`、项目级 `CLAUDE.md` 或托管配置；仅聚合当前偏好中配置的 Claude / Codex 用户配置目录。
3. 第一版不执行 MCP 连通性检测、OAuth 登录流程或 hook 命令试运行。
4. 第一版不新增后端命令；继续通过已有 `readConfigFile`、`saveConfigFile`、`openInVscode`、`revealInFinder` 能力操作文件。
5. 第一版不从插件或 Skill 目录推断 agent 定义；只展示已有配置文件和 schema 中声明的 agent 相关字段。

## 推荐方案

采用“能力页聚合 + 复用现有编辑器”的方案。

主导航变为：

- `Claude Code`
- `Codex`
- `Hooks`
- `MCP`
- `Agents`
- `插件`
- `技能`

三个新页面都采用一致布局：

- 页面标题说明当前能力覆盖 Claude 与 Codex。
- 页面主体分为 Claude 区块与 Codex 区块。
- 每个区块使用现有 `Card` / `PageHeader` / `Badge` / `Button` 风格。
- 简单文件用 `ConfigEditor`。
- 已有 schema 覆盖的配置用 `VisualConfigEditor` 的能力子集。

为避免复制整份 `settings.json` / `config.toml` 可视化编辑器，新增一个轻量能力配置组件，接收完整 schema 与目标字段路径列表，只渲染指定字段所在的能力分组。该组件复用 `VisualConfigEditor` 的解析、序列化、字段渲染和保存逻辑；新 tab 不展示无关 schema 字段，确保用户进入能力页后只看到当前主题相关配置。

## Hooks Tab

### Claude 区块

展示和编辑：

- `settings.json` 中的 `hooks`
- `settings.json` 中的 `disableAllHooks`
- 托管策略中与 Hooks 相关的 allowlist / only 字段，如果当前 schema 已覆盖

交互：

- `disableAllHooks` 使用开关控件。
- `hooks` 使用对象编辑控件，保留现有 JSON 校验。
- 显示危险风险提示，因为 hook 命令可能执行本机命令。
- 提供 `Finder`、`VSCode`、`刷新`、`保存` 操作。

### Codex 区块

展示和编辑：

- `config.toml` 中的 `hooks`
- `hooks.json` 文件

交互：

- `config.toml` 的 `hooks` 使用 TOML 对象编辑控件。
- `hooks.json` 使用现有 `ConfigEditor` 原始文本编辑，继续由后端保存前校验 JSON。
- 如果 `hooks.json` 不存在，展示文件不存在徽章和“保存后创建”的占位。

## MCP Tab

### Claude 区块

展示和编辑：

- `settings.json` 中的 `mcpServers`
- `enableAllProjectMcpServers`
- `enabledMcpjsonServers`
- `disabledMcpjsonServers`
- `disableClaudeAiConnectors`
- 托管策略中与 MCP allowlist / denylist 相关字段，如果当前 schema 已覆盖

交互：

- MCP server 对象标记为敏感，因为可能包含命令、路径、环境变量和 token。
- 项目 MCP 自动批准相关字段显示危险风险提示。
- 字符串列表继续按行编辑。

### Codex 区块

展示和编辑：

- `config.toml` 中的 `mcp_servers`
- `mcp_oauth_callback_port`
- `mcp_oauth_callback_url`
- `mcp_oauth_credentials_store`

交互：

- `mcp_servers` 使用 TOML 对象编辑控件。
- OAuth 凭据存储字段标记敏感。
- 本地端口字段使用数字控件。

## Agents Tab

### Claude 区块

展示和编辑：

- `CLAUDE.md`
- `settings.json` 中的 `agent`
- `teammateDefaultModel`
- `availableModels`
- `enforceAvailableModels`
- 其他当前 Claude schema 中已经归入模型与 Agent 分组的 agent 相关字段

交互：

- `CLAUDE.md` 使用 `ConfigEditor`，作为全局 agent 指令文件。
- agent 名称和模型字段使用文本控件。
- allowlist 类字段显示危险风险提示，因为它们会限制模型或 agent 能力范围。

### Codex 区块

展示和编辑：

- `AGENTS.md`
- `config.toml` 中的 `agents`
- 与 agent 工作方式强相关的 `model`、`model_provider`、`hide_agent_reasoning`、`show_raw_agent_reasoning`

交互：

- `AGENTS.md` 使用 `ConfigEditor`，作为全局 agent 指令文件。
- `agents` 使用 TOML 对象编辑控件。
- reasoning 显示类字段标记敏感或实验性，沿用现有 schema 风险信息。

## 组件设计

新增页面：

- `src/pages/HooksPage.tsx`
- `src/pages/McpPage.tsx`
- `src/pages/AgentsPage.tsx`

新增或抽取组件：

- `src/components/CapabilityConfigEditor.tsx`

`CapabilityConfigEditor` 负责加载一个配置文件，并仅展示指定 schema 字段。推荐接口：

```typescript
interface CapabilityConfigEditorProps {
  spec: ConfigFileSpec;
  schema: VisualConfigSchema;
  title: string;
  description: string;
  fieldPaths: string[];
}
```

字段筛选规则：

1. 按 `fieldPaths` 从 schema 中筛选字段。
2. 保留原字段顺序和 group 顺序。
3. 空 group 不展示。
4. 未知字段仍由原始文本视图兜底，不在能力页默认展开。
5. 保存时写回完整配置对象，不能丢失未展示字段。

如果为了降低重复，需要重构 `VisualConfigEditor`，应优先抽取纯函数和小组件：

- 配置文本解析函数
- 配置文本序列化函数
- 字段状态计算函数
- schema 过滤函数

## 路由与导航

`src/config.ts` 中 `NAV_ITEMS` 增加三个条目：

- `{ id: "hooks", label: "Hooks" }`
- `{ id: "mcp", label: "MCP" }`
- `{ id: "agents", label: "Agents" }`

`src/App.tsx` 的 `renderPage` 增加三个 case：

- `hooks` 渲染 `HooksPage`
- `mcp` 渲染 `McpPage`
- `agents` 渲染 `AgentsPage`

顶部 segmented nav 已按 `NAV_ITEMS.length` 动态计算宽度，新增 tab 后滑块逻辑不需要改算法，但测试需要更新 index 断言。

## 错误处理

- 单个配置文件读取失败：对应卡片展示错误信息，其他卡片继续渲染。
- JSON / TOML 解析失败：对应能力配置卡片切到原始文本视图，并展示解析错误。
- 保存失败：沿用现有错误提示，不清空草稿。
- VSCode / Finder 打开失败：沿用现有错误提示。
- 配置目录未设置或为空：卡片展示不可读取状态，不触发保存。

## 测试策略

按 TDD 实施，先写失败测试，再写实现。

前端测试：

- `App.test.tsx` 验证新导航包含 `Hooks`、`MCP`、`Agents`，点击后能切到对应页面。
- `App.test.tsx` 更新插件 tab 的滑块位置断言。
- `CapabilityConfigEditor.test.tsx` 验证只渲染传入的字段路径，不渲染同 schema 其他字段。
- `CapabilityConfigEditor.test.tsx` 验证保存能力页字段时保留未展示字段。
- `HooksPage.test.tsx` 验证 Claude 与 Codex 区块都出现，且 Codex `hooks.json` 编辑器存在。
- `McpPage.test.tsx` 验证 Claude / Codex MCP 字段出现，敏感和危险徽章存在。
- `AgentsPage.test.tsx` 验证 `CLAUDE.md`、`AGENTS.md` 与 agent 配置字段都出现。

构建验证：

- `npm test -- --runInBand` 或项目当前可用的 Vitest 命令
- `npm run build`

## 验收标准

1. 顶部导航能看到并进入 `Hooks`、`MCP`、`Agents`。
2. `Hooks` 页能编辑 Claude `settings.json` 的 hook 字段和 Codex `config.toml` / `hooks.json` hook 配置。
3. `MCP` 页能编辑 Claude 与 Codex 的 MCP 相关字段。
4. `Agents` 页能编辑 `CLAUDE.md`、`AGENTS.md` 和 Claude / Codex agent 相关字段。
5. 能力页保存某个字段后，原配置文件中的无关字段仍然保留。
6. 解析失败、文件不存在、保存失败都只影响对应卡片。
7. 原 Claude / Codex 页面仍可完整编辑原配置文件。
