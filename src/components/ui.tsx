// 共享 UI 原语：统一卡片、区块标题、按钮、徽章、提示等基础组件，保证全应用风格一致
import type { ReactNode } from "react";

// LoadingIcon 渲染与 visual-worktree Spin 类似的旋转加载图标。
// className 为调用方传入的额外尺寸或颜色样式。
export function LoadingIcon({ className = "" }: { className?: string }) {
  return (
    <span
      data-testid="loading-icon"
      aria-hidden="true"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

// 卡片容器：面板背景 + 边框 + 圆角，承载分组内容
export function Card({
  children,
  className = "",
}: {
  children: ReactNode; // 卡片内容
  className?: string; // 额外样式类
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-panel p-4 ${className}`}
    >
      {children}
    </div>
  );
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
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-main">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// 区块小标题：用于卡片内分段
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-sm font-medium text-text-main">{children}</div>
  );
}

// 按钮变体类型：primary 主操作 / default 次操作 / ghost 文本按钮
type ButtonVariant = "primary" | "default" | "ghost";

// 通用按钮：统一三种变体样式与禁用态
export function Button({
  children,
  onClick,
  variant = "default",
  disabled = false,
  loading = false,
  className = "",
  title,
}: {
  children: ReactNode; // 按钮文本
  onClick?: () => void; // 点击回调
  variant?: ButtonVariant; // 视觉变体
  disabled?: boolean; // 是否禁用
  loading?: boolean; // 是否展示图标式加载状态
  className?: string; // 额外样式
  title?: string; // 悬浮提示
}) {
  // base 为所有变体共用的基础样式
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  // variantClass 根据变体决定配色
  const variantClass =
    variant === "primary"
      ? "bg-accent text-white hover:opacity-90"
      : variant === "ghost"
      ? "text-text-muted hover:text-text-main hover:bg-surface"
      : "border border-border text-text-main hover:bg-surface";
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      title={title}
      className={`${base} ${variantClass} ${className}`}
    >
      {loading && <LoadingIcon />}
      {children}
    </button>
  );
}

// 徽章：展示状态/标签，支持语义色
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode; // 徽章文本
  tone?: "neutral" | "success" | "warning" | "info"; // 语义色调
}) {
  // toneClass 根据色调决定背景与文字色
  const toneClass =
    tone === "success"
      ? "bg-green-500/15 text-green-500"
      : tone === "warning"
      ? "bg-amber-500/15 text-amber-500"
      : tone === "info"
      ? "bg-accent/15 text-accent"
      : "bg-border/60 text-text-muted";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${toneClass}`}
    >
      {children}
    </span>
  );
}

// 空状态占位：列表/数据为空时展示
export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-10 text-sm text-text-muted">
      {text}
    </div>
  );
}
