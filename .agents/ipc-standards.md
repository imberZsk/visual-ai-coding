# IPC 规范

- 新能力同步检查 `electron/ipcChannels.js`、`electron/preload.cjs`、`electron/ipcHandlers.js`、`src/api.ts`、核心实现和测试。
- 保持 `contextIsolation: true` 与 `nodeIntegration: false`，不暴露原始 `ipcRenderer`、fs 或 shell。
- preload 只暴露命名明确的最小业务 API；来自渲染层的路径和对象必须在主进程再次校验。
- handler 返回稳定、可序列化的结构，不跨进程传 Error、函数或 Electron 对象。
- 事件订阅返回精确取消函数，组件卸载时清理；访问窗口和接口结果前判空。
- 可测试逻辑下沉 `src/core`，handler 只保留副作用、依赖注入与兜底。
