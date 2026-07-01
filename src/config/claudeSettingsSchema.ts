import type {
  VisualConfigControl,
  VisualConfigField,
  VisualConfigRisk,
  VisualConfigSchema,
} from "../components/visual-config/schemaTypes";
import { CLAUDE_MODEL_OPTIONS } from "./modelOptions";

// USER_PROJECT_LOCAL_SCOPE 存储 Claude settings 在三类常见配置层级中的生效说明。
const USER_PROJECT_LOCAL_SCOPE = "用户级、项目级、本地级均可覆盖；实际优先级以 Claude Code 合并结果为准。";
// USER_SCOPE 存储只建议放在用户配置中的字段说明。
const USER_SCOPE = "用户级配置；通常是个人偏好或机器本地设置。";
// MANAGED_SCOPE 存储托管策略专用字段说明。
const MANAGED_SCOPE = "托管/企业策略配置；普通用户配置中通常不需要设置。";
// SENSITIVE_SCOPE 存储可能包含密钥、命令或本机路径的字段说明。
const SENSITIVE_SCOPE = "用户级或托管配置；可能包含密钥、命令或本机路径，保存前请确认来源可信。";

// field 用于创建 Claude settings 的可视化字段定义，减少大 schema 中重复的属性书写。
// path 参数存储 settings.json 中的点分路径；title 参数存储界面标题；description 参数存储字段用途说明；control 参数存储控件类型；scope 参数存储生效范围；risk 参数存储风险等级；extra 参数存储枚举、默认值和敏感标记等补充元数据。
function field(
  path: string,
  title: string,
  description: string,
  control: VisualConfigControl,
  scope: string = USER_PROJECT_LOCAL_SCOPE,
  risk: VisualConfigRisk = "normal",
  extra: Partial<VisualConfigField> = {}
): VisualConfigField {
  return {
    path,
    title,
    description,
    control,
    scope,
    risk,
    ...extra,
  };
}

