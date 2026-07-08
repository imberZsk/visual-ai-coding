// 共享 UI 原语：以 Ant Design 为底座，统一卡片、按钮、徽章、空状态与 loading 风格
import {
  Button as AntButton,
  Card as AntCard,
  Empty,
  Spin,
  Tag,
  type ButtonProps as AntButtonProps,
} from "antd";
import type { ReactNode } from "react";

// LoadingIcon 渲染与 visual-worktree 一致的 Ant Design Spin 加载图标。
// className 为调用方传入的额外尺寸或颜色样式。
export function LoadingIcon({ className = "" }: { className?: string }) {
  return (
    <span
      data-testid="loading-icon"
      aria-hidden="true"
      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center align-middle leading-none ${className}`}
    >
      <Spin size="small" />
    </span>
  );
}

// PageShell 提供页面内容的统一宽度、内边距和垂直节奏。
export function PageShell({
  children,
  className = "",
}: {
  children: ReactNode; // children 存储页面主体内容。
  className?: string; // className 存储调用方需要追加的布局类名。
}) {
  // shellClassName 存储页面外壳的最终样式类。
  const shellClassName = [
    "mx-auto min-h-full w-full max-w-7xl px-6 py-6 lg:px-8",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={shellClassName}>{children}</div>;
}

// 卡片容器：复用 Ant Design Card 的边框、内边距与暗色主题适配。
export function Card({
  children,
  className = "",
}: {
  children: ReactNode; // 卡片内容
  className?: string; // 额外样式类
}) {
  // cardClassName 存储项目统一卡片样式和调用方样式。
  const cardClassName = ["border-border bg-panel shadow-none", className]
    .filter(Boolean)
    .join(" ");

  return <AntCard size="small" className={cardClassName}>{children}</AntCard>;
}

// 页面标题区：主标题 + 可选副标题，统一页面顶部留白
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string; // 页面主标题
  subtitle?: string; // 副标题说明
  actions?: ReactNode; // 右侧操作区（按钮等）
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold text-text-main">{title}</h1>
        {subtitle && (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// 区块小标题：用于卡片内分段
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-sm font-semibold text-text-main">{children}</div>
  );
}

// 按钮变体类型：primary 主操作 / default 次操作 / ghost 文本按钮
type ButtonVariant = "primary" | "default" | "ghost";

// getAntButtonType 将项目历史按钮变体映射为 Ant Design 按钮类型。
// variant 参数存储项目内按钮变体。
function getAntButtonType(variant: ButtonVariant): AntButtonProps["type"] {
  if (variant === "primary") {
    return "primary";
  }

  if (variant === "ghost") {
    return "text";
  }

  return "default";
}

// 通用按钮：统一使用 Ant Design Button，保留项目既有 Button API。
export function Button({
  children,
  onClick,
  variant = "default",
  disabled = false,
  loading = false,
  className = "",
  title,
  ariaLabel,
}: {
  children: ReactNode; // 按钮文本
  onClick?: () => void; // 点击回调
  variant?: ButtonVariant; // 视觉变体
  disabled?: boolean; // 是否禁用
  loading?: boolean; // 是否展示图标式加载状态
  className?: string; // 额外样式
  title?: string; // 悬浮提示
  ariaLabel?: string; // 可访问名称，供图标按钮等无可见文字的按钮使用
}) {
  // buttonType 存储映射后的 Ant Design 按钮类型。
  const buttonType = getAntButtonType(variant);
  // buttonClassName 存储调用方样式与 Ant Design loading 类，避免内置 loading 动画污染按钮无障碍名称。
  const buttonClassName = [className, loading ? "ant-btn-loading" : ""]
    .filter(Boolean)
    .join(" ");
  // loadingIcon 存储 loading 状态下展示的 Ant Design Spin 图标。
  const loadingIcon = loading ? <LoadingIcon /> : undefined;

  return (
    <AntButton
      type={buttonType}
      autoInsertSpace={false}
      onClick={onClick}
      disabled={disabled || loading}
      icon={loadingIcon}
      aria-busy={loading}
      aria-label={ariaLabel}
      title={title}
      className={buttonClassName}
    >
      {children}
    </AntButton>
  );
}

// 徽章：复用 Ant Design Tag 展示状态/标签，支持项目语义色调。
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode; // 徽章文本
  tone?: "neutral" | "success" | "warning" | "info"; // 语义色调
}) {
  // toneColor 存储 Ant Design Tag 的语义色。
  const toneColor =
    tone === "success"
      ? "success"
      : tone === "warning"
      ? "warning"
      : tone === "info"
      ? "processing"
      : "default";

  return <Tag color={toneColor} className="m-0">{children}</Tag>;
}

// 空状态占位：复用 Ant Design Empty，统一列表/数据为空时的视觉表达。
export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-panel-soft/45 py-8">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} />
    </div>
  );
}
