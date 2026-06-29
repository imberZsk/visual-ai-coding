// 主题应用 hook：根据偏好中的 theme 设置 html.dark 类，支持跟随系统
import { useEffect } from "react";
import { useAppStore } from "../store";

// 将主题模式应用到 document.documentElement
// mode 为 light / dark / system
function applyTheme(mode: string) {
  // root 为 html 元素，通过增删 dark 类驱动 CSS 变量切换
  const root = document.documentElement;
  // 计算实际是否暗色：system 时读取系统偏好
  const isDark =
    mode === "dark" ||
    (mode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

// 监听偏好主题变化并应用；system 模式下同步监听系统主题切换
export function useTheme() {
  // theme 为当前主题模式
  const theme = useAppStore((s) => s.prefs?.theme ?? "system");

  useEffect(() => {
    // 立即应用当前主题
    applyTheme(theme);

    // 仅 system 模式需要监听系统主题变化
    if (theme !== "system") return;

    // mql 为系统暗色偏好媒体查询
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    // 系统主题变化时重新应用
    const handler = () => applyTheme("system");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);
}
