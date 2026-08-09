// Marketplace 管理页：按工具展示已注册市场来源，并提供读取与刷新索引操作。
import { Alert, App as AntApp } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import {
  listClaudeMarketplaces,
  listCodexMarketplaces,
  revealInFinder,
  updateClaudeMarketplace,
  updateCodexMarketplace,
} from '../api'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  PageShell,
} from '../components/ui'
import { useAppStore } from '../store'
import type { MarketplaceInfo } from '../types'

// MarketplacePageProps 描述当前市场页所属的工具。
interface MarketplacePageProps {
  tool: 'claude' | 'codex' // tool 存储需要展示市场的工具作用域。
}

// TOOL_LABELS 存储工具标识对应的界面名称。
const TOOL_LABELS: Record<MarketplacePageProps['tool'], string> = {
  claude: 'Claude Code',
  codex: 'Codex',
}

// MarketplacePage 展示指定工具的 marketplace 来源与索引刷新入口。
// tool 参数用于选择对应配置目录、列表接口和更新命令。
export default function MarketplacePage({ tool }: MarketplacePageProps) {
  // messageApi 存储 Ant Design 上下文消息实例。
  const { message: messageApi } = AntApp.useApp()
  // claudeHome 存储 Claude 配置根目录。
  const claudeHome = useAppStore((state) => state.prefs?.claude_home || '')
  // codexHome 存储 Codex 配置根目录。
  const codexHome = useAppStore((state) => state.prefs?.codex_home || '')
  // marketplaces 存储当前工具最近一次读取到的市场列表。
  const [marketplaces, setMarketplaces] = useState<MarketplaceInfo[]>([])
  // loading 标记市场列表是否正在读取。
  const [loading, setLoading] = useState(true)
  // updatingName 存储当前正在刷新索引的市场名称。
  const [updatingName, setUpdatingName] = useState('')
  // error 存储最近一次列表读取失败的原因。
  const [error, setError] = useState('')
  // activeHome 存储当前工具使用的配置根目录。
  const activeHome = tool === 'claude' ? claudeHome : codexHome
  // toolLabel 存储当前工具的界面名称。
  const toolLabel = TOOL_LABELS[tool]

  // loadMarketplaces 读取当前工具已注册的 marketplace 来源。
  const loadMarketplaces = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // result 存储当前工具返回的统一市场列表。
      const result =
        tool === 'claude'
          ? await listClaudeMarketplaces(activeHome)
          : await listCodexMarketplaces(activeHome)
      setMarketplaces(result)
    } catch (caughtError) {
      setError(String(caughtError))
    } finally {
      setLoading(false)
    }
  }, [activeHome, tool])

  // refreshMarketplace 刷新指定 marketplace 的本地索引，并重新读取列表。
  // marketplaceName 参数存储需要刷新的市场名称。
  const refreshMarketplace = async (marketplaceName: string) => {
    setUpdatingName(marketplaceName)
    try {
      if (tool === 'claude') {
        await updateClaudeMarketplace(marketplaceName, activeHome)
      } else {
        await updateCodexMarketplace(marketplaceName, activeHome)
      }
      await loadMarketplaces()
      messageApi.success(`${marketplaceName} 索引已更新`)
    } catch (caughtError) {
      messageApi.error(`${marketplaceName} 更新失败：${String(caughtError)}`)
    } finally {
      setUpdatingName('')
    }
  }

  useEffect(() => {
    void loadMarketplaces()
  }, [loadMarketplaces])

  return (
    <PageShell>
      <PageHeader
        title={`${toolLabel} · Marketplace`}
        subtitle={`管理 ${toolLabel} 的插件市场来源与本地索引；插件安装状态和版本操作在 Plugins 页面处理`}
        actions={
          <Button onClick={() => void loadMarketplaces()} loading={loading}>
            重新读取
          </Button>
        }
      />

      {error && (
        <Alert
          className="mb-4"
          description={error}
          message={`${toolLabel} Marketplace 读取失败`}
          showIcon
          type="error"
        />
      )}

      {!error && !loading && marketplaces.length === 0 ? (
        <EmptyState text="未发现已注册的 Marketplace" />
      ) : (
        <div className="page-item-stack">
          {marketplaces.map((marketplace) => (
            <Card key={marketplace.name}>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text-main">
                      {marketplace.name}
                    </span>
                    <Badge tone="info">
                      {marketplace.source_type || '未知来源'}
                    </Badge>
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-text-muted">
                    <div className="break-all">
                      来源：{marketplace.source || '—'}
                    </div>
                    <div
                      className="truncate"
                      title={marketplace.install_location}
                    >
                      本地索引：{marketplace.install_location || '—'}
                    </div>
                    {marketplace.last_updated && (
                      <div>最近更新：{marketplace.last_updated}</div>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
                  <Button
                    disabled={!marketplace.install_location}
                    onClick={() => {
                      void revealInFinder(marketplace.install_location).catch(
                        (caughtError) =>
                          messageApi.error(`定位失败：${String(caughtError)}`)
                      )
                    }}
                    variant="ghost"
                  >
                    Finder
                  </Button>
                  <Button
                    loading={updatingName === marketplace.name}
                    onClick={() => void refreshMarketplace(marketplace.name)}
                    variant="primary"
                  >
                    更新索引
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  )
}
