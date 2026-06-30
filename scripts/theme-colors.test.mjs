import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("theme colors", () => {
  // 验证主题语义色整体贴近 visual-worktree 使用的 Ant Design 明暗主题。
  it("uses visual-worktree-like light and dark theme tokens", () => {
    // cssPath 存储全局样式文件路径。
    const cssPath = resolve(process.cwd(), "src/styles/index.css");
    // css 存储全局样式内容，用于检查主题变量。
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain("--surface: 255 255 255;");
    expect(css).toContain("--panel: 255 255 255;");
    expect(css).toContain("--border: 217 217 217;");
    expect(css).toContain("--accent: 22 119 255;");
    expect(css).toContain("--text-main: 0 0 0;");
    expect(css).toContain("--text-muted: 0 0 0;");
    expect(css).toContain("--surface: 20 20 20;");
    expect(css).toContain("--panel: 31 31 31;");
    expect(css).toContain("--border: 66 66 66;");
    expect(css).toContain("--text-main: 255 255 255;");
    expect(css).toContain("--text-muted: 255 255 255;");
    expect(css).toContain("--sidebar: 245 245 245;");
    expect(css).toContain("--sidebar: 24 24 24;");
  });
});
