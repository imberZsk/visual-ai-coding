// 后端命令封装层：集中所有 Tauri invoke 调用，前端组件只依赖此模块
import { invoke } from "@tauri-apps/api/tauri";
import type {
  Preferences,
  ConfigFile,
  DirEntryInfo,
  PluginInfo,
  MarketplaceInfo,
  PluginUpdateCheckResult,
  SkillListResult,
  ToolLatestVersion,
  ToolStatus,
} from "./types";

// 读取应用偏好（不存在时后端返回默认值并落盘）
export function getPreferences(): Promise<Preferences> {
  return invoke("get_preferences");
}

// 保存应用偏好
export function savePreferences(prefs: Preferences): Promise<void> {
  return invoke("save_preferences", { prefs });
}

// 读取单个配置文件内容
export function readConfigFile(
  id: string,
  title: string,
  path: string,
  readonly: boolean
): Promise<ConfigFile> {
  return invoke("read_config_file", { id, title, path, readonly });
}

// 保存配置文件（后端按 format 做语法校验）
export function saveConfigFile(
  path: string,
  content: string,
  format: string
): Promise<void> {
  return invoke("save_config_file", { path, content, format });
}

// 列出目录直接子条目
export function listDir(path: string): Promise<DirEntryInfo[]> {
  return invoke("list_dir", { path });
}

// 读取 Claude 已安装插件列表
export function listClaudePlugins(claudeHome: string): Promise<PluginInfo[]> {
  return invoke("list_claude_plugins", { claudeHome });
}

// 读取 Claude 市场列表
export function listClaudeMarketplaces(
  claudeHome: string
): Promise<MarketplaceInfo[]> {
  return invoke("list_claude_marketplaces", { claudeHome });
}

// 手动更新指定插件，返回 CLI 输出
// scope 为插件安装作用域（user / project），保证 project 插件更新到正确位置
export function updateClaudePlugin(
  pluginName: string,
  scope: string
): Promise<string> {
  return invoke("update_claude_plugin", { pluginName, scope });
}

// 手动更新指定市场，返回 CLI 输出
export function updateClaudeMarketplace(
  marketplaceName: string
): Promise<string> {
  return invoke("update_claude_marketplace", { marketplaceName });
}

// 检查 Claude 插件更新状态
// claudeHome 为 Claude 配置根目录，后端据此定位本地插件与市场配置。
export function checkClaudePluginUpdates(
  claudeHome: string
): Promise<PluginUpdateCheckResult> {
  return invoke("check_claude_plugin_updates", { claudeHome });
}

// 检查 Codex 插件更新状态
// codexHome 为 Codex 配置根目录，后端据此定位本地 marketplace 与插件安装目录。
export function checkCodexPluginUpdates(
  codexHome: string
): Promise<PluginUpdateCheckResult> {
  return invoke("check_codex_plugin_updates", { codexHome });
}

// 刷新 Codex marketplace，确保随后安装插件时拿到最新索引
// marketplaceName 为要更新的 marketplace 名称。
export function updateCodexMarketplace(
  marketplaceName: string
): Promise<string> {
  return invoke("update_codex_marketplace", { marketplaceName });
}

// 更新 Codex 指定插件
// pluginId 为插件完整 ID，marketplace 为插件所属市场，后端需要两者共同定位安装来源。
export function updateCodexPlugin(
  pluginId: string,
  marketplace: string
): Promise<string> {
  return invoke("update_codex_plugin", { pluginId, marketplace });
}

// 探测本机 AI 工具安装状态
export function detectTools(): Promise<ToolStatus[]> {
  return invoke("detect_tools");
}

// 查询指定工具在 npm registry 上的最新版本
// toolId 为工具标识，如 claude / codex。
export function checkToolLatestVersion(
  toolId: string
): Promise<ToolLatestVersion> {
  return invoke("check_tool_latest_version", { toolId });
}

// 更新指定工具 CLI 到 npm registry 最新版本
// toolId 为工具标识，如 claude / codex。
export function updateToolCli(toolId: string): Promise<string> {
  return invoke("update_tool_cli", { toolId });
}

// 在 VSCode 打开文件/目录
export function openInVscode(
  vscodePath: string,
  target: string
): Promise<void> {
  return invoke("open_in_vscode", { vscodePath, target });
}

// 在 Finder 中显示路径
export function revealInFinder(target: string): Promise<void> {
  return invoke("reveal_in_finder", { target });
}

// 扫描 Claude / Codex / Agents 可用 Skill 列表
// claudeHome 与 codexHome 分别为对应工具的配置根目录。
export function listSkills(
  claudeHome: string,
  codexHome: string
): Promise<SkillListResult> {
  return invoke("list_skills", { claudeHome, codexHome });
}
