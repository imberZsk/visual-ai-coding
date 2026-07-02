// 插件管理核心逻辑：解析 Claude/Codex 插件列表、比较版本并调用 CLI 更新。
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import * as TOML from "smol-toml";
import { expandHome, runCommand } from "./util.js";

// parseSemverLike 解析 semver-like 版本字符串。
// version 参数存储待解析的版本文本。
function parseSemverLike(version) {
  // trimmed 存储去掉空白后的版本文本。
  const trimmed = String(version || "").trim();
  // split 存储主版本与 prerelease 的切分结果。
  const split = trimmed.split("-");
  // core 存储 x.y.z 主版本部分。
  const core = split[0];
  // prerelease 存储预发布标签，正式版为 undefined。
  const prerelease = split.length > 1 ? split.slice(1).join("-") : undefined;
  // coreParts 存储主版本、次版本、补丁版本三个片段。
  const coreParts = core.split(".");

  if (coreParts.length !== 3) {
    return undefined;
  }
  if (prerelease === "") {
    return undefined;
  }
  if (prerelease && !/^[0-9A-Za-z.-]+$/.test(prerelease)) {
    return undefined;
  }

  // major 存储主版本号。
  const major = Number(coreParts[0]);
  // minor 存储次版本号。
  const minor = Number(coreParts[1]);
  // patch 存储补丁版本号。
  const patch = Number(coreParts[2]);
  if (![major, minor, patch].every(Number.isInteger)) {
    return undefined;
  }

  return { major, minor, patch, prerelease };
}

// splitPrerelease 将 prerelease 字符串拆成可比较的点分段。
// prerelease 参数存储预发布标签。
function splitPrerelease(prerelease) {
  return String(prerelease || "")
    .split(".")
    .map((value) => ({
      value,
      isNumeric: value !== "" && /^\d+$/.test(value),
    }));
}

// comparePrerelease 比较两个 prerelease 标签的先后顺序。
// left 和 right 分别存储左右两个预发布标签。
function comparePrerelease(left, right) {
  // leftParts 存储左侧 prerelease 点分段。
  const leftParts = splitPrerelease(left);
  // rightParts 存储右侧 prerelease 点分段。
  const rightParts = splitPrerelease(right);
  // sharedLength 存储两侧可逐段比较的长度。
  const sharedLength = Math.min(leftParts.length, rightParts.length);

  for (let index = 0; index < sharedLength; index += 1) {
    // leftPart 存储左侧当前位置分段。
    const leftPart = leftParts[index];
    // rightPart 存储右侧当前位置分段。
    const rightPart = rightParts[index];
    if (leftPart.value === rightPart.value) {
      continue;
    }
    if (leftPart.isNumeric && rightPart.isNumeric) {
      return Number(leftPart.value) < Number(rightPart.value) ? -1 : 1;
    }
    if (leftPart.isNumeric !== rightPart.isNumeric) {
      return leftPart.isNumeric ? -1 : 1;
    }
    return leftPart.value < rightPart.value ? -1 : 1;
  }

  if (leftParts.length === rightParts.length) {
    return 0;
  }
  return leftParts.length < rightParts.length ? -1 : 1;
}

// compareVersions 比较已安装版本与 marketplace 可用版本，返回统一更新状态。
// current 参数存储当前版本，available 参数存储可用版本。
export function compareVersions(current, available) {
  // currentText 存储当前版本文本。
  const currentText = String(current || "").trim();
  // availableText 存储可用版本文本。
  const availableText = String(available || "").trim();
  if (!currentText || !availableText) {
    return "unknown";
  }
  if (currentText === availableText) {
    return "same";
  }

  // currentParts 存储当前版本解析结果。
  const currentParts = parseSemverLike(currentText);
  // availableParts 存储可用版本解析结果。
  const availableParts = parseSemverLike(availableText);
  if (!currentParts || !availableParts) {
    return currentText === availableText ? "same" : "different";
  }

  for (const key of ["major", "minor", "patch"]) {
    if (currentParts[key] !== availableParts[key]) {
      return currentParts[key] < availableParts[key] ? "newer" : "different";
    }
  }

  if (currentParts.prerelease === availableParts.prerelease) {
    return "same";
  }
  if (!currentParts.prerelease && availableParts.prerelease) {
    return "different";
  }
  if (currentParts.prerelease && !availableParts.prerelease) {
    return "newer";
  }
  return comparePrerelease(currentParts.prerelease, availableParts.prerelease) < 0
    ? "newer"
    : "different";
}

