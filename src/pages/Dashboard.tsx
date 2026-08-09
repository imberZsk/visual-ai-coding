// 概览页：展示本机 AI 工具安装状态、配置目录、快速入口
import { useState } from 'react'
import { useAppStore } from '../store'
import { PageHeader, Card, Badge, Button, PageShell } from '../components/ui'
import { openExternalUrl, revealInFinder, openInVscode } from '../api'
import type { ToolStatus } from '../types'
import { comparePluginVersions } from '../utils/versionCompare'
import './Dashboard.css'

// IDLE_VERSION_CHECK 存储工具版本查询的空闲态兜底值，避免未查询工具访问 undefined。
const IDLE_VERSION_CHECK = {
  loading: false,
  updating: false,
  latestVersion: '',
  releaseNotesUrl: '',
  error: '',
  updateMessage: '',
}

// extractVersionNumber 从工具版本文本中提取 semver 主体，versionText 参数存储命令行探测到的原始版本输出。
function extractVersionNumber(versionText: string): string {
  // match 存储从版本文本中匹配到的 semver 片段。
  const match = versionText.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)

  return match?.[0] ?? versionText.trim()
}

// getVersionBadge 根据本地版本与最新版本返回展示徽章，currentVersion 参数存储本地版本文本，latestVersion 参数存储 npm 最新版本。
function getVersionBadge(currentVersion: string, latestVersion: string) {
  // currentSemver 存储可比较的本地 semver 版本号。
  const currentSemver = extractVersionNumber(currentVersion)
  // updateStatus 存储本地版本相对最新版本的比较结果。
  const updateStatus = comparePluginVersions(currentSemver, latestVersion)

  if (updateStatus === 'newer') {
    return <Badge tone="warning">可更新</Badge>
  }

  if (updateStatus === 'same') {
    return <Badge tone="success">已最新</Badge>
  }

  return <Badge tone="neutral">需确认</Badge>
}

// getToolUpdateStatus 根据本地版本与最新版本返回可更新状态。
// currentVersion 参数存储本地版本文本，latestVersion 参数存储 npm 最新版本。
function getToolUpdateStatus(currentVersion: string, latestVersion: string) {
  // currentSemver 存储可比较的本地 semver 版本号。
  const currentSemver = extractVersionNumber(currentVersion)

  return comparePluginVersions(currentSemver, latestVersion)
}

