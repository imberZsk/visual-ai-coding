# Changelog

本项目所有重要变更记录于此，遵循语义化版本规则。

## 0.9.0 - 2026-07-13

### 新增

- 概览页查询 Claude Code / Codex CLI 最新版本后，可点击“查看更新内容”并在系统浏览器打开对应的官方 changelog 或 releases 页面。

### 测试

- 补充官方更新页映射、HTTPS 外链安全校验与概览页更新内容入口的回归测试。

## 0.8.8 - 2026-07-08

### 修复

- 移除可视化配置字段排序中的“默认顺序”选项，保留更有实际用途的“已设置优先”和“未设置优先”。
- 将复杂 JSON / 列表字段从弹窗编辑改为展开项内联大文本框，合法内容自动同步到字段草稿，非法 JSON 保留在文本框内并显示错误。

### 测试

- 更新可视化配置与能力页回归测试，覆盖内联复杂字段编辑、非法 JSON 防污染和默认排序选项移除。

## 0.8.7 - 2026-07-08

### 修复

- 查询 CLI 最新版本时同步重新探测本地工具状态，避免外部更新或后台更新后页面继续展示启动时缓存的旧版本。
- 将成功、警告和危险语义色调整为更标准的通过绿、提醒黄与错误红，并同步 Ant Design 主题 token，避免状态标识过浅难辨。

### 测试

- 补充查询最新版本后刷新本地探测结果的 Dashboard 回归测试。
- 补充主题状态色回归测试，锁定浅色和暗色主题下的成功、警告与危险 token。

## 0.8.6 - 2026-07-08

### 修复

- 优化可视化配置字段的设置状态标识：已设置字段仅在状态胶囊与圆点上使用绿色成功态，避免整行染绿造成视觉负担，未设置字段保持中性。

### 测试

- 补充字段状态标识回归测试，覆盖已设置成功态与未设置中性态。

## 0.8.5 - 2026-07-08

### 修复

- 修复 Claude Code 从 Volta 安装时点击“更新到最新版”只执行 npm 全局安装、但实际 `claude` shim 仍停留在旧版本的问题；现在会按当前 CLI 路径选择 Volta 或 npm，并在安装后校验真实版本。

### 测试

- 补充 CLI 更新命令参数、Volta 路径识别和版本输出解析的后端回归测试。

## 0.8.4 - 2026-07-08

### 修复

- 修复按钮 loading 图标与文字基线不齐的问题，并强化暗色模式下默认按钮和主按钮 hover 的可读性。
- 将 Switch 打开态恢复为用户熟悉的 Ant Design 蓝色，同时保留柔和把手和暗色适配，避免打开状态显示成纯白难以辨认。

### 测试

- 补充公共 loading 图标尺寸与主题色回归测试，覆盖 Switch 蓝色打开态和暗色按钮 hover token。

## 0.8.3 - 2026-07-08

### 修复

- 将浅色主题面板和 Ant Design 容器 token 从纯白收敛为偏纸面的灰白，保持黑白石墨主题但避免纯黑纯白造成的刺眼断层。

### 测试

- 补充主题回归测试，覆盖浅色 CSS 面板变量和 Ant Design 容器 token 不再使用纯白。

## 0.8.2 - 2026-07-08

### 修复

- 修复可视化配置编辑器布局过于粘连的问题：文件头、排序工具条、配置分组、高级字段和状态提示拆为独立模块，不再由一个大外框连续包住所有内容。
- 降低配置字段行的边框和背景重量，让 Claude Code、Codex、Hooks、MCP、Agents 等页面里的 settings/config 模块更清爽、模块边界更明确。

### 测试

- 补充配置模块拆分布局回归测试，确保文件头不会再次包住排序工具条和字段分组。

## 0.8.1 - 2026-07-08

### 修复

- 将上一版偏青绿的控制台主题收敛为黑白石墨系：深色默认背景、浅色纸白背景、主按钮、Switch、Link、Tag、侧边栏选中态和 Ant Design token 全部同步到低饱和中性体系。
- 优化 Claude Code、Codex、Hooks、MCP、Agents 等页面复用的配置模块层次：文件头、路径元信息、排序工具条、分组区域和字段行拆分为更清晰的属性面板结构，减少配置项之间“融合不清晰”的观感。
- 字段行头部重新组织为标题、真实配置 key、设置状态、说明、作用域和默认值等独立层级，降低彩色标签堆叠造成的视觉噪音。

### 测试

- 更新黑白石墨主题 token、首屏暗色背景、配置文件模块结构和字段行层次的回归测试。

## 0.8.0 - 2026-07-07

### 变更

- UI 大改为控制台式左侧导航：概览、配置、Hooks、MCP、Agents、插件与技能入口统一放入侧边栏，设置与主题切换保留为底部工具操作。
- 默认主题改为深色，并重做浅色 / 深色语义色与 Ant Design token，使页面背景、卡片、表格、抽屉、输入框和按钮风格更清爽统一。
- 新增统一 `PageShell` 页面外壳，收敛各页面内容宽度、边距和标题分隔；配置编辑器与插件卡片操作区支持换行，减少窄窗口挤压。