// pluginShortName 从插件完整 ID 中提取短名称。
// id 参数存储形如 name@marketplace 的插件标识。
function pluginShortName(id) {
  return String(id || "").split("@")[0] || String(id || "");
}

// pluginMarketplace 从插件完整 ID 中提取 marketplace 名称。
// id 参数存储形如 name@marketplace 的插件标识。
function pluginMarketplace(id) {
  return String(id || "").split("@")[1] || "";
}

// jsonString 读取对象字段中的字符串，缺失时返回空串。
// item 参数存储 JSON 对象，field 参数存储字段名。
function jsonString(item, field) {
  // value 存储读取到的原始字段值。
  const value = item?.[field];
  return typeof value === "string" ? value : "";
}

// jsonBool 读取对象字段中的布尔值，缺失时返回 false。
// item 参数存储 JSON 对象，field 参数存储字段名。
function jsonBool(item, field) {
  return item?.[field] === true;
}

// parseJsonRoot 解析命令输出中的 JSON 根对象。
// content 参数存储 CLI stdout，toolLabel 参数存储错误提示中的工具名。
function parseJsonRoot(content, toolLabel) {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`解析 ${toolLabel} 插件 JSON 失败: ${error.message}`);
  }
}

// buildPluginUpdateResult 基于 installed/available 构建统一插件更新结果。
// options 参数存储不同 CLI 的字段名差异。
function buildPluginUpdateResult(options) {
  // plugins 存储统一格式的插件列表。
  const plugins = [];
  for (const item of options.installed) {
    // id 存储当前插件完整标识。
    const id = jsonString(item, options.idField);
    // currentVersion 存储当前安装版本。
    const currentVersion = jsonString(item, "version");
    // availableVersion 存储 marketplace 可用版本。
    const availableVersion = options.availableVersions.get(id) || "";
    // name 存储插件展示名。
    const name =
      (options.nameField && jsonString(item, options.nameField)) || pluginShortName(id);
    // marketplace 存储插件 marketplace 名称。
    const marketplace =
      (options.marketplaceField && jsonString(item, options.marketplaceField)) ||
      pluginMarketplace(id);
    // scope 存储插件安装作用域，Codex 没有时为空串。
    const scope = options.scopeField ? jsonString(item, options.scopeField) : "";

    plugins.push({
      id,
      name,
      marketplace,
      current_version: currentVersion,
      available_version: availableVersion,
      scope,
      enabled: jsonBool(item, "enabled"),
      install_path: jsonString(item, options.installPathField),
      last_updated: jsonString(item, options.lastUpdatedField),
      update_status: compareVersions(currentVersion, availableVersion),
    });
  }

  return {
    tool: options.tool,
    plugins,
    raw_output: "",
    diagnostics: "",
  };
}

// parseClaudePluginUpdateJson 解析 Claude plugin list --json --available 输出。
// content 参数存储 Claude CLI stdout。
function parseClaudePluginUpdateJson(content) {
  // root 存储 JSON 根对象。
  const root = parseJsonRoot(content, "Claude");
  // availableVersions 存储 pluginId 到可用版本的映射。
  const availableVersions = new Map();
  for (const item of Array.isArray(root.available) ? root.available : []) {
    // id 存储 marketplace 返回的插件 ID。
    const id = jsonString(item, "pluginId");
    if (id) {
      availableVersions.set(id, jsonString(item, "version"));
    }
  }

  // result 存储统一化后的插件更新结果。
  const result = buildPluginUpdateResult({
    tool: "claude",
    installed: Array.isArray(root.installed) ? root.installed : [],
    availableVersions,
    idField: "id",
    scopeField: "scope",
    installPathField: "installPath",
    lastUpdatedField: "lastUpdated",
  });
  result.raw_output = content;
  return result;
}

// parseCodexPluginUpdateJson 解析 Codex plugin list --available --json 输出。
// content 参数存储 Codex CLI stdout。
function parseCodexPluginUpdateJson(content) {
  // root 存储 JSON 根对象。
  const root = parseJsonRoot(content, "Codex");
  // availableVersions 存储插件 ID 到可用版本的映射。
  const availableVersions = new Map();
  for (const item of Array.isArray(root.available) ? root.available : []) {
    // id 存储 marketplace 返回的插件 ID。
    const id = jsonString(item, "id");
    if (id) {
      availableVersions.set(id, jsonString(item, "version"));
    }
  }

  // result 存储统一化后的插件更新结果。
  const result = buildPluginUpdateResult({
    tool: "codex",
    installed: Array.isArray(root.installed) ? root.installed : [],
    availableVersions,
    idField: "id",
    nameField: "name",
    marketplaceField: "marketplace",
    installPathField: "install_path",
    lastUpdatedField: "last_updated",
  });
  result.raw_output = content;
  return result;
}

