import { describe, expect, it, vi } from "vitest";
import { registerIpcHandlers } from "../../electron/ipcHandlers.js";
import { IPC } from "../../electron/ipcChannels.js";

// createFakeIpcMain 创建只记录 handle 注册的 ipcMain 替身。
function createFakeIpcMain() {
  // handlers 存储通道名到处理函数的映射。
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => {
      handlers.set(channel, handler);
    }),
  };
}

describe("electron ipc handlers", () => {
  // 验证 Electron 主进程会注册前端需要的核心 IPC 通道。
  it("registers the app IPC surface", () => {
    // ipcMain 存储 Electron ipcMain 的测试替身。
    const ipcMain = createFakeIpcMain();

    registerIpcHandlers(ipcMain, { shell: { openPath: vi.fn(), showItemInFolder: vi.fn() } });

    expect(ipcMain.handle).toHaveBeenCalledWith(IPC.GET_PREFERENCES, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC.READ_CONFIG_FILE, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC.CHECK_CLAUDE_PLUGIN_UPDATES, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC.LIST_SKILLS, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC.DETECT_TOOLS, expect.any(Function));
  });
});
