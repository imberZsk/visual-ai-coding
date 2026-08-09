import { describe, expect, it, vi } from 'vitest'
import { registerIpcHandlers } from '../../electron/ipcHandlers.js'
import { IPC } from '../../electron/ipcChannels.js'

// createFakeIpcMain 创建只记录 handle 注册的 ipcMain 替身。
function createFakeIpcMain() {
  // handlers 存储通道名到处理函数的映射。
  const handlers = new Map()
  return {
    handlers,
    handle: vi.fn((channel, handler) => {
      handlers.set(channel, handler)
    }),
  }
}

describe('electron ipc handlers', () => {
  // 验证 Electron 主进程会注册前端需要的核心 IPC 通道。
  it('registers the app IPC surface', () => {
    // ipcMain 存储 Electron ipcMain 的测试替身。
    const ipcMain = createFakeIpcMain()

    registerIpcHandlers(ipcMain, {
      shell: {
        openExternal: vi.fn(),
        openPath: vi.fn(),
        showItemInFolder: vi.fn(),
      },
    })

    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC.GET_PREFERENCES,
      expect.any(Function)
    )
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC.READ_CONFIG_FILE,
      expect.any(Function)
    )
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC.CHECK_CLAUDE_PLUGIN_UPDATES,
      expect.any(Function)
    )
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC.LIST_CODEX_MARKETPLACES,
      expect.any(Function)
    )
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC.SET_PLUGIN_ENABLED,
      expect.any(Function)
    )
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC.LIST_PLUGIN_GIT_BRANCHES,
      expect.any(Function)
    )
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC.SWITCH_PLUGIN_GIT_BRANCH,
      expect.any(Function)
    )
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC.LIST_QUOTA_ACCOUNTS,
      expect.any(Function)
    )
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC.SAVE_QUOTA_ACCOUNT,
      expect.any(Function)
    )
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC.DELETE_QUOTA_ACCOUNT,
      expect.any(Function)
    )
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC.QUERY_QUOTA_ACCOUNT,
      expect.any(Function)
    )
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC.DISCOVER_QUOTA_MODELS,
      expect.any(Function)
    )
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC.LIST_SKILLS,
      expect.any(Function)
    )
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC.DETECT_TOOLS,
      expect.any(Function)
    )
    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC.OPEN_EXTERNAL_URL,
      expect.any(Function)
    )
  })

  // 验证外链 IPC 只允许 HTTPS，并将合法网址交给系统浏览器。
  it('opens only HTTPS external URLs', async () => {
    // ipcMain 存储 IPC handler 注册结果，便于直接调用外链处理函数。
    const ipcMain = createFakeIpcMain()
    // openExternal 存储 Electron shell.openExternal 的测试替身。
    const openExternal = vi.fn().mockResolvedValue(undefined)

    registerIpcHandlers(ipcMain, {
      shell: { openExternal, openPath: vi.fn(), showItemInFolder: vi.fn() },
    })

    // openExternalHandler 存储已注册的外链处理函数。
    const openExternalHandler = ipcMain.handlers.get(IPC.OPEN_EXTERNAL_URL)
    await openExternalHandler({}, 'https://github.com/openai/codex/releases')

    expect(openExternal).toHaveBeenCalledWith(
      'https://github.com/openai/codex/releases'
    )
    expect(() => openExternalHandler({}, 'file:///etc/passwd')).toThrow(
      '仅支持打开 HTTPS 网址'
    )
  })
})
