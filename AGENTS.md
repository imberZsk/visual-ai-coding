# AGENTS.md

本文件为 AI 编码助手在本仓库工作时提供指导。

## 项目概述

Visual AI Coding 是一个 Electron 桌面应用（macOS），用图形界面统一管理散落在 `~/.claude`、`~/.codex` 下的配置文件、插件与工具：探测 CLI 安装状态、可视化编辑核心配置（带语法校验与原始文本兜底）、检查并拉取插件更新。

技术栈：Electron（主进程 + preload 安全桥 + Vite 渲染进程）+ React 18 + TypeScript + Tailwind CSS 3 + Zustand。

## 常用命令

```bash
npm run dev          # 开发模式（Electron + Vite 热更新，固定 5273 端口）
npm run dist         # 打包 .app + .dmg
npm run build        # 类型检查 (tsc) + 渲染进程构建
npm run verify:boot  # 构建并运行 Electron 启动冒烟测试
npm test             # 运行全部前端/脚本测试（vitest run）
npm run test:watch   # watch 模式
```

运行单个测试文件或用例：

```bash
npx vitest run src/utils/versionCompare.test.ts          # 单文件
npx vitest run -t "resolveDevServerAction"               # 按用例名过滤
npx vitest run test/core/plugins.test.js                 # 单个 Node 后端测试
```

`.npmrc` 指向内网 npm registry，`npm install` 需能访问该地址。

## 架构

### 前后端边界（关键约束）

Electron 渲染进程必须保持 `contextIsolation: true` 与 `nodeIntegration: false`。前端**没有**任何 Node fs/shell 能力。所有文件读写、进程调用都必须走 preload 暴露的受限 `window.api`：

1. 在 `src/core/<域>.js` 写纯后端逻辑，优先保持可单测
2. 在 `electron/ipcChannels.js` 增加 IPC 通道常量
3. 在 `electron/ipcHandlers.js` 注册 `ipcMain.handle(...)`
4. 在 `electron/preload.cjs` 暴露对应 `window.api` 方法
5. 在 `src/api.ts` 增加封装（前端组件只依赖 `api.ts`，不直接访问 `window.api`）

后端逻辑按域分模块：`preferences`（偏好持久化）、`settings`（配置文件读写与目录浏览）、`plugins`（Claude/Codex 插件列表与更新）、`skills`（Skill 扫描）、`system`（工具探测、VSCode/Finder 打开）、`officialSettings`（官方设置同步）、`util`（共享工具）。

### 后端共享工具（`src/core/util.js`）

跨命令复用，改动前先读这里：
- `expandHome` — 展开 `~` / `~/xxx`（`~otheruser` 不展开）
- `atomicWrite` — 临时文件 + rename 原子替换，防止写入中途崩溃损坏配置
- `runCommand` / `buildCommandEnv` — 用登录 shell 解析出的真实 `$PATH` 执行外部命令。**WHY**：macOS 从 Finder 启动的 GUI 应用只继承极简 PATH，探测不到装在 nvm/homebrew/`~/.local/bin` 下的 `claude`/`code` CLI，必须用它执行外部命令

### 前端状态（`src/store.ts`）

单一 Zustand store 集中管理偏好、工具探测结果、插件检查/更新状态、工具版本查询状态。关键模式：**异步任务的 Promise 存进 store**（`checking`/`updating`/`toolVersionChecking` 等映射），这样切换 tab 组件卸载后任务仍继续执行、进度不丢，重复点击时复用同一 Promise 防重复调用 CLI。

`updatePrefs` 乐观更新内存再落盘，失败回滚。偏好持久化到 `~/.visualAiCoding/preferences.json`。

### 页面与导航

`App.tsx` 用 `renderPage(tab)` 按 `prefs.last_active_tab` 切换页面（非路由库）。页面在 `src/pages/`：Dashboard、Claude/Codex 配置页、Hooks、Mcp、Agents、Plugins、Skills、Settings。导航项定义在 `src/config.ts` 的 `NAV_ITEMS`。

### 可视化配置编辑

`src/config/` 下的 schema（`claudeSettingsSchema.ts`、`codexConfigSchema.ts`）描述已知字段如何渲染成表单，`VisualConfigEditor` + `visual-config/FieldRenderer` 消费。核心行为：schema 未覆盖的未知字段**保留可见**（高级字段区），并可整体切回原始文本编辑；保存前后端按 `format` 做 JSON/TOML 语法校验再落盘。`src/config.ts` 的 `CLAUDE_CONFIG_FILES` / `CODEX_CONFIG_FILES` 定义每个可编辑文件的路径与只读标记。

### 主题

Tailwind `darkMode: "class"`，语义色（surface/panel/accent/text-main 等）通过 CSS 变量 `rgb(var(--x) / <alpha-value>)` 驱动，运行时切换主题只改 CSS 变量。用 `useTheme` hook 应用，支持浅色/深色/跟随系统。写样式用语义色类名（`bg-surface`、`text-text-muted`），不要写死颜色。

### dev 脚本

`scripts/dev-or-reuse.mjs`：检查 Electron 渲染进程开发端口 5273；端口空闲时启动 Vite，端口已有可访问 dev server 时复用，端口被非 HTTP 服务占用时阻止启动。`scripts/verify-boot.mjs` 构建后以生产模式启动 Electron 并验证 preload API。

## 强制流程（来自仓库根 AGENTS.md）

新增功能时必须同步更新三处，缺一不可：
1. **功能清单** `功能清单.md` — 在对应模块表格补「功能名 + 一句话用途」
2. **CHANGELOG** `CHANGELOG.md` — 顶部新增一条记录
3. **版本号** `package.json` 的 `version` — 语义化版本（功能升 minor / 修复升 patch / 破坏性升 major）

改了 `scripts/work-auto-scripts` 下脚本要在该目录 README 补一句说明。并行/worktree 工作流汇报完成后，先在 main 上真实跑一遍构建和完整测试再宣布成功。小功能直接在当前分支开发，不用 worktree。

## 代码注释规范（来自全局 CLAUDE.md）

每个函数/方法、每个变量都必须加注释；非显而易见的 if/switch 分支注释业务场景；复杂逻辑/workaround 注释 WHY 而非 WHAT。现有代码严格遵循此风格，新增代码需保持一致。交流与文档使用中文。
- 容易阻塞的任务需要异步处理，需要增加loading，统一loading

## 开发

开发的时候，强制考虑 antd 是否有合适的组件，优先使用 antd 组件实现
