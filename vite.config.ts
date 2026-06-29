import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 前端构建配置：固定端口 1420 供 Tauri 加载，忽略 src-tauri 目录变更
export default defineConfig({
  plugins: [react()],
  // 防止 Tauri 开发环境清屏，保留 Rust 端日志
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 忽略 src-tauri，避免 Rust 文件改动触发前端热更新
      ignored: ["**/src-tauri/**"],
    },
  },
});
