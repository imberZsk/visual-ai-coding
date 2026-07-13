// 系统集成：打开 VSCode/Finder、探测 AI CLI、查询和更新 CLI 最新版本。
import { spawn } from "node:child_process";
import { expandHome, buildCommandEnv, runCommand } from "./util.js";

// OFFICIAL_NPM_REGISTRY 存储查询和安装 AI CLI 时使用的官方 npm registry。
const OFFICIAL_NPM_REGISTRY = "https://registry.npmjs.org";

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

// releaseNotesUrlForTool 返回指定工具的官方更新内容网址。
// toolId 参数存储工具标识，如 claude / codex。
export function releaseNotesUrlForTool(toolId) {
  // releaseNotesUrls 存储工具标识到官方 changelog 或 releases 页面的映射。
  const releaseNotesUrls = {
    claude: "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
    codex: "https://github.com/openai/codex/releases",
  };

  return releaseNotesUrls[toolId] ?? "";
}

// binForTool 根据工具标识返回 CLI 可执行文件名。
// toolId 参数存储工具标识，如 claude / codex。
export function binForTool(toolId) {
  if (toolId === "claude") {
    return "claude";
  }
  if (toolId === "codex") {
    return "codex";
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

// parseToolVersionStdout 从 CLI --version 输出中提取 semver 版本号。
// stdout 参数存储 CLI 版本输出文本。
export function parseToolVersionStdout(stdout) {
  // match 存储版本输出里可用于和 npm latest 对比的 semver 片段。
  const match = String(stdout || "").match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
  return match?.[0] || "";
}

// buildPackageSpec 构造带版本或 tag 的 npm 包规格。
// packageName 参数存储 npm 包名，version 参数存储目标版本或 tag。
export function buildPackageSpec(packageName, version = "latest") {
  // targetVersion 存储规范化后的目标版本；空值兜底到 latest。
  const targetVersion = String(version || "latest").trim() || "latest";
  return `${packageName}@${targetVersion}`;
}

// buildUpdateToolArgs 构造 npm 全局更新工具 CLI 的参数。
// packageName 参数存储要安装到全局环境的 npm 包名，version 参数存储目标版本或 tag。
export function buildUpdateToolArgs(packageName, version = "latest") {
  return [
    "install",
    "-g",
    buildPackageSpec(packageName, version),
    `--registry=${OFFICIAL_NPM_REGISTRY}`,
  ];
}

// buildVoltaUpdateToolArgs 构造 Volta 重新安装工具 CLI 的参数。
// packageName 参数存储要交给 Volta 管理的 npm 包名，version 参数存储目标版本或 tag。
export function buildVoltaUpdateToolArgs(packageName, version = "latest") {
  return ["install", buildPackageSpec(packageName, version)];
}

// installManagerForToolPath 根据当前命中的 CLI 路径判断应使用的安装管理器。
// toolPath 参数存储 which 命令解析出的可执行文件路径。
export function installManagerForToolPath(toolPath) {
  // normalizedPath 存储规范化为字符串后的 CLI 路径。
  const normalizedPath = String(toolPath || "");
  if (normalizedPath.includes("/.volta/bin/")) {
    return "volta";
  }
  return "npm";
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
    `--registry=${OFFICIAL_NPM_REGISTRY}`,
  ]);
  return {
    tool_id: toolId,
    package_name: packageName,
    latest_version: parseLatestVersionStdout(output.stdout),
    release_notes_url: releaseNotesUrlForTool(toolId),
  };
}

// resolveToolPath 查询当前 PATH 中实际命中的 CLI 路径。
// bin 参数存储 CLI 可执行文件名。
async function resolveToolPath(bin) {
  // whichOutput 存储 which 命令输出。
  const whichOutput = await runCommand("which", [bin]);
  // toolPath 存储去除空白后的实际 CLI 路径。
  const toolPath = whichOutput.stdout.trim();
  if (!toolPath) {
    throw new Error(`未找到 ${bin} 可执行文件`);
  }
  return toolPath;
}

// verifyToolVersion 确认更新后当前 CLI 真实版本已经等于目标版本。
// bin 参数存储 CLI 名称，packageName 参数存储 npm 包名，targetVersion 参数存储目标版本，toolPath 参数存储更新前命中的路径。
async function verifyToolVersion(bin, packageName, targetVersion, toolPath) {
  // versionOutput 存储 CLI 更新后的 --version 输出。
  const versionOutput = await runCommand(bin, ["--version"]);
  // installedVersion 存储从 CLI 输出中提取出的真实版本。
  const installedVersion = parseToolVersionStdout(versionOutput.stdout);
  if (installedVersion === targetVersion) {
    return;
  }

  // reportedVersion 存储用于错误提示的版本文本，解析失败时保留原始输出。
  const reportedVersion = installedVersion || versionOutput.stdout.trim() || "未知";
  // pathHint 存储当前 PATH 命中的二进制提示，帮助定位 Volta/npm/Homebrew 多来源冲突。
  const pathHint = toolPath ? `当前命中的可执行文件：${toolPath}` : "未能解析当前可执行文件路径";
  throw new Error(
    `已执行更新命令，但 ${bin} 仍报告版本 ${reportedVersion}，目标版本是 ${targetVersion}。${pathHint}。请检查 PATH 中是否还有其它 ${packageName} 安装来源。`,
  );
}

// updateToolCli 更新指定工具 CLI 到 npm registry 最新版本。
// toolId 参数存储工具标识，如 claude / codex。
export async function updateToolCli(toolId) {
  // packageName 存储工具对应的 npm 包名。
  const packageName = npmPackageForTool(toolId);
  if (!packageName) {
    throw new Error(`不支持更新 ${toolId} 的 CLI`);
  }

  // bin 存储工具对应的 CLI 可执行文件名。
  const bin = binForTool(toolId);
  if (!bin) {
    throw new Error(`不支持更新 ${toolId} 的 CLI`);
  }

  // latestInfo 存储 npm registry 返回的最新版本信息，用精确版本避免安装到旧 tag 或缓存版本。
  const latestInfo = await checkToolLatestVersion(toolId);
  // targetVersion 存储本次更新要安装的精确版本。
  const targetVersion = latestInfo.latest_version;
  // toolPath 存储当前 PATH 中实际命中的 CLI 路径，用于选择安装管理器。
  const toolPath = await resolveToolPath(bin);
  // installManager 存储根据当前 CLI 路径判断出的安装管理器。
  const installManager = installManagerForToolPath(toolPath);
  // output 存储安装命令输出。
  const output =
    installManager === "volta"
      ? await runCommand("volta", buildVoltaUpdateToolArgs(packageName, targetVersion), {
          env: { npm_config_registry: OFFICIAL_NPM_REGISTRY },
        })
      : await runCommand("npm", buildUpdateToolArgs(packageName, targetVersion));

  await verifyToolVersion(bin, packageName, targetVersion, toolPath);

  // stdout 存储成功时的输出文本。
  const stdout = output.stdout.trim();
  return stdout || `${packageName} 已更新到 ${targetVersion}`;
}
