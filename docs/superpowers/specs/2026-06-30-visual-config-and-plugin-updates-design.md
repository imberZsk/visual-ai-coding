# Visual Config And Plugin Updates Design

## 背景

当前应用是 Tauri 1.5 + React + TypeScript，用于管理 Claude Code 与 Codex 的配置、插件和工具状态。现有 Claude / Codex 配置页主要通过通用 `ConfigEditor` 以 textarea 方式编辑 `settings.json`、`config.toml` 等文件；插件页只展示 Claude 插件和市场，并提供手动更新按钮，没有预先检查“是否有可更新版本”。

本次目标是让 Claude `settings.json` 与 Codex `config.toml` 的已知配置项都具备可视化编辑能力，并让 Claude / Codex 插件都显示是否有新版本可拉取。

参考来源：

- Claude Code settings 官方文档：`https://docs.anthropic.com/en/docs/claude-code/settings`
- Codex CLI 配置参考：`https://developers.openai.com/codex/config-reference`
- 本机 CLI 行为采样：`claude plugin list --json --available`、`codex plugin list --json --available`、`codex plugin marketplace upgrade --help`、`codex plugin add --help`

## 目标

1. Claude `settings.json` 的官方已知字段以表单方式展示和编辑，并显示字段用途、是否已设置、风险提示和适用范围。
2. Codex `config.toml` 的官方已知字段以表单方式展示和编辑，并显示字段用途、是否已设置、风险提示和适用范围。
3. 未知字段、未来新增字段、自定义字段必须保留，并在“高级字段”区域可查看和编辑。
4. Claude 插件页显示当前版本、市场可用版本、是否可更新，并保留按 scope 更新的能力。
5. Codex 插件页显示当前版本、市场可用版本、是否可更新，并提供刷新 marketplace / 重新安装拉取更新的入口。
6. 任一工具的配置解析或插件检查失败时，只影响对应区块，并展示可读错误，不阻断其他页面或工具。

## 非目标

1. 不做完整在线文档同步系统；字段元数据由项目内静态 schema 维护。
2. 不保证保留 TOML 注释、空行和原始键顺序；可视化保存会生成规范化文本，原始文本编辑仍可用于手工精修。
3. 不在第一版处理所有项目级 / 本地级 / 托管级配置文件的合并预览；第一版聚焦用户配置目录中的 `settings.json` 与 `config.toml`。
4. 不手写插件 marketplace 的 git 更新逻辑；更新和安装都通过官方 CLI 执行。

## 推荐方案

采用“元数据驱动表单 + 原始文本兜底”的方案。

字段元数据负责描述每个已知配置项：

- `path`：配置路径，如 `permissions.defaultMode` 或 `model_providers.OpenAI.base_url`
- `title`：界面展示名称
- `description`：字段用途说明
- `control`：控件类型，如 `switch`、`text`、`number`、`select`、`string-list`、`json-object`
- `defaultValue`：官方或 CLI 默认值，未知时为空
- `options`：枚举值列表
- `scope`：用户级、项目级、本地级、托管级、机器本地等说明
- `risk`：普通、敏感、危险、实验性等提示
- `sensitive`：是否默认脱敏展示
- `group`：界面分组

解析后的配置和字段元数据共同驱动可视化 UI；保存时根据表单状态写回配置对象，再序列化为 JSON / TOML，并保留 schema 未覆盖字段。

## 配置页设计

### Claude `settings.json`

Claude 页面保留现有文件卡片结构，但 `settings.json` 使用专门的 `VisualConfigEditor`。该编辑器提供“可视化”和“原始 JSON”两个视图。

可视化分组：

