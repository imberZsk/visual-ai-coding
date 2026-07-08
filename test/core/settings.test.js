import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createClaudeOutputStyle,
  detectFormat,
  listClaudeOutputStyles,
  listDir,
  saveConfigFile,
  validateContent,
} from "../../src/core/settings.js";

// makeTempHome 创建隔离的配置根目录，供配置读写测试使用。
function makeTempHome(name) {
  // dir 存储当前测试使用的唯一临时目录。
  const dir = join(tmpdir(), `visual-aicoding-settings-${name}-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("core settings", () => {
  // 验证扩展名到编辑格式的映射保持与旧 Rust 后端一致。
  it("detects config format from extension", () => {
    expect(detectFormat("settings.json")).toBe("json");
    expect(detectFormat("config.toml")).toBe("toml");
    expect(detectFormat("CLAUDE.md")).toBe("text");
  });

  // 验证保存前会拒绝非法 JSON，避免写坏配置。
  it("rejects invalid json before saving", () => {
    expect(() => validateContent("{not json}", "json")).toThrow(/JSON 格式错误/);
  });

  // 验证保存前会拒绝非法 TOML，避免写坏配置。
  it("rejects invalid toml before saving", () => {
    expect(() => validateContent("= = =", "toml")).toThrow(/TOML 格式错误/);
  });

  // 验证保存配置会创建父目录并写入内容。
  it("saves config files after validation", () => {
    // dir 存储测试根目录。
    const dir = makeTempHome("save");
    // target 存储本次写入的配置路径。
    const target = join(dir, "nested", "config.json");

    saveConfigFile(target, "{\"ok\":true}", "json");

    expect(readFileSync(target, "utf8")).toBe("{\"ok\":true}");
    rmSync(dir, { recursive: true, force: true });
  });

  // 验证目录列表按目录优先、同类名称排序。
  it("lists directory entries with directories first", async () => {
    // dir 存储测试根目录。
    const dir = makeTempHome("list");
    mkdirSync(join(dir, "z-dir"));
    writeFileSync(join(dir, "a-file.txt"), "hello");
    mkdirSync(join(dir, "a-dir"));

    // entries 存储异步读取到的目录项列表。
    const entries = await listDir(dir);

    expect(entries.map((entry) => entry.name)).toEqual(["a-dir", "z-dir", "a-file.txt"]);
    rmSync(dir, { recursive: true, force: true });
  });

  // 验证 output style 列表同时包含内置项和自定义 Markdown。
  it("lists builtin and custom Claude output styles", async () => {
    // claudeHome 存储测试专属 Claude home。
    const claudeHome = makeTempHome("output-styles");
    // stylesDir 存储自定义 output style 目录。
    const stylesDir = join(claudeHome, "output-styles");
    mkdirSync(stylesDir);
    writeFileSync(
      join(stylesDir, "snark.md"),
      "---\nname: 毒舌\ndescription: 说话犀利但技术准确\n---\n\n保持准确。\n",
    );

    // result 存储扫描结果。
    const result = await listClaudeOutputStyles(claudeHome);

    expect(result.exists).toBe(true);
    expect(result.styles.map((style) => style.name)).toContain("default");
    expect(result.styles.map((style) => style.name)).toContain("毒舌");
    rmSync(claudeHome, { recursive: true, force: true });
  });

  // 验证创建 output style 会写出 Claude Code 可识别的 Markdown 模板。
  it("creates a Claude output style markdown file", () => {
    // claudeHome 存储测试专属 Claude home。
    const claudeHome = makeTempHome("create-style");

    // style 存储创建后的风格信息。
    const style = createClaudeOutputStyle(claudeHome, "毒舌");
    // content 存储创建后的 Markdown 文件内容。
    const content = readFileSync(join(claudeHome, "output-styles", "毒舌.md"), "utf8");

    expect(style.name).toBe("毒舌");
    expect(style.kind).toBe("custom");
    expect(content).toContain("name: 毒舌");
    rmSync(claudeHome, { recursive: true, force: true });
  });
});
