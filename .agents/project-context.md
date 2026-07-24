# 项目上下文

Visual AI Coding 是 Electron + React + TypeScript 桌面应用，用于可视化管理 `~/.claude`、`~/.codex` 下的配置、插件、Skills 与本地工具。

- Node.js `>=22.12.0`，包管理器 `pnpm@11.13.0`。
- 技术栈：Electron、React 19、TypeScript、Ant Design 6、Tailwind CSS、Vite、Vitest、Zustand。
- 偏好存储在 `~/.visualAiCoding/preferences.json`；不得提交真实 AI 配置、凭据或个人绝对路径。
- Vite 开发端口固定为 5274。

```bash
pnpm run lint
pnpm test
pnpm run build
pnpm run verify:boot
pnpm run dist
pnpm run dist:win
```
