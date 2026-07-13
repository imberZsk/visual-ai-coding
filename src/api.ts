// 后端命令封装层：集中所有 Electron preload API 调用，前端组件只依赖此模块
import type {
  Preferences,
  ConfigFile,
  ClaudeOutputStyleInfo,
  ClaudeOutputStyleListResult,
  DirEntryInfo,
  PluginInfo,
  MarketplaceInfo,
  PluginUpdateCheckResult,
  SkillListResult,
  OfficialSettingsSyncResult,
  ToolLatestVersion,
  ToolStatus,
} from "./types";

// ElectronApi 存储 preload API 的非空类型，getElectronApi 已在运行时做缺失检查。
type ElectronApi = NonNullable<Window["api"]>;

// PluginTogglePayload 描述单插件启停请求参数。
export interface PluginTogglePayload {
  tool: "claude" | "codex"; // 插件所属工具。
  pluginId: string; // 插件完整 ID。
  scope: string; // Claude 插件安装作用域，Codex 为空字符串。
  enabled: boolean; // 目标启用状态。
  claudeHome: string; // Claude 配置根目录。
  codexHome: string; // Codex 配置根目录。
}

// getElectronApi 获取 preload 暴露的受限 API；缺失时给出明确错误，便于定位启动链路问题。
function getElectronApi(): ElectronApi {
  // api 存储 preload 注入到 window 上的安全桥。
  const api = window.api;
  if (!api) {
    throw new Error("Electron preload API 未初始化");
  }
  return api;
}

// 读取应用偏好（不存在时后端返回默认值并落盘）
export function getPreferences(): Promise<Preferences> {
  return getElectronApi().getPreferences();
}

// 保存应用偏好
export function savePreferences(prefs: Preferences): Promise<void> {
  return getElectronApi().savePreferences(prefs);
}

// 读取单个配置文件内容
export function readConfigFile(
  id: string,
  title: string,
  path: string,
  readonly: boolean
): Promise<ConfigFile> {
  return getElectronApi().readConfigFile({ id, title, path, readonly });
}

// 保存配置文件（后端按 format 做语法校验）
export function saveConfigFile(
  path: string,
  content: string,
  format: string
): Promise<void> {
  return getElectronApi().saveConfigFile({ path, content, format });
}

// 列出目录直接子条目
export function listDir(path: string): Promise<DirEntryInfo[]> {
  return getElectronApi().listDir(path);
}

// 扫描 Claude 内置与自定义 output style 列表
// claudeHome 为 Claude 配置根目录，后端据此定位 output-styles 目录。
export function listClaudeOutputStyles(
  claudeHome: string
): Promise<ClaudeOutputStyleListResult> {
  return getElectronApi().listClaudeOutputStyles(claudeHome);
}

// 创建 Claude 自定义 output style Markdown 文件
// claudeHome 为 Claude 配置根目录，name 为 settings.json 中 outputStyle 对应的风格名。
export function createClaudeOutputStyle(
  claudeHome: string,
  name: string
): Promise<ClaudeOutputStyleInfo> {
  return getElectronApi().createClaudeOutputStyle({ claudeHome, name });
}

// 读取 Claude 已安装插件列表
export function listClaudePlugins(claudeHome: string): Promise<PluginInfo[]> {
  return getElectronApi().listClaudePlugins(claudeHome);
}

// 读取 Claude 市场列表
export function listClaudeMarketplaces(
  claudeHome: string
): Promise<MarketplaceInfo[]> {
  return getElectronApi().listClaudeMarketplaces(claudeHome);
}

// 手动更新指定插件，返回 CLI 输出
// scope 为插件安装作用域（user / project），保证 project 插件更新到正确位置
export function updateClaudePlugin(
  pluginName: string,
  scope: string
): Promise<string> {
  return getElectronApi().updateClaudePlugin({ pluginName, scope });
}

// 手动更新指定市场，返回 CLI 输出
export function updateClaudeMarketplace(
  marketplaceName: string
): Promise<string> {
  return getElectronApi().updateClaudeMarketplace(marketplaceName);
}

// 检查 Claude 插件更新状态
// claudeHome 为 Claude 配置根目录，后端据此定位本地插件与市场配置。
export function checkClaudePluginUpdates(
  claudeHome: string
): Promise<PluginUpdateCheckResult> {
  return getElectronApi().checkClaudePluginUpdates(claudeHome);
}

// 检查 Codex 插件更新状态
// codexHome 为 Codex 配置根目录，后端据此定位本地 marketplace 与插件安装目录。
export function checkCodexPluginUpdates(
  codexHome: string
): Promise<PluginUpdateCheckResult> {
  return getElectronApi().checkCodexPluginUpdates(codexHome);
}

// 刷新 Codex marketplace，确保随后安装插件时拿到最新索引
// marketplaceName 为要更新的 marketplace 名称。
export function updateCodexMarketplace(
  marketplaceName: string
): Promise<string> {
  return getElectronApi().updateCodexMarketplace(marketplaceName);
}

// 更新 Codex 指定插件
// pluginId 为插件完整 ID，marketplace 为插件所属市场，后端需要两者共同定位安装来源。
export function updateCodexPlugin(
  pluginId: string,
  marketplace: string
): Promise<string> {
  return getElectronApi().updateCodexPlugin({ pluginId, marketplace });
}

// 启用或禁用单个插件
// payload 存储工具、插件标识、目标状态和对应配置根目录。
export function setPluginEnabled(payload: PluginTogglePayload): Promise<string> {
  return getElectronApi().setPluginEnabled(payload);
}

// 探测本机 AI 工具安装状态
export function detectTools(): Promise<ToolStatus[]> {
  return getElectronApi().detectTools();
}

// 查询指定工具在 npm registry 上的最新版本
// toolId 为工具标识，如 claude / codex。
export function checkToolLatestVersion(
  toolId: string
): Promise<ToolLatestVersion> {
  return getElectronApi().checkToolLatestVersion(toolId);
}

// 更新指定工具 CLI 到 npm registry 最新版本
// toolId 为工具标识，如 claude / codex。
export function updateToolCli(toolId: string): Promise<string> {
  return getElectronApi().updateToolCli(toolId);
}

// 在 VSCode 打开文件/目录
export function openInVscode(
  vscodePath: string,
  target: string
): Promise<void> {
  return getElectronApi().openInVscode({ vscodePath, target });
}

// 在 Finder 中显示路径
export function revealInFinder(target: string): Promise<void> {
  return getElectronApi().revealInFinder(target);
}

// 使用系统浏览器打开 HTTPS 外部网址。
// url 参数存储需要打开的完整网址。
export function openExternalUrl(url: string): Promise<void> {
  return getElectronApi().openExternalUrl(url);
}

// 扫描 Claude / Codex / Agents 可用 Skill 列表
// claudeHome 与 codexHome 分别为对应工具的配置根目录。
export function listSkills(
  claudeHome: string,
  codexHome: string
): Promise<SkillListResult> {
  return getElectronApi().listSkills({ claudeHome, codexHome });
}

// 读取官方设置来源缓存
export function getOfficialSettingsSources(): Promise<OfficialSettingsSyncResult> {
  return getElectronApi().getOfficialSettingsSources();
}

// 从官方文档同步最新配置字段来源
export function updateOfficialSettingsSources(): Promise<OfficialSettingsSyncResult> {
  return getElectronApi().updateOfficialSettingsSources();
}