// DashboardContent 渲染概览主体，将每个工具的状态、版本和配置入口集中展示。
export function DashboardContent() {
  // tools 为本机工具探测结果
  const tools = useAppStore((s) => s.tools)
  // prefs 为应用偏好，用于取配置目录
  const prefs = useAppStore((s) => s.prefs)
  // refreshTools 用于重新探测工具状态
  const refreshTools = useAppStore((s) => s.refreshTools)
  // updatePrefs 用于切换页签跳转
  const updatePrefs = useAppStore((s) => s.updatePrefs)
  // versionChecks 存储跨 tab 保留的每个工具最新版本查询状态。
  const versionChecks = useAppStore((s) => s.toolVersionChecks)
  // checkLatestToolVersion 用于查询指定工具 npm 最新版本，状态写入全局 store。
  const checkLatestToolVersion = useAppStore((s) => s.checkLatestToolVersion)
  // updateToolToLatest 用于更新指定工具 CLI，状态写入全局 store。
  const updateToolToLatest = useAppStore((s) => s.updateToolToLatest)
  // refreshingTools 标记重新探测是否正在执行，用于控制按钮 loading。
  const [refreshingTools, setRefreshingTools] = useState(false)

  // 在 Finder 打开指定目录
  const reveal = (p: string) => revealInFinder(p).catch((e) => console.error(e))
  // 在 VSCode 打开指定目录
  const openVscode = (p: string) =>
    openInVscode(prefs?.vscode_path || 'code', p).catch((e) => console.error(e))

  // handleRefreshTools 触发工具重新探测，并在异步期间维持按钮 loading。
  async function handleRefreshTools() {
    if (refreshingTools) {
      // 已有探测在执行时直接返回，避免重复触发后端扫描。
      return
    }

    setRefreshingTools(true)
    try {
      await refreshTools()
    } catch (error) {
      // error 存储重新探测失败原因，先输出到控制台保持页面可恢复。
      console.error(error)
    } finally {
      setRefreshingTools(false)
    }
  }

  // renderToolCard 渲染单个 AI 工具状态卡片。
  // tool 参数存储当前工具的安装、版本与可执行路径探测结果。
  function renderToolCard(tool: ToolStatus) {
    // versionCheck 存储当前工具最新版本查询的 UI 状态。
    const versionCheck = versionChecks[tool.id] ?? IDLE_VERSION_CHECK
    // canCheckLatestVersion 标记当前工具是否支持查询 npm 最新版本。
    const canCheckLatestVersion =
      tool.installed && (tool.id === 'claude' || tool.id === 'codex')
    // updateStatus 存储当前工具是否落后于 npm 最新版本。
    const updateStatus = versionCheck.latestVersion
      ? getToolUpdateStatus(tool.version, versionCheck.latestVersion)
      : 'unknown'
    // configHome 存储当前工具的配置根目录，用于快速打开操作。
    const configHome =
      tool.id === 'claude' ? prefs?.claude_home : prefs?.codex_home

    return (
      <Card key={tool.id} className="dashboard-tool-card">
        <div className="dashboard-tool-card__body">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-text-main">
                  {tool.name}
                </span>
                {/* 安装状态徽章 */}
                {tool.installed ? (
                  <Badge tone="success">已安装</Badge>
                ) : (
                  <Badge tone="warning">未检测到</Badge>
                )}
              </div>
              {/* 版本与路径信息 */}
              <div className="dashboard-tool-card__metadata mt-3 space-y-1 text-xs text-text-muted">
                <div className="truncate" title={tool.version}>
                  版本：{tool.version || '—'}
                </div>
                <div className="truncate" title={tool.path}>
                  路径：{tool.path || '—'}
                </div>
                {/* 版本查询结果区：常驻 min-h 预留一行占位，避免查询完成后信息插入把下方按钮行下推、导致同 grid 行两卡片高度骤然不一致（CLS） */}
                <div className="min-h-[1.25rem]">
                  {versionCheck.latestVersion && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>最新版本：{versionCheck.latestVersion}</span>
                      {getVersionBadge(
                        tool.version,
                        versionCheck.latestVersion
                      )}
                      {versionCheck.releaseNotesUrl && (
                        <Button
                          onClick={() => {
                            void openExternalUrl(
                              versionCheck.releaseNotesUrl
                            ).catch((error) => console.error(error))
                          }}
                          variant="ghost"
                        >
                          查看更新内容
                        </Button>
                      )}
                    </div>
                  )}
                  {versionCheck.error && (
                    <div className="text-warning">
                      查询失败：{versionCheck.error}
                    </div>
                  )}
                  {versionCheck.updateMessage && (
                    <div className="text-success">
                      {versionCheck.updateMessage}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 配置目录与工具操作放在同一工具面板，避免概览页重复四张卡片。 */}
          <div className="dashboard-tool-card__directory">
            <div className="dashboard-tool-card__directory-label">配置目录</div>
            <div
              className="dashboard-tool-card__directory-value"
              title={configHome}
            >
              {configHome || '—'}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => reveal(configHome || '')} variant="ghost">
                Finder
              </Button>
              <Button
                onClick={() => openVscode(configHome || '')}
                variant="default"
              >
                VSCode
              </Button>
            </div>
          </div>
        </div>

        {/* 快速跳转到对应配置页 */}
        <div className="dashboard-tool-card__actions flex flex-wrap gap-2">
          <Button
            onClick={() =>
              updatePrefs({
                active_ai_tool: tool.id === 'claude' ? 'claude' : 'codex',
                last_active_tab: tool.id === 'claude' ? 'claude' : 'codex',
              })
            }
            variant="primary"
          >
            管理配置
          </Button>
          {canCheckLatestVersion && (
            <Button
              onClick={() => {
                void checkLatestToolVersion(tool.id)
              }}
              variant="default"
              loading={versionCheck.loading}
            >
              查询最新版本
            </Button>
          )}
          {updateStatus === 'newer' && (
            <Button
              onClick={() => {
                void updateToolToLatest(tool.id)
              }}
              variant="primary"
              loading={versionCheck.updating}
            >
              更新到最新版
            </Button>
          )}
        </div>
      </Card>
    )
  }

  return (
    <div className="dashboard-content">
      <PageHeader
        title="概览"
        subtitle="本机 AI 编码工具状态与配置入口"
        actions={
          <Button
            onClick={() => {
              void handleRefreshTools()
            }}
            variant="default"
            loading={refreshingTools}
          >
            重新探测
          </Button>
        }
      />

      {/* 工具安装状态卡片 */}
      <div className="dashboard-tool-grid">{tools.map(renderToolCard)}</div>
    </div>
  )
}

// 概览页组件
export default function Dashboard() {
  return (
    <PageShell>
      <DashboardContent />
    </PageShell>
  )
}
