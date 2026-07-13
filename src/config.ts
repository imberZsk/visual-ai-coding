// 应用静态配置：定义可视化展示的配置文件清单与导航项
// 这些清单基于真实的 ~/.claude 与 ~/.codex 目录结构

// 配置文件清单项：描述一个可在「配置」页展示/编辑的文件
export interface ConfigFileSpec {
  // 逻辑标识
  id: string;
  // 展示标题
  title: string;
  // 相对工具根目录的子路径（最终拼接 claude_home / codex_home）
  relPath: string;
  // 所属工具：claude / codex
  tool: "claude" | "codex";
  // 是否只读（大文件、二进制、日志等不可编辑）
  readonly: boolean;
  // 一句话说明该文件用途
  desc: string;
}

// Claude Code 可视化配置文件清单（基于真实目录）
export const CLAUDE_CONFIG_FILES: ConfigFileSpec[] = [
  {
    id: "claude-settings",
    title: "settings.json",
    relPath: "settings.json",
    tool: "claude",
    readonly: false,
    desc: "核心设置：环境变量、模型、权限、hooks",
  },
  {
    id: "claude-md",
    title: "CLAUDE.md",
    relPath: "CLAUDE.md",
    tool: "claude",
    readonly: false,
    desc: "全局指令，对所有项目生效",
  },
  {
    id: "claude-installed-plugins",
    title: "installed_plugins.json",
    relPath: "plugins/installed_plugins.json",
    tool: "claude",
    readonly: true,
    desc: "已安装插件清单（只读，请用插件页管理）",
  },
  {
    id: "claude-known-marketplaces",
    title: "known_marketplaces.json",
    relPath: "plugins/known_marketplaces.json",
    tool: "claude",
    readonly: true,
    desc: "已知插件市场（只读）",
  },
];

// Codex 可视化配置文件清单（基于真实目录）
export const CODEX_CONFIG_FILES: ConfigFileSpec[] = [
  {
    id: "codex-config",
    title: "config.toml",
    relPath: "config.toml",
    tool: "codex",
    readonly: false,
    desc: "核心设置：模型、provider、沙箱、审批策略",
  },
  {
    id: "codex-agents",
    title: "AGENTS.md",
    relPath: "AGENTS.md",
    tool: "codex",
    readonly: false,
    desc: "全局 agent 指令",
  },
  {
    id: "codex-hooks",
    title: "hooks.json",
    relPath: "hooks.json",
    tool: "codex",
    readonly: false,
    desc: "会话生命周期钩子配置",
  },
  {
    id: "codex-version",
    title: "version.json",
    relPath: "version.json",
    tool: "codex",
    readonly: true,
    desc: "版本与更新检查信息（只读）",
  },
];

// 导航页签定义
export interface NavItem {
  // 页签标识
  id: string;
  // 展示名称
  label: string;
}

// ToolNavGroup 描述侧边栏中的一级工具及其二级能力入口。
export interface ToolNavGroup {
  id: "codex" | "claude"; // id 存储工具作用域，用于生成对应能力页路由。
  label: string; // label 存储一级导航展示名称。
  children: NavItem[]; // children 存储该工具下可进入的二级页面。
}

// TOOL_NAV_GROUPS 存储按工具归类的层级导航，避免跨工具能力平铺混合。
export const TOOL_NAV_GROUPS: ToolNavGroup[] = [
  {
    id: "codex",
    label: "Codex",
    children: [
      { id: "codex", label: "配置" },
      { id: "codex-mcp", label: "MCP" },
      { id: "codex-hooks", label: "Hooks" },
      { id: "codex-agents", label: "Agents" },
      { id: "codex-plugins", label: "插件" },
      { id: "codex-skills", label: "技能" },
    ],
  },
  {
    id: "claude",
    label: "Claude Code",
    children: [
      { id: "claude", label: "配置" },
      { id: "claude-mcp", label: "MCP" },
      { id: "claude-hooks", label: "Hooks" },
      { id: "claude-agents", label: "Agents" },
      { id: "claude-plugins", label: "插件" },
      { id: "claude-skills", label: "技能" },
    ],
  },
];