// parseClaudePluginUpdateCheckOutput 基于 stdout/stderr 构造 Claude 更新检查结果。
// stdout 参数存储 JSON 输出，stderr 参数存储成功时的 warning/诊断输出。
export function parseClaudePluginUpdateCheckOutput(stdout, stderr) {
  // result 存储基于 stdout 解析出的结果。
  const result = parseClaudePluginUpdateJson(stdout);
  result.diagnostics = String(stderr || "").trim();
  return result;
}

// parseCodexPluginUpdateCheckOutput 基于 stdout/stderr 构造 Codex 更新检查结果。
// stdout 参数存储 JSON 输出，stderr 参数存储成功时的 warning/诊断输出。
export function parseCodexPluginUpdateCheckOutput(stdout, stderr) {
  // result 存储基于 stdout 解析出的结果。
  const result = parseCodexPluginUpdateJson(stdout);
  result.diagnostics = String(stderr || "").trim();
  return result;
}

// readCodexConfigRoot 读取 Codex config.toml 并解析为对象。
// codexHome 参数存储 Codex home 目录。
function readCodexConfigRoot(codexHome) {
  // configPath 存储 Codex config.toml 路径。
  const configPath = join(codexHome, "config.toml");
  // content 存储 config.toml 文本。
  const content = readFileSync(configPath, "utf8");
  return TOML.parse(content);
}

// readCodexPluginManifest 读取已安装 Codex 插件的 plugin.json。
// installPath 参数存储具体版本安装目录。
function readCodexPluginManifest(installPath) {
  // manifestPath 存储插件 manifest 路径。
  const manifestPath = join(installPath, ".codex-plugin", "plugin.json");
  if (!existsSync(manifestPath)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return undefined;
  }
}

// latestCodexPluginInstallPath 在本地 cache 中寻找指定插件的最新安装目录。
// codexHome 参数存储 Codex home，marketplace 和 name 参数定位插件。
function latestCodexPluginInstallPath(codexHome, marketplace, name) {
  // pluginRoot 存储该插件所有版本目录所在位置。
  const pluginRoot = join(codexHome, "plugins", "cache", marketplace, name);
  if (!existsSync(pluginRoot)) {
    return undefined;
  }

  // candidates 存储包含 manifest 的候选版本目录。
  const candidates = readdirSync(pluginRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(pluginRoot, entry.name))
    .filter((path) => existsSync(join(path, ".codex-plugin", "plugin.json")));

  candidates.sort((left, right) => {
    // leftName 存储左侧候选版本目录名。
    const leftName = basename(left);
    // rightName 存储右侧候选版本目录名。
    const rightName = basename(right);
    // status 存储把 left 当 current、right 当 available 的比较结果。
    const status = compareVersions(leftName, rightName);
    if (status === "newer") {
      return -1;
    }
    if (status === "same") {
      return 0;
    }
    return 1;
  });

  return candidates.pop();
}

// buildCodexFallbackResult 在 Codex CLI 失败时从本地配置/cache 构造降级结果。
// codexHome 参数存储 Codex home，diagnostics 参数存储原始 CLI 错误。
export function buildCodexFallbackResult(codexHome, diagnostics) {
  // root 存储解析后的 Codex config.toml。
  const root = readCodexConfigRoot(codexHome);
  // pluginsTable 存储 config.toml 中的 plugins 表。
  const pluginsTable = root.plugins;
  if (!pluginsTable || typeof pluginsTable !== "object") {
    throw new Error(String(diagnostics || ""));
  }

  // plugins 存储从本地配置/cache 构造出的插件列表。
  const plugins = [];
  for (const [id, value] of Object.entries(pluginsTable)) {
    // marketplace 存储插件所属 marketplace。
    const marketplace = pluginMarketplace(id);
    // name 存储插件短名称。
    const name = pluginShortName(id);
    // installPath 存储本地 cache 中最新版本目录。
    const installPath = latestCodexPluginInstallPath(codexHome, marketplace, name);
    // manifest 存储插件 manifest 内容。
    const manifest = installPath ? readCodexPluginManifest(installPath) : undefined;
    // currentVersion 存储插件当前安装版本。
    const currentVersion =
      jsonString(manifest, "version") || (installPath ? basename(installPath) : "");
    // displayName 存储 manifest 插件名，缺失时回退到 ID 短名。
    const displayName = jsonString(manifest, "name") || name;

    plugins.push({
      id,
      name: displayName,
      marketplace,
      current_version: currentVersion,
      available_version: "",
      scope: "",
      enabled: value?.enabled === true,
      install_path: installPath || "",
      last_updated: "",
      update_status: "unknown",
    });
  }

  plugins.sort((left, right) => left.id.toLowerCase().localeCompare(right.id.toLowerCase()));

  return {
    tool: "codex",
    plugins,
    raw_output: "",
    diagnostics: String(diagnostics || ""),
  };
}

