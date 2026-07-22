import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  deleteQuotaAccount,
  discoverQuotaModels,
  listQuotaAccounts,
  queryQuotaAccount,
  saveQuotaAccount,
} from '../../src/core/quotaManager.js'

// createTestPath 创建单个用例独享的额度配置路径。
function createTestPath() {
  // directory 存储系统临时目录下的隔离测试文件夹。
  const directory = mkdtempSync(join(tmpdir(), 'visual-quota-'))
  return join(directory, 'quota-accounts.json')
}

// encryptSecret 模拟系统安全存储编码，便于断言磁盘不出现密钥明文。
// secret 参数存储待编码的测试密钥。
function encryptSecret(secret) {
  return Buffer.from(secret).toString('base64')
}

// decryptSecret 模拟系统安全存储解码。
// secret 参数存储 Base64 测试密文。
function decryptSecret(secret) {
  return Buffer.from(secret, 'base64').toString('utf8')
}

describe('quota manager', () => {
  // 验证保存模型资产后，列表和磁盘均不会暴露 API Key 明文。
  it('stores protected credentials and lists model accounts without secrets', () => {
    // path 存储本用例额度配置文件路径。
    const path = createTestPath()
    // account 存储保存后返回的安全账户信息。
    const account = saveQuotaAccount(
      {
        name: 'Team OpenAI',
        provider: 'openai',
        models: ['gpt-5.4', 'gpt-5.4'],
        quota_limit: 100,
        unit: 'USD',
        endpoint: '',
        api_key: 'sk-secret',
      },
      { path, encryptSecret }
    )

    expect(account.models).toEqual(['gpt-5.4'])
    expect(account.has_api_key).toBe(true)
    expect(account).not.toHaveProperty('encrypted_api_key')
    expect(readFileSync(path, 'utf8')).not.toContain('sk-secret')
    expect(listQuotaAccounts({ path })).toEqual([account])
  })

  // 验证 OpenAI 当前月成本会正确汇总，并用用户上限计算剩余额度。
  it('queries OpenAI monthly costs and calculates remaining quota', async () => {
    // path 存储本用例额度配置文件路径。
    const path = createTestPath()
    // account 存储待查询的 OpenAI 账户。
    const account = saveQuotaAccount(
      {
        name: 'OpenAI',
        provider: 'openai',
        models: ['gpt-5.4'],
        quota_limit: 50,
        unit: 'USD',
        endpoint: '',
        api_key: 'admin-key',
      },
      { path, encryptSecret }
    )
    // fetchImpl 模拟 OpenAI costs API 的分桶响应。
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { results: [{ amount: { value: 12.5, currency: 'usd' } }] },
          { results: [{ amount: { value: '7.25', currency: 'usd' } }] },
        ],
      }),
    })

    // result 存储规范化后的额度结果。
    const result = await queryQuotaAccount(account.id, {
      path,
      decryptSecret,
      fetchImpl,
      now: new Date('2026-07-22T08:00:00.000Z'),
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('https://api.openai.com/v1/organization/costs?'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer admin-key' },
      })
    )
    expect(result).toMatchObject({
      used: 19.75,
      limit: 50,
      remaining: 30.25,
      unit: 'USD',
    })
  })

  // 验证自定义 HTTPS 接口可直接提供已用、总量、剩余和单位。
  it('normalizes a custom quota endpoint response', async () => {
    // path 存储本用例额度配置文件路径。
    const path = createTestPath()
    // account 存储待查询的自定义供应商账户。
    const account = saveQuotaAccount(
      {
        name: 'Private Gateway',
        provider: 'custom',
        models: ['local-pro'],
        quota_limit: 0,
        unit: 'tokens',
        endpoint: 'https://quota.example.com/current',
        api_key: 'token',
      },
      { path, encryptSecret }
    )
    // fetchImpl 模拟标准化自定义额度接口。
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        used: 200,
        limit: 1000,
        remaining: 800,
        unit: 'credits',
      }),
    })

    await expect(
      queryQuotaAccount(account.id, {
        path,
        decryptSecret,
        fetchImpl,
        now: new Date('2026-07-22T08:00:00.000Z'),
      })
    ).resolves.toMatchObject({
      used: 200,
      limit: 1000,
      remaining: 800,
      unit: 'credits',
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://quota.example.com/current',
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } })
    )
  })

  // 验证 Base URL 与 Key 可读取 OpenAI 兼容模型，并组合相对额度路径。
  it('discovers compatible models and queries quota from a base URL', async () => {
    // path 存储本用例额度配置文件路径。
    const path = createTestPath()
    // account 存储使用 Base URL 的兼容服务账户。
    const account = saveQuotaAccount(
      {
        name: 'Compatible Gateway',
        provider: 'custom',
        models: ['manual-model'],
        base_url: 'https://gateway.example.com/v1',
        quota_path: 'account/quota',
        endpoint: '',
        quota_limit: 0,
        unit: 'credits',
        api_key: 'gateway-key',
      },
      { path, encryptSecret }
    )
    // fetchImpl 按 URL 返回模型列表或额度数据。
    const fetchImpl = vi.fn(async (url) => ({
      ok: true,
      json: async () =>
        String(url).endsWith('/models')
          ? { data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-a' }] }
          : { used: 10, limit: 50, remaining: 40, unit: 'credits' },
    }))

    await expect(
      discoverQuotaModels(
        {
          account_id: account.id,
          base_url: account.base_url,
        },
        { path, decryptSecret, fetchImpl }
      )
    ).resolves.toEqual(['model-a', 'model-b'])
    await expect(
      queryQuotaAccount(account.id, {
        path,
        decryptSecret,
        fetchImpl,
        now: new Date('2026-07-22T08:00:00.000Z'),
      })
    ).resolves.toMatchObject({ used: 10, limit: 50, remaining: 40 })
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'https://gateway.example.com/v1/models',
      'https://gateway.example.com/v1/account/quota',
    ])
  })

  // 验证删除账户后配置列表不再包含该记录。
  it('deletes a quota account', () => {
    // path 存储本用例额度配置文件路径。
    const path = createTestPath()
    // account 存储待删除账户。
    const account = saveQuotaAccount(
      {
        name: 'Anthropic',
        provider: 'anthropic',
        models: ['claude-sonnet-4-5'],
        quota_limit: 80,
        unit: 'USD',
        endpoint: '',
        api_key: 'admin-key',
      },
      { path, encryptSecret }
    )

    deleteQuotaAccount(account.id, { path })
    expect(listQuotaAccounts({ path })).toEqual([])
  })
})
