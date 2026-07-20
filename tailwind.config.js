/** Tailwind 配置：启用 class 策略的暗色主题，扫描所有前端源码 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // 主题语义色，通过 CSS 变量驱动，支持运行时切换
        surface: "rgb(var(--surface) / <alpha-value>)",
        sidebar: "rgb(var(--sidebar) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        "panel-soft": "rgb(var(--panel-soft) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        "border-strong": "rgb(var(--border-strong) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "text-main": "rgb(var(--text-main) / <alpha-value>)",
        "text-muted": "rgb(var(--text-muted) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
