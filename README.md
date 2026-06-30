# Visual AI Coding

可视化管理 Claude Code 与 Codex 的配置、插件与工具。

把散落在 `~/.claude`、`~/.codex` 下的配置文件、插件、市场用图形界面统一管理：查看工具安装状态、可视化编辑核心配置（带语法校验与原始文本兜底）、检查插件可用版本并拉取更新、一键在 VSCode / Finder 打开，支持主题切换。

## 技术栈

- Tauri 1.5（Rust 后端 + WebView 前端）
- React 18 + TypeScript
- Tailwind CSS 3（语义色变量驱动主题切换）
- Zustand（状态管理）

## 功能

| 页面 | 用途 |
| --- | --- |
| 概览 | 探测 Claude Code / Codex CLI 安装状态与版本，配置目录快速入口 |
| Claude Code | 可视化编辑 `settings.json`，编辑 `CLAUDE.md`，只读查看插件 / 市场清单 |
| Codex | 可视化编辑 `config.toml`，编辑 `AGENTS.md`、`hooks.json`，只读查看 `version.json` |
| 插件 | 展示 Claude / Codex 插件当前版本、可用版本与更新状态，支持拉取更新 |
| 应用设置 | 主题切换、VSCode 路径、配置目录自定义 |

应用偏好持久化到 `~/.visualAiCoding/preferences.json`。

## 开发

```bash
npm install          # 安装依赖
npm run tauri:dev    # 开发模式（热更新）
npm run tauri:build  # 打包 .app + .dmg
```

仅前端：

```bash
npm run dev          # Vite 开发服务器
npm run build        # 类型检查 + 前端构建
```

Rust 测试：

```bash
cd src-tauri && cargo test
```

## 设计要点

- **最小权限**：Tauri `allowlist.all = false`，所有文件读写、进程调用走自定义 `invoke` 命令，不暴露 JS 端 fs/shell API。
- **原子写入**：保存配置用「临时文件 + rename」，写入中途崩溃不会损坏原配置。
- **PATH 修正**：macOS GUI 应用从 Finder 启动不继承终端 PATH，通过登录 shell 解析真实 PATH，保证能找到用户安装的 `claude` / `code` CLI。
- **保存前校验**：JSON / TOML 内容先校验语法再落盘，避免写坏配置。
- **可视化配置编辑**：Claude `settings.json` 与 Codex `config.toml` 的已知字段以表单呈现，未知字段在高级字段区域保留可见，并可切回原始文本编辑。
- **插件更新状态**：插件页同时检查 Claude 与 Codex 插件版本；单个工具检查失败只影响对应区块，更新动作仍通过官方 CLI 执行。

## 平台

当前定位 macOS（用到 `open -R` 等 macOS 专有能力）。