- 模型与推理：`model`、`fallbackModel`、`effortLevel`、`prompt_suggestions`、`verbose`
- 权限：`permissions.allow`、`permissions.deny`、`permissions.ask`、`permissions.defaultMode`、危险模式提示字段
- 环境变量：`env`，敏感 key 默认脱敏，如 token、password、secret、key
- Hooks：`hooks`，按事件展示 matcher、type、command、timeout
- MCP / 工具：`mcpServers`、`allowedTools`、`disallowedTools`、`tools`
- 插件与市场：`enabledPlugins`、`disabledPlugins`、`extraKnownMarketplaces`
- 更新与诊断：`autoUpdates`、`autoUpdatesChannel`、调试和 telemetry 类字段
- UI 与行为：`statusLine`、提示、终端/界面行为类字段
- 高级字段：schema 未覆盖的顶层或嵌套字段

交互规则：

- 布尔字段使用开关，并显示“未设置 / 已设置为 true / 已设置为 false”。
- 枚举字段使用选择框，并在旁边展示默认值。
- 数组字段使用可增删列表，空数组和未设置明确区分。
- 对象字段使用轻量 JSON 编辑器，保存前做 JSON 校验。
- 敏感值默认显示为 `••••••`，点击“显示/编辑”后才展示真实值。
- 对权限、危险模式、自动更新等字段展示风险徽章。

### Codex `config.toml`

Codex 页面同样为 `config.toml` 提供“可视化”和“原始 TOML”两个视图。

可视化分组：

- 模型与 provider：`model_provider`、`model`、`review_model`、`model_providers.*`
- 推理与存储：`model_reasoning_effort`、`disable_response_storage`
- 沙箱 / 审批 / 网络：`sandbox_mode`、`approval_policy`、`network_access`、`sandbox_permissions`
- 通知：`notify`
- 功能开关：`features.*`
- Desktop / TUI：`desktop.*`、`tui.*`
- MCP：`mcp_servers.*`，包含 command、args、env、startup timeout
- 插件与市场：`plugins.*`、`marketplaces.*`
- 项目信任：`projects.*.trust_level`
- 高级字段：schema 未覆盖的表、数组或键

Codex 字段说明必须标明作用域限制。项目级配置不应误导用户覆盖 provider、认证、notify 等机器本地字段；这些字段在用户级可编辑，在项目级场景仅显示说明或警告。

## 插件页设计

插件页扩展为双工具视图：

- Claude 插件
- Codex 插件

每个工具区块包含：

- 已安装插件列表
- 市场可用版本
- 当前版本
- 最新版本
- 是否启用
- 安装作用域或来源
- 安装路径
- 最近更新时间
- 检查状态：未检查、检查中、已最新、可更新、检查失败
- 操作：刷新列表、更新 marketplace、拉取更新、Finder 打开

### Claude 插件更新检查

优先执行 `claude plugin list --json --available`，解析 `installed` 和 `available` 两组数据。

匹配规则：

- 已安装插件使用 `id`，形如 `name@marketplace`
- 可用插件使用 `pluginId`，同样形如 `name@marketplace`
- 同一插件多 scope 安装时，以 `id + scope + installPath` 作为 UI key

版本比较：

- 先按 semver 比较。
- 如果不是标准 semver，则按字符串不等提示“版本不同”，不强行判断高低。

更新命令：

- 单插件更新使用现有命令：`claude plugin update <plugin> -s <scope>`
- 市场刷新使用现有命令：`claude plugin marketplace update <marketplace>`
- 更新成功后重新加载插件和市场状态。

### Codex 插件更新检查

新增后端命令执行 `codex plugin list --json --available`。该命令可能因某个 marketplace snapshot 无效而整体失败；失败时 Codex 插件区块展示错误，不影响 Claude 插件区块。

匹配规则：

- 从 `codex plugin list --json --available` 解析已安装和可用插件。
- 从 `config.toml` 的 `[plugins."<id>"]` 读取 enabled 状态作为补充。
- 以 `plugin@marketplace` 作为主匹配键。

更新流程：

- 优先执行 `codex plugin marketplace upgrade <marketplace> --json` 刷新对应市场。
- 刷新后执行 `codex plugin add <plugin@marketplace> --json` 拉取最新版本。
- 若 CLI 后续提供直接插件更新命令，可替换为直接命令，但第一版不绕开 CLI 自己操作缓存。
- 更新成功后重新加载插件状态。

