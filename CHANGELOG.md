# Changelog

本项目所有重要变更记录于此，遵循语义化版本规则。

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
