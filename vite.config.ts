import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 与 Vitest 配置：固定 Tauri 端口并为前端测试提供 jsdom 环境。
export default defineConfig({
  plugins: [react()],
  // clearScreen 存储是否保留开发终端中的 Rust 日志。
  clearScreen: false,
  server: {
    // port 存储 Tauri 前端开发服务器固定端口。
    port: 1420,
    // strictPort 存储是否强制使用固定端口，避免 Tauri 连接到错误地址。
    strictPort: true,
    watch: {
      // ignored 存储不触发前端热更新的 Rust 文件匹配规则。
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    // environment 存储 React Testing Library 所需的浏览器模拟环境。
    environment: "jsdom",
    // setupFiles 存储 Vitest 启动时加载的测试初始化文件。
    setupFiles: "src/test/setup.ts",
    // globals 存储是否启用全局 describe、it 和 expect。
    globals: true,
  },
});
