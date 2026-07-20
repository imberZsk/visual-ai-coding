import { spawn } from "node:child_process";
import net from "node:net";
import { pathToFileURL } from "node:url";

// DEFAULT_DEV_HOST 存储 Vite/Electron 开发服务器默认监听地址。
const DEFAULT_DEV_HOST = "127.0.0.1";
// DEFAULT_DEV_PORT 存储 Electron 开发窗口连接的 Vite 起始端口。
const DEFAULT_DEV_PORT = 5274;
// HTTP_TIMEOUT_MS 存储检查已有开发服务器是否可访问的超时时间。
const HTTP_TIMEOUT_MS = 800;
// TCP_TIMEOUT_MS 存储检测端口占用状态的超时时间。
const TCP_TIMEOUT_MS = 500;
// CLI_VALUE_OPTIONS 存储后面带值的 Vite 参数名，用于重写 host/port 时跳过旧值。
const CLI_VALUE_OPTIONS = new Set(["--host", "--port"]);

// buildDevServerUrl 根据 host 与 port 生成 Electron 要连接的开发服务器地址。
// host 参数存储开发服务器主机名；port 参数存储开发服务器端口。
function buildDevServerUrl(host, port) {
  return `http://${host}:${port}`;
}

// isTcpPortInUse 检查指定端口是否已有进程监听。
// host 参数存储目标主机名；port 参数存储目标端口。
export async function isTcpPortInUse(host, port) {
  return new Promise((resolve) => {
    // settled 标记当前检测 Promise 是否已经返回结果，避免 connect/error/timeout 重复触发。
    let settled = false;
    // socket 存储用于探测端口连通性的 TCP 连接。
    const socket = net.createConnection({ host, port });

    // finish 负责统一关闭 socket 并返回检测结果。
    // result 参数存储端口是否处于占用状态。
    function finish(result) {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(result);
    }

    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(TCP_TIMEOUT_MS, () => finish(false));
  });
}

// findAvailablePort 从起始端口开始寻找第一个未被占用的端口。
// options 参数存储 host、startPort 以及测试可注入的端口检测函数。
export async function findAvailablePort(options) {
  // host 存储本次端口探测使用的主机名。
  const host = options.host;
  // startPort 存储本次端口探测的起始端口。
  const startPort = options.startPort;
  // checkPortInUse 存储端口占用检测函数，测试中可替换为假实现。
  const checkPortInUse = options.isPortInUse ?? isTcpPortInUse;

  for (let port = startPort; port <= 65535; port += 1) {
    // portInUse 标记当前候选端口是否已被监听。
    const portInUse = await checkPortInUse(host, port);
    if (!portInUse) {
      return port;
    }
  }

  throw new Error(`No available dev server port found from ${startPort} to 65535.`);
}

