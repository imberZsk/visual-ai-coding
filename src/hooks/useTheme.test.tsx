import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTheme } from './useTheme'

// storeState 存储测试中模拟的偏好加载状态。
let storeState: { prefs: { theme: string } | null }

vi.mock('../store', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

// ThemeHarness 用于在测试组件生命周期中挂载 useTheme。
function ThemeHarness() {
  useTheme()
  return null
}

// installLightSystemPreference 安装浅色系统偏好的 matchMedia mock。
function installLightSystemPreference() {
  // matchMediaMock 存储模拟的系统主题查询函数。
  const matchMediaMock = vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))

  vi.stubGlobal('matchMedia', matchMediaMock)
}

describe('useTheme', () => {
  beforeEach(() => {
    // prefs 为 null 表示后端偏好尚未加载完成。
    storeState = { prefs: null }
    document.documentElement.className = 'dark'
    window.localStorage.clear()
    installLightSystemPreference()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.documentElement.className = ''
    window.localStorage.clear()
  })

  // 验证后端偏好还没返回时不覆盖 index.html 的首屏暗色类，避免暗色用户先闪白再变暗。
  it('keeps the bootstrapped dark class while preferences are still loading', () => {
    render(<ThemeHarness />)

    expect(document.documentElement).toHaveClass('dark')
  })

  // 验证加载完成的主题偏好会写入前端缓存，供下次启动首屏脚本同步读取。
  it('caches the loaded theme preference for the next startup paint', () => {
    // storeState 存储已加载的深色主题偏好。
    storeState = { prefs: { theme: 'dark' } }

    render(<ThemeHarness />)

    expect(window.localStorage.getItem('visual-aicoding.theme')).toBe('dark')
  })

  // 验证浅色主题会移除 html.dark 类并把 colorScheme 设为 light。
  it('removes the dark class for the light theme', () => {
    // storeState 存储浅色主题偏好。
    storeState = { prefs: { theme: 'light' } }

    render(<ThemeHarness />)

    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  // 验证 system 模式下会读取系统偏好；系统为暗色时应加上 dark 类。
  it('applies dark when system prefers dark under system mode', () => {
    // matchMediaMock 存储返回暗色系统偏好的查询函数。
    const matchMediaMock = vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    vi.stubGlobal('matchMedia', matchMediaMock)
    // storeState 存储跟随系统主题偏好。
    storeState = { prefs: { theme: 'system' } }

    render(<ThemeHarness />)

    expect(document.documentElement).toHaveClass('dark')
  })

  // 验证 system 模式会注册系统主题变化监听，卸载时移除，且变化时重新应用主题。
  it('subscribes to system theme changes under system mode', () => {
    // changeHandler 存储组件注册的系统主题变化回调。
    let changeHandler: (() => void) | undefined
    // addEventListenerMock 存储捕获 change 回调的替身。
    const addEventListenerMock = vi.fn(
      (_event: string, handler: () => void) => {
        changeHandler = handler
      }
    )
    // removeEventListenerMock 存储卸载时移除监听的替身。
    const removeEventListenerMock = vi.fn()
    // matchesRef 存储可变的系统暗色偏好状态，供回调触发后读取。
    const matchesRef = { current: false }
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        get matches() {
          return matchesRef.current
        },
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock,
      }))
    )
    storeState = { prefs: { theme: 'system' } }

    // rendered 存储渲染结果，供后续卸载验证移除监听。
    const rendered = render(<ThemeHarness />)
    expect(addEventListenerMock).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    )

    // 模拟系统切换到暗色后触发回调，应重新应用 dark 类。
    matchesRef.current = true
    changeHandler?.()
    expect(document.documentElement).toHaveClass('dark')

    rendered.unmount()
    expect(removeEventListenerMock).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    )
  })

  // 验证 localStorage 写入抛错时不影响主题应用，只是丢失下次启动缓存。
  it('keeps applying theme when localStorage write throws', () => {
    // storeState 存储深色主题偏好。
    storeState = { prefs: { theme: 'dark' } }
    // setItem 抛错模拟 localStorage 不可用（隐私模式或配额已满）。
    const setItemSpy = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new Error('storage disabled')
      })

    // 不应抛出异常，主题仍应被应用。
    expect(() => render(<ThemeHarness />)).not.toThrow()
    expect(document.documentElement).toHaveClass('dark')

    setItemSpy.mockRestore()
  })
})
