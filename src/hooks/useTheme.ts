// 主题应用 hook：根据偏好中的 theme 设置 html.dark 类，支持跟随系统
import { useEffect, useLayoutEffect } from "react";
import { useAppStore } from "../store";

// STARTUP_THEME_STORAGE_KEY 存储首屏脚本读取的主题缓存 key。
const STARTUP_THEME_STORAGE_KEY = "visual-aicoding.theme";

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
  root.style.colorScheme = isDark ? "dark" : "light";
}

// 将已加载的后端主题偏好写入启动缓存，供下一次首屏同步脚本读取。
// mode 为后端偏好中的主题模式。
function cacheThemePreference(mode: string) {
  try {
    window.localStorage.setItem(STARTUP_THEME_STORAGE_KEY, mode);
  } catch {
    // WHY：localStorage 不可用不应影响当前主题应用，只会失去下一次启动的缓存命中。
  }
}

// 监听偏好主题变化并应用；system 模式下同步监听系统主题切换
export function useTheme() {
  // theme 为当前主题模式
  const theme = useAppStore((s) => s.prefs?.theme);

  useLayoutEffect(() => {
    if (!theme) return;
    // 立即应用当前主题
    applyTheme(theme);
    cacheThemePreference(theme);
  }, [theme]);

  useEffect(() => {
    if (!theme) return;
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
