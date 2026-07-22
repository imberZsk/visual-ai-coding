// 大模型额度管理：保存模型账户，并通过供应商或自定义 HTTPS 接口查询当前周期额度。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appConfigDir } from './preferences.js'
import { atomicWrite } from './util.js'

// QUOTA_REQUEST_TIMEOUT_MS 存储单次额度请求的最长等待时间。
const QUOTA_REQUEST_TIMEOUT_MS = 20_000
// QUOTA_PROVIDERS 存储当前支持的额度来源类型。
const QUOTA_PROVIDERS = new Set(['openai', 'anthropic', 'custom'])
// DEFAULT_CURRENCY 存储成本型额度的默认单位。
const DEFAULT_CURRENCY = 'USD'

// quotaAccountsPath 返回额度账户配置文件路径。
export function quotaAccountsPath() {
  return join(appConfigDir(), 'quota-accounts.json')
}

// readQuotaRoot 读取额度账户配置，损坏或缺失时安全回退为空列表。
// path 参数用于测试注入临时配置文件。
function readQuotaRoot(path = quotaAccountsPath()) {
  if (!existsSync(path)) return { accounts: [] }
  try {
    // root 存储磁盘 JSON 解析后的额度配置根对象。
    const root = JSON.parse(readFileSync(path, 'utf8'))
    return { accounts: Array.isArray(root?.accounts) ? root.accounts : [] }
  } catch {
    return { accounts: [] }
  }
}

// publicAccount 移除密钥密文，仅向渲染进程暴露是否已经配置凭据。
// account 参数存储磁盘中的完整账户记录。
function publicAccount(account) {
  // encryptedApiKey 存储主进程持有的凭据密文。
  const encryptedApiKey = String(account?.encrypted_api_key || '')
  return {
    id: String(account?.id || ''),
    name: String(account?.name || ''),
    provider: String(account?.provider || ''),
    models: Array.isArray(account?.models) ? account.models : [],
    base_url: String(account?.base_url || ''),
    quota_path: String(account?.quota_path || ''),
    endpoint: String(account?.endpoint || ''),
    quota_limit: Number(account?.quota_limit) || 0,
    unit: String(account?.unit || DEFAULT_CURRENCY),
    has_api_key: Boolean(encryptedApiKey),
  }
}

// listQuotaAccounts 返回全部模型额度账户，且不泄露 API Key。
// options.path 参数用于测试指定临时配置文件。
export function listQuotaAccounts(options = {}) {
  return readQuotaRoot(options.path).accounts.map(publicAccount)
}

// normalizeAccount 校验并规范化待保存账户。
// input 参数存储渲染进程提交的表单值，existing 参数存储可选旧记录。
function normalizeAccount(input, existing) {
  // provider 存储规范化后的供应商类型。
  const provider = String(input?.provider || '')
    .trim()
    .toLowerCase()
  if (!QUOTA_PROVIDERS.has(provider)) throw new Error('不支持的额度来源')
  // name 存储用户可识别的账户名称。
  const name = String(input?.name || '').trim()
  if (!name) throw new Error('账户名称不能为空')
  // models 存储去空、去重后的模型 ID。
  const models = [
    ...new Set(
      (Array.isArray(input?.models) ? input.models : [])
        .map((model) => String(model).trim())
        .filter(Boolean)
    ),
  ]
  if (models.length === 0) throw new Error('至少配置一个模型')
  // quotaLimit 存储用户配置的当前周期总额度上限。
  const quotaLimit = Number(input?.quota_limit)
  if (
    provider !== 'custom' &&
    (!Number.isFinite(quotaLimit) || quotaLimit <= 0)
  ) {
    throw new Error('额度上限必须大于 0')
  }
  // baseUrl 存储自定义 OpenAI 兼容服务的基础地址。
  const baseUrl = String(input?.base_url || existing?.base_url || '')
    .trim()
    .replace(/\/$/, '')
  // quotaPath 存储相对 Base URL 的额度查询路径。
  const quotaPath = String(
    input?.quota_path || existing?.quota_path || ''
  ).trim()
  // endpoint 存储旧版本自定义供应商的完整 HTTPS 查询地址。
  const endpoint = String(input?.endpoint || '').trim()
  if (provider === 'custom') {
    if (baseUrl) validateHttpsEndpoint(baseUrl)
    else validateHttpsEndpoint(endpoint)
    if (baseUrl && !quotaPath) throw new Error('自定义供应商需配置额度查询路径')
  }
  return {
    id: String(existing?.id || input?.id || crypto.randomUUID()),
    name,
    provider,
    models,
    base_url: baseUrl,
    quota_path: quotaPath,
    endpoint,
    quota_limit:
      provider === 'custom' && !Number.isFinite(quotaLimit) ? 0 : quotaLimit,
    unit:
      String(input?.unit || existing?.unit || DEFAULT_CURRENCY).trim() ||
      DEFAULT_CURRENCY,
    encrypted_api_key: String(existing?.encrypted_api_key || ''),
  }
}

