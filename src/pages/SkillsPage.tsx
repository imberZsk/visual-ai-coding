// Skill 清单页：展示当前 Claude / Codex / Agents 可用的 skill 及其用途说明
import {
  Alert,
  Button as AntButton,
  Empty,
  Input,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  type TableColumnsType,
} from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { listSkills, openInVscode } from '../api'
import { PageHeader, PageShell } from '../components/ui'
import { useAppStore } from '../store'
import type { SkillInfo, SkillListResult } from '../types'

// INITIAL_SKILL_LOAD_DELAY_MS 存储首次扫描延迟，用于让 tab 切换动画先完成。
const INITIAL_SKILL_LOAD_DELAY_MS = 180

// ALL_SKILL_FILTER 存储筛选控件的“全部”值，避免与真实工具或来源名称冲突。
const ALL_SKILL_FILTER = 'all'

// DEFAULT_SKILL_TOOL 存储技能页首次打开和清除筛选后使用的默认工具分类。
const DEFAULT_SKILL_TOOL = 'codex'

// SKILL_TABLE_RESERVED_HEIGHT 存储页面中表格以外区域的预估高度，用于计算可展示行数。
const SKILL_TABLE_RESERVED_HEIGHT = 390

// SKILL_TABLE_ROW_HEIGHT 存储单行技能内容的预估高度，包含三行用途文本所需空间。
const SKILL_TABLE_ROW_HEIGHT = 86

// MIN_SKILL_PAGE_SIZE 存储小窗口下每页至少展示的技能数量。
const MIN_SKILL_PAGE_SIZE = 5

// MAX_SKILL_PAGE_SIZE 存储大窗口下每页最多展示的技能数量，避免单页过长影响定位。
const MAX_SKILL_PAGE_SIZE = 20

// SKILL_TOOL_OPTIONS 存储技能所属工具的固定分类选项。
const SKILL_TOOL_OPTIONS = [
  { label: 'Codex', value: 'codex' },
  { label: 'Claude', value: 'claude' },
  { label: 'Agents', value: 'agents' },
  { label: '全部', value: ALL_SKILL_FILTER },
]

// SkillsPageProps 描述技能页当前所属的一级工具。
interface SkillsPageProps {
  tool?: 'claude' | 'codex' // tool 存储固定展示的 Skill 工具作用域，省略时保留工具筛选控件。
}

// calculateSkillPageSize 根据窗口高度计算技能表每页展示数量。
// windowHeight 为当前渲染窗口的内部高度。
function calculateSkillPageSize(windowHeight: number): number {
  // availableHeight 存储扣除页头、筛选区和分页器后可供表格行使用的高度。
  const availableHeight = Math.max(
    0,
    windowHeight - SKILL_TABLE_RESERVED_HEIGHT
  )
  // visibleRows 存储当前高度理论上可以完整容纳的技能行数。
  const visibleRows = Math.floor(availableHeight / SKILL_TABLE_ROW_HEIGHT)
  return Math.min(
    MAX_SKILL_PAGE_SIZE,
    Math.max(MIN_SKILL_PAGE_SIZE, visibleRows)
  )
}

// VscodeIcon 渲染简化版 VSCode logo，用于 Skill 行的“在 VSCode 中打开”图标按钮。
function VscodeIcon() {
  return (
    <span
      role="img"
      aria-label="vscode"
      className="inline-flex text-base leading-none"
    >
      <svg
        width="1em"
        height="1em"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M17.484 0.291l-8.082 7.952L4.18 4.503 0 6.875l5.263 5.125L0 17.126l4.18.372 5.222-3.742 8.082 7.952L24 19.237V4.763L17.484.291zM18 18.582l-6.667-6.582L18 5.418v13.164z" />
      </svg>
    </span>
  )
}

// toolTagColor 根据 skill 所属工具返回 Ant Design Tag 色值。
// tool 为后端返回的工具域标识。
function toolTagColor(tool: SkillInfo['tool']): string {
  if (tool === 'codex') {
    return 'processing'
  }
  if (tool === 'claude') {
    return 'warning'
  }
  return 'success'
}