## 数据结构

前端新增类型：

- `VisualConfigSchema`
- `VisualConfigGroup`
- `VisualConfigField`
- `VisualConfigValueState`
- `PluginUpdateInfo`
- `PluginUpdateStatus`

后端新增或扩展类型：

- `ToolPluginInfo`
- `ToolMarketplaceInfo`
- `PluginAvailableInfo`
- `PluginUpdateCheckResult`
- `PluginUpdateCommandResult`

Claude 现有 `PluginInfo` / `MarketplaceInfo` 可保留兼容，但新接口应使用工具无关结构，避免前端为 Claude 和 Codex 写两套重复 UI。

## 保存策略

1. 读取文件原文。
2. 解析为 JSON 或 TOML value。
3. 根据 schema 提取可视化字段状态。
4. 用户修改字段。
5. 将修改写回解析对象。
6. 保留 schema 未覆盖字段。
7. 序列化为格式化 JSON / TOML。
8. 调用现有后端 `save_config_file`，继续使用原子写入和语法校验。

原始文本视图仍可直接编辑完整文件；切回可视化视图前必须先成功解析，否则停留在原始视图并显示错误。

## 错误处理

- JSON / TOML 解析失败：显示原始编辑器和错误位置，不渲染可视化表单。
- 单字段校验失败：阻止保存，并定位到字段。
- 敏感字段为空：允许保存，但显示提示。
- 插件 CLI 不存在：显示“未找到 CLI”，不影响配置编辑。
- 插件 JSON 输出格式未知：显示“无法解析 CLI 输出”，并保留原始输出供复制。
- Codex marketplace snapshot 失败：只标记 Codex 插件检查失败，Claude 插件继续可用。
- 更新命令失败：展示 stdout / stderr 合并文本，列表保持更新前状态。

## 测试策略

按 TDD 实施，先写失败测试，再写实现。

纯函数测试：

- 按路径读取嵌套 JSON / TOML 字段。
- 按路径写入嵌套 JSON / TOML 字段。
- 未知字段在保存后保留。
- 空数组和未设置能区分。
- 敏感 key 能脱敏。
- semver 与非 semver 版本比较行为正确。

Rust 命令测试：

- Claude 插件 JSON 能解析 installed / available。
- Claude 可更新状态能按 `id + scope` 匹配。
- Codex 插件 JSON 能解析 installed / available。
- Codex marketplace 错误能返回结构化错误。
- CLI 失败时 stdout / stderr 被保留。

构建验证：

- `npm run build`
- `cd src-tauri && cargo test`

## 文件影响范围

预计新增：

- `src/components/VisualConfigEditor.tsx`
- `src/components/visual-config/FieldRenderer.tsx`
- `src/components/visual-config/schemaTypes.ts`
- `src/config/claudeSettingsSchema.ts`
- `src/config/codexConfigSchema.ts`
- `src/utils/configPath.ts`
- `src/utils/versionCompare.ts`
- `src-tauri/src/commands/plugin_updates.rs`

预计修改：

- `src/pages/ClaudePage.tsx`
- `src/pages/CodexPage.tsx`
- `src/pages/PluginsPage.tsx`
- `src/api.ts`
- `src/types.ts`
- `src-tauri/src/commands/plugins.rs`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/main.rs`

若实现中发现 `VisualConfigEditor` 过大，应按字段渲染、分组导航、原始编辑三个责任继续拆分。

## 验收标准

1. Claude `settings.json` 已知字段可在 UI 中查看说明、查看是否设置、修改并保存。
2. Codex `config.toml` 已知字段可在 UI 中查看说明、查看是否设置、修改并保存。
3. 未知字段不会因可视化保存丢失。
4. 敏感字段默认脱敏。
5. Claude 插件能显示是否可更新，并能拉取更新。
6. Codex 插件能显示是否可更新，并能拉取更新或给出 CLI 失败原因。
7. 一个工具的插件检查失败不影响另一个工具。
8. `npm run build` 和 `cargo test` 通过。
