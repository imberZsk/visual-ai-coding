import type {
  VisualConfigControl,
  VisualConfigField,
  VisualConfigRisk,
  VisualConfigSchema,
} from "../components/visual-config/schemaTypes";
import { CODEX_MODEL_OPTIONS } from "./modelOptions";

// USER_PROJECT_SCOPE 存储 Codex 用户级与项目级配置的通用说明。
const USER_PROJECT_SCOPE = "用户级、项目级配置；项目级配置只应放入适合随仓库共享的约束。";
// USER_ONLY_SCOPE 存储 Codex 用户级本机配置的说明。
const USER_ONLY_SCOPE = "用户级配置；通常包含个人偏好、认证、本机路径或桌面行为。";
// LOCAL_MACHINE_SCOPE 存储只适合本机保存的敏感配置说明。
const LOCAL_MACHINE_SCOPE = "用户级本机配置；可能包含路径、凭据、环境或机器相关行为。";

// field 用于创建 Codex config.toml 的可视化字段定义。
// path 参数存储 config.toml 中的点分路径；title 参数存储界面标题；description 参数存储字段用途说明；control 参数存储控件类型；scope 参数存储生效范围；risk 参数存储风险等级；extra 参数存储枚举、默认值和敏感标记等补充元数据。
function field(
  path: string,
  title: string,
  description: string,
  control: VisualConfigControl,
  scope: string = USER_PROJECT_SCOPE,
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

// CODEX_CONFIG_SCHEMA 存储 Codex config.toml 的可视化字段元数据。
export const CODEX_CONFIG_SCHEMA: VisualConfigSchema = {
  id: "codex-config",
  title: "Codex config.toml",
  format: "toml",
  groups: [
    {
      id: "model-provider",
      title: "模型与 Provider",
      description: "控制默认模型、模型能力、provider 连接与 OpenAI/OSS 后端。",
      fields: [
        field("model_provider", "模型 Provider", "选择默认模型提供方。", "text", USER_ONLY_SCOPE),
        field("model", "默认模型", "Codex agent 默认使用的模型。", "select", USER_PROJECT_SCOPE, "normal", {
          options: CODEX_MODEL_OPTIONS,
        }),
        field("review_model", "评审模型", "Codex review 命令默认使用的模型。", "select", USER_PROJECT_SCOPE, "normal", {
          options: CODEX_MODEL_OPTIONS,
        }),
        field("approvals_reviewer", "审批评审模型", "用于审批/评审相关流程的模型或 reviewer 配置。", "text", USER_ONLY_SCOPE, "experimental"),
        field("model_providers", "Provider 详情", "Provider URL、wire API、认证方式和 websocket 能力。", "toml-object", LOCAL_MACHINE_SCOPE, "sensitive", { sensitive: true, defaultValue: {} }),
        field("openai_base_url", "OpenAI Base URL", "覆盖 OpenAI API base URL。", "text", LOCAL_MACHINE_SCOPE, "sensitive"),
        field("chatgpt_base_url", "ChatGPT Base URL", "覆盖 ChatGPT/Codex 相关服务 base URL。", "text", LOCAL_MACHINE_SCOPE, "sensitive"),
        field("oss_provider", "OSS Provider", "配置 open-source provider，如 lmstudio 或 ollama。", "text", USER_ONLY_SCOPE),
        field("model_catalog_json", "模型目录 JSON", "自定义模型目录 JSON 或路径，用于覆盖内置模型能力表。", "toml-object", USER_ONLY_SCOPE, "experimental"),
        field("model_context_window", "模型上下文窗口", "手动声明当前模型的上下文窗口大小。", "number", USER_ONLY_SCOPE, "experimental"),
        field("model_auto_compact_token_limit", "自动压缩 Token 阈值", "达到该 token 限制附近时触发自动 compact。", "number", USER_ONLY_SCOPE),
        field("model_reasoning_effort", "推理强度", "控制模型推理投入程度。", "select", USER_PROJECT_SCOPE, "normal", {
          options: [
            { value: "minimal", label: "minimal" },
            { value: "low", label: "low" },
            { value: "medium", label: "medium" },
            { value: "high", label: "high" },
            { value: "xhigh", label: "xhigh" },
            { value: "max", label: "max" },
          ],
        }),
        field("plan_mode_reasoning_effort", "Plan 模式推理强度", "单独控制 plan 模式使用的推理强度。", "select", USER_PROJECT_SCOPE, "normal", {
          options: [
            { value: "minimal", label: "minimal" },
            { value: "low", label: "low" },
            { value: "medium", label: "medium" },
            { value: "high", label: "high" },
            { value: "xhigh", label: "xhigh" },
            { value: "max", label: "max" },
          ],
        }),
        field("model_reasoning_summary", "推理摘要", "控制是否请求或显示模型 reasoning summary。", "text", USER_PROJECT_SCOPE, "experimental"),
        field("model_supports_reasoning_summaries", "模型支持 Reasoning Summary", "手动声明模型是否支持 reasoning summaries。", "switch", USER_ONLY_SCOPE, "experimental"),
        field("model_verbosity", "模型详细程度", "控制模型回答详细程度。", "select", USER_PROJECT_SCOPE, "normal", {
          options: [
            { value: "low", label: "low" },
            { value: "medium", label: "medium" },
            { value: "high", label: "high" },
          ],
        }),
        field("service_tier", "服务层级", "设置 OpenAI 请求使用的 service tier。", "text", USER_ONLY_SCOPE),
      ],
    },
    {
      id: "runtime-policy",
      title: "运行策略",
      description: "控制沙箱、审批、权限、网络、命令环境和响应存储。",
      fields: [
        field("disable_response_storage", "禁用响应存储", "控制是否禁止服务端保存响应内容。", "switch", USER_ONLY_SCOPE),
        field("sandbox_mode", "沙箱模式", "控制 agent 执行命令时的文件系统访问范围。", "select", USER_PROJECT_SCOPE, "danger", {
          options: [
            { value: "read-only", label: "read-only" },
            { value: "workspace-write", label: "workspace-write" },
            { value: "danger-full-access", label: "danger-full-access" },
          ],
        }),
        field("sandbox_permissions", "沙箱权限", "对沙箱能力进行额外声明。", "string-list", USER_PROJECT_SCOPE, "danger"),
        field("sandbox_workspace_write", "Workspace-write 细节", "workspace-write 沙箱的可写根、网络等附加设置。", "toml-object", USER_PROJECT_SCOPE, "danger"),
        field("approval_policy", "审批策略", "控制命令执行前是否需要用户审批。", "select", USER_PROJECT_SCOPE, "danger", {
          options: [
            { value: "untrusted", label: "untrusted" },
            { value: "on-failure", label: "on-failure" },
            { value: "on-request", label: "on-request" },
            { value: "never", label: "never" },
          ],
        }),
        field("approval_policy.granular.request_permissions", "细粒度权限请求", "控制细粒度审批模式下哪些权限需要请求。", "toml-object", USER_PROJECT_SCOPE, "danger"),
        field("default_permissions", "默认权限集合", "声明默认允许、询问或拒绝的权限规则集合。", "toml-object", USER_PROJECT_SCOPE, "danger"),
        field("permissions", "权限规则", "Codex 权限系统的完整规则配置。", "toml-object", USER_PROJECT_SCOPE, "danger"),
        field("network_access", "网络访问", "控制 Codex 是否启用网络访问。", "select", USER_PROJECT_SCOPE, "danger", {
          options: [
            { value: "enabled", label: "enabled" },
            { value: "disabled", label: "disabled" },
          ],
        }),
        field("web_search", "Web Search", "控制是否启用内置 web search 能力。", "switch", USER_PROJECT_SCOPE, "danger"),
        field("tools.web_search", "工具：Web Search", "按 tools 命名空间控制 web search 工具能力。", "switch", USER_PROJECT_SCOPE, "danger"),
        field("tools.view_image", "工具：查看图片", "控制模型是否可使用图片查看工具。", "switch", USER_PROJECT_SCOPE),
        field("notify", "通知命令", "回合结束时执行的通知命令。", "string-list", LOCAL_MACHINE_SCOPE, "sensitive"),
        field("shell_environment_policy", "Shell 环境策略", "控制命令执行时继承、过滤或注入哪些环境变量。", "toml-object", LOCAL_MACHINE_SCOPE, "sensitive", { sensitive: true, defaultValue: {} }),
        field("allow_login_shell", "允许登录 Shell", "允许 Codex 用登录 shell 语义解析环境。", "switch", USER_ONLY_SCOPE, "sensitive", { defaultValue: true }),
        field("background_terminal_max_timeout", "后台终端超时", "后台终端命令允许的最大超时时间。", "number", USER_ONLY_SCOPE),
        field("disable_paste_burst", "禁用粘贴突发处理", "禁用终端粘贴突发保护或相关交互行为。", "switch", USER_ONLY_SCOPE),
        field("windows_wsl_setup_acknowledged", "WSL 设置确认", "记录 Windows/WSL 设置提示是否已确认。", "switch", USER_ONLY_SCOPE),
        field("windows", "Windows 设置", "Windows 专属配置集合。", "toml-object", USER_ONLY_SCOPE),
      ],
    },
    {
      id: "instructions-memory",
      title: "指令、记忆与项目文档",
      description: "控制系统指令、项目文档发现、记忆、压缩提示和个性化。",
      fields: [
        field("instructions", "全局指令", "注入 Codex 会话的全局指令文本。", "text", USER_PROJECT_SCOPE, "danger"),
        field("developer_instructions", "开发者指令", "额外的开发者层级指令文本。", "text", USER_PROJECT_SCOPE, "danger"),
        field("model_instructions_file", "模型指令文件", "从本机文件读取模型指令的路径。", "text", LOCAL_MACHINE_SCOPE, "sensitive"),
        field("compact_prompt", "压缩提示词", "自定义会话 compact 时使用的提示词。", "text", USER_PROJECT_SCOPE, "experimental"),
        field("experimental_compact_prompt_file", "实验压缩提示文件", "从文件读取实验 compact prompt。", "text", LOCAL_MACHINE_SCOPE, "experimental"),
        field("personality", "个性化风格", "设置 Codex 默认沟通风格或人格配置。", "text", USER_ONLY_SCOPE),
        field("notice", "启动提示", "在会话启动时展示的提示或公告。", "text", USER_ONLY_SCOPE),
        field("memories", "记忆设置", "Codex memory 的完整配置。", "toml-object", USER_ONLY_SCOPE, "experimental"),
        field("project_doc_fallback_filenames", "项目文档兜底文件名", "AGENTS.md 等项目说明文件不存在时尝试读取的兜底文件名。", "string-list", USER_PROJECT_SCOPE, "normal", { defaultValue: [] }),
        field("project_doc_max_bytes", "项目文档最大字节数", "读取项目说明文件时允许的最大字节数。", "number", USER_PROJECT_SCOPE, "normal", { defaultValue: 32768 }),
        field("project_root_markers", "项目根标记", "用于识别项目根目录的文件或目录名称。", "string-list", USER_PROJECT_SCOPE),
        field("history", "历史记录", "会话历史记录保存、加载和裁剪行为。", "toml-object", USER_ONLY_SCOPE, "normal", {
          defaultValue: { max_bytes: null, persistence: "save-all" },
        }),
        field("feedback", "反馈设置", "反馈入口、采样或上报相关设置。", "toml-object", USER_ONLY_SCOPE),
        field("analytics", "分析设置", "遥测、分析事件或匿名统计配置。", "toml-object", USER_ONLY_SCOPE, "sensitive"),
        field("otel", "OpenTelemetry", "OpenTelemetry traces、headers 和导出配置。", "toml-object", LOCAL_MACHINE_SCOPE, "sensitive", { sensitive: true }),
      ],
    },
    {
      id: "ui-desktop",
      title: "界面、桌面与文件打开",
      description: "控制 TUI、桌面应用、文件打开器、隐藏 reasoning 和更新检查。",
      fields: [
        field("tui", "TUI 设置", "Codex CLI 终端界面设置。", "toml-object", USER_ONLY_SCOPE),
        field("desktop", "Desktop 设置", "Codex 桌面应用相关设置。", "toml-object", USER_ONLY_SCOPE, "experimental"),
        field("apps", "App 设置", "Codex App 或应用集成相关设置。", "toml-object", USER_ONLY_SCOPE, "experimental"),
        field("file_opener", "文件打开器", "点击文件引用时使用的打开器或编辑器配置。", "text", LOCAL_MACHINE_SCOPE),
        field("hide_agent_reasoning", "隐藏 Agent Reasoning", "在界面中隐藏 agent reasoning 内容。", "switch", USER_ONLY_SCOPE, "normal", { defaultValue: false }),
        field("show_raw_agent_reasoning", "显示原始 Reasoning", "显示模型原始 reasoning 文本。", "switch", USER_ONLY_SCOPE, "sensitive"),
        field("suppress_unstable_features_warning", "隐藏不稳定功能警告", "不再展示 unstable/experimental 功能提醒。", "switch", USER_ONLY_SCOPE, "experimental"),
        field("check_for_update_on_startup", "启动检查更新", "启动时检查 Codex CLI/App 是否有新版本。", "switch", USER_ONLY_SCOPE),
        field("commit_attribution", "Commit 归因", "控制 Codex 生成 commit 时的归因文本或 trailer。", "toml-object", USER_PROJECT_SCOPE),
        field("tool_output_token_limit", "工具输出 Token 上限", "限制单次工具输出进入上下文的 token 数。", "number", USER_PROJECT_SCOPE),
        field("tool_suggest", "工具建议", "控制工具建议或提示相关行为。", "toml-object", USER_ONLY_SCOPE, "experimental"),
        field("auto_review", "自动 Review", "控制自动代码评审或后台 review 行为。", "toml-object", USER_PROJECT_SCOPE, "experimental"),
      ],
    },
    {
      id: "extensions",
      title: "扩展、MCP、Hooks 与插件",
      description: "控制功能开关、MCP server、hooks、skills、agents、插件和 marketplace。",
      fields: [
        field("features", "功能开关", "Codex 实验或渐进发布功能开关。", "toml-object", USER_ONLY_SCOPE, "experimental"),
        field("mcp_servers", "MCP Servers", "Codex 可连接的 MCP server 配置。", "toml-object", LOCAL_MACHINE_SCOPE, "sensitive", { sensitive: true, defaultValue: {} }),
        field("mcp_oauth_callback_port", "MCP OAuth 回调端口", "MCP OAuth 本地回调用端口。", "number", LOCAL_MACHINE_SCOPE, "sensitive"),
        field("mcp_oauth_callback_url", "MCP OAuth 回调 URL", "MCP OAuth 使用的显式回调 URL。", "text", LOCAL_MACHINE_SCOPE, "sensitive"),
        field("mcp_oauth_credentials_store", "MCP OAuth 凭据存储", "MCP OAuth 凭据保存位置或后端。", "text", LOCAL_MACHINE_SCOPE, "sensitive", { sensitive: true }),
        field("hooks", "Hooks", "Codex 生命周期 hooks 和信任状态配置。", "toml-object", LOCAL_MACHINE_SCOPE, "danger"),
        field("skills", "Skills", "Codex skills 的启用、禁用或来源配置。", "toml-object", USER_ONLY_SCOPE),
        field("agents", "Agents", "Codex agents 的启用、禁用或来源配置。", "toml-object", USER_ONLY_SCOPE),
        field("plugins", "插件", "Codex 已安装插件启用状态。", "toml-object", USER_ONLY_SCOPE, "normal", { defaultValue: {} }),
        field("marketplaces", "插件市场", "Codex 插件市场来源和更新时间。", "toml-object", USER_ONLY_SCOPE, "normal", { defaultValue: {} }),
        field("projects", "项目信任", "项目路径到 trust_level 的映射。", "toml-object", USER_ONLY_SCOPE, "danger"),
        field("sqlite_home", "SQLite Home", "Codex SQLite 状态或索引数据所在目录。", "text", LOCAL_MACHINE_SCOPE, "sensitive"),
        field("experimental_use_unified_exec_tool", "统一 Exec Tool", "启用实验性的统一 exec tool 行为。", "switch", USER_ONLY_SCOPE, "experimental"),
      ],
    },
    {
      id: "auth-storage",
      title: "认证与存储",
      description: "控制认证方式、凭据存储、工作区绑定和登录策略。",
      fields: [
        field("cli_auth_credentials_store", "CLI 凭据存储", "Codex CLI 认证凭据保存位置或后端。", "text", LOCAL_MACHINE_SCOPE, "sensitive", { sensitive: true }),
        field("forced_login_method", "强制登录方式", "限制 Codex 使用特定登录方式。", "text", USER_ONLY_SCOPE, "danger"),
        field("forced_chatgpt_workspace_id", "强制 ChatGPT Workspace", "限制登录或请求使用指定 ChatGPT workspace。", "text", USER_ONLY_SCOPE, "danger"),
        field("log_dir", "日志目录", "Codex 运行日志保存目录。", "text", LOCAL_MACHINE_SCOPE, "sensitive"),
      ],
    },
  ],
};