// filterSkills 按关键词、工具分类和来源过滤 skill。
// skills 为完整 skill 列表，query 为搜索关键词，tool/source 为当前分类筛选值。
function filterSkills(
  skills: SkillInfo[],
  query: string,
  tool: string,
  source: string
): SkillInfo[] {
  // keyword 存储归一化后的搜索关键词。
  const keyword = query.trim().toLowerCase()

  return skills.filter((skill) => {
    // matchesTool 标记当前 skill 是否符合工具分类。
    const matchesTool = tool === ALL_SKILL_FILTER || skill.tool === tool
    // matchesSource 标记当前 skill 是否符合来源分类。
    const matchesSource = source === ALL_SKILL_FILTER || skill.source === source
    // haystack 存储参与搜索匹配的 skill 文本字段集合。
    const haystack = [
      skill.name,
      skill.description,
      skill.source,
      skill.tool,
      skill.plugin,
      skill.path,
    ]
      .join(' ')
      .toLowerCase()
    // matchesKeyword 标记当前 skill 是否符合文本搜索条件。
    const matchesKeyword = !keyword || haystack.includes(keyword)

    return matchesTool && matchesSource && matchesKeyword
  })
}

// getSkillRowKey 生成 Ant Design Table 的稳定行 key。
// skill 为待展示的 skill 信息。
function getSkillRowKey(skill: SkillInfo): string {
  return `${skill.path}-${skill.name}`
}