// CLAUDE_SETTINGS_SCHEMA 存储 Claude settings.json 的可视化字段元数据。
export const CLAUDE_SETTINGS_SCHEMA: VisualConfigSchema = {
  id: "claude-settings",
  title: "Claude settings.json",
  format: "json",
  groups: [
    {
      id: "model-agent",
      title: "模型与 Agent",
      description: "控制主会话、Advisor、子代理、推理强度和模型可选范围。",
      fields: [
        field("model", "默认模型", "Claude Code 默认使用的模型别名或完整模型名。", "select", USER_PROJECT_LOCAL_SCOPE, "normal", {
          options: CLAUDE_MODEL_OPTIONS,
        }),
        field(
          "fallbackModel",
          "Fallback 模型",
          "默认模型不可用或过载时按顺序尝试的备用模型；可填字符串或 JSON 数组。",
          "json-value"
        ),
        field(
          "advisorModel",
          "Advisor 模型",
          "Advisor 工具使用的模型别名或完整模型 ID；取消设置可停用 Advisor 默认模型。",
          "select",
          USER_PROJECT_LOCAL_SCOPE,
          "normal",
          { options: CLAUDE_MODEL_OPTIONS }
        ),
        field(
          "agent",
          "默认 Agent",
          "把主线程作为指定子代理运行，并作为 claude agents 派发会话的默认 agent。",
          "text"
        ),
        field(
          "effortLevel",
          "推理强度",
          "持久化 /effort 选择的推理强度。",
          "select",
          USER_PROJECT_LOCAL_SCOPE,
          "normal",
          {
            options: [
              { value: "low", label: "low" },
              { value: "medium", label: "medium" },
              { value: "high", label: "high" },
              { value: "xhigh", label: "xhigh" },
              { value: "max", label: "max" },
            ],
          }
        ),
        field(
          "alwaysThinkingEnabled",
          "默认扩展思考",
          "新会话默认启用扩展思考；通常由 /config 写入。",
          "switch",
          USER_SCOPE,
          "experimental"
        ),
        field(
          "availableModels",
          "可选模型 allowlist",
          "限制主会话、子代理、技能和 Advisor 可选择的模型列表。",
          "string-list",
          MANAGED_SCOPE,
          "danger"
        ),
        field(
          "enforceAvailableModels",
          "强制模型 allowlist",
          "将 availableModels 的限制扩展到 Default 模型选择。",
          "switch",
          MANAGED_SCOPE,
          "danger"
        ),
        field(
          "modelOverrides",
          "模型映射",
          "把 Anthropic 模型 ID 映射到 Bedrock inference profile ARN 等 provider 专用 ID。",
          "json-object",
          SENSITIVE_SCOPE,
          "sensitive",
          { sensitive: true }
        ),
        field(
          "outputStyle",
          "输出风格",
          "调整系统提示词所使用的输出风格名称。",
          "text",
          USER_PROJECT_LOCAL_SCOPE,
          "normal"
        ),
        field(
          "language",
          "回复语言",
          "设置 Claude 默认使用的回复语言，例如 japanese、spanish、french。",
          "text",
          USER_SCOPE
        ),
        field(
          "teammateDefaultModel",
          "Teammate 默认模型",
          "agent team teammate 在 spawn prompt 未指定模型时使用的默认模型。",
          "select",
          USER_SCOPE,
          "experimental",
          { options: CLAUDE_MODEL_OPTIONS }
        ),
      ],
    },
    {
      id: "permissions-sandbox",
      title: "权限与沙箱",
      description: "控制工具 allow/ask/deny 规则、危险模式和 Bash 沙箱边界。",
      fields: [
        field(
          "permissions.defaultMode",
          "默认权限模式",
          "新会话默认采用的权限模式。",
          "select",
          USER_PROJECT_LOCAL_SCOPE,
          "danger",
          {
            options: [
              { value: "default", label: "default" },
              { value: "acceptEdits", label: "acceptEdits" },
              { value: "plan", label: "plan" },
              { value: "auto", label: "auto" },
              { value: "dontAsk", label: "dontAsk" },
              { value: "bypassPermissions", label: "bypassPermissions" },
            ],
          }
        ),
        field("permissions.allow", "允许规则", "允许直接执行的工具或命令规则。", "string-list", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("permissions.ask", "询问规则", "执行前需要确认的工具或命令规则。", "string-list"),
        field("permissions.deny", "拒绝规则", "始终拒绝执行的工具、命令或敏感文件访问规则。", "string-list"),
        field(
          "permissions.additionalDirectories",
          "额外工作目录",
          "允许 Claude Code 访问的额外工作目录。",
          "string-list",
          USER_PROJECT_LOCAL_SCOPE,
          "danger"
        ),
        field(
          "permissions.disableBypassPermissionsMode",
          "禁用绕过权限模式",
          "阻止 bypassPermissions 或危险跳过权限模式被激活。",
          "select",
          MANAGED_SCOPE,
          "danger",
          { options: [{ value: "disable", label: "disable" }] }
        ),
        field(
          "permissions.skipDangerousModePermissionPrompt",
          "跳过危险模式提示",
          "进入 bypass permissions 模式时跳过二次确认提示。",
          "switch",
          USER_SCOPE,
          "danger"
        ),
        field("sandbox.enabled", "启用 Bash 沙箱", "在支持平台启用 Bash 沙箱。", "switch", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.failIfUnavailable", "沙箱不可用则退出", "启用沙箱但依赖缺失或平台不支持时，启动即失败。", "switch", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.autoAllowBashIfSandboxed", "沙箱内自动允许 Bash", "命令在沙箱内运行时自动批准 Bash。", "switch", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.excludedCommands", "排除沙箱命令", "需要在沙箱外运行的命令列表。", "string-list", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.allowUnsandboxedCommands", "允许命令跳出沙箱", "允许 dangerouslyDisableSandbox 参数让命令在沙箱外运行。", "switch", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.filesystem.allowWrite", "沙箱允许写入路径", "沙箱命令额外可写的路径列表。", "string-list", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.filesystem.denyWrite", "沙箱禁止写入路径", "沙箱命令不可写入的路径列表。", "string-list", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.filesystem.denyRead", "沙箱禁止读取路径", "沙箱命令不可读取的路径列表。", "string-list", USER_PROJECT_LOCAL_SCOPE, "sensitive"),
        field("sandbox.filesystem.allowRead", "沙箱重新允许读取路径", "在 denyRead 区域内重新允许读取的路径列表。", "string-list", USER_PROJECT_LOCAL_SCOPE, "sensitive"),
        field("sandbox.filesystem.allowManagedReadPathsOnly", "只允许托管读取路径", "只采纳托管设置中的 allowRead 路径。", "switch", MANAGED_SCOPE, "danger"),
        field("sandbox.credentials.files", "沙箱隐藏凭据文件", "沙箱命令不能读取的凭据文件或目录。", "string-list", USER_PROJECT_LOCAL_SCOPE, "sensitive", { sensitive: true }),
        field("sandbox.credentials.envVars", "沙箱隐藏环境变量", "沙箱命令运行前要移除的环境变量规则数组。", "json-value", USER_PROJECT_LOCAL_SCOPE, "sensitive", { sensitive: true }),
        field("sandbox.network.allowedDomains", "沙箱允许域名", "沙箱网络允许访问的域名列表，支持通配符。", "string-list", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.network.deniedDomains", "沙箱拒绝域名", "沙箱网络禁止访问的域名列表。", "string-list", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.network.allowManagedDomainsOnly", "只允许托管域名", "只采纳托管设置中的网络允许域名。", "switch", MANAGED_SCOPE, "danger"),
        field("sandbox.network.allowUnixSockets", "允许 Unix Socket", "沙箱内可访问的 Unix socket 路径。", "string-list", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.network.allowAllUnixSockets", "允许所有 Unix Socket", "允许沙箱访问所有 Unix socket。", "switch", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.network.allowLocalBinding", "允许本地端口绑定", "允许沙箱命令绑定 localhost 端口。", "switch", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.network.allowMachLookup", "允许 Mach 服务查询", "macOS 沙箱可查询的 XPC/Mach 服务名。", "string-list", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.network.httpProxyPort", "HTTP 代理端口", "使用自带代理时指定 HTTP 代理端口。", "number", USER_SCOPE),
        field("sandbox.network.socksProxyPort", "SOCKS 代理端口", "使用自带代理时指定 SOCKS5 代理端口。", "number", USER_SCOPE),
        field("sandbox.enableWeakerNestedSandbox", "弱化嵌套沙箱", "在非特权 Docker 环境中启用较弱沙箱。", "switch", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.enableWeakerNetworkIsolation", "弱化网络隔离", "允许访问系统 TLS 信任服务，降低网络隔离强度。", "switch", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.allowAppleEvents", "允许 Apple Events", "允许沙箱命令发送 Apple Events。", "switch", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("sandbox.bwrapPath", "bubblewrap 路径", "Linux/WSL2 托管策略中指定 bwrap 绝对路径。", "text", MANAGED_SCOPE, "danger"),
        field("sandbox.socatPath", "socat 路径", "Linux/WSL2 托管策略中指定 sandbox 网络代理 socat 绝对路径。", "text", MANAGED_SCOPE, "danger"),
      ],
    },
    {
      id: "runtime-extensions",
      title: "运行时与扩展",
      description: "控制环境变量、Hooks、MCP、工具、插件、技能和自动记忆。",
      fields: [
        field("env", "环境变量", "启动 Claude Code 时注入的环境变量。", "json-object", SENSITIVE_SCOPE, "sensitive", { sensitive: true }),
        field("hooks", "Hooks", "按生命周期事件执行的命令 hook 配置。", "json-object", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("disableAllHooks", "禁用全部 Hooks", "禁用所有 hooks 和自定义 status line。", "switch", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("mcpServers", "MCP Servers", "Claude Code 可连接的 MCP server 配置。", "json-object", SENSITIVE_SCOPE, "sensitive", { sensitive: true }),
        field("allowedTools", "允许工具", "默认启用的内置工具列表。", "string-list", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("disallowedTools", "禁用工具", "默认禁用的内置工具列表。", "string-list"),
        field("tools", "工具集合", "指定会话可使用的工具集合。", "string-list", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("enableAllProjectMcpServers", "允许所有项目 MCP", "自动批准项目 .mcp.json 中定义的所有 MCP server。", "switch", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("enabledMcpjsonServers", "启用 .mcp.json Server", "从 .mcp.json 中允许的特定 server 名称。", "string-list"),
        field("disabledMcpjsonServers", "禁用 .mcp.json Server", "从 .mcp.json 中拒绝的特定 server 名称。", "string-list"),
        field("disableClaudeAiConnectors", "禁用 claude.ai 连接器", "阻止 claude.ai MCP connectors 自动拉取和连接。", "switch", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("disableBundledSkills", "禁用内置技能", "禁用 Claude Code 随附的 skills 和 workflows。", "switch", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("disableSkillShellExecution", "禁用技能 Shell 执行", "禁止 skills 和 custom commands 中的内联 shell 执行。", "switch", USER_PROJECT_LOCAL_SCOPE, "danger"),
        field("disableWorkflows", "禁用动态 Workflow", "禁用动态 workflows 与 bundled workflow commands。", "switch", USER_PROJECT_LOCAL_SCOPE, "normal"),
        field("workflowKeywordTriggerEnabled", "Workflow 关键词触发", "控制 prompt 中 ultracode 关键词是否触发动态 workflow。", "switch", USER_SCOPE, "experimental"),
        field("maxSkillDescriptionChars", "技能描述上限", "限制每个 skill 的描述和 when_to_use 文本进入上下文的字符数。", "number", USER_SCOPE),
        field("skillListingBudgetFraction", "技能列表上下文预算", "为 skill listing 预留的模型上下文窗口比例。", "number", USER_SCOPE),
        field("skillOverrides", "技能可见性覆盖", "按 skill 名称控制 on、name-only、user-invocable-only 或 off。", "json-object", USER_SCOPE, "normal"),
        field("fileSuggestion", "文件建议脚本", "配置 @ 文件自动补全的自定义脚本。", "json-object", SENSITIVE_SCOPE, "sensitive"),
        field("autoMemoryEnabled", "自动记忆", "控制 Claude 是否读取和写入自动记忆目录。", "switch", USER_SCOPE, "experimental"),
        field("autoMemoryDirectory", "自动记忆目录", "自定义自动记忆存储目录。", "text", USER_SCOPE, "sensitive"),
        field("claudeMdExcludes", "排除 CLAUDE.md", "加载 memory 时跳过的 CLAUDE.md glob 或绝对路径。", "string-list"),
        field("respectGitignore", "@ 文件遵守 .gitignore", "控制 @ 文件选择器是否排除 .gitignore 匹配文件。", "switch", USER_SCOPE),
        field("skipWebFetchPreflight", "跳过 WebFetch 预检", "跳过 WebFetch 域名安全预检。", "switch", USER_PROJECT_LOCAL_SCOPE, "danger"),
      ],
    },
    {
      id: "plugins-updates",
      title: "插件与更新",
      description: "控制插件启停、市场、更新渠道和版本上下限。",
      fields: [
        field("enabledPlugins", "启用插件", "按插件 ID 控制是否启用已安装插件。", "json-object", USER_SCOPE),
        field("disabledPlugins", "禁用插件", "按插件 ID 控制是否禁用已安装插件。", "json-object", USER_SCOPE),
        field("extraKnownMarketplaces", "额外市场", "Claude Code 额外识别的插件市场配置。", "json-object", USER_SCOPE),
        field("autoUpdates", "自动更新", "控制 Claude Code 是否自动检查并应用更新。", "switch", USER_SCOPE),
        field(
          "autoUpdatesChannel",
          "更新渠道",
          "控制自动更新使用的发布渠道。",
          "select",
          USER_SCOPE,
          "normal",
          {
            options: [
              { value: "stable", label: "stable" },
              { value: "latest", label: "latest" },
            ],
          }
        ),
        field("minimumVersion", "最低自动更新版本", "阻止自动更新和 claude update 安装低于该值的版本。", "text", MANAGED_SCOPE),
        field("requiredMinimumVersion", "强制最低版本", "低于该版本的 Claude Code 启动时退出并提示升级。", "text", MANAGED_SCOPE, "danger"),
        field("requiredMaximumVersion", "强制最高版本", "高于该版本的 Claude Code 启动时退出。", "text", MANAGED_SCOPE, "danger"),
        field("pluginSuggestionMarketplaces", "插件建议市场", "允许出现上下文安装建议的 marketplace 名称。", "string-list", MANAGED_SCOPE),
        field("pluginTrustMessage", "插件信任提示", "安装插件前追加到信任警告中的组织自定义提示。", "text", MANAGED_SCOPE),
        field("strictKnownMarketplaces", "严格市场 allowlist", "限制可添加、安装、更新和刷新插件的 marketplace 来源。", "json-value", MANAGED_SCOPE, "danger"),
        field("blockedMarketplaces", "市场 blocklist", "阻止特定 marketplace 来源被添加、安装、更新或刷新。", "json-value", MANAGED_SCOPE, "danger"),
        field("strictPluginOnlyCustomization", "仅允许插件自定义", "阻止用户和项目来源的 skills、agents、hooks、MCP，只加载插件和托管来源。", "json-value", MANAGED_SCOPE, "danger"),
      ],
    },
    {
      id: "ui-notifications",
      title: "界面与通知",
      description: "控制终端 UI、状态栏、滚动、通知、语音和可访问性。",
      fields: [
        field("verbose", "详细输出", "默认显示完整工具输出而非截断摘要。", "switch"),
        field(
          "theme",
          "主题",
          "Claude Code 界面主题。",
          "select",
          USER_SCOPE,
          "normal",
          {
            options: [
              { value: "auto", label: "auto" },
              { value: "dark", label: "dark" },
              { value: "light", label: "light" },
              { value: "dark-daltonized", label: "dark-daltonized" },
              { value: "light-daltonized", label: "light-daltonized" },
              { value: "dark-ansi", label: "dark-ansi" },
              { value: "light-ansi", label: "light-ansi" },
            ],
          }
        ),
        field(
          "tui",
          "TUI 渲染器",
          "选择 classic/default 或 fullscreen 终端渲染模式。",
          "select",
          USER_SCOPE,
          "experimental",
          {
            options: [
              { value: "default", label: "default" },
              { value: "fullscreen", label: "fullscreen" },
            ],
          }
        ),
        field("statusLine", "状态栏", "自定义 Claude Code 状态栏渲染方式。", "json-object", USER_SCOPE),
        field("footerLinksRegexes", "Footer 链接正则", "根据 turn 输出中的正则匹配渲染额外 footer badge 链接。", "json-value", USER_SCOPE, "normal"),
        field("prUrlTemplate", "PR 链接模板", "用于 footer 和 tool-result 摘要的 PR badge URL 模板。", "text", USER_SCOPE),
        field("autoCompactEnabled", "自动压缩上下文", "上下文接近限制时自动 compact 对话。", "switch", USER_SCOPE),
        field("cleanupPeriodDays", "清理天数", "启动时删除超过该天数的 session 文件。", "number", USER_SCOPE),
        field("feedbackSurveyRate", "反馈问卷概率", "符合条件时展示会话质量问卷的概率，0 表示完全关闭。", "number", USER_SCOPE),
        field("fileCheckpointingEnabled", "文件检查点", "每次编辑前快照文件，便于 /rewind 恢复。", "switch", USER_SCOPE),
        field("autoScrollEnabled", "自动滚动", "fullscreen 渲染中跟随新输出滚动到底部。", "switch", USER_SCOPE),
        field("wheelScrollAccelerationEnabled", "滚轮加速", "快速滚动时加速鼠标滚轮滚动速度。", "switch", USER_SCOPE),
        field("terminalProgressBarEnabled", "终端进度条", "在支持的终端中显示进度条。", "switch", USER_SCOPE),
        field("awaySummaryEnabled", "离开后摘要", "离开终端数分钟后返回时显示一行 session recap。", "switch", USER_SCOPE),
        field("showTurnDuration", "显示回合耗时", "响应后显示本回合耗时。", "switch", USER_SCOPE),
        field("showThinkingSummaries", "显示思考摘要", "在交互会话中显示 extended thinking summaries。", "switch", USER_SCOPE),
        field("syntaxHighlightingDisabled", "禁用语法高亮", "禁用 diff、代码块和文件预览的语法高亮。", "switch", USER_SCOPE),
        field("spinnerTipsEnabled", "Spinner Tips", "Claude 工作时在 spinner 中显示 tips。", "switch", USER_SCOPE),
        field("spinnerTipsOverride", "自定义 Spinner Tips", "替换或追加 spinner tips。", "json-value", USER_SCOPE),
        field("spinnerVerbs", "Spinner 动词", "自定义 turn 进行中显示的动作动词。", "json-object", USER_SCOPE),
        field("preferredNotifChannel", "通知渠道", "任务完成和权限提示通知方式。", "select", USER_SCOPE, "normal", {
          options: [
            { value: "auto", label: "auto" },
            { value: "terminal_bell", label: "terminal_bell" },
            { value: "iterm2", label: "iterm2" },
            { value: "iterm2_with_bell", label: "iterm2_with_bell" },
            { value: "kitty", label: "kitty" },
          ],
        }),
        field("agentPushNotifEnabled", "Agent 推送通知", "Remote Control 连接时允许 Claude 主动发送任务完成等手机推送。", "switch", USER_SCOPE, "experimental"),
        field("inputNeededNotifEnabled", "需要输入通知", "Remote Control 连接时，权限提示或问题等待输入时发送推送。", "switch", USER_SCOPE, "experimental"),
        field("voice.enabled", "语音输入", "启用 voice dictation。", "switch", USER_SCOPE, "experimental"),
        field("voice", "语音设置", "语音 dictation 的完整设置对象。", "json-object", USER_SCOPE, "experimental"),
        field("voiceEnabled", "旧版语音开关", "voice.enabled 的旧别名；优先使用 voice 对象。", "switch", USER_SCOPE, "experimental"),
        field("axScreenReader", "屏幕阅读器模式", "渲染屏幕阅读器友好的扁平文本输出。", "switch", USER_SCOPE),
        field("prefersReducedMotion", "减少动画", "减少或禁用 spinner、shimmer、flash 等 UI 动画。", "switch", USER_SCOPE),
        field("editorMode", "编辑模式", "输入框键位模式。", "select", USER_SCOPE, "normal", {
          options: [
            { value: "normal", label: "normal" },
            { value: "vim", label: "vim" },
          ],
        }),
        field("viewMode", "默认视图模式", "启动时默认 transcript view mode。", "select", USER_SCOPE, "normal", {
          options: [
            { value: "default", label: "default" },
            { value: "verbose", label: "verbose" },
            { value: "focus", label: "focus" },
          ],
        }),
        field("defaultShell", "默认 Shell", "输入框 ! 命令使用的默认 shell。", "select", USER_SCOPE, "normal", {
          options: [
            { value: "bash", label: "bash" },
            { value: "powershell", label: "powershell" },
          ],
        }),
      ],
    },
    {
      id: "auth-managed",
      title: "认证、托管与供应链",
      description: "控制登录约束、云凭据刷新、企业托管策略和供应链限制。",
      fields: [
        field("apiKeyHelper", "API Key Helper", "通过系统 shell 运行的自定义命令，用于生成认证值。", "text", SENSITIVE_SCOPE, "sensitive", { sensitive: true }),
        field("awsAuthRefresh", "AWS Auth Refresh", "刷新 .aws 目录的自定义脚本。", "text", SENSITIVE_SCOPE, "sensitive"),
        field("awsCredentialExport", "AWS Credential Export", "输出 AWS credentials JSON 的自定义脚本。", "text", SENSITIVE_SCOPE, "sensitive"),
        field("gcpAuthRefresh", "GCP Auth Refresh", "GCP Application Default Credentials 过期或不可读时执行的刷新脚本。", "text", SENSITIVE_SCOPE, "sensitive"),
        field("otelHeadersHelper", "OTEL Headers Helper", "生成动态 OpenTelemetry headers 的脚本。", "text", SENSITIVE_SCOPE, "sensitive"),
        field("forceLoginMethod", "强制登录方式", "限制登录到 claude.ai、console 或 cloud gateway。", "select", MANAGED_SCOPE, "danger", {
          options: [
            { value: "claudeai", label: "claudeai" },
            { value: "console", label: "console" },
            { value: "gateway", label: "gateway" },
          ],
        }),
        field("forceLoginGatewayUrl", "强制 Gateway URL", "预填并锁定 /login Cloud gateway 页面中的 gateway URL。", "text", MANAGED_SCOPE, "danger"),
        field("forceLoginOrgUUID", "强制组织 UUID", "要求登录属于指定 Anthropic organization；可填字符串或 JSON 数组。", "json-value", MANAGED_SCOPE, "danger"),
        field("forceLoginOrgUUIDs", "强制组织 UUID 列表", "旧式或兼容字段：允许的组织 UUID 列表。", "string-list", MANAGED_SCOPE, "danger"),
        field("forceRemoteSettingsRefresh", "强制刷新远端设置", "启动时必须先成功获取最新远端托管设置，否则退出。", "switch", MANAGED_SCOPE, "danger"),
        field("policyHelper", "Policy Helper", "由管理员部署、启动时动态计算托管设置的可执行程序。", "text", MANAGED_SCOPE, "danger"),
        field("parentSettingsBehavior", "父级设置合并策略", "控制嵌入宿主进程提供的 managed settings 与本机配置如何合并。", "select", MANAGED_SCOPE, "danger", {
          options: [
            { value: "first-wins", label: "first-wins" },
            { value: "last-wins", label: "last-wins" },
          ],
        }),
        field("allowedMcpServers", "MCP Server allowlist", "托管设置中允许用户配置的 MCP server 列表。", "string-list", MANAGED_SCOPE, "danger"),
        field("deniedMcpServers", "MCP Server denylist", "托管设置中明确阻止的 MCP server 列表。", "string-list", MANAGED_SCOPE, "danger"),
        field("allowManagedMcpServersOnly", "仅允许托管 MCP", "只采纳托管设置中的 allowedMcpServers。", "switch", MANAGED_SCOPE, "danger"),
        field("allowManagedPermissionRulesOnly", "仅允许托管权限规则", "阻止用户和项目设置定义 allow、ask、deny 权限规则。", "switch", MANAGED_SCOPE, "danger"),
        field("allowManagedHooksOnly", "仅允许托管 Hooks", "仅加载托管、SDK 或托管强制启用插件中的 hooks。", "switch", MANAGED_SCOPE, "danger"),
        field("allowAllClaudeAiMcps", "允许 claude.ai MCP", "部署 managed-mcp.json 时仍加载 claude.ai connectors。", "switch", MANAGED_SCOPE, "danger"),
        field("allowedHttpHookUrls", "HTTP Hook URL allowlist", "允许 HTTP hooks 请求的 URL pattern 列表。", "string-list", MANAGED_SCOPE, "danger"),
        field("httpHookAllowedEnvVars", "HTTP Hook 环境变量 allowlist", "允许 HTTP hooks 插值到 headers 的环境变量名。", "string-list", MANAGED_SCOPE, "sensitive"),
        field("allowedChannelPlugins", "Channel Plugin allowlist", "允许推送消息的 channel plugin 列表。", "string-list", MANAGED_SCOPE, "danger"),
        field("channelsEnabled", "启用 Channels", "组织中允许 channels 功能。", "switch", MANAGED_SCOPE, "danger"),
        field("claudeMd", "托管 CLAUDE.md", "作为组织托管 memory 注入的 CLAUDE.md 风格指令。", "text", MANAGED_SCOPE, "danger"),
        field("companyAnnouncements", "公司公告", "启动时向用户展示的公告内容。", "json-value", MANAGED_SCOPE),
        field("disableAgentView", "禁用后台 Agents", "关闭 background agents、agent view 和相关入口。", "switch", MANAGED_SCOPE, "danger"),
        field("disableArtifact", "禁用 Artifact", "禁用 Artifact tool 发布私有网页输出。", "switch", MANAGED_SCOPE, "danger"),
        field("disableAutoMode", "禁用 Auto Mode", "阻止 auto permission mode 被激活。", "select", MANAGED_SCOPE, "danger", {
          options: [{ value: "disable", label: "disable" }],
        }),
        field("disableDeepLinkRegistration", "禁用 Deep Link 注册", "阻止启动时注册 claude-cli:// 协议处理器。", "select", MANAGED_SCOPE, "danger", {
          options: [{ value: "disable", label: "disable" }],
        }),
        field("disableRemoteControl", "禁用 Remote Control", "阻止 remote-control 命令、启动参数和会话内开关。", "switch", MANAGED_SCOPE, "danger"),
        field("fastModePerSessionOptIn", "Fast Mode 每会话选择", "新会话默认关闭 fast mode，要求用户每次手动启用。", "switch", MANAGED_SCOPE),
        field("includeGitInstructions", "包含 Git 指令", "把内置 commit/PR workflow 指令和 git status 快照加入系统提示。", "switch", USER_PROJECT_LOCAL_SCOPE),
        field("includeCoAuthoredBy", "包含 Co-authored-by", "提交信息中是否包含 Claude 的 Co-authored-by 归因。", "switch", USER_SCOPE),
        field("attribution", "Git/PR 归因", "自定义 git commits 和 pull requests 的归因文本与 trailers。", "json-object", USER_SCOPE),
        field("plansDirectory", "计划文件目录", "自定义计划文件存储目录。", "text", USER_SCOPE, "sensitive"),
        field("sshConfigs", "SSH 环境配置", "Desktop 环境下可选择的 SSH 连接配置。", "json-value", USER_SCOPE, "sensitive"),
        field("wslInheritsWindowsSettings", "WSL 继承 Windows 设置", "Windows 托管设置是否也被 WSL 中 Claude Code 读取。", "switch", MANAGED_SCOPE),
      ],
    },
    {
      id: "worktree-ide",
      title: "Worktree 与 IDE",
      description: "控制后台 worktree 隔离、IDE 自动连接和外部编辑器上下文。",
      fields: [
        field("worktree.baseRef", "Worktree 基准分支", "新 worktree 从哪个 ref 创建分支。", "select", USER_SCOPE, "normal", {
          options: [
            { value: "fresh", label: "fresh" },
            { value: "head", label: "head" },
          ],
        }),
        field("worktree.symlinkDirectories", "Worktree 软链目录", "新 worktree 中从主仓库软链过去的目录列表。", "string-list", USER_SCOPE, "danger"),
        field("worktree.sparsePaths", "Worktree Sparse 路径", "通过 git sparse-checkout 写入 worktree 的路径列表。", "string-list", USER_SCOPE),
        field("worktree.bgIsolation", "后台隔离模式", "后台会话对主 checkout 的编辑隔离方式。", "select", USER_SCOPE, "danger", {
          options: [
            { value: "worktree", label: "worktree" },
            { value: "none", label: "none" },
          ],
        }),
        field("autoConnectIde", "自动连接 IDE", "从外部终端启动时自动连接运行中的 IDE。", "switch", USER_SCOPE),
        field("autoInstallIdeExtension", "自动安装 IDE 扩展", "从 VS Code 终端运行时自动安装 Claude Code IDE 扩展。", "switch", USER_SCOPE),
        field("externalEditorContext", "外部编辑器上下文", "用 Ctrl+G 打开外部编辑器时，把 Claude 上次响应作为注释上下文。", "switch", USER_SCOPE),
      ],
    },
  ],
};
