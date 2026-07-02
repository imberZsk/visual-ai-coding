// 系统集成：打开 VSCode/Finder、探测 AI CLI、查询和更新 CLI 最新版本。
import { spawn } from "node:child_process";
import { expandHome, buildCommandEnv, runCommand } from "./util.js";

// npmPackageForTool 根据工具标识返回 npm 包名。
// toolId 参数存储工具标识，如 claude / codex。
export function npmPackageForTool(toolId) {
  if (toolId === "claude") {
    return "@anthropic-ai/claude-code";
  }
  if (toolId === "codex") {
    return "@openai/codex";
  }
  return undefined;
}

// parseLatestVersionStdout 解析 npm view 输出中的版本号。
// stdout 参数存储 npm 输出文本。
export function parseLatestVersionStdout(stdout) {
  // version 存储去掉换行与空白后的版本文本。
  const version = String(stdout || "").trim();
  if (!version) {
    throw new Error("npm 未返回版本号");
  }
  return version;
}

// buildUpdateToolArgs 构造 npm 全局更新工具 CLI 的参数。
// packageName 参数存储要安装到全局环境的 npm 包名。
export function buildUpdateToolArgs(packageName) {
  return ["install", "-g", packageName, "--registry=https://registry.npmjs.org"];
}

// spawnAndForget 启动外部命令，不等待命令完成。
// bin 参数存储可执行文件名，args 参数存储命令参数。
function spawnAndForget(bin, args) {
  // child 存储子进程句柄。
  const child = spawn(bin, args, {
    env: buildCommandEnv(),
    stdio: "ignore",
    detached: true,
  });
  child.unref();
}

// openInVscode 在 VSCode 中打开指定文件或目录。
// vscodePath 参数存储 code CLI 路径，target 参数存储目标路径。
export function openInVscode(vscodePath, target) {
  // bin 存储最终使用的 code 命令。
  const bin = String(vscodePath || "").trim() || "code";
  // absoluteTarget 存储展开后的目标路径。
  const absoluteTarget = expandHome(target);
  spawnAndForget(bin, [absoluteTarget]);
}

// revealInFinder 在 macOS Finder 中显示指定路径。
// target 参数存储目标文件或目录。
export function revealInFinder(target) {
  // absoluteTarget 存储展开后的目标路径。
  const absoluteTarget = expandHome(target);
  spawnAndForget("open", ["-R", absoluteTarget]);
}

// probeTool 探测单个 CLI 工具的版本与路径。
// id/name/bin 参数分别存储工具标识、展示名和可执行文件名。
async function probeTool(id, name, bin) {
  try {
    // whichOutput 存储 which 命令输出。
    const whichOutput = await runCommand("which", [bin]);
    // path 存储解析出的可执行路径。
    const path = whichOutput.stdout.trim();
    if (!path) {
      throw new Error("not found");
    }

    // versionOutput 存储 --version 输出。
    const versionOutput = await runCommand(bin, ["--version"]).catch(() => ({ stdout: "" }));
    return {
      id,
      name,
      installed: true,
      version: versionOutput.stdout.trim(),
      path,
    };
  } catch {
    return {
      id,
      name,
      installed: false,
      version: "",
      path: "",
    };
  }
}

// detectTools 探测本机已安装的 Claude Code CLI 与 Codex CLI。
export async function detectTools() {
  return Promise.all([
    probeTool("claude", "Claude Code", "claude"),
    probeTool("codex", "Codex CLI", "codex"),
  ]);
}

// checkToolLatestVersion 查询指定工具在 npm registry 上的最新版本。
// toolId 参数存储工具标识，如 claude / codex。
export async function checkToolLatestVersion(toolId) {
  // packageName 存储工具对应的 npm 包名。
  const packageName = npmPackageForTool(toolId);
  if (!packageName) {
    throw new Error(`不支持查询 ${toolId} 的最新版本`);
  }

  // output 存储 npm view 命令输出。
  const output = await runCommand("npm", [
    "view",
    packageName,
    "version",
    "--registry=https://registry.npmjs.org",
  ]);
  return {
    tool_id: toolId,
    package_name: packageName,
    latest_version: parseLatestVersionStdout(output.stdout),
  };
}

// updateToolCli 更新指定工具 CLI 到 npm registry 最新版本。
// toolId 参数存储工具标识，如 claude / codex。
export async function updateToolCli(toolId) {
  // packageName 存储工具对应的 npm 包名。
  const packageName = npmPackageForTool(toolId);
  if (!packageName) {
    throw new Error(`不支持更新 ${toolId} 的 CLI`);
  }

  // output 存储 npm install -g 命令输出。
  const output = await runCommand("npm", buildUpdateToolArgs(packageName));
  // stdout 存储成功时的输出文本。
  const stdout = output.stdout.trim();
  return stdout || `${packageName} 已更新到最新版本`;
}
