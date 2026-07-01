import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("initial theme paint", () => {
  // 验证首屏 HTML 在 React 加载前就有暗色兜底，避免深色主题用户启动时先看到白屏。
  it("applies a dark-safe theme before the React entry script runs", () => {
    // htmlPath 存储入口 HTML 文件路径。
    const htmlPath = resolve(process.cwd(), "index.html");
    // html 存储入口 HTML 文本，用于检查首屏同步主题逻辑。
    const html = readFileSync(htmlPath, "utf8");
    // themeScriptIndex 存储首屏主题脚本的位置。
    const themeScriptIndex = html.indexOf("visual-aicoding.theme");
    // reactEntryIndex 存储 React 入口脚本的位置。
    const reactEntryIndex = html.indexOf('/src/main.tsx');

    expect(html).toContain('<html lang="zh-CN" class="dark">');
    expect(html).toContain("background: rgb(20 20 20)");
    expect(themeScriptIndex).toBeGreaterThanOrEqual(0);
    expect(reactEntryIndex).toBeGreaterThan(themeScriptIndex);
  });

  // 验证后端偏好加载后会同步到前端缓存，下一次启动才能在首屏脚本里立即命中主题。
  it("mirrors the loaded preference theme to startup cache", () => {
    // hookPath 存储主题 hook 文件路径。
    const hookPath = resolve(process.cwd(), "src/hooks/useTheme.ts");
    // hookSource 存储主题 hook 源码，用于检查偏好缓存同步调用。
    const hookSource = readFileSync(hookPath, "utf8");

    expect(hookSource).toContain("cacheThemePreference(theme)");
  });
});
