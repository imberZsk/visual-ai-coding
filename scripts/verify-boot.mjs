import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Electron 启动冒烟测试：构建后以生产模式启动，验证窗口加载与 preload API 暴露。

// __dirname 存储当前脚本目录。
const __dirname = dirname(fileURLToPath(import.meta.url));
// root 存储项目根目录。
const root = join(__dirname, "..");
// distIndex 存储生产构建后的入口 HTML。
const distIndex = join(root, "dist", "index.html");

if (!existsSync(distIndex)) {
  console.error("[verify-boot] 缺少 dist/index.html，请先运行 npm run build");
  process.exit(2);
}

// electronBin 存储本项目安装的 Electron 可执行文件路径。
const electronBin = join(root, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
// child 存储启动中的 Electron 子进程。
const child = spawn(electronBin, ["."], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "production",
    VAC_SMOKE: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

// output 存储 Electron 子进程 stdout/stderr，用于判断自检结果。
let output = "";
child.stdout.on("data", (chunk) => {
  // text 存储当前 stdout 片段。
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});
child.stderr.on("data", (chunk) => {
  // text 存储当前 stderr 片段。
  const text = chunk.toString();
  output += text;
  process.stderr.write(text);
});

// timer 存储超时保护计时器；首次运行可能触发 Electron 二进制下载，因此给 90s 缓冲。
const timer = setTimeout(() => {
  console.error("[verify-boot] 超时：90s 内未收到自检成功标记");
  child.kill("SIGKILL");
  process.exit(3);
}, 90000);

child.on("exit", (code) => {
  clearTimeout(timer);
  if (output.includes("SMOKE_OK")) {
    console.log("[verify-boot] Electron 启动自检通过");
    process.exit(0);
  }
  console.error(`[verify-boot] 启动自检未通过（exit=${code}）`);
  process.exit(code || 1);
});
