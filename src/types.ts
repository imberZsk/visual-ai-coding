// 全前端共享的类型定义，与 Rust 后端命令返回结构一一对应

// 应用偏好，对应 Rust Preferences（注意 serde 默认使用 snake_case 字段名）
export interface Preferences {
  theme: string // light / dark / system
  vscode_path: string // VSCode CLI 路径
  claude_home: string // Claude 配置根目录
  codex_home: string // Codex 配置根目录
  last_active_tab: string // 上次激活的页面
  hidden_visual_config_fields: Record<string, string[]> // 可视化配置中用户手动隐藏的字段路径，按 schema id 分组
}

// QuotaProvider 描述额度查询来源类型。
export type QuotaProvider = 'openai' | 'anthropic' | 'custom'

// QuotaAccount 描述前端可见的模型额度账户，不包含 API Key 明文。
export interface QuotaAccount {
  id: string // 账户稳定 ID。
  name: string // 用户设置的账户名称。
  provider: QuotaProvider // 额度来源类型。
  models: string[] // 此账户可用的模型 ID。
  base_url: string // OpenAI 兼容服务基础地址。
  quota_path: string // 相对 Base URL 的额度查询路径。
  endpoint: string // 自定义额度查询接口，内置供应商为空。
  quota_limit: number // 当前周期总额度上限。
  unit: string // 额度单位，例如 USD、CNY、tokens。
  has_api_key: boolean // 主进程是否已安全保存凭据。
}

// QuotaAccountInput 描述新增或编辑额度账户时提交的数据。
export interface QuotaAccountInput extends Omit<QuotaAccount, 'has_api_key'> {
  api_key?: string // 新 API Key；编辑时留空表示保留旧值。
}

// QuotaResult 描述单个账户的当前额度查询结果。
export interface QuotaResult {
  account_id: string // 对应额度账户 ID。
  checked_at: string // 查询完成时间 ISO 字符串。
  used: number // 当前周期已使用额度。
  limit: number // 当前周期总额度。
  remaining: number // 当前周期剩余额度。
  unit: string // 额度单位。
}

// QuotaModelDiscoveryInput 描述通过 Base URL 读取模型列表所需的数据。
export interface QuotaModelDiscoveryInput {
  account_id?: string // 编辑账户 ID，用于 API Key 留空时读取已保存凭据。
  base_url: string // OpenAI 兼容服务基础地址。
  api_key?: string // 新输入的 API Key。
}

// 单个配置文件，对应 Rust ConfigFile
export interface ConfigFile {
  id: string // 逻辑标识
  title: string // 展示标题
  path: string // 绝对路径
  format: string // json / toml / text
  content: string // 文件文本内容
  exists: boolean // 是否存在
  readonly: boolean // 是否只读
}

// 目录条目，对应 Rust DirEntryInfo
export interface DirEntryInfo {
  name: string // 名称
  path: string // 绝对路径
  is_dir: boolean // 是否目录
  size: number // 字节大小
}

// Claude output style 来源类型，对应 Rust ClaudeOutputStyleInfo.kind
export type ClaudeOutputStyleKind = 'builtin' | 'custom'

// Claude output style 信息，对应 Rust ClaudeOutputStyleInfo
export interface ClaudeOutputStyleInfo {
  name: string // 风格名称，对应 settings.json 中 outputStyle 的值
  kind: ClaudeOutputStyleKind // 风格来源：builtin / custom
  path: string // 自定义风格 Markdown 文件路径，内置风格为空字符串
  description: string // 风格说明
}

// Claude output style 列表结果，对应 Rust ClaudeOutputStyleListResult
export interface ClaudeOutputStyleListResult {
  directory: string // 自定义 output-styles 目录绝对路径
  exists: boolean // 自定义 output-styles 目录是否存在
  styles: ClaudeOutputStyleInfo[] // 内置与自定义 output style 候选项
  diagnostics: string // 扫描自定义风格时产生的提示
}

// 已安装插件，对应 Rust PluginInfo
export interface PluginInfo {
  name: string // 插件全名
  marketplace: string // 所属市场
  version: string // 版本
  scope: string // user / project
  install_path: string // 安装路径
  installed_at: string // 安装时间
  last_updated: string // 最近更新时间
  git_commit_sha: string // git commit sha
}

// 市场信息，对应 Rust MarketplaceInfo
export interface MarketplaceInfo {
  name: string // 市场名
  source_type: string // git / local
  source: string // 来源地址
  install_location: string // 安装位置
  last_updated: string // 最近更新时间
}

// 插件更新状态，对应 Rust 后端计算出的版本比较结果
export type PluginUpdateStatus = 'same' | 'newer' | 'different' | 'unknown'

// 工具无关插件信息，对应 Rust ToolPluginInfo
export interface ToolPluginInfo {
  id: string // 插件完整 ID
  name: string // 插件短名称
  marketplace: string // marketplace 名称
  current_version: string // 当前已安装版本
  available_version: string // 可用最新版本
  scope: string // 安装作用域，Codex 为空字符串
  enabled: boolean // 插件是否启用
  install_path: string // 插件安装路径
  last_updated: string // 最近更新时间
  update_status: PluginUpdateStatus // 更新状态
}

