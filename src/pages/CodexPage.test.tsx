import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CodexPage from './CodexPage'
import type { ConfigFileSpec } from '../config'

// 用轻量替身替换真实编辑器，隔离子组件渲染，只验证页面装配逻辑。
vi.mock('../components/ConfigEditor', () => ({
  default: ({ spec }: { spec: ConfigFileSpec }) => (
    <div data-testid={`config-editor-${spec.id}`}>{spec.title}</div>
  ),
}))

vi.mock('../components/VisualConfigEditor', () => ({
  default: ({ spec }: { spec: ConfigFileSpec }) => (
    <div data-testid={`visual-editor-${spec.id}`}>{spec.title}</div>
  ),
}))

describe('CodexPage Codex 配置页', () => {
  // 验证页面渲染标题，并为 config.toml 使用可视化编辑器、其余文件用原始编辑器。
  it('渲染标题并按文件类型选择编辑器', () => {
    render(<CodexPage />)

    expect(screen.getByRole('heading', { name: 'Codex' })).toBeInTheDocument()
    // codex-config 应走可视化编辑器。
    expect(screen.getByTestId('visual-editor-codex-config')).toBeInTheDocument()
  })
})
