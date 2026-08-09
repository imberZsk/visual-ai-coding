// 额度管理页面：维护模型账户，并按账户异步查询当前周期用量与剩余额度。
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App as AntApp,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Tag,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import {
  deleteQuotaAccount,
  discoverQuotaModels,
  listQuotaAccounts,
  queryQuotaAccount,
  saveQuotaAccount,
} from '../api'
import { Card, EmptyState, PageHeader, PageShell } from '../components/ui'
import './QuotaPage.css'
import type {
  QuotaAccount,
  QuotaAccountInput,
  QuotaProvider,
  QuotaResult,
} from '../types'

// PROVIDER_LABELS 存储供应商类型对应的界面名称。
const PROVIDER_LABELS: Record<QuotaProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  custom: '自定义接口',
}
// PROVIDER_OPTIONS 存储账户表单的供应商候选项。
const PROVIDER_OPTIONS = Object.entries(PROVIDER_LABELS).map(
  ([value, label]) => ({
    value,
    label,
  })
)

// QuotaFormValues 描述 Ant Design 表单中的可编辑字段。
interface QuotaFormValues {
  name: string // 账户展示名称。
  provider: QuotaProvider // 供应商类型。
  models: string[] // 可用模型 ID 列表。
  api_key?: string // 新增或替换的 API Key。
  endpoint?: string // 自定义额度接口地址。
  base_url?: string // OpenAI 兼容服务基础地址。
  quota_path?: string // 相对 Base URL 的额度查询路径。
  quota_limit?: number // 当前周期额度上限。
  unit: string // 额度计量单位。
}

// formatQuotaValue 按最多两位小数格式化额度数值。
// value 参数存储待显示的额度数值。
function formatQuotaValue(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(
    value
  )
}