// saveQuotaAccount 新增或更新模型额度账户，并在主进程编码 API Key。
// input 参数存储表单数据，options 提供 encryptSecret 与测试路径。
export function saveQuotaAccount(input, options = {}) {
  // path 存储额度配置文件路径。
  const path = options.path || quotaAccountsPath()
  // root 存储当前磁盘配置，用于保留未修改账户与已有密钥。
  const root = readQuotaRoot(path)
  // existingIndex 存储更新账户的位置，新增时为 -1。
  const existingIndex = root.accounts.findIndex(
    (account) => account.id === input?.id
  )
  // existing 存储同 ID 的旧账户记录。
  const existing = existingIndex >= 0 ? root.accounts[existingIndex] : undefined
  // account 存储校验后的新账户记录。
  const account = normalizeAccount(input, existing)
  // apiKey 存储用户本次输入的新凭据；空值表示保留已有凭据。
  const apiKey = String(input?.api_key || '').trim()
  if (apiKey) {
    if (typeof options.encryptSecret !== 'function')
      throw new Error('系统凭据保护不可用')
    account.encrypted_api_key = options.encryptSecret(apiKey)
  }
  if (!account.encrypted_api_key) throw new Error('API Key 不能为空')
  if (existingIndex >= 0) root.accounts[existingIndex] = account
  else root.accounts.push(account)
  atomicWrite(path, `${JSON.stringify(root, null, 2)}\n`)
  return publicAccount(account)
}

// deleteQuotaAccount 删除指定额度账户。
// accountId 参数存储账户 ID，options.path 用于测试临时文件。
export function deleteQuotaAccount(accountId, options = {}) {
  // path 存储额度配置文件路径。
  const path = options.path || quotaAccountsPath()
  // root 存储删除前的完整账户集合。
  const root = readQuotaRoot(path)
  // nextAccounts 存储过滤目标账户后的集合。
  const nextAccounts = root.accounts.filter(
    (account) => account.id !== accountId
  )
  if (nextAccounts.length === root.accounts.length)
    throw new Error('额度账户不存在')
  atomicWrite(path, `${JSON.stringify({ accounts: nextAccounts }, null, 2)}\n`)
}

// validateHttpsEndpoint 校验额度请求只能访问公网 HTTPS 地址。
// endpoint 参数存储待校验 URL。
function validateHttpsEndpoint(endpoint) {
  try {
    // url 存储解析后的额度查询地址。
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' || !url.hostname) throw new Error()
  } catch {
    throw new Error('额度查询地址必须是有效的 HTTPS URL')
  }
}

// buildCustomQuotaUrl 将 Base URL 与额度路径组合为最终 HTTPS 地址，并兼容旧 endpoint。
// account 参数存储自定义供应商账户配置。
function buildCustomQuotaUrl(account) {
  if (!account.base_url) return String(account.endpoint || '')
  try {
    // baseUrl 存储确保以斜杠结尾的基础地址，避免 URL 把末级路径当文件替换。
    const baseUrl = `${String(account.base_url).replace(/\/$/, '')}/`
    // quotaPath 存储去除开头斜杠的相对额度路径。
    const quotaPath = String(account.quota_path || '').replace(/^\/+/, '')
    // quotaUrl 存储组合后的最终额度查询地址。
    const quotaUrl = new URL(quotaPath, baseUrl).toString()
    validateHttpsEndpoint(quotaUrl)
    return quotaUrl
  } catch {
    throw new Error('Base URL 或额度查询路径无效')
  }
}

// discoverQuotaModels 通过 OpenAI 兼容的 /models 接口读取可用模型 ID。
// input 参数存储 Base URL、可选新密钥或已有账户 ID，options 注入凭据解密与 fetch。
export async function discoverQuotaModels(input, options = {}) {
  // baseUrl 存储规范化后的 OpenAI 兼容服务地址。
  const baseUrl = String(input?.base_url || '')
    .trim()
    .replace(/\/$/, '')
  validateHttpsEndpoint(baseUrl)
  // existing 存储编辑场景下可复用凭据的旧账户。
  const existing = input?.account_id
    ? readQuotaRoot(options.path).accounts.find(
        (account) => account.id === input.account_id
      )
    : undefined
  // inputApiKey 存储表单本次输入的新密钥。
  const inputApiKey = String(input?.api_key || '').trim()
  // apiKey 存储本次模型发现请求实际使用的凭据。
  const apiKey =
    inputApiKey ||
    (existing?.encrypted_api_key && typeof options.decryptSecret === 'function'
      ? options.decryptSecret(existing.encrypted_api_key)
      : '')
  if (!apiKey) throw new Error('读取模型前请配置 API Key')
  // payload 存储 OpenAI 兼容 /models 接口响应。
  const payload = await requestJson(
    `${baseUrl}/models`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    },
    options.fetchImpl || fetch
  )
  // models 存储响应中去重并排序后的模型 ID。
  const models = [
    ...new Set(
      (Array.isArray(payload?.data) ? payload.data : [])
        .map((model) => String(model?.id || '').trim())
        .filter(Boolean)
    ),
  ].sort()
  if (models.length === 0) throw new Error('模型接口未返回可用模型')
  return models
}

