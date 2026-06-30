// 全前端共享的类型定义，与 Rust 后端命令返回结构一一对应

// 应用偏好，对应 Rust Preferences（注意 serde 默认使用 snake_case 字段名）
export interface Preferences {
  theme: string; // light / dark / system
  vscode_path: string; // VSCode CLI 路径
  claude_home: string; // Claude 配置根目录
  codex_home: string; // Codex 配置根目录
  last_active_tab: string; // 上次激活的页面
}

// 单个配置文件，对应 Rust ConfigFile
export interface ConfigFile {
  id: string; // 逻辑标识
  title: string; // 展示标题
  path: string; // 绝对路径
  format: string; // json / toml / text
  content: string; // 文件文本内容
  exists: boolean; // 是否存在
  readonly: boolean; // 是否只读
}

// 目录条目，对应 Rust DirEntryInfo
export interface DirEntryInfo {
  name: string; // 名称
  path: string; // 绝对路径
  is_dir: boolean; // 是否目录
  size: number; // 字节大小
}

// 已安装插件，对应 Rust PluginInfo
export interface PluginInfo {
  name: string; // 插件全名
  marketplace: string; // 所属市场
  version: string; // 版本
  scope: string; // user / project
  install_path: string; // 安装路径
  installed_at: string; // 安装时间
  last_updated: string; // 最近更新时间
  git_commit_sha: string; // git commit sha
}

// 市场信息，对应 Rust MarketplaceInfo
export interface MarketplaceInfo {
  name: string; // 市场名
  source_type: string; // git / local
  source: string; // 来源地址
  install_location: string; // 安装位置
  last_updated: string; // 最近更新时间
}

// 插件更新状态，对应 Rust 后端计算出的版本比较结果
export type PluginUpdateStatus = "same" | "newer" | "different" | "unknown";

// 工具无关插件信息，对应 Rust ToolPluginInfo
export interface ToolPluginInfo {
  id: string; // 插件完整 ID
  name: string; // 插件短名称
  marketplace: string; // marketplace 名称
  current_version: string; // 当前已安装版本
  available_version: string; // 可用最新版本
  scope: string; // 安装作用域，Codex 为空字符串
  enabled: boolean; // 插件是否启用
  install_path: string; // 插件安装路径
  last_updated: string; // 最近更新时间
  update_status: PluginUpdateStatus; // 更新状态
}

// 插件更新检查结果，对应 Rust PluginUpdateCheckResult
export interface PluginUpdateCheckResult {
  tool: "claude" | "codex"; // 工具标识
  plugins: ToolPluginInfo[]; // 插件信息列表
  raw_output: string; // CLI 原始输出
  diagnostics?: string; // 诊断信息，兼容 Rust 新增字段
}

// 工具探测结果，对应 Rust ToolStatus
export interface ToolStatus {
  id: string; // 工具标识
  name: string; // 展示名
  installed: boolean; // 是否安装
  version: string; // 版本文本
  path: string; // 可执行路径
}