// isHttpDevServerReachable 检查已有端口是否提供可访问的 HTTP 开发服务。
// url 参数存储待访问的开发服务器地址。
export async function isHttpDevServerReachable(url) {
  // controller 存储 fetch 超时控制器，避免端口被非 HTTP 服务占用时长时间挂住。
  const controller = new AbortController();
  // timeoutId 存储超时计时器句柄，fetch 完成后需要清理。
  const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    // response 存储已有服务对 HTTP 请求的响应。
    const response = await fetch(url, { signal: controller.signal });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// resolveDevServerAction 根据端口占用和 HTTP 可访问性决定启动、复用或阻止。
// options 参数存储 host、port 以及测试可注入的探测函数。
export async function resolveDevServerAction(options) {
  // host 存储本次检查使用的主机名。
  const host = options.host;
  // port 存储本次检查使用的端口。
  const port = options.port;
  // checkPortInUse 存储端口占用检测函数，测试中可替换为假实现。
  const checkPortInUse = options.isPortInUse ?? isTcpPortInUse;
  // checkHttpReachable 存储 HTTP 可访问性检测函数，测试中可替换为假实现。
  const checkHttpReachable = options.isHttpReachable ?? isHttpDevServerReachable;
  // portInUse 标记当前端口是否已经被监听。
  const portInUse = await checkPortInUse(host, port);

  if (!portInUse) {
    return "start";
  }

  // devServerUrl 存储 Electron 即将连接的固定开发服务器 URL。
  const devServerUrl = buildDevServerUrl(host, port);
  // httpReachable 标记端口上的服务是否像一个可访问的 HTTP dev server。
  const httpReachable = await checkHttpReachable(devServerUrl);
  return httpReachable ? "reuse" : "blocked";
}

// readCliOption 读取命令行参数中指定选项的值。
// args 参数存储命令行参数；name 参数存储选项名，如 --host。
function readCliOption(args, name) {
  // optionIndex 存储目标选项在参数数组中的位置。
  const optionIndex = args.indexOf(name);
  if (optionIndex === -1) {
    return "";
  }
  // optionValue 存储目标选项后面的参数值。
  const optionValue = args[optionIndex + 1];
  return optionValue && !optionValue.startsWith("--") ? optionValue : "";
}

// hasCliFlag 检查命令行参数中是否包含指定布尔开关。
// args 参数存储命令行参数；name 参数存储开关名，如 --strictPort。
function hasCliFlag(args, name) {
  return args.includes(name);
}

// removeViteHostPortArgs 移除旧的 host/port/strictPort 参数，避免追加动态端口后发生冲突。
// args 参数存储原始 Vite CLI 参数。
function removeViteHostPortArgs(args) {
  // result 存储清理后的 Vite CLI 参数。
  const result = [];

  for (let index = 0; index < args.length; index += 1) {
    // arg 存储当前正在检查的命令行参数。
    const arg = args[index];
    if (CLI_VALUE_OPTIONS.has(arg)) {
      index += 1;
      continue;
    }
    if (arg === "--strictPort") {
      continue;
    }
    result.push(arg);
  }

  return result;
}

// buildViteArgs 构造传给 Vite CLI 的最终参数。
// args 参数存储用户原始参数；host 与 port 存储最终选中的监听地址。
export function buildViteArgs(args, host, port) {
  // cleanedArgs 存储移除旧 host/port 后的参数。
  const cleanedArgs = removeViteHostPortArgs(args);
  return [...cleanedArgs, "--host", host, "--port", String(port), "--strictPort"];
}

// startVite 启动真实 Vite 进程，并继承当前终端输出。
// args 参数存储透传给 Vite CLI 的命令行参数。
export async function startVite(args) {
  // viteCommand 存储跨平台 Vite 可执行文件名。
  const viteCommand = process.platform === "win32" ? "vite.cmd" : "vite";
  // child 存储正在运行的 Vite 子进程。
  const child = spawn(viteCommand, args, {
    env: process.env,
    stdio: "inherit",
  });

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      // exitCode 存储 Vite 子进程退出码；被信号终止时按 1 处理。
      const exitCode = code ?? (signal ? 1 : 0);
      resolve(exitCode);
    });
  });
}

// main 执行开发服务器复用脚本的命令行入口。
export async function main() {
  // rawArgs 存储透传给 Vite CLI 的原始命令行参数。
  const rawArgs = process.argv.slice(2);
  // cliHost 存储命令行显式指定的 host。
  const cliHost = readCliOption(rawArgs, "--host");
  // cliPort 存储命令行显式指定的 port。
  const cliPort = readCliOption(rawArgs, "--port");
  // host 存储本次脚本使用的开发服务器主机。
  const host = cliHost || process.env.VITE_HOST || DEFAULT_DEV_HOST;
  // rawPort 存储命令行或环境变量中的端口文本。
  const rawPort = cliPort || process.env.VITE_PORT || String(DEFAULT_DEV_PORT);
  // startPort 存储解析后的起始开发服务器端口。
  const startPort = Number(rawPort);
  // exactPort 标记调用方是否要求使用显式端口，Electron 主进程需要保持加载地址与 Vite 端口一致。
  const exactPort = Boolean(cliPort) && hasCliFlag(rawArgs, "--strictPort");
  // port 存储最终要传给 Vite 的端口；直接运行时会从 1420 起向后寻找空闲端口。
  const port = exactPort
    ? startPort
    : await findAvailablePort({ host, startPort });
  // action 存储端口检查后的处理动作。
  const action = await resolveDevServerAction({ host, port });

  if (action === "reuse") {
    console.log(`Vite dev server already running at ${buildDevServerUrl(host, port)}; reusing it.`);
    // WHY: 复用模式下进程必须挂起而非立即退出。
    // concurrently -k 在任意子进程退出时会向所有其他进程发 SIGTERM；
    // 若此处直接 return 0，dev:electron 还没完成启动就会被杀死。
    //
    // WHY setInterval: Node.js signal handler 本身不会延长事件循环寿命（无 ref-count）；
    // 必须用一个真实的 active handle 阻止事件循环在 await 期间自动退出。
    const keepAlive = setInterval(() => {}, 24 * 60 * 60 * 1000);
    await new Promise((resolve) => {
      process.once("SIGTERM", resolve);
      process.once("SIGINT", resolve);
    });
    clearInterval(keepAlive);
    return 0;
  }

  if (action === "blocked") {
    console.error(
      `Port ${port} is in use, but ${buildDevServerUrl(host, port)} is not reachable as an HTTP dev server.`
    );
    return 1;
  }

  return startVite(buildViteArgs(rawArgs, host, port));
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
