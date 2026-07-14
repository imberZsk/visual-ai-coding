import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// splitVendorChunk 将 Ant Design 相关依赖拆到独立 chunk；id 是 Rolldown 传入的模块绝对标识。
function splitVendorChunk(id: string) {
  return id.includes('/node_modules/antd/') ||
    id.includes('/node_modules/@ant-design/icons/')
    ? 'vendor-antd'
    : undefined
}

// Vite 与 Vitest 配置：Electron 渲染进程使用相对 base 以便 file:// 加载。
export default defineConfig({
  base: './',
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
    outDir: 'dist',
    // emptyOutDir 存储构建前是否清理旧产物。
    emptyOutDir: true,
    // chunkSizeWarningLimit 存储构建体积提示阈值，AntD vendor 独立包约 535k，700k 可避免预期依赖体积造成噪声。
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // manualChunks 使用函数形式兼容 Vite 8 的 Rolldown 输出接口。
        manualChunks: splitVendorChunk,
      },
    },
  },
  test: {
    // environment 存储 React Testing Library 所需的浏览器模拟环境。
    environment: 'jsdom',
    // setupFiles 存储 Vitest 启动时加载的测试初始化文件。
    setupFiles: 'src/test/setup.ts',
    // globals 存储是否启用全局 describe、it 和 expect。
    globals: true,
    // coverage 存储覆盖率测量配置。
    coverage: {
      // provider 存储覆盖率引擎，v8 使用 V8 内置覆盖率采集，无需额外插桩。
      provider: 'v8',
      // reporter 存储覆盖率报告输出格式：控制台文本 + 可浏览的 HTML。
      reporter: ['text', 'html'],
      // include 存储纳入覆盖率统计的业务源码范围（渲染进程 TS/TSX 与主进程 core 逻辑）。
      include: ['src/**/*.{ts,tsx}', 'src/core/**/*.js'],
      // exclude 存储排除项：测试文件、测试初始化、类型声明、入口与样式等不计入覆盖率。
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/types.ts',
        'src/styles/**',
        'src/components/visual-config/schemaTypes.ts',
      ],
    },
  },
})
