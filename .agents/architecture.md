# 架构约束

- `src/core/` 按 preferences、settings、plugins、skills、system、officialSettings 等领域放纯 Node 逻辑。
- `electron/` 只负责窗口、系统副作用、IPC 注册和 preload；渲染进程不得直接使用 Node 能力。
- 前端组件只依赖 `src/api.ts`，调用链保持 `组件/store -> api.ts -> window.api -> preload -> ipcHandlers -> src/core`。
- `src/core/util.js` 的 `expandHome`、`atomicWrite`、`runCommand` 和 `buildCommandEnv` 是共享边界工具，改动前检查全部调用方。
- 单一 Zustand store 管理偏好和异步任务；长任务 Promise 保存在 store，切页后继续执行并防止重复调用。
- 可视化配置编辑必须保留 schema 未覆盖字段，并始终提供原始文本兜底和保存前语法校验。
- 项目为 ESM，只有 `electron/preload.cjs` 保持 CommonJS。
