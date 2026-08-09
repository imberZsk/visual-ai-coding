// 前端入口：挂载 React 应用、Ant Design 主题容器并加载全局样式
import { useEffect, useState } from 'react'
import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useAppStore } from './store'
import './styles/index.css'

// STARTUP_THEME_STORAGE_KEY 存储首屏脚本与 useTheme 共用的主题缓存 key。
const STARTUP_THEME_STORAGE_KEY = 'visual-aicoding.theme'

// ANTD_MESSAGE_CENTER_TOP 存储全局 Ant Design toast 的垂直中心位置；水平方向由 message 默认居中。
const ANTD_MESSAGE_CENTER_TOP = '50%'

// getStartupThemePreference 读取首屏缓存主题，供偏好加载前的 Ant Design Provider 使用。
function getStartupThemePreference(): string {
  try {
    // cachedTheme 存储上次偏好加载后写入 localStorage 的主题模式。
    const cachedTheme = window.localStorage.getItem(STARTUP_THEME_STORAGE_KEY)
    if (
      cachedTheme === 'light' ||
      cachedTheme === 'dark' ||
      cachedTheme === 'system'
    ) {
      return cachedTheme
    }
  } catch {
    // WHY：localStorage 不可用时仍需要渲染 Provider，使用暗色兜底贴合入口 HTML。
  }

  return 'dark'
}

// getSystemDarkPreference 读取当前系统暗色偏好，供 Ant Design system 主题同步使用。
function getSystemDarkPreference(): boolean {
  if (typeof window.matchMedia !== 'function') {
    // 测试或极端运行环境没有 matchMedia 时默认使用亮色，避免入口渲染崩溃。
    return false
  }

  // mediaQuery 存储系统暗色模式媒体查询对象。
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  return mediaQuery.matches
}

// RootProviders 渲染 Ant Design 全局配置，让基础组件与 visual-worktree 保持一致。
function RootProviders() {
  // themeMode 存储用户偏好的主题模式，system 时跟随系统媒体查询。
  const themeMode = useAppStore(
    (state) => state.prefs?.theme || getStartupThemePreference()
  )
  // systemDark 标记当前系统是否处于暗色模式。
  const [systemDark, setSystemDark] = useState(getSystemDarkPreference)
  // isDark 存储 Ant Design 实际使用的暗色状态。
  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemDark)
  // algorithm 存储 Ant Design 当前主题算法。
  const algorithm = isDark
    ? antdTheme.darkAlgorithm
    : antdTheme.defaultAlgorithm
  // themeTokens 存储与项目 CSS 变量对齐的 Ant Design 语义主题 token。
  const themeTokens = {
    colorPrimary: '#1677ff',
    borderRadius: 6,
    controlHeight: 32,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  }
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      // 测试或极端运行环境没有 matchMedia 时无需监听系统主题变化。
      return
    }

    // mediaQuery 存储系统暗色模式媒体查询对象。
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    // handleSystemThemeChange 存储系统主题变更处理函数，用于刷新 Ant Design 主题算法。
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches)
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange)
    return () =>
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm,
        token: themeTokens,
      }}
    >
      <AntApp message={{ top: ANTD_MESSAGE_CENTER_TOP }}>
        <App />
      </AntApp>
    </ConfigProvider>
  )
}

// rootElement 存储 React 应用挂载的 DOM 根节点。
const rootElement = document.getElementById('root') as HTMLElement

// 挂载根组件到 #root 节点。
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RootProviders />
  </React.StrictMode>
)
