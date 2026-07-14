import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ClaudePage from './ClaudePage'
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

describe('ClaudePage Claude 配置页', () => {
  // 验证页面渲染标题，并为 settings.json 使用可视化编辑器、其余文件用原始编辑器。
  it('渲染标题并按文件类型选择编辑器', () => {
    render(<ClaudePage />)

    expect(
      screen.getByRole('heading', { name: 'Claude Code' })
    ).toBeInTheDocument()
    // claude-settings 应走可视化编辑器。
    expect(
      screen.getByTestId('visual-editor-claude-settings')
    ).toBeInTheDocument()
    // 其余配置文件走原始文本编辑器。
    expect(screen.getByTestId('config-editor-claude-md')).toBeInTheDocument()
  })
})
