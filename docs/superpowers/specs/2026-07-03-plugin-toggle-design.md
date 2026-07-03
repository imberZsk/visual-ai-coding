# 插件单项启停设计

## 背景

当前插件页已经能展示 Claude Code 与 Codex 插件的安装状态、启用状态、版本状态，并支持检查更新与拉取更新。页面中的“已启用/已禁用”目前只是只读徽章，用户无法在图形界面里直接启停某一个插件。

用户首版选择只做插件单项开关，不覆盖 MCP、Hook、Skill。这样能优先解决最清晰、风险最低的管理场景，同时避免把不同工具对 MCP、Hook、Skill 的禁用语义混在同一次改动里。

## 目标

- 在插件页为每一个 Claude / Codex 插件提供单独的启用/禁用开关。
- 开关必须写入工具真实配置或调用工具官方命令，刷新页面后状态仍然可信。
- 单个插件切换时展示 loading，避免重复点击触发多次操作。
- 切换失败时展示错误，并保持列表中原有状态。
- 切换成功后刷新当前工具的插件检查结果，确保版本、状态与诊断信息同步。

## 非目标

- 不实现 MCP、Hook、Skill 的单项开关。
- 不实现批量启用、批量禁用或全局开关。
- 不改变插件安装、卸载、更新流程。
- 不重新设计插件页布局，只在现有卡片操作区加入开关。

## 推荐方案

采用“真实配置开关”方案：

- Claude 插件启停调用官方 CLI：`claude plugin enable <plugin>` 与 `claude plugin disable <plugin>`，安装作用域存在时继续传递 `-s <scope>`。
- Codex 插件启停直接原子写回 `~/.codex/config.toml`：维护 `[plugins."<id>"].enabled = true/false`。
- 前端只负责展示开关、loading 与反馈，不把临时 UI 状态当作最终事实来源。
- 操作完成后重新调用当前工具的插件检查逻辑，列表以真实后端返回为准。

选择这个方案的原因是 Claude 已有官方启停命令，应优先使用工具自己的语义；Codex 当前 `codex plugin` CLI 只有 add/list/remove，没有 enable/disable，因此写回 `config.toml` 是当前可验证的真实持久化路径。

## 用户体验

插件卡片保留现有信息：

- 插件 ID、版本、更新状态、安装作用域、启用状态徽章。
- marketplace、最新版本、最近更新时间、安装路径。
- Finder 与拉取更新按钮。

新增交互：

- 在操作区加入“启用”开关。
- 开关当前值来自 `plugin.enabled`。
- 点击开关后只让该插件开关进入 loading。
- 同一插件切换过程中，开关禁用并复用同一个 Promise，避免重复调用 CLI 或重复写文件。
- 操作成功后显示成功提示，并刷新当前工具插件列表。
- 操作失败后显示错误提示，列表状态保持后端刷新前的原值。

## 架构

后端新增插件启停能力，沿用现有 Electron 边界：

1. `src/core/plugins.js` 增加纯业务函数：
   - `setClaudePluginEnabled(pluginName, scope, enabled)`
   - `setCodexPluginEnabled(codexHome, pluginId, enabled)`
2. `electron/ipcChannels.js` 增加插件启停 IPC 通道。
3. `electron/ipcHandlers.js` 注册 handler。
4. `electron/preload.cjs` 暴露受限 API。
5. `src/electron-api.d.ts` 与 `src/api.ts` 增加类型与封装。
6. `src/store.ts` 增加插件启停异步状态。
7. `src/pages/PluginsPage.tsx` 在插件卡片中渲染开关。

前端仍然只依赖 `src/api.ts`，不直接访问 `window.api`。

## 后端细节

Claude：

- 使用现有 `runPluginCli` 路径执行命令，保留 macOS GUI 场景下登录 shell PATH 的兼容能力。
- `enabled === true` 时执行 `claude plugin enable <plugin>`。
- `enabled === false` 时执行 `claude plugin disable <plugin>`。
- `scope` 非空时追加 `-s <scope>`。
- 使用 `CLAUDE_HOME` 指向用户偏好里的 Claude 根目录。

Codex：

- 读取用户偏好里的 `codex_home/config.toml`。
- 解析 TOML 根对象。
- 确保 `plugins` 表存在。
- 确保目标插件表存在。
- 写入 `plugins[pluginId].enabled = enabled`。
- 使用 `smol-toml` 序列化，并通过 `atomicWrite` 原子落盘。
- 如果 `pluginId` 为空，直接抛出明确错误。

## Store 状态

`pluginPage` 增加：

- `toggle`：最近一次启停操作的反馈信息，包含目标插件、阶段和输出文本。
- `toggling`：按 `tool/id/scope/install_path` 记录正在执行的 Promise。

新增 action：

- `setPluginEnabled(tool, plugin, enabled)`。

行为：

- 同一插件已有切换任务时直接返回已有 Promise。
- 切换前写入 loading 反馈。
- 调用后端 API。
- 成功后写入成功反馈并刷新当前工具列表。
- 失败后写入错误反馈。
- finally 中清理该插件的切换任务。

## 错误处理

- CLI 执行失败时，把 stdout/stderr 合并后的可读错误透传给页面。
- TOML 解析失败时提示 `config.toml` 格式错误。
- TOML 写入失败时依赖 `atomicWrite` 抛出的错误，避免静默失败。
- 如果用户没有配置对应 home 目录，action 直接返回并给出错误提示。

## 测试

后端测试：

- Claude 启用命令参数包含 `plugin enable` 与 scope。
- Claude 禁用命令参数包含 `plugin disable` 与 scope。
- Codex 能在已有 `[plugins."<id>"]` 中切换 `enabled`。
- Codex 能在缺失目标插件表时创建表并写入 `enabled`。
- Codex 遇到非法 TOML 时抛出清晰错误。

前端测试：

- 插件卡片显示启用开关。
- 点击开关调用 store action，传入目标插件和目标状态。
- 切换中只对应插件开关 loading。
- 切换失败时显示错误反馈。

验证命令：

- `npx vitest run test/core/plugins.test.js`
- `npx vitest run src/pages/PluginsPage.test.tsx`
- `npm test`
- `npm run build`

## 验收标准

- Claude 插件可以在 UI 中单独启用和禁用。
- Codex 插件可以在 UI 中单独启用和禁用。
- 切换后重新打开插件页，状态仍与真实配置一致。
- 切换过程中不会重复执行同一插件的启停操作。
- 原有检查更新与拉取更新功能不回归。
