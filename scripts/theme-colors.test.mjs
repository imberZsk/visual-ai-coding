import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("theme colors", () => {
  // 验证主题语义色切换为黑白石墨 UI 需要的浅色与默认深色 token。
  it("uses graphite monochrome light and dark theme tokens", () => {
    // cssPath 存储全局样式文件路径。
    const cssPath = resolve(process.cwd(), "src/styles/index.css");
    // css 存储全局样式内容，用于检查主题变量。
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain("--surface: 246 246 244;");
    expect(css).toContain("--sidebar: 250 250 249;");
    expect(css).toContain("--panel: 252 252 250;");
    expect(css).toContain("--panel-soft: 238 238 235;");
    expect(css).toContain("--accent: 82 82 78;");
    expect(css).toContain("--text-main: 24 24 23;");
    expect(css).toContain("--text-muted: 91 91 87;");
    expect(css).toContain("--success: 22 163 74;");
    expect(css).toContain("--warning: 202 138 4;");
    expect(css).toContain("--danger: 220 38 38;");
    expect(css).toContain("--control-on: 22 119 255;");
    expect(css).toContain("--control-on-hover: 64 150 255;");
    expect(css).not.toContain("--panel: 255 255 255;");
    expect(css).not.toContain("--success: 92 125 92;");
    expect(css).not.toContain("--warning: 163 116 58;");
    expect(css).not.toContain("--danger: 178 86 82;");
    expect(css).toContain("--surface: 18 18 17;");
    expect(css).toContain("--sidebar: 12 12 12;");
    expect(css).toContain("--panel: 28 28 27;");
    expect(css).toContain("--panel-soft: 38 38 36;");
    expect(css).toContain("--accent: 212 212 208;");
    expect(css).toContain("--text-main: 239 239 235;");
    expect(css).toContain("--text-muted: 168 168 160;");
    expect(css).toContain("--success: 34 197 94;");
    expect(css).toContain("--warning: 234 179 8;");
    expect(css).toContain("--danger: 239 68 68;");
    expect(css).toContain(".ant-app .ant-switch.ant-switch-checked");
    expect(css).toContain("background: rgb(var(--control-on));");
    expect(css).toContain(".dark .ant-app .ant-btn-default:not(:disabled):not(.ant-btn-disabled):hover");
  });

  // 验证 Ant Design token 也避开纯白容器，避免组件层和 CSS 变量出现色彩断层。
  it("keeps Ant Design light containers off pure white", () => {
    // entryPath 存储 React 入口文件路径。
    const entryPath = resolve(process.cwd(), "src/main.tsx");
    // entrySource 存储 React 入口源码，用于检查 Ant Design 主题 token。
    const entrySource = readFileSync(entryPath, "utf8");

    expect(entrySource).toContain('colorBgContainer: isDark ? "#1c1c1b" : "#fcfcfa"');
    expect(entrySource).toContain('colorBgElevated: isDark ? "#262624" : "#fcfcfa"');
    expect(entrySource).toContain('colorSuccess: isDark ? "#22c55e" : "#16a34a"');
    expect(entrySource).toContain('colorWarning: isDark ? "#eab308" : "#ca8a04"');
    expect(entrySource).toContain('colorError: isDark ? "#ef4444" : "#dc2626"');
    expect(entrySource).toContain('defaultHoverBg: isDark ? "#262624" : "#eeeceb"');
    expect(entrySource).toContain('defaultHoverColor: isDark ? "#efefeb" : "#181817"');
    expect(entrySource).not.toContain('colorBgContainer: isDark ? "#1c1c1b" : "#ffffff"');
    expect(entrySource).not.toContain('colorBgElevated: isDark ? "#262624" : "#ffffff"');
  });
});