// SkillTable 使用 Ant Design Table 渲染扁平 skill 清单，避免维护手写表格语义与响应式细节。
// skills 为当前需要展示的 skill 列表，vscodePath 为 VSCode CLI 路径。
function SkillTable({
  skills,
  vscodePath,
  pageSize,
}: {
  skills: SkillInfo[] // skills 存储当前需要展示的 skill 列表。
  vscodePath: string // vscodePath 存储用户配置的 VSCode CLI 路径。
  pageSize: number // pageSize 存储按当前窗口高度计算的每页技能数量。
}) {
  // columns 存储 Ant Design Table 列配置，集中声明每列如何消费 skill 字段。
  const columns: TableColumnsType<SkillInfo> = [
    {
      title: 'Skill',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (_value, skill) => (
        <Space orientation="vertical" size={6} className="min-w-0">
          <Typography.Text strong ellipsis={{ tooltip: skill.name }}>
            {skill.name}
          </Typography.Text>
          <Space size={4} wrap>
            <Tag color={toolTagColor(skill.tool)} className="m-0">
              {skill.tool}
            </Tag>
            {skill.plugin && <Tag className="m-0">{skill.plugin}</Tag>}
          </Space>
        </Space>
      ),
    },
    {
      title: '用途',
      dataIndex: 'description',
      key: 'description',
      render: (description: SkillInfo['description']) => (
        <Typography.Paragraph
          className="m-0 text-text-muted"
          ellipsis={{
            rows: 3,
            tooltip: description || '这个 skill 没有提供用途说明。',
          }}
        >
          {description || '这个 skill 没有提供用途说明。'}
        </Typography.Paragraph>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 160,
      render: (source: SkillInfo['source']) => (
        <Typography.Text ellipsis={{ tooltip: source || '未知来源' }}>
          {source || '未知来源'}
        </Typography.Text>
      ),
    },
    {
      title: '路径',
      dataIndex: 'path',
      key: 'path',
      width: 260,
      render: (path: SkillInfo['path']) => (
        <Typography.Paragraph
          className="m-0 skill-path-text"
          ellipsis={{ rows: 2, tooltip: path }}
          style={{ wordBreak: 'break-all' }}
        >
          {path}
        </Typography.Paragraph>
      ),
    },
    {
      title: '操作',
      key: 'action',
      align: 'right',
      width: 88,
      render: (_value, skill) => {
        // canOpenInVscode 标记当前是否具备使用 VSCode 打开的必要配置。
        const canOpenInVscode = Boolean(vscodePath && skill.path)

        return (
          <Tooltip
            title={
              canOpenInVscode
                ? '用 VSCode 打开 SKILL.md'
                : '请先在设置中配置 VSCode CLI 路径'
            }
          >
            <AntButton
              aria-label="VSCode"
              disabled={!canOpenInVscode}
              icon={<VscodeIcon />}
              onClick={() => {
                void openInVscode(vscodePath, skill.path).catch(console.error)
              }}
              type="text"
            />
          </Tooltip>
        )
      },
    },
  ]

  return (
    <Table
      className="skill-directory-table"
      columns={columns}
      dataSource={skills}
      pagination={{
        pageSize,
        showSizeChanger: false,
        hideOnSinglePage: true,
        showTotal: (total) => `共 ${total} 条`,
      }}
      rowKey={getSkillRowKey}
      size="small"
      tableLayout="fixed"
    />
  )
}

// SkillsPage 展示本机可用 skill 列表。
export default function SkillsPage({ tool }: SkillsPageProps) {
  // claudeHome 存储 Claude 配置根目录。
  const claudeHome = useAppStore((state) => state.prefs?.claude_home || '')
  // codexHome 存储 Codex 配置根目录。
  const codexHome = useAppStore((state) => state.prefs?.codex_home || '')
  // vscodePath 存储 VSCode CLI 路径，用于打开 Skill 文件。
  const vscodePath = useAppStore((state) => state.prefs?.vscode_path || '')
  // result 存储最近一次 skill 扫描结果。
  const [result, setResult] = useState<SkillListResult>({
    skills: [],
    diagnostics: '',
  })
  // loading 标记 skill 扫描是否正在执行。
  const [loading, setLoading] = useState(true)
  // error 存储 skill 扫描失败原因。
  const [error, setError] = useState('')
  // query 存储搜索框输入内容。
  const [query, setQuery] = useState('')
  // toolFilter 存储当前选中的工具分类。
  const [toolFilter, setToolFilter] = useState<string>(
    tool || DEFAULT_SKILL_TOOL
  )
  // sourceFilter 存储当前选中的来源分类。
  const [sourceFilter, setSourceFilter] = useState(ALL_SKILL_FILTER)
  // pageSize 存储当前窗口高度对应的技能表分页条数。
  const [pageSize, setPageSize] = useState(() =>
    calculateSkillPageSize(window.innerHeight)
  )
  // loadingRef 存储正在执行的 loadSkills 请求序号，用于丢弃过期请求结果，避免竞态覆盖。
  const loadingRef = useRef(0)

  // loadSkills 从后端扫描可用 skill。
  async function loadSkills() {
    // seq 存储本次请求序号；若返回时序号已被更新则说明有更新的请求在运行，丢弃结果。
    const seq = ++loadingRef.current
    setLoading(true)
    setError('')
    try {
      // nextResult 存储后端返回的 skill 扫描结果。
      const nextResult = await listSkills(claudeHome, codexHome)
      // 只有最新一次请求的结果才写入 state，避免并发时旧结果覆盖新结果。
      if (seq !== loadingRef.current) return
      setResult(nextResult)
    } catch (loadError) {
      if (seq !== loadingRef.current) return
      setError(String(loadError))
      setResult({ skills: [], diagnostics: '' })
    } finally {
      if (seq === loadingRef.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    // timer 存储首次扫描延迟句柄，避免 tab 切换期间同步扫描磁盘造成卡顿。
    const timer = window.setTimeout(() => {
      void loadSkills()
    }, INITIAL_SKILL_LOAD_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
    // loadSkills 会随请求状态重建；这里只应在两个扫描根目录变化时重新扫描。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claudeHome, codexHome])

  useEffect(() => {
    // handleResize 在窗口尺寸变化时重新计算技能表每页条数。
    function handleResize() {
      setPageSize(calculateSkillPageSize(window.innerHeight))
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // sourceOptions 存储从扫描结果动态生成的来源筛选选项。
  const sourceOptions = useMemo(() => {
    // sources 存储去重并按中文名称排序后的技能来源。
    const sources = [
      ...new Set(result.skills.map((skill) => skill.source || '未知来源')),
    ].sort((left, right) => left.localeCompare(right, 'zh-CN'))
    return [
      { label: '全部来源', value: ALL_SKILL_FILTER },
      ...sources.map((source) => ({ label: source, value: source })),
    ]
  }, [result.skills])

  // hasActiveFilters 标记当前是否存在任意搜索或分类筛选条件。
  const hasActiveFilters = Boolean(
    query.trim() ||
    (!tool && toolFilter !== DEFAULT_SKILL_TOOL) ||
    sourceFilter !== ALL_SKILL_FILTER
  )
  // filteredSkills 存储按当前搜索词、工具和来源过滤后的 skill 列表。
  const filteredSkills = useMemo(
    () => filterSkills(result.skills, query, toolFilter, sourceFilter),
    [result.skills, query, toolFilter, sourceFilter]
  )

  // clearFilters 清空技能页的搜索与分类筛选条件。
  function clearFilters() {
    setQuery('')
    setToolFilter(tool || DEFAULT_SKILL_TOOL)
    setSourceFilter(ALL_SKILL_FILTER)
  }

  return (
    <PageShell className="max-w-6xl">
      <PageHeader
        title={
          tool ? `${tool === 'codex' ? 'Codex' : 'Claude Code'} · 技能` : '技能'
        }
        subtitle={
          tool
            ? `查看当前 ${tool === 'codex' ? 'Codex' : 'Claude Code'} 可用的 Skill，以及每个 Skill 适合处理什么任务。`
            : '查看当前 Claude、Codex 与本机 Agents 可用的 Skill，以及每个 Skill 适合处理什么任务。'
        }
        actions={
          <AntButton
            aria-label="刷新"
            disabled={loading}
            onClick={() => void loadSkills()}
            loading={loading}
          >
            刷新
          </AntButton>
        }
      />

      <div className="mb-5 space-y-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <Input
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 skill、用途、来源"
          />
          <Select
            aria-label="来源筛选"
            options={sourceOptions}
            value={sourceFilter}
            onChange={setSourceFilter}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!tool && (
            <Segmented
              aria-label="工具分类"
              options={SKILL_TOOL_OPTIONS}
              value={toolFilter}
              onChange={(value) => setToolFilter(String(value))}
            />
          )}
          <div className="flex items-center gap-2 text-sm text-text-muted">
            {loading && <Spin size="small" />}
            <span>
              共 {result.skills.length} 个 Skill
              {hasActiveFilters ? `，匹配 ${filteredSkills.length} 个` : ''}
            </span>
            {hasActiveFilters && (
              <AntButton type="link" size="small" onClick={clearFilters}>
                清除筛选
              </AntButton>
            )}
          </div>
        </div>
      </div>

      {error && (
        <Alert
          className="mb-4"
          description={
            <pre className="m-0 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
              {error}
            </pre>
          }
          message="Skill 扫描失败"
          showIcon
          type="error"
        />
      )}

      {result.diagnostics && !error && (
        <Alert
          className="mb-4"
          description={
            <pre className="m-0 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
              {result.diagnostics}
            </pre>
          }
          message="扫描诊断"
          showIcon
          type="warning"
        />
      )}

      {/* min-h 常驻基准：让 loading / 空 / 表格三态共用同一最小高度，避免扫描完成后内容区从小占位跳到不定行表格造成的整屏跳动（CLS） */}
      <div className="min-h-[280px]">
        {loading && result.skills.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center gap-2 text-sm text-text-muted">
            <Spin size="small" />
            <span>加载 Skill…</span>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-8">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                hasActiveFilters ? '没有匹配的 Skill' : '未发现可用 Skill'
              }
            />
          </div>
        ) : (
          <SkillTable
            skills={filteredSkills}
            vscodePath={vscodePath}
            pageSize={pageSize}
          />
        )}
      </div>
    </PageShell>
  )
}
