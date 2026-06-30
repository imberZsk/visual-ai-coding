import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { findAvailablePort } from "./dev-or-reuse.mjs";

// DEFAULT_DEV_HOST 存储 Tauri/Vite 开发服务器默认监听地址。
const DEFAULT_DEV_HOST = "127.0.0.1";
// DEFAULT_DEV_PORT 存储动态端口探测的起始端口。
const DEFAULT_DEV_PORT = 1420;

// buildDevServerUrl 根据 host 与 port 生成 Tauri 要连接的开发服务器地址。
// host 参数存储开发服务器主机名；port 参数存储开发服务器端口。
function buildDevServerUrl(host, port) {
  return `http://${host}:${port}`;
}

// buildTauriDevConfig 构造传给 Tauri CLI --config 的动态配置。
// host 参数存储开发服务器主机名；port 参数存储选中的开发服务器端口。
export function buildTauriDevConfig(host, port) {
  return {
    build: {
      devPath: buildDevServerUrl(host, port),
      beforeDevCommand: `npm run dev -- --host ${host} --port ${port} --strictPort`,
    },
  };
}

// buildTauriDevArgs 构造传给 Tauri CLI 的最终参数。
// args 参数存储用户传给 tauri dev 的原始参数；host 与 port 存储最终选中的监听地址。
export function buildTauriDevArgs(args, host, port) {
  // config 存储动态覆盖 Tauri devPath 与 beforeDevCommand 的配置对象。
  const config = buildTauriDevConfig(host, port);
  return ["dev", ...args, "--config", JSON.stringify(config)];
}

// startTauriDev 启动真实 Tauri CLI，并继承当前终端输出。
// args 参数存储传给 Tauri CLI 的最终参数。
export async function startTauriDev(args) {
  // tauriCommand 存储跨平台 Tauri 可执行文件名。
  const tauriCommand = process.platform === "win32" ? "tauri.cmd" : "tauri";
  // child 存储正在运行的 Tauri 子进程。
  const child = spawn(tauriCommand, args, {
    env: process.env,
    stdio: "inherit",
  });

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      // exitCode 存储 Tauri 子进程退出码；被信号终止时按 1 处理。
      const exitCode = code ?? (signal ? 1 : 0);
      resolve(exitCode);
    });
  });
}

// main 执行 Tauri dev 动态端口 wrapper 的命令行入口。
export async function main() {
  // host 存储本次脚本使用的开发服务器主机。
  const host = process.env.VITE_HOST || DEFAULT_DEV_HOST;
  // rawPort 存储环境变量中的起始端口文本。
  const rawPort = process.env.VITE_PORT || String(DEFAULT_DEV_PORT);
  // startPort 存储解析后的起始开发服务器端口。
  const startPort = Number(rawPort);
  // port 存储从起始端口向后找到的可用端口。
  const port = await findAvailablePort({ host, startPort });
  // args 存储透传给 Tauri CLI 的动态参数。
  const args = buildTauriDevArgs(process.argv.slice(2), host, port);

  console.log(`Tauri dev server will use ${buildDevServerUrl(host, port)}.`);
  return startTauriDev(args);
}

// isDirectRun 标记当前模块是否作为 CLI 脚本直接执行。
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
