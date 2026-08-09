# 样式规范

## 样式归属

- `src/styles/index.css` 只保留主题语义变量、基础重置、跨页 Ant Design 规则和真正共享的可视化配置规则。
- 侧栏或页面专用样式放在相邻 `ComponentName.css` / `PageName.css`，由对应 TSX 显式导入。
- 页面专用选择器必须绑定业务根 class，禁止在全局 CSS 无边界覆盖所有 antd 内部 DOM。
- 多处复用的间距、颜色和稳定尺寸使用语义 CSS 变量或共享原语；布局间距遵循 `ui-standards.md` 的 4px 梯度。
- 侧栏宽度、导航行高、图标尺寸和字体层级属于设计基础，必须使用 `ui-standards.md` 中的统一数值；页面不得自行覆盖或复制另一套尺寸。

## Tailwind 边界

- Tailwind 可用于简单的 flex/grid、文本和标准间距；颜色只使用 `bg-surface`、`bg-panel`、`text-text-muted`、`border-border` 等已定义语义类。
- 禁止在业务组件中新增固定色类、任意值颜色、与规范不符的任意间距，也不通过过长 className 模拟页面级样式表。
- 同一组件存在多个相关样式或需响应式、状态选择器时，迁移到相邻 CSS 模块。

## JSX 行内样式边界

- 业务组件默认禁止 `style={{ ... }}`、`styles={{ ... }}` 和通过 `*Props` 传入固定 style。固定布局、尺寸、间距、字号、颜色、背景、边框、圆角、阴影和滚动规则必须进入相邻 CSS。
- `width: "100%"`、`marginBottom: 0` 和 `color: token.colorTextSecondary` 也属于固定视觉规则，不能因代码短就留在 JSX。
- antd 的 `block`、`danger`、`type`、`size`、`status`、`Typography type` 和语义 `Tag color` 属于组件 API，可以使用。
- 唯一例外是运行时才能确定且无法由 class/CSS 自定义属性表达的数据驱动几何值；使用时必须注释数据来源和不能用 CSS 的原因，不得夹带固定间距或颜色。

## 颜色与覆盖

- `src/main.tsx` 集中定义 Ant Design 运行时主题色，CSS 使用 `src/styles/index.css` 中的语义变量；业务页面不散落 hex/rgb/hsl 色值。
- 明暗主题都必须保持主文本、弱化文本、边界、选中态和语义状态的可读性，不为某一主题单独写死色值。
- 不把 `!important` 作为默认方案。覆盖 antd 内部结构时必须限定业务根 class，并说明 DOM 或优先级原因。

## 完成前检查

1. 搜索本次组件中的 `style=`、`styles=`、裸色值和非规范布局间距。
2. 确认页面 CSS 已由业务根 class 限定，专用规则没有回流全局 CSS。
3. 运行格式检查、相关测试、完整测试、构建和无头 E2E。
4. 生成关键页面的深浅色截图，并按 `ui-standards.md` 逐张人工检查。