// runPluginCliRaw 执行插件相关 CLI 命令，返回拆分 stdout/stderr。
// bin 参数存储命令名，args 参数存储命令参数，homeEnvKey/homeDir 指定工具 home。
async function runPluginCliRaw(bin, args, homeEnvKey, homeDir) {
  // expandedHome 存储展开后的工具根目录。
  const expandedHome = expandHome(homeDir);
  try {
    return await runCommand(bin, args, { env: { [homeEnvKey]: expandedHome } });
  } catch (error) {
    // mergedOutput 存储失败时要原样透传给调用方的合并输出。
    const mergedOutput = `${error.stdout || ""}\n${error.stderr || ""}`.trim() || error.message;
    throw new Error(`执行命令失败:\n${mergedOutput}`.trim());
  }
}

// runPluginCli 执行插件相关 CLI 命令并返回合并后的可读输出。
// bin 参数存储命令名，args 参数存储命令参数，homeEnvKey/homeDir 指定工具 home。
async function runPluginCli(bin, args, homeEnvKey, homeDir) {
  // output 存储拆分后的 CLI 输出。
  const output = await runPluginCliRaw(bin, args, homeEnvKey, homeDir);
  return `${output.stdout}\n${output.stderr}`.trim();
}

// checkClaudePluginUpdates 检查 Claude 已安装插件是否存在可用更新。
// claudeHome 参数存储 Claude 配置根目录。
export async function checkClaudePluginUpdates(claudeHome) {
  // output 存储 Claude CLI 原始 stdout/stderr。
  const output = await runPluginCliRaw(
    "claude",
    ["plugin", "list", "--json", "--available"],
    "CLAUDE_HOME",
    claudeHome,
  );
  return parseClaudePluginUpdateCheckOutput(output.stdout, output.stderr);
}

// checkCodexPluginUpdates 检查 Codex 已安装插件是否存在可用更新。
// codexHome 参数存储 Codex 配置根目录。
export async function checkCodexPluginUpdates(codexHome) {
  // expandedHome 存储展开后的 Codex home，CLI 失败时用于本地 fallback。
  const expandedHome = expandHome(codexHome);
  try {
    // output 存储 Codex CLI 原始 stdout/stderr。
    const output = await runPluginCliRaw(
      "codex",
      ["plugin", "list", "--available", "--json"],
      "CODEX_HOME",
      codexHome,
    );
    return parseCodexPluginUpdateCheckOutput(output.stdout, output.stderr);
  } catch (error) {
    return buildCodexFallbackResult(expandedHome, error.message);
  }
}

// listClaudePlugins 读取已安装 Claude 插件列表。
// claudeHome 参数存储 Claude 配置根目录。
export function listClaudePlugins(claudeHome) {
  // filePath 存储 installed_plugins.json 路径。
  const filePath = join(expandHome(claudeHome), "plugins", "installed_plugins.json");
  if (!existsSync(filePath)) {
    return [];
  }

  // root 存储插件 JSON 根对象。
  const root = JSON.parse(readFileSync(filePath, "utf8"));
  // result 存储所有安装记录。
  const result = [];
  for (const [fullName, installs] of Object.entries(root.plugins || {})) {
    // marketplace 存储 @ 后面的市场名。
    const marketplace = pluginMarketplace(fullName);
    for (const item of Array.isArray(installs) ? installs : []) {
      result.push({
        name: fullName,
        marketplace,
        version: jsonString(item, "version"),
        scope: jsonString(item, "scope"),
        install_path: jsonString(item, "installPath"),
        installed_at: jsonString(item, "installedAt"),
        last_updated: jsonString(item, "lastUpdated"),
        git_commit_sha: jsonString(item, "gitCommitSha"),
      });
    }
  }
  result.sort((left, right) => left.name.toLowerCase().localeCompare(right.name.toLowerCase()));
  return result;
}

