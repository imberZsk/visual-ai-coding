import { describe, expect, it } from "vitest";
import { CLAUDE_SETTINGS_SCHEMA } from "./claudeSettingsSchema";
import { CODEX_CONFIG_SCHEMA } from "./codexConfigSchema";

// 该测试套件回调用于验证可视化配置 schema 是否覆盖任务要求的核心字段与敏感元数据。
describe("visual config schemas", () => {
  // 该回调用于验证 Claude settings schema 至少覆盖需求中列出的核心字段。
  it("covers required Claude settings groups and fields", () => {
    // claudePaths 存储 Claude schema 已声明的全部字段路径。
    const claudePaths = CLAUDE_SETTINGS_SCHEMA.groups.flatMap(
      // group 参数存储当前遍历到的 Claude schema 分组定义。
      (group) => group.fields.map(
        // field 参数存储当前分组中的单个字段定义。
        (field) => field.path
      )
    );

    expect(CLAUDE_SETTINGS_SCHEMA.format).toBe("json");
    expect(claudePaths).toEqual(
      expect.arrayContaining([
        "advisorModel",
        "agent",
        "alwaysThinkingEnabled",
        "apiKeyHelper",
        "attribution",
        "autoCompactEnabled",
        "autoMemoryEnabled",
        "autoScrollEnabled",
        "model",
        "fallbackModel",
        "effortLevel",
        "availableModels",
        "cleanupPeriodDays",
        "defaultShell",
        "disableAllHooks",
        "disableArtifact",
        "disableAutoMode",
        "disableBundledSkills",
        "disableClaudeAiConnectors",
        "disableRemoteControl",
        "editorMode",
        "feedbackSurveyRate",
        "fileCheckpointingEnabled",
        "footerLinksRegexes",
        "forceLoginGatewayUrl",
        "forceLoginMethod",
        "gcpAuthRefresh",
        "includeGitInstructions",
        "language",
        "maxSkillDescriptionChars",
        "minimumVersion",
        "modelOverrides",
        "permissions.defaultMode",
        "permissions.allow",
        "permissions.deny",
        "permissions.ask",
        "permissions.additionalDirectories",
        "permissions.disableBypassPermissionsMode",
        "permissions.skipDangerousModePermissionPrompt",
        "sandbox.enabled",
        "sandbox.failIfUnavailable",
        "sandbox.autoAllowBashIfSandboxed",
        "sandbox.excludedCommands",
        "sandbox.filesystem.allowWrite",
        "sandbox.network.allowedDomains",
        "sandbox.credentials.envVars",
        "env",
        "hooks",
        "mcpServers",
        "enabledPlugins",
        "disabledPlugins",
        "extraKnownMarketplaces",
        "autoUpdates",
        "autoUpdatesChannel",
        "statusLine",
        "theme",
        "tui",
        "verbose",
        "voice.enabled",
        "worktree.baseRef",
        "worktree.symlinkDirectories",
      ])
    );
  });

  // 该回调用于验证 Codex config schema 至少覆盖需求中列出的核心字段。
  it("covers required Codex config groups and fields", () => {
    // codexPaths 存储 Codex schema 已声明的全部字段路径。
    const codexPaths = CODEX_CONFIG_SCHEMA.groups.flatMap(
      // group 参数存储当前遍历到的 Codex schema 分组定义。
      (group) => group.fields.map(
        // field 参数存储当前分组中的单个字段定义。
        (field) => field.path
      )
    );

    expect(CODEX_CONFIG_SCHEMA.format).toBe("toml");
    expect(codexPaths).toEqual(
      expect.arrayContaining([
        "agents",
        "allow_login_shell",
        "analytics",
        "approval_policy.granular.request_permissions",
        "approvals_reviewer",
        "apps",
        "auto_review",
        "background_terminal_max_timeout",
        "chatgpt_base_url",
        "check_for_update_on_startup",
        "cli_auth_credentials_store",
        "commit_attribution",
        "compact_prompt",
        "default_permissions",
        "developer_instructions",
        "disable_paste_burst",
        "experimental_compact_prompt_file",
        "experimental_use_unified_exec_tool",
        "feedback",
        "file_opener",
        "forced_chatgpt_workspace_id",
        "forced_login_method",
        "hide_agent_reasoning",
        "history",
        "hooks",
        "instructions",
        "log_dir",
        "mcp_oauth_callback_port",
        "mcp_oauth_callback_url",
        "mcp_oauth_credentials_store",
        "memories",
        "model_provider",
        "model",
        "review_model",
        "model_auto_compact_token_limit",
        "model_catalog_json",
        "model_context_window",
        "model_instructions_file",
        "model_reasoning_effort",
        "model_reasoning_summary",
        "model_supports_reasoning_summaries",
        "model_verbosity",
        "notice",
        "openai_base_url",
        "oss_provider",
        "otel",
        "permissions",
        "personality",
        "plan_mode_reasoning_effort",
        "project_doc_fallback_filenames",
        "project_doc_max_bytes",
        "project_root_markers",
        "disable_response_storage",
        "sandbox_mode",
        "approval_policy",
        "sandbox_workspace_write",
        "network_access",
        "notify",
        "features",
        "desktop",
        "tui",
        "mcp_servers",
        "plugins",
        "marketplaces",
        "projects",
        "service_tier",
        "shell_environment_policy",
        "show_raw_agent_reasoning",
        "skills",
        "sqlite_home",
        "suppress_unstable_features_warning",
        "tool_output_token_limit",
        "tool_suggest",
        "tools.view_image",
        "tools.web_search",
        "web_search",
        "windows",
        "windows_wsl_setup_acknowledged",
      ])
    );
  });

  // 该回调用于验证敏感对象字段会被 schema 显式标记，便于后续 UI 做默认脱敏。
  it("marks sensitive object fields", () => {
    // claudeFields 存储 Claude schema 中展平后的全部字段定义。
    const claudeFields = CLAUDE_SETTINGS_SCHEMA.groups.flatMap(
      // group 参数存储当前遍历到的 Claude schema 分组定义。
      (group) => group.fields
    );
    // envField 存储路径为 env 的字段定义，用于校验敏感标记。
    const envField = claudeFields.find(
      // field 参数存储当前遍历到的单个字段定义。
      (field) => field.path === "env"
    );

    expect(envField?.sensitive).toBe(true);
  });
});
