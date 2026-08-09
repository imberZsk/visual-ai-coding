// Agents 能力页：集中管理 Claude 与 Codex 的 Agent 指令和配置入口。
import { CLAUDE_CONFIG_FILES, CODEX_CONFIG_FILES } from '../config'
import { CLAUDE_SETTINGS_SCHEMA } from '../config/claudeSettingsSchema'
import { CODEX_CONFIG_SCHEMA } from '../config/codexConfigSchema'
import CapabilityConfigEditor from '../components/CapabilityConfigEditor'
import ConfigEditor from '../components/ConfigEditor'
import { PageHeader, PageShell } from '../components/ui'

// AgentsPageProps 描述 Agents 页面当前所属的一级工具。
interface AgentsPageProps {
  tool?: 'claude' | 'codex' // tool 存储需要展示 Agent 配置的工具作用域，省略时保留汇总视图兼容性。
}

// CLAUDE_AGENT_FIELD_PATHS 存储 Claude settings 中与 Agents 能力相关的字段路径。
const CLAUDE_AGENT_FIELD_PATHS = [
  'agent',
  'teammateDefaultModel',
  'availableModels',
  'enforceAvailableModels',
]

// CODEX_AGENT_FIELD_PATHS 存储 Codex config.toml 中与 Agents 能力相关的字段路径。
const CODEX_AGENT_FIELD_PATHS = [
  'agents',
  'model',
  'model_provider',
  'hide_agent_reasoning',
  'show_raw_agent_reasoning',
]

// findConfigSpec 根据配置文件 id 查找对应描述。
// files 参数存储候选配置文件列表，id 参数存储需要查找的配置文件标识。
function findConfigSpec(files: typeof CLAUDE_CONFIG_FILES, id: string) {
  // spec 存储命中的配置文件描述。
  const spec = files.find((file) => file.id === id)

  if (!spec) {
    throw new Error(`未找到配置文件: ${id}`)
  }

  return spec
}

// AgentsPage 渲染 Agents 跨工具能力页。
export default function AgentsPage({ tool }: AgentsPageProps) {
  // claudeSettingsSpec 存储 Claude settings.json 的配置文件描述。
  const claudeSettingsSpec = findConfigSpec(
    CLAUDE_CONFIG_FILES,
    'claude-settings'
  )
  // claudeMdSpec 存储 Claude 全局指令文件的配置文件描述。
  const claudeMdSpec = findConfigSpec(CLAUDE_CONFIG_FILES, 'claude-md')
  // codexConfigSpec 存储 Codex config.toml 的配置文件描述。
  const codexConfigSpec = findConfigSpec(CODEX_CONFIG_FILES, 'codex-config')
  // codexAgentsSpec 存储 Codex AGENTS.md 的配置文件描述。
  const codexAgentsSpec = findConfigSpec(CODEX_CONFIG_FILES, 'codex-agents')

  return (
    <PageShell>
      <PageHeader
        title={
          tool
            ? `${tool === 'codex' ? 'Codex' : 'Claude Code'} · Agents`
            : 'Agents'
        }
        subtitle={
          tool
            ? `管理 ${tool === 'codex' ? 'Codex' : 'Claude Code'} 的全局指令与 Agent 行为配置`
            : '集中管理 Claude 与 Codex 的全局 Agent 配置'
        }
      />
      <div className="page-module-stack">
        {tool !== 'codex' && <ConfigEditor spec={claudeMdSpec} />}
        {tool !== 'codex' && (
          <CapabilityConfigEditor
            description="Claude settings.json 中的默认 agent、teammate 模型和模型 allowlist。"
            fieldPaths={CLAUDE_AGENT_FIELD_PATHS}
            schema={CLAUDE_SETTINGS_SCHEMA}
            spec={claudeSettingsSpec}
            title="Claude Agents"
          />
        )}
        {tool !== 'claude' && <ConfigEditor spec={codexAgentsSpec} />}
        {tool !== 'claude' && (
          <CapabilityConfigEditor
            description="Codex config.toml 中的 agents 配置、默认模型和 reasoning 展示策略。"
            fieldPaths={CODEX_AGENT_FIELD_PATHS}
            schema={CODEX_CONFIG_SCHEMA}
            spec={codexConfigSpec}
            title="Codex Agents"
          />
        )}
      </div>
    </PageShell>
  )
}
