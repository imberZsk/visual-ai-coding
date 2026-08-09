// 统一配置页：只写一次 MCP / Skills，一键同步到 Claude Code 与 Codex。
import {
  Alert,
  Button as AntButton,
  Empty,
  Form,
  Input,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
  type TableColumnsType,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import {
  getUnifiedMcp,
  listUnifiedSkills,
  saveUnifiedMcp,
  syncUnified,
} from '../api'
import { PageHeader, PageShell, SectionTitle } from '../components/ui'
import { useAppStore } from '../store'
import type {
  UnifiedMcpServer,
  UnifiedSkillsResult,
  UnifiedSyncResult,
} from '../types'
import './UnifiedPage.css'

// EMPTY_SERVER 生成一条空白 MCP server，用于新增行的初始值。
function emptyServer(): UnifiedMcpServer {
  return { name: '', command: '', args: [], env: {} }
}

// serversEqual 粗略比较两个 server 列表是否一致，用于判断是否有未保存改动。
// left 与 right 分别存储比较的两个 server 列表。
function serversEqual(
  left: UnifiedMcpServer[],
  right: UnifiedMcpServer[]
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

// parseArgsInput 将多行/空格分隔文本解析为参数数组。
// text 参数存储用户在参数输入框中填写的原始文本。
function parseArgsInput(text: string): string[] {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

// parseEnvInput 将 KEY=VALUE 多行文本解析为环境变量键值表。
// text 参数存储用户在环境变量输入框中填写的原始文本。
function parseEnvInput(text: string): Record<string, string> {
  // env 存储解析后的环境变量键值表。
  const env: Record<string, string> = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    // trimmed 存储去空白后的单行文本。
    const trimmed = line.trim()
    if (!trimmed) continue
    // eqIndex 存储等号位置，用于拆分键与值。
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) continue
    env[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim()
  }
  return env
}

// stringifyEnv 将环境变量键值表还原为 KEY=VALUE 多行文本，供编辑展示。
// env 参数存储环境变量键值表。
function stringifyEnv(env: Record<string, string>): string {
  return Object.entries(env || {})
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

// SyncResultAlert 渲染一次同步结果的逐项反馈与警告。
// result 参数存储后端返回的同步结果。
function SyncResultAlert({ result }: { result: UnifiedSyncResult }) {
  // toolLabel 将工具标识映射为展示名。
  const toolLabel = (tool: string) =>
    tool === 'claude' ? 'Claude Code' : 'Codex'
  // capabilityLabel 将能力标识映射为展示名。
  const capabilityLabel = (capability: string) =>
    capability === 'mcp' ? 'MCP' : 'Skills'

  return (
    <Alert
      className="mb-4"
      type={result.warnings.length > 0 ? 'warning' : 'success'}
      showIcon
      message={`同步完成：${new Date(result.syncedAt).toLocaleString()}`}
      description={
        <div className="space-y-2">
          <ul className="m-0 list-disc pl-5 text-sm">
            {result.results.map((item) => (
              <li key={`${item.capability}-${item.tool}`}>
                {toolLabel(item.tool)} · {capabilityLabel(item.capability)}
                ：写入 {item.count}
                {typeof item.total === 'number' ? ` / ${item.total}` : ''} 项 →{' '}
                <span className="break-all font-mono text-xs">{item.path}</span>
              </li>
            ))}
          </ul>
          {result.warnings.length > 0 && (
            <div className="text-sm">
              <div className="font-medium">提示：</div>
              <ul className="m-0 list-disc pl-5">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      }
    />
  )
}

// McpEditor 渲染统一 MCP server 的表单编辑区。
// servers 存储当前 server 列表，onAdd/onRemove/onUpdate 为编辑回调。
function McpEditor({
  servers,
  onAdd,
  onRemove,
  onUpdate,
}: {
  servers: UnifiedMcpServer[]
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, patch: Partial<UnifiedMcpServer>) => void
}) {
  return (
    <section className="unified-section">
      <div className="unified-section__header">
        <SectionTitle>MCP Servers</SectionTitle>
        <AntButton icon={<PlusOutlined />} onClick={onAdd} size="small">
          新增 Server
        </AntButton>
      </div>
      <Typography.Paragraph className="text-text-muted">
        中立格式描述一次，同步时分别写入 Claude 的 ~/.claude.json 与 Codex 的
        config.toml； 本工具写入的 server 带托管标记，不会覆盖你手动添加的
        server。
      </Typography.Paragraph>

      {servers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-8">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="还没有 MCP server，点击右上角新增"
          />
        </div>
      ) : (
        <div className="unified-server-list">
          {servers.map((server, index) => (
            <div key={index} className="unified-server-item">
              <div className="unified-server-item__header">
                <span className="text-sm font-medium text-text-main">
                  Server #{index + 1}
                </span>
                <AntButton
                  aria-label="删除"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => onRemove(index)}
                  size="small"
                  type="text"
                />
              </div>
              <Form
                className="unified-server-form"
                layout="vertical"
                size="small"
              >
                <Form.Item label="名称" required>
                  <Input
                    value={server.name}
                    onChange={(event) =>
                      onUpdate(index, { name: event.target.value })
                    }
                    placeholder="唯一 server 名，如 context7"
                  />
                </Form.Item>
                <Form.Item label="启动命令">
                  <Input
                    value={server.command}
                    onChange={(event) =>
                      onUpdate(index, { command: event.target.value })
                    }
                    placeholder="如 npx 或绝对路径可执行文件"
                  />
                </Form.Item>
                <Form.Item label="参数（每行一个）">
                  <Input.TextArea
                    value={server.args.join('\n')}
                    onChange={(event) =>
                      onUpdate(index, {
                        args: parseArgsInput(event.target.value),
                      })
                    }
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    placeholder={'-y\n@upstash/context7-mcp'}
                  />
                </Form.Item>
                <Form.Item label="环境变量（每行 KEY=VALUE）">
                  <Input.TextArea
                    value={stringifyEnv(server.env)}
                    onChange={(event) =>
                      onUpdate(index, {
                        env: parseEnvInput(event.target.value),
                      })
                    }
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    placeholder={'API_KEY=xxx'}
                  />
                </Form.Item>
              </Form>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// UnifiedSkillsSection 渲染统一 Skills 源目录下的技能列表与说明。
// skills 存储统一 Skills 源扫描结果。
function UnifiedSkillsSection({ skills }: { skills: UnifiedSkillsResult }) {
  // columns 存储技能列表的表格列配置。
  const columns: TableColumnsType<{ name: string }> = [
    {
      title: '技能',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Space>
          <Tag color="success">skill</Tag>
          <Typography.Text>{name}</Typography.Text>
        </Space>
      ),
    },
  ]

  return (
    <section className="unified-section">
      <SectionTitle>Skills</SectionTitle>
      <Typography.Paragraph className="text-text-muted">
        把技能目录放进{' '}
        <span className="break-all font-mono text-xs">
          {skills.dir || '~/.visualAiCoding/unified/skills'}
        </span>
        ，同步时会软链到 Claude 与 Codex 的 skills 目录，改一处两端生效。
      </Typography.Paragraph>
      {skills.skills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-8">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="统一 Skills 源目录还没有技能"
          />
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={skills.skills.map((name) => ({ name }))}
          rowKey="name"
          size="small"
          pagination={false}
        />
      )}
    </section>
  )
}

// UnifiedPage 展示统一 MCP 编辑、统一 Skills 列表与一键同步入口。
export default function UnifiedPage() {
  // claudeHome 存储 Claude 配置根目录，同步时传给后端。
  const claudeHome = useAppStore((state) => state.prefs?.claude_home || '')
  // codexHome 存储 Codex 配置根目录，同步时传给后端。
  const codexHome = useAppStore((state) => state.prefs?.codex_home || '')
  // servers 存储当前编辑中的统一 MCP server 列表。
  const [servers, setServers] = useState<UnifiedMcpServer[]>([])
  // savedServers 存储最近一次落盘的 server 列表，用于判断未保存改动。
  const [savedServers, setSavedServers] = useState<UnifiedMcpServer[]>([])
  // skills 存储统一 Skills 源目录扫描结果。
  const [skills, setSkills] = useState<UnifiedSkillsResult>({
    dir: '',
    skills: [],
  })
  // loading 标记初始数据加载是否进行中。
  const [loading, setLoading] = useState(true)
  // saving 标记保存操作是否进行中。
  const [saving, setSaving] = useState(false)
  // syncing 标记同步操作是否进行中。
  const [syncing, setSyncing] = useState(false)
  // error 存储加载或操作失败原因。
  const [error, setError] = useState('')
  // syncResult 存储最近一次同步结果，用于展示反馈。
  const [syncResult, setSyncResult] = useState<UnifiedSyncResult | null>(null)

  // loadAll 从后端读取统一 MCP 与 Skills 源。
  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      // mcpResult 存储统一 MCP 源。
      const mcpResult = await getUnifiedMcp()
      // skillResult 存储统一 Skills 源。
      const skillResult = await listUnifiedSkills()
      setServers(mcpResult.servers)
      setSavedServers(mcpResult.servers)
      setSkills(skillResult)
    } catch (loadError) {
      setError(String(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  // hasUnsaved 标记当前编辑内容是否与已保存内容不一致。
  const hasUnsaved = !serversEqual(servers, savedServers)

  // updateServer 更新指定行 server 的某个字段。
  // index 存储行序号，patch 存储要合并的字段。
  function updateServer(index: number, patch: Partial<UnifiedMcpServer>) {
    setServers((prev) =>
      prev.map((server, i) => (i === index ? { ...server, ...patch } : server))
    )
  }

  // addServer 追加一行空白 server。
  function addServer() {
    setServers((prev) => [...prev, emptyServer()])
  }

  // removeServer 删除指定行 server。
  // index 存储要删除的行序号。
  function removeServer(index: number) {
    setServers((prev) => prev.filter((_, i) => i !== index))
  }

  // handleSave 校验并保存统一 MCP 源。
  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      // result 存储后端归一化并落盘后的结果。
      const result = await saveUnifiedMcp(servers)
      setServers(result.servers)
      setSavedServers(result.servers)
      message.success('已保存统一 MCP 配置')
    } catch (saveError) {
      setError(String(saveError))
    } finally {
      setSaving(false)
    }
  }

  // handleSync 先保存再同步，确保写入两端的是最新内容。
  async function handleSync() {
    setSyncing(true)
    setError('')
    setSyncResult(null)
    try {
      // 有未保存改动时先落盘，避免同步旧内容。
      if (hasUnsaved) {
        const saved = await saveUnifiedMcp(servers)
        setServers(saved.servers)
        setSavedServers(saved.servers)
      }
      // result 存储同步结果。
      const result = await syncUnified({ claudeHome, codexHome })
      setSyncResult(result)
      // 同步会新建软链，刷新 Skills 列表反映最新状态。
      setSkills(await listUnifiedSkills())
      message.success('已同步到 Claude 与 Codex')
    } catch (syncError) {
      setError(String(syncError))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <PageShell className="unified-page">
      <PageHeader
        title="统一配置"
        subtitle="只写一次 MCP 与 Skills，一键同步到 Claude Code 与 Codex。"
        actions={
          <Space>
            <AntButton
              onClick={() => void loadAll()}
              disabled={loading || saving || syncing}
            >
              刷新
            </AntButton>
            <AntButton
              onClick={() => void handleSave()}
              loading={saving}
              disabled={!hasUnsaved || syncing}
            >
              保存
            </AntButton>
            <AntButton
              type="primary"
              onClick={() => void handleSync()}
              loading={syncing}
              disabled={loading}
            >
              保存并同步
            </AntButton>
          </Space>
        }
      />

      {error && (
        <Alert
          className="mb-4"
          type="error"
          showIcon
          message="操作失败"
          description={
            <pre className="m-0 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
              {error}
            </pre>
          }
        />
      )}

      {syncResult && <SyncResultAlert result={syncResult} />}

      {loading ? (
        <div className="flex min-h-[280px] items-center justify-center gap-2 text-sm text-text-muted">
          <Spin size="small" />
          <span>加载统一配置…</span>
        </div>
      ) : (
        <div className="unified-workspace">
          <McpEditor
            servers={servers}
            onAdd={addServer}
            onRemove={removeServer}
            onUpdate={updateServer}
          />
          <UnifiedSkillsSection skills={skills} />
        </div>
      )}
    </PageShell>
  )
}
