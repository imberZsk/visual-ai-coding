import { defineConfig } from '@playwright/test'

// Playwright 配置串行运行 Electron 用例，避免多个桌面窗口争用前台焦点。
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
})
