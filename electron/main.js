// Electron 主进程入口：创建窗口、注册 IPC、加载 Vite/构建后的渲染进程。
import { app, BrowserWindow, ipcMain, session } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { registerIpcHandlers } from "./ipcHandlers.js";

// __dirname 存储当前文件目录；ESM 中需从 import.meta.url 推导。
const __dirname = dirname(fileURLToPath(import.meta.url));
// isDev 标记当前是否开发环境。
const isDev = process.env.NODE_ENV === "development";
// isSmoke 标记是否启动 Electron 冒烟自检模式。
const isSmoke = process.env.VAC_SMOKE === "1";
// mainWindow 持有主窗口引用，避免被垃圾回收。
let mainWindow = null;

// macOS GUI 应用不继承 SSH_AUTH_SOCK；从 launchd 补齐后，CLI/git 子进程能访问 SSH agent。
if (process.platform === "darwin" && !process.env.SSH_AUTH_SOCK) {
  try {
    // socketPath 存储 launchd 注册的 SSH agent socket 路径。
    const socketPath = execSync("launchctl getenv SSH_AUTH_SOCK", { encoding: "utf8" }).trim();
    if (socketPath) {
      process.env.SSH_AUTH_SOCK = socketPath;
    }
  } catch {
    // SSH agent 不可用时静默降级，不影响非 SSH 命令。
  }
}

// createWindow 创建主窗口并加载渲染进程页面。
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: !isSmoke,
    title: "Visual AI Coding",
    backgroundColor: "#141414",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5274");
    if (process.env.OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

// setupCSP 注入 Content-Security-Policy，消除 Electron 安全警告。
function setupCSP() {
  // policy 存储按 dev/prod 区分的 CSP 字符串。
  const policy = isDev
    ? "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:5274 http://localhost:5274; img-src 'self' data:; font-src 'self' data:"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy],
      },
    });
  });
}

// runSmokeCheck 验证窗口加载、preload API 暴露和关键 IPC 可见性。
// win 参数存储待检查的 BrowserWindow。
async function runSmokeCheck(win) {
  try {
    await new Promise((resolve, reject) => {
      win.webContents.once("did-finish-load", resolve);
      win.webContents.once("did-fail-load", (_event, code, description) => {
        reject(new Error(`load failed ${code} ${description}`));
      });
    });

    // apiOk 存储渲染进程中 window.api 的关键方法检查结果。
    const apiOk = await win.webContents.executeJavaScript(
      "typeof window.api === 'object' && typeof window.api.getPreferences === 'function' && typeof window.api.detectTools === 'function'",
    );
    if (!apiOk) {
      throw new Error("window.api 未正确暴露");
    }

    console.log("SMOKE_OK preload-api-available");
    app.exit(0);
  } catch (error) {
    console.error("SMOKE_FAIL", error.message);
    app.exit(1);
  }
}

registerIpcHandlers(ipcMain);

app.whenReady().then(() => {
  setupCSP();
  // win 存储刚创建的主窗口。
  const win = createWindow();
  if (isSmoke) {
    runSmokeCheck(win);
    return;
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