// QuotaPage 渲染模型资产与额度查询管理器。
export default function QuotaPage() {
  // messageApi 存储 Ant Design 全局消息实例。
  const { message: messageApi } = AntApp.useApp()
  // form 存储新增和编辑账户共用的表单实例。
  const [form] = Form.useForm<QuotaFormValues>()
  // accounts 存储主进程返回的全部安全账户配置。
  const [accounts, setAccounts] = useState<QuotaAccount[]>([])
  // results 存储账户 ID 到最近一次额度查询结果的映射。
  const [results, setResults] = useState<Record<string, QuotaResult>>({})
  // queryErrors 存储账户 ID 到最近一次查询错误的映射。
  const [queryErrors, setQueryErrors] = useState<Record<string, string>>({})
  // queryingIds 存储正在查询额度的账户 ID 集合。
  const [queryingIds, setQueryingIds] = useState<Set<string>>(new Set())
  // loading 标记账户配置是否正在首次读取。
  const [loading, setLoading] = useState(true)
  // saving 标记账户表单是否正在保存。
  const [saving, setSaving] = useState(false)
  // discoveringModels 标记是否正在从 OpenAI 兼容接口读取模型。
  const [discoveringModels, setDiscoveringModels] = useState(false)
  // modalOpen 标记账户编辑弹窗是否可见。
  const [modalOpen, setModalOpen] = useState(false)
  // editingAccount 存储当前编辑账户，空值表示新增。
  const [editingAccount, setEditingAccount] = useState<QuotaAccount | null>(
    null
  )
  // provider 存储当前表单供应商，用于显示自定义接口字段。
  const provider = Form.useWatch('provider', form)

  // loadAccounts 异步读取额度账户配置。
  const loadAccounts = useCallback(async () => {
    setLoading(true)
    try {
      // nextAccounts 存储主进程最新账户列表。
      const nextAccounts = await listQuotaAccounts()
      setAccounts(nextAccounts)
    } catch (error) {
      messageApi.error(`读取额度账户失败：${String(error)}`)
    } finally {
      setLoading(false)
    }
  }, [messageApi])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  // openCreateModal 打开新增账户表单并写入合理默认值。
  function openCreateModal() {
    setEditingAccount(null)
    form.setFieldsValue({
      name: '',
      provider: 'openai',
      models: [],
      api_key: '',
      endpoint: '',
      base_url: '',
      quota_path: '',
      quota_limit: undefined,
      unit: 'USD',
    })
    setModalOpen(true)
  }

  // openEditModal 打开编辑账户表单，API Key 留空表示保留密文。
  // account 参数存储当前要编辑的账户。
  function openEditModal(account: QuotaAccount) {
    setEditingAccount(account)
    form.setFieldsValue({
      name: account.name,
      provider: account.provider,
      models: account.models,
      api_key: '',
      endpoint: account.endpoint,
      base_url: account.base_url,
      quota_path: account.quota_path,
      quota_limit: account.quota_limit || undefined,
      unit: account.unit,
    })
    setModalOpen(true)
  }

  // submitAccount 校验并保存当前账户表单。
  async function submitAccount() {
    try {
      // values 存储通过前端规则校验后的表单值。
      const values = await form.validateFields()
      // input 存储提交给主进程的账户配置。
      const input: QuotaAccountInput = {
        id: editingAccount?.id || '',
        name: values.name,
        provider: values.provider,
        models: values.models,
        endpoint: values.endpoint || '',
        base_url: values.base_url || '',
        quota_path: values.quota_path || '',
        quota_limit: values.quota_limit || 0,
        unit: values.unit,
        api_key: values.api_key?.trim() || undefined,
      }
      setSaving(true)
      await saveQuotaAccount(input)
      setModalOpen(false)
      await loadAccounts()
      messageApi.success(editingAccount ? '额度账户已更新' : '额度账户已添加')
    } catch (error) {
      // Ant Design 校验失败包含 errorFields，此时控件已就地显示原因，无需重复 toast。
      if (error && typeof error === 'object' && 'errorFields' in error) return
      messageApi.error(`保存失败：${String(error)}`)
    } finally {
      setSaving(false)
    }
  }

  // loadCompatibleModels 通过 Base URL 与 API Key 异步读取 OpenAI 兼容模型列表。
  async function loadCompatibleModels() {
    // baseUrl 存储当前表单中的兼容服务基础地址。
    const baseUrl = String(form.getFieldValue('base_url') || '').trim()
    // apiKey 存储当前表单中新输入的可选密钥。
    const apiKey = String(form.getFieldValue('api_key') || '').trim()
    if (!baseUrl) {
      messageApi.warning('请先填写 Base URL')
      return
    }
    setDiscoveringModels(true)
    try {
      // models 存储兼容服务返回的模型 ID 列表。
      const models = await discoverQuotaModels({
        account_id: editingAccount?.id,
        base_url: baseUrl,
        api_key: apiKey || undefined,
      })
      form.setFieldValue('models', models)
      messageApi.success(`已读取 ${models.length} 个模型`)
    } catch (error) {
      messageApi.error(`读取模型失败：${String(error)}`)
    } finally {
      setDiscoveringModels(false)
    }
  }

  // removeAccount 删除账户并同步清理页面内查询状态。
  // accountId 参数存储目标账户 ID。
  async function removeAccount(accountId: string) {
    try {
      await deleteQuotaAccount(accountId)
      setAccounts((current) =>
        current.filter((account) => account.id !== accountId)
      )
      setResults((current) => {
        // nextResults 存储移除目标账户后的查询结果。
        const nextResults = { ...current }
        delete nextResults[accountId]
        return nextResults
      })
      messageApi.success('额度账户已删除')
    } catch (error) {
      messageApi.error(`删除失败：${String(error)}`)
    }
  }

  // queryAccount 异步查询指定账户额度，并仅更新该账户 loading。
  // accountId 参数存储目标账户 ID。
  async function queryAccount(accountId: string) {
    setQueryingIds((current) => new Set(current).add(accountId))
    setQueryErrors((current) => ({ ...current, [accountId]: '' }))
    try {
      // result 存储供应商返回并由主进程规范化后的额度结果。
      const result = await queryQuotaAccount(accountId)
      setResults((current) => ({ ...current, [accountId]: result }))
    } catch (error) {
      setQueryErrors((current) => ({ ...current, [accountId]: String(error) }))
    } finally {
      setQueryingIds((current) => {
        // nextIds 存储结束当前查询后的 loading 集合。
        const nextIds = new Set(current)
        nextIds.delete(accountId)
        return nextIds
      })
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="额度管理"
        subtitle="集中维护可用模型账户，并查看当前周期用量与剩余额度。"
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreateModal}
          >
            添加账户
          </Button>
        }
      />

      {loading ? (
        <div className="py-16 text-center text-text-muted">
          正在读取额度账户…
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState text="尚未配置模型额度账户" />
      ) : (
        <div className="quota-account-grid">
          {accounts.map((account) => {
            // result 存储当前账户最近一次额度结果。
            const result = results[account.id]
            // queryError 存储当前账户最近一次查询错误。
            const queryError = queryErrors[account.id]
            // percent 存储已用额度占比，供进度条展示。
            const percent =
              result?.limit > 0
                ? Math.min(100, Math.max(0, (result.used / result.limit) * 100))
                : 0
            return (
              <Card key={account.id} className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <WalletOutlined
                        className="text-text-muted"
                        aria-hidden="true"
                      />
                      <h2 className="truncate text-base font-semibold text-text-main">
                        {account.name}
                      </h2>
                      <Tag>{PROVIDER_LABELS[account.provider]}</Tag>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {account.models.map((model) => (
                        <Tag key={model}>{model}</Tag>
                      ))}
                    </div>
                    {account.base_url && (
                      <div className="mt-2 truncate font-mono text-xs text-text-muted">
                        {account.base_url}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      aria-label={`编辑 ${account.name}`}
                      title="编辑"
                      onClick={() => openEditModal(account)}
                    />
                    <Popconfirm
                      title={`删除 ${account.name}`}
                      description="删除后无法恢复该账户配置。"
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() => removeAccount(account.id)}
                    >
                      <Button
                        danger
                        type="text"
                        icon={<DeleteOutlined />}
                        aria-label={`删除 ${account.name}`}
                        title="删除"
                      />
                    </Popconfirm>
                  </div>
                </div>

                <div className="mt-6 border-t border-border pt-4">
                  {result ? (
                    <>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-text-muted">已用</div>
                          <div className="mt-1 font-medium">
                            {formatQuotaValue(result.used)} {result.unit}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-text-muted">总额度</div>
                          <div className="mt-1 font-medium">
                            {formatQuotaValue(result.limit)} {result.unit}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-text-muted">剩余</div>
                          <div className="mt-1 font-semibold text-success">
                            {formatQuotaValue(result.remaining)} {result.unit}
                          </div>
                        </div>
                      </div>
                      <Progress
                        className="mt-3"
                        percent={Number(percent.toFixed(1))}
                        showInfo={false}
                        status={percent >= 90 ? 'exception' : 'normal'}
                      />
                      <div className="mt-1 text-xs text-text-muted">
                        查询时间：{new Date(result.checked_at).toLocaleString()}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-text-muted">尚未查询</div>
                  )}
                  {queryError && (
                    <Alert
                      className="mt-3"
                      type="error"
                      showIcon
                      message="额度查询失败"
                      description={queryError}
                    />
                  )}
                  <Button
                    className="mt-4"
                    icon={<ReloadOutlined />}
                    loading={queryingIds.has(account.id)}
                    aria-label={`查询 ${account.name} 额度`}
                    onClick={() => queryAccount(account.id)}
                  >
                    查询额度
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        destroyOnHidden
        open={modalOpen}
        title={editingAccount ? '编辑额度账户' : '添加额度账户'}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onCancel={() => setModalOpen(false)}
        onOk={submitAccount}
      >
        <Form form={form} layout="vertical" className="pt-3">
          <Form.Item
            name="name"
            label="账户名称"
            rules={[
              { required: true, whitespace: true, message: '请输入账户名称' },
            ]}
          >
            <Input placeholder="例如：团队 OpenAI" />
          </Form.Item>
          <Form.Item
            name="provider"
            label="额度来源"
            rules={[{ required: true }]}
          >
            <Select options={PROVIDER_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="api_key"
            label="API Key"
            rules={[
              {
                required: !editingAccount?.has_api_key,
                message: '请输入 API Key',
              },
            ]}
          >
            <Input.Password
              autoComplete="new-password"
              placeholder={
                editingAccount?.has_api_key
                  ? '留空以保留现有密钥'
                  : '输入管理员或额度查询密钥'
              }
            />
          </Form.Item>
          {provider === 'custom' && (
            <>
              <Form.Item
                name="base_url"
                label="Base URL"
                rules={[
                  {
                    required: true,
                    type: 'url',
                    message: '请输入有效的 HTTPS URL',
                  },
                ]}
              >
                <Input placeholder="https://provider.example.com/v1" />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="models"
            label="可用模型"
            rules={[
              {
                required: true,
                type: 'array',
                min: 1,
                message: '至少添加一个模型',
              },
            ]}
            extra={
              provider === 'custom' ? (
                <Button
                  className="mt-2"
                  loading={discoveringModels}
                  onClick={loadCompatibleModels}
                >
                  从 Base URL 读取模型
                </Button>
              ) : undefined
            }
          >
            <Select
              mode="tags"
              tokenSeparators={[',']}
              placeholder="输入模型 ID 后回车"
            />
          </Form.Item>
          {provider === 'custom' && (
            <Form.Item
              name="quota_path"
              label="额度查询路径"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: '请输入额度查询路径',
                },
              ]}
            >
              <Input placeholder="account/quota" />
            </Form.Item>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
            <Form.Item
              name="quota_limit"
              label="周期总额度"
              rules={
                provider === 'custom'
                  ? []
                  : [{ required: true, message: '请输入周期总额度' }]
              }
            >
              <InputNumber min={0} precision={2} className="w-full" />
            </Form.Item>
            <Form.Item
              name="unit"
              label="单位"
              rules={[{ required: true, whitespace: true }]}
            >
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </PageShell>
  )
}
