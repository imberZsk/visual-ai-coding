# Changelog

本项目所有重要变更记录于此，遵循语义化版本规则。

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
