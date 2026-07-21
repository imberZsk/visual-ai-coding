import { describe, expect, it, vi } from 'vitest'
import {
  loadAutoUpdater,
  registerAppUpdater,
  resolveAutoUpdater,
} from '../electron/appUpdater.js'

/** 创建可记录 handler 的 IPC 替身；无参数，返回测试用注册器。 */
function createIpcMain() {
  // handlers 存储各更新 IPC 通道注册的回调。
  const handlers = new Map()
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  }
}

describe('appUpdater', () => {
  it('兼容 CommonJS 默认导出的 autoUpdater', () => {
    // updater 存储模拟的真实更新器实例。
    const updater = {}
    expect(resolveAutoUpdater({ default: { autoUpdater: updater } })).toBe(
      updater
    )
  })

  it('模块加载失败时安全降级', async () => {
    // importUpdater 模拟打包环境中模块解析失败。
    const importUpdater = vi.fn().mockRejectedValue(new Error('load failed'))
    await expect(loadAutoUpdater(importUpdater, true)).resolves.toBeNull()
  })

  it('更新器不可用时仍可注册并返回无更新', async () => {
    // ipcMain 存储测试用 IPC 注册器。
    const ipcMain = createIpcMain()
    expect(() => registerAppUpdater(ipcMain, null, true)).not.toThrow()
    await expect(ipcMain.handlers.get('app-update:check')()).resolves.toEqual({
      available: false,
    })
  })
})