### 测试

- 补充侧边导航、默认深色偏好、首屏深色背景、主题 token 和页面外壳测试，并更新页面交互测试以覆盖新导航语义。

## 0.7.0 - 2026-07-03

### 新增

- 插件管理页：为 Claude Code 与 Codex 插件新增单插件启用/禁用开关；Claude 通过官方 CLI 执行启停，Codex 原子写回 `config.toml` 的插件启用状态。

### 测试

- 补充插件启停后端、IPC 注册与页面交互测试，覆盖参数构造、Codex TOML 写回、开关 loading 和失败反馈。

## 0.6.3 - 2026-07-03

### 修复

- 优化可视化配置项关闭动画：收起时保留详情内容到 Ant Design Collapse 关闭动画结束后再卸载，避免内容提前清空导致关闭过程跳动或闪断。

### 测试

- 补充字段关闭动画回归测试，覆盖收起期间详情内容保留、动画结束后卸载的行为。

## 0.6.2 - 2026-07-03

### 修复

- 修复可视化配置项展开时“先动一下、中途停顿、再展开完成”的二段式卡顿：移除字段详情内层 `setTimeout + grid-template-rows` 动画，避免与 Ant Design Collapse 的高度测量和展开动画叠加。

### 测试

- 补充字段展开即时可交互测试，确保详情区不再进入延迟的 `opening` 状态，也不再携带内层 grid 高度过渡。

## 0.6.1 - 2026-07-03

### 修复

- 优化可视化配置项展示性能：收起状态不再提前创建字段表单控件、Select 候选项和复杂对象预览，减少 Ant Design 组件化后首次展示与切换时的卡顿。

### 测试

- 新增 `FieldRenderer` 懒渲染回归测试，覆盖收起复杂字段不会提前序列化预览内容。

## 0.6.0 - 2026-07-03

### 变更

- 可视化配置项改用 Ant Design `Collapse`、`Form`、`Input`、`InputNumber`、`Select`、`Switch`、`Modal` 与 `Alert` 承载，配置选项、字段编辑和弹窗质感更统一。
- 原始配置编辑器、outputStyle 专用控件、设置抽屉、设置页、技能页与插件页提示统一替换为 Ant Design 组件，减少手写控件造成的视觉割裂。
- 设置入口改用 Ant Design `Drawer`，主题和排序等分段选项统一使用 `Segmented`。

### 测试

- 补充可视化配置编辑器的 Ant Design 结构测试，并为 jsdom 测试环境补齐 `matchMedia` 与 `getComputedStyle` 兼容层。

## 0.5.3 - 2026-07-02

### 性能/体验改进

- **主进程异步化**：`electron/main.js` 将启动期 `execSync('launchctl getenv SSH_AUTH_SOCK')` 改为 `execFile` 异步回调，消除 Electron 启动阶段事件循环冻结；同步预热 `warmLoginPath()` 也在 `app.whenReady()` 后后台运行
- **登录 shell PATH 解析异步化**：`src/core/util.js` 的 `resolveLoginPath`/`buildCommandEnv`/`runCommand`/`spawnDetached` 全部改为 async，避免首次执行命令时同步启动完整登录 shell（耗时可达 2s），并导出 `warmLoginPath` 供启动时提前预热
- **IPC Handler 异步化**：`src/core/settings.js` 的 `listDir`、`readCustomOutputStyle`、`listClaudeOutputStyles` 改用 `fs/promises` 并行读取，不再阻塞主进程；`src/core/skills.js` 的 `collectSkillFiles`、`scanSkillRoot`、`listSkills` 全部改为 async，并发读取各目录下的 SKILL.md
- **SkillsPage 并发防护**：`loadSkills` 引入 `loadingRef` 序号机制，丢弃过期请求结果，防止快速触发时旧响应覆盖新响应



### 变更
- 顶部主导航页签改用 Ant Design `Segmented` 组件替换原手写的分段滑块。原实现用 `useLayoutEffect` + `getBoundingClientRect` 测量激活按钮宽度/偏移，再用绝对定位的 `<div>` 配合 `translateX` 模拟高亮滑块——首帧测量时机、字体加载与窗口尺寸变化都会让滑块与按钮错位（线框重叠、文字未居中）。Segmented 内建滑块动画、文字居中与无重叠布局，且已通过入口 `ConfigProvider` 接入项目主题，无需再手写测量逻辑。Dashboard 等不在 `NAV_ITEMS` 的隐藏入口天然不高亮任何页签，替代了原来手动隐藏滑块的分支。

## 0.5.1 - 2026-07-02

