// MCP 能力页：集中管理 Claude 与 Codex 的 MCP 配置入口。
import { CLAUDE_CONFIG_FILES, CODEX_CONFIG_FILES } from "../config";
import { CLAUDE_SETTINGS_SCHEMA } from "../config/claudeSettingsSchema";
import { CODEX_CONFIG_SCHEMA } from "../config/codexConfigSchema";
import CapabilityConfigEditor from "../components/CapabilityConfigEditor";
import { PageHeader } from "../components/ui";

// CLAUDE_MCP_FIELD_PATHS 存储 Claude settings 中与 MCP 能力相关的字段路径。
const CLAUDE_MCP_FIELD_PATHS = [
  "mcpServers",
  "enableAllProjectMcpServers",
  "enabledMcpjsonServers",
  "disabledMcpjsonServers",
  "disableClaudeAiConnectors",
  "allowedMcpServers",
  "deniedMcpServers",
  "allowManagedMcpServersOnly",
  "allowAllClaudeAiMcps",
];

// CODEX_MCP_FIELD_PATHS 存储 Codex config.toml 中与 MCP 能力相关的字段路径。
const CODEX_MCP_FIELD_PATHS = [
  "mcp_servers",
  "mcp_oauth_callback_port",
  "mcp_oauth_callback_url",
  "mcp_oauth_credentials_store",
];

// findConfigSpec 根据配置文件 id 查找对应描述。
// files 参数存储候选配置文件列表，id 参数存储需要查找的配置文件标识。
function findConfigSpec(files: typeof CLAUDE_CONFIG_FILES, id: string) {
  // spec 存储命中的配置文件描述。
  const spec = files.find((file) => file.id === id);

  if (!spec) {
    throw new Error(`未找到配置文件: ${id}`);
  }

  return spec;
}

// McpPage 渲染 MCP 跨工具能力页。
export default function McpPage() {
  // claudeSettingsSpec 存储 Claude settings.json 的配置文件描述。
  const claudeSettingsSpec = findConfigSpec(CLAUDE_CONFIG_FILES, "claude-settings");
  // codexConfigSpec 存储 Codex config.toml 的配置文件描述。
  const codexConfigSpec = findConfigSpec(CODEX_CONFIG_FILES, "codex-config");

  return (
    <div className="p-6">
      <PageHeader
        title="MCP"
        subtitle="集中管理 Claude 与 Codex 的 MCP server、项目 MCP 和 OAuth 配置"
      />
      <div className="space-y-4">
        <CapabilityConfigEditor
          description="Claude settings.json 中的 MCP servers、项目 MCP 开关和托管 MCP allowlist。"
          fieldPaths={CLAUDE_MCP_FIELD_PATHS}
          schema={CLAUDE_SETTINGS_SCHEMA}
          spec={claudeSettingsSpec}
          title="Claude MCP"
        />
        <CapabilityConfigEditor
          description="Codex config.toml 中的 MCP servers 与 MCP OAuth 本地回调配置。"
          fieldPaths={CODEX_MCP_FIELD_PATHS}
          schema={CODEX_CONFIG_SCHEMA}
          spec={codexConfigSpec}
          title="Codex MCP"
        />
      </div>
    </div>
  );
}