// currentMonthRange 返回供应商接口需要的 UTC 月初与当前时间。
// now 参数用于测试固定当前时间。
function currentMonthRange(now) {
  // start 存储当前 UTC 月份第一天零点。
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return { start, end: now }
}

// sumCostValues 递归汇总供应商响应中的 amount.value 成本值。
// value 参数存储任意 JSON 节点。
function sumCostValues(value) {
  if (!value || typeof value !== 'object') return 0
  if (
    !Array.isArray(value) &&
    value.amount &&
    typeof value.amount === 'object'
  ) {
    // amountValue 存储当前成本记录的数值。
    const amountValue = Number(value.amount.value)
    return Number.isFinite(amountValue) ? amountValue : 0
  }
  return Object.values(value).reduce(
    (total, child) => total + sumCostValues(child),
    0
  )
}

// requestJson 执行带超时的额度请求并解析 JSON。
// url 和 init 描述 HTTP 请求，fetchImpl 参数用于测试替换网络层。
async function requestJson(url, init, fetchImpl) {
  // controller 存储请求取消控制器，超时后中断底层网络连接。
  const controller = new AbortController()
  // timeout 存储超时定时器句柄，请求完成后必须清理。
  const timeout = setTimeout(() => controller.abort(), QUOTA_REQUEST_TIMEOUT_MS)
  try {
    // response 存储供应商 HTTP 响应。
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`额度接口返回 HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

// queryQuotaAccount 异步查询单个模型账户的当前额度。
// accountId 参数存储账户 ID，options 注入解密、fetch、时间和测试路径。
export async function queryQuotaAccount(accountId, options = {}) {
  // account 存储目标账户完整配置，仅存在于主进程。
  const account = readQuotaRoot(options.path).accounts.find(
    (item) => item.id === accountId
  )
  if (!account) throw new Error('额度账户不存在')
  if (typeof options.decryptSecret !== 'function')
    throw new Error('系统凭据保护不可用')
  // apiKey 存储解密后的供应商凭据，不写回磁盘也不返回渲染进程。
  const apiKey = options.decryptSecret(account.encrypted_api_key)
  // fetchImpl 存储异步 HTTP 实现，默认使用 Node 内置 fetch。
  const fetchImpl = options.fetchImpl || fetch
  // now 存储本次查询时间，用于确定当前月成本区间。
  const now = options.now || new Date()
  // range 存储当前 UTC 月份时间范围。
  const range = currentMonthRange(now)
  // payload 存储供应商返回的 JSON 数据。
  let payload
  // used 存储当前周期已经消耗的额度。
  let used
  // limit 存储当前周期总额度。
  let limit = Number(account.quota_limit) || 0
  // remaining 存储当前剩余额度。
  let remaining
  // unit 存储额度计量单位。
  let unit = account.unit || DEFAULT_CURRENCY

  if (account.provider === 'openai') {
    // query 存储 OpenAI costs API 的 UTC 时间戳参数。
    const query = new URLSearchParams({
      start_time: String(Math.floor(range.start.getTime() / 1000)),
      end_time: String(Math.floor(range.end.getTime() / 1000)),
      bucket_width: '1d',
      limit: '31',
    })
    payload = await requestJson(
      `https://api.openai.com/v1/organization/costs?${query}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      fetchImpl
    )
    used = sumCostValues(payload)
    remaining = Math.max(0, limit - used)
  } else if (account.provider === 'anthropic') {
    // query 存储 Anthropic cost report API 的 ISO 时间参数。
    const query = new URLSearchParams({
      starting_at: range.start.toISOString(),
      ending_at: range.end.toISOString(),
    })
    payload = await requestJson(
      `https://api.anthropic.com/v1/organizations/cost_report?${query}`,
      {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      },
      fetchImpl
    )
    used = sumCostValues(payload)
    remaining = Math.max(0, limit - used)
  } else {
    // quotaUrl 存储由 Base URL 与额度路径组合的查询地址；旧账户回退完整 endpoint。
    const quotaUrl = buildCustomQuotaUrl(account)
    validateHttpsEndpoint(quotaUrl)
    payload = await requestJson(
      quotaUrl,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      fetchImpl
    )
    used = Number(payload?.used)
    limit = Number(payload?.limit ?? account.quota_limit)
    remaining = Number(payload?.remaining ?? limit - used)
    unit = String(payload?.unit || account.unit || DEFAULT_CURRENCY)
    if (![used, limit, remaining].every(Number.isFinite)) {
      throw new Error('自定义额度接口需返回数值 used、limit 或 remaining')
    }
  }
  return {
    account_id: account.id,
    checked_at: now.toISOString(),
    used,
    limit,
    remaining,
    unit,
  }
}