### 修复
- 消除 `pnpm dev` 启动时的 `npm warn Unknown env config` 警告：`dev` 脚本原用 `concurrently "npm:dev:vite" ...` 的 `npm:` 简写会 spawn 一个 npm 子进程，pnpm 会把自身独有的配置键（`verify-deps-before-run`、`_jsr-registry`、`npm-globalconfig`）通过 `npm_config_*` 环境变量注入子进程，npm 不认识这些键便报警。改为让 concurrently 直接内联执行底层命令（node/wait-on/electron），不再经过 `npm run` 这层，从而与包管理器解耦、警告消失。同步把 `start`、`verify:boot`、`dist` 中的 `npm run build` 内联为 `tsc && vite build`，避免这些命令在 pnpm 下触发同样警告。

## 0.5.0 - 2026-07-02

### 变更
- 前端公共 UI 原语切换为 Ant Design：loading 使用 `Spin`，按钮使用 AntD loading 状态，徽章、卡片与空状态分别复用 `Tag`、`Card`、`Empty`。
- 顶部主题、设置与关闭入口改用 Ant Design 图标，并保留中文无障碍名称。
- 入口新增 Ant Design `ConfigProvider`，浅色、深色与跟随系统主题下的 AntD 组件与项目语义色同步。
- 构建配置新增 AntD vendor chunk，避免 UI 库集中进入业务入口包。

### 测试
- 新增公共 UI 原语测试，覆盖 AntD Spin/Button/Tag/Card/Empty 结构与 loading 兼容标记。

## 0.4.0 - 2026-07-02

### 变更
- 运行时从 Tauri 重构为 Electron：新增主进程、preload 安全桥、IPC handler 与 `src/core` Node 后端模块。
- 前端 API 层改为通过 `window.api` 调用后端，移除 `@tauri-apps/*` 依赖与 `src-tauri` 后端目录。
- 开发/打包脚本改为 Vite + Electron，并新增 Electron 启动冒烟测试。

### 测试
- 新增 Node 后端与 Electron IPC 单元测试，覆盖路径展开、原子写入、配置校验、插件更新解析、Skill 扫描和 IPC 注册。

## 0.3.0 - 2026-07-01

### 新增
- 可视化配置项：为已在官方文档 / 官方 JSON Schema 中核实到固定默认值的字段（如 `autoCompactEnabled`、`theme`、`sandbox.enabled`、`allow_login_shell` 等）新增"默认值：xxx"展示，未核实到官方默认值的字段不展示，避免臆造数据。

## 0.2.1 - 2026-07-01

### 修复
- 插件管理页：最近更新时间改为北京时间中文格式，避免直接展示 ISO 时间中的 `T`、`Z` 等原始标记。

## 0.2.0 - 2026-07-01

### 新增
- 可视化配置项：每个字段标题旁展示真实配置 key/path，例如“默认模型”展示 `model`。
- 应用设置页：新增官方设置来源区，展示 Claude / Codex 配置来源 URL、同步时间、字段覆盖统计和未覆盖字段预览，并支持手动更新官方设置元数据。
- Claude Code 配置页：输出风格字段改为专用控件，可选择内置/自定义 output style，缺失时提示目标 Markdown 路径并支持一键创建。
- 统一 loading 反馈：配置加载/保存、字段级保存、路径保存、官方设置更新、outputStyle 扫描与创建均展示一致的加载图标与禁用态。

## 0.1.0 - 2026-06-29

首个版本。可视化管理 Claude Code 与 Codex 的配置、插件与工具。

### 新增
- 概览页：探测本机 Claude Code / Codex CLI 安装状态、版本、路径，配置目录一键 Finder / VSCode 打开
- Claude Code 配置页：可视化编辑 settings.json、CLAUDE.md，只读查看插件与市场清单
- Codex 配置页：可视化编辑 config.toml、AGENTS.md、hooks.json，只读查看 version.json
- 插件管理页：展示已安装插件与市场，支持手动点击更新（按 scope 更新到正确位置）
- 应用设置页：浅色 / 深色 / 跟随系统主题切换，VSCode 与配置目录路径自定义
- 偏好持久化到 ~/.visualAiCoding/preferences.json
- 保存配置前做 JSON / TOML 语法校验

### 健壮性（首轮代码审查后修复）
- 原子写入（临时文件 + rename），防止写入中途崩溃损坏 settings.json / config.toml 等配置
- 登录 shell PATH 解析，修复 macOS 从 Finder 启动的 GUI 应用不继承终端 PATH、导致 claude / code CLI 探测与插件更新失败的问题
- 插件更新透传 scope，修复 project 作用域插件更新错对象的问题
- 偏好保存失败时回滚内存状态，避免 UI 与磁盘不一致
- 偏好文件损坏时先备份为 .corrupted 再回退默认值，避免覆盖丢失

### 技术
- 技术栈：Tauri 1.5 + React 18 + TypeScript + Tailwind CSS 3
- 14 个 Rust 单元测试覆盖路径展开、格式推断、内容校验、原子写入
- 通过 dmg 打包验收