// PluginGitBranchInfo 描述插件源码仓库的分支状态。
export interface PluginGitBranchInfo {
  repository_path: string // Git 仓库根目录
  current_branch: string // 当前检出的本地分支，detached HEAD 时为空字符串
  branches: string[] // 可切换的本地与远端分支名称
}

// PluginGitPayload 描述定位插件源码仓库所需的信息。
export interface PluginGitPayload {
  tool: 'claude' | 'codex' // 插件所属工具
  pluginId: string // 插件完整 ID
  scope: string // Claude 插件安装作用域，Codex 为空字符串
  marketplace: string // 插件所属 marketplace
  installPath: string // 插件安装路径
  claudeHome: string // Claude 配置根目录
  codexHome: string // Codex 配置根目录
}

// 插件更新检查结果，对应 Rust PluginUpdateCheckResult
export interface PluginUpdateCheckResult {
  tool: 'claude' | 'codex' // 工具标识
  plugins: ToolPluginInfo[] // 插件信息列表
  raw_output: string // CLI 原始输出
  diagnostics: string // 诊断信息，对应 Rust 必填字段
}

// 工具探测结果，对应 Rust ToolStatus
export interface ToolStatus {
  id: string // 工具标识
  name: string // 展示名
  installed: boolean // 是否安装
  version: string // 版本文本
  path: string // 可执行路径
}

// 工具最新版本查询结果，对应 Rust ToolLatestVersion
export interface ToolLatestVersion {
  tool_id: string // 工具标识
  package_name: string // 查询所用 npm 包名
  latest_version: string // npm registry 返回的最新版本
  release_notes_url: string // 官方 changelog 或 releases 页面网址
}

// 单个 Skill 信息，对应 Rust SkillInfo
export interface SkillInfo {
  name: string // Skill 名称，来自 SKILL.md front matter 或目录名
  description: string // Skill 用途说明，来自 SKILL.md description
  source: string // 来源展示名，如 Codex 系统 / Codex 插件 / Agents
  tool: 'claude' | 'codex' | 'agents' // Skill 所属工具域
  plugin: string // 插件归属，非插件 Skill 为空字符串
  path: string // SKILL.md 绝对路径
}

// Skill 列表查询结果，对应 Rust SkillListResult
export interface SkillListResult {
  skills: SkillInfo[] // 扫描到的可用 Skill 列表
  diagnostics: string // 扫描诊断信息，如缺失目录或读取失败
}

// OfficialSettingField 描述官方文档中识别出的一个配置字段。
export interface OfficialSettingField {
  path: string // path 存储配置字段真实英文 key 或点分路径
}

// OfficialSettingsSource 描述一个配置文件对应的官方来源与本地缓存状态。
export interface OfficialSettingsSource {
  id: string // id 存储与 VisualConfigSchema.id 对齐的稳定标识
  title: string // title 存储设置页展示标题
  description: string // description 存储官方来源用途说明
  url: string // url 存储官方文档地址
  cached_at: string // cached_at 存储最近一次成功同步时间，未同步时为空
  fields: OfficialSettingField[] // fields 存储官方文档提取出的字段列表
}

// OfficialSettingsSyncResult 描述官方设置来源读取或同步结果。
export interface OfficialSettingsSyncResult {
  sources: OfficialSettingsSource[] // sources 存储全部官方设置来源
  diagnostics: string // diagnostics 存储同步失败或部分失败的诊断信息
}

// UnifiedMcpServer 描述统一 MCP 源中的单个 server（工具无关的中立结构）。
export interface UnifiedMcpServer {
  name: string // server 名称，同步到两端时作为唯一 key
  command: string // server 启动命令
  args: string[] // server 启动参数
  env: Record<string, string> // server 环境变量
}

// UnifiedMcpResult 描述读取/保存统一 MCP 源的结果。
export interface UnifiedMcpResult {
  path: string // 统一 mcp.json 绝对路径
  servers: UnifiedMcpServer[] // 归一化后的 server 列表
}

// UnifiedSkillsResult 描述统一 Skills 源目录下的技能列表。
export interface UnifiedSkillsResult {
  dir: string // 统一 Skills 源目录绝对路径
  skills: string[] // 技能名称列表
}

// UnifiedSyncItem 描述一次同步中单个动作（某能力写入某工具）的结果。
export interface UnifiedSyncItem {
  capability: 'mcp' | 'skills' // 同步的能力类型
  tool: 'claude' | 'codex' // 同步目标工具
  path: string // 写入或链接的目标路径
  count: number // 本次写入/链接的条目数量
  total?: number // Skills 同步时的源技能总数
  warnings: string[] // 本动作产生的非致命提示
}

// UnifiedSyncResult 描述一次统一配置同步的整体结果。
export interface UnifiedSyncResult {
  results: UnifiedSyncItem[] // 各同步动作的结果列表
  warnings: string[] // 汇总后的全部非致命提示
  syncedAt: string // 同步完成时间（ISO 字符串）
}
