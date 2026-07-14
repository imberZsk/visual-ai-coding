// Electron preload API 类型声明：渲染进程只能通过 window.api 访问后端能力。
import type {
  ClaudeOutputStyleInfo,
  ClaudeOutputStyleListResult,
  ConfigFile,
  DirEntryInfo,
  MarketplaceInfo,
  OfficialSettingsSyncResult,
  PluginInfo,
  PluginUpdateCheckResult,
  Preferences,
  SkillListResult,
  ToolLatestVersion,
  ToolStatus,
  UnifiedMcpResult,
  UnifiedMcpServer,
  UnifiedSkillsResult,
  UnifiedSyncResult,
} from './types'

declare global {
  interface Window {
    api?: {
      getPreferences: () => Promise<Preferences> // 读取应用偏好。
      savePreferences: (prefs: Preferences) => Promise<void> // 保存应用偏好。
      getOfficialSettingsSources: () => Promise<OfficialSettingsSyncResult> // 读取官方设置来源缓存。
      updateOfficialSettingsSources: () => Promise<OfficialSettingsSyncResult> // 同步官方设置来源。
      readConfigFile: (payload: {
        id: string // 配置文件逻辑标识。
        title: string // 配置文件展示标题。
        path: string // 配置文件路径。
        readonly: boolean // 是否只读。
      }) => Promise<ConfigFile>
      saveConfigFile: (payload: {
        path: string // 配置文件路径。
        content: string // 配置文件内容。
        format: string // 配置文件格式。
      }) => Promise<void>
      listDir: (path: string) => Promise<DirEntryInfo[]> // 列出目录条目。
      listClaudeOutputStyles: (
        claudeHome: string
      ) => Promise<ClaudeOutputStyleListResult> // 扫描 Claude output style。
      createClaudeOutputStyle: (payload: {
        claudeHome: string // Claude 配置根目录。
        name: string // output style 名称。
      }) => Promise<ClaudeOutputStyleInfo>
      listClaudePlugins: (claudeHome: string) => Promise<PluginInfo[]> // 读取 Claude 插件列表。
      listClaudeMarketplaces: (claudeHome: string) => Promise<MarketplaceInfo[]> // 读取 Claude marketplace 列表。
      checkClaudePluginUpdates: (
        claudeHome: string
      ) => Promise<PluginUpdateCheckResult> // 检查 Claude 插件更新。
      checkCodexPluginUpdates: (
        codexHome: string
      ) => Promise<PluginUpdateCheckResult> // 检查 Codex 插件更新。
      updateClaudePlugin: (payload: {
        pluginName: string // Claude 插件完整名称。
        scope: string // 安装作用域。
      }) => Promise<string>
      updateClaudeMarketplace: (marketplaceName: string) => Promise<string> // 更新 Claude marketplace。
      updateCodexPlugin: (payload: {
        pluginId: string // Codex 插件 ID。
        marketplace: string // 所属 marketplace。
      }) => Promise<string>
      updateCodexMarketplace: (marketplaceName: string) => Promise<string> // 更新 Codex marketplace。
      setPluginEnabled: (payload: {
        tool: 'claude' | 'codex' // 插件所属工具。
        pluginId: string // 插件完整 ID。
        scope: string // Claude 插件安装作用域，Codex 为空字符串。
        enabled: boolean // 目标启用状态。
        claudeHome: string // Claude 配置根目录。
        codexHome: string // Codex 配置根目录。
      }) => Promise<string>
      listSkills: (payload: {
        claudeHome: string // Claude 配置根目录。
        codexHome: string // Codex 配置根目录。
      }) => Promise<SkillListResult>
      checkToolLatestVersion: (toolId: string) => Promise<ToolLatestVersion> // 查询工具最新版。
      updateToolCli: (toolId: string) => Promise<string> // 更新工具 CLI。
      detectTools: () => Promise<ToolStatus[]> // 探测本机工具。
      openInVscode: (payload: {
        vscodePath: string // VSCode CLI 路径。
        target: string // 要打开的目标路径。
      }) => Promise<void>
      revealInFinder: (target: string) => Promise<void> // 在 Finder 中显示路径。
      openExternalUrl: (url: string) => Promise<void> // 使用系统浏览器打开 HTTPS 外部网址。
      getUnifiedMcp: () => Promise<UnifiedMcpResult> // 读取统一 MCP 配置源。
      saveUnifiedMcp: (servers: UnifiedMcpServer[]) => Promise<UnifiedMcpResult> // 保存统一 MCP 配置源。
      listUnifiedSkills: () => Promise<UnifiedSkillsResult> // 列出统一 Skills 源目录技能。
      syncUnified: (options?: {
        claudeHome?: string // Claude 配置根目录，省略时用默认。
        codexHome?: string // Codex 配置根目录，省略时用默认。
      }) => Promise<UnifiedSyncResult>
    }
  }
}

export {}
