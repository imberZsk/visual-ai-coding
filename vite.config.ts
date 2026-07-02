import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 与 Vitest 配置：Electron 渲染进程使用相对 base 以便 file:// 加载。
export default defineConfig({
  base: "./",
  plugins: [react()],
  // clearScreen 存储是否保留 Electron 主进程与 Vite 日志。
  clearScreen: false,
  server: {
    // port 存储 Electron 开发窗口连接的 Vite 固定端口。
    port: 5274,
    // strictPort 存储是否强制使用固定端口，避免 Electron 连接到错误地址。
    strictPort: true,
  },
  build: {
    // outDir 存储渲染进程生产构建目录，Electron 生产模式从这里加载 index.html。
    outDir: "dist",
    // emptyOutDir 存储构建前是否清理旧产物。
    emptyOutDir: true,
    // chunkSizeWarningLimit 存储构建体积提示阈值，AntD vendor 独立包约 535k，700k 可避免预期依赖体积造成噪声。
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // manualChunks 将 Ant Design 入口显式拆包，依赖归属交给 Rollup，避免手工分桶造成循环 chunk。
        manualChunks: {
          "vendor-antd": ["antd", "@ant-design/icons"],
        },
      },
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