// listClaudeMarketplaces 读取 Claude marketplace 列表。
// claudeHome 参数存储 Claude 配置根目录。
export function listClaudeMarketplaces(claudeHome) {
  // filePath 存储 known_marketplaces.json 路径。
  const filePath = join(expandHome(claudeHome), "plugins", "known_marketplaces.json");
  if (!existsSync(filePath)) {
    return [];
  }

  // root 存储 marketplace JSON 根对象。
  const root = JSON.parse(readFileSync(filePath, "utf8"));
  // result 存储所有 marketplace 展示信息。
  const result = [];
  for (const [name, value] of Object.entries(root || {})) {
    // source 存储来源对象。
    const source = value?.source || {};
    result.push({
      name,
      source_type: jsonString(source, "source"),
      source: jsonString(source, "url") || jsonString(source, "source"),
      install_location: jsonString(value, "installLocation"),
      last_updated: jsonString(value, "lastUpdated"),
    });
  }
  result.sort((left, right) => left.name.toLowerCase().localeCompare(right.name.toLowerCase()));
  return result;
}

// updateClaudePlugin 通过 claude CLI 更新指定插件。
// pluginName 参数存储插件完整名，scope 参数存储安装作用域。
export async function updateClaudePlugin(pluginName, scope) {
  // args 存储传给 claude CLI 的参数。
  const args = ["plugin", "update", pluginName];
  if (String(scope || "").trim()) {
    args.push("-s", scope);
  }
  return runPluginCli("claude", args, "CLAUDE_HOME", process.env.CLAUDE_HOME || "~/.claude");
}

// updateClaudeMarketplace 通过 claude CLI 刷新指定 marketplace。
// marketplaceName 参数存储 marketplace 名称。
export async function updateClaudeMarketplace(marketplaceName) {
  return runPluginCli(
    "claude",
    ["plugin", "marketplace", "update", marketplaceName],
    "CLAUDE_HOME",
    process.env.CLAUDE_HOME || "~/.claude",
  );
}

// updateCodexPlugin 通过 Codex CLI 安装指定 marketplace 中的插件以完成升级。
// pluginId 参数存储插件 ID，marketplace 参数存储所属 marketplace。
export async function updateCodexPlugin(pluginId, marketplace) {
  // defaultHome 存储当前 CODEX_HOME 或默认值。
  const defaultHome = process.env.CODEX_HOME || "~/.codex";
  // pluginArg 存储清理后的插件参数。
  const pluginArg = String(pluginId || "").trim();
  // marketplaceArg 存储清理后的 marketplace 参数。
  const marketplaceArg = String(marketplace || "").trim();
  // args 存储传给 codex plugin add 的参数。
  const args = ["plugin", "add", pluginArg, "--json"];
  if (marketplaceArg && !pluginArg.includes("@")) {
    args.push("--marketplace", marketplaceArg);
  }
  return runPluginCli("codex", args, "CODEX_HOME", defaultHome);
}

// updateCodexMarketplace 通过 Codex CLI 刷新 marketplace 快照。
// marketplaceName 参数存储 marketplace 名称；为空表示升级全部。
export async function updateCodexMarketplace(marketplaceName) {
  // defaultHome 存储当前 CODEX_HOME 或默认值。
  const defaultHome = process.env.CODEX_HOME || "~/.codex";
  // normalizedName 存储清理后的 marketplace 名称。
  const normalizedName = String(marketplaceName || "").trim();
  // args 存储传给 codex plugin marketplace upgrade 的参数。
  const args = ["plugin", "marketplace", "upgrade", "--json"];
  if (normalizedName) {
    args.push(normalizedName);
  }
  return runPluginCli("codex", args, "CODEX_HOME", defaultHome);
}

// buildUpdateToolArgs 构造 npm 全局更新参数；插件测试复用该纯函数保持旧覆盖面。
// packageName 参数存储 npm 包名。
export function buildUpdateToolArgs(packageName) {
  return ["install", "-g", packageName, "--registry=https://registry.npmjs.org"];
}
