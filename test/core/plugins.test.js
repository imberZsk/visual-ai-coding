import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as TOML from "smol-toml";
import {
  buildClaudePluginToggleArgs,
  buildCodexFallbackResult,
  buildUpdateToolArgs,
  compareVersions,
  parseClaudePluginUpdateCheckOutput,
  parseCodexPluginUpdateCheckOutput,
  setCodexPluginEnabled,
} from "../../src/core/plugins.js";

// makeTempCodexHome 创建隔离 Codex home，供 fallback 解析测试使用。
function makeTempCodexHome() {
  // dir 存储当前测试使用的唯一临时目录。
  const dir = join(tmpdir(), `visual-aicoding-codex-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("core plugins", () => {
  // 验证 semver-like 版本比较能识别可更新状态。
  it("compares semver-like versions", () => {
    expect(compareVersions("6.0.3", "6.0.4")).toBe("newer");
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe("newer");
    expect(compareVersions("1.0.0", "1.0.0-beta.1")).toBe("different");
  });

  // 验证 Claude 更新检查只解析 stdout 中的 JSON，并保留 stderr 诊断。
  it("parses Claude plugin update output without mixing stderr", () => {
    // stdout 存储 Claude CLI 返回的 JSON 样例。
    const stdout = JSON.stringify({
      installed: [
        {
          id: "superpowers@superpowers-dev",
          version: "6.0.3",
          scope: "user",
          enabled: true,
          installPath: "/tmp/superpowers",
          lastUpdated: "2026-06-29T08:10:22.693Z",
        },
      ],
      available: [{ pluginId: "superpowers@superpowers-dev", version: "6.0.4" }],
    });

    // result 存储解析后的统一插件更新结果。
    const result = parseClaudePluginUpdateCheckOutput(stdout, "warning: cached");

    expect(result.plugins[0].update_status).toBe("newer");
    expect(result.diagnostics).toBe("warning: cached");
  });

  // 验证 Codex 更新检查只解析 stdout 中的 JSON，并保留 stderr 诊断。
  it("parses Codex plugin update output without mixing stderr", () => {
    // stdout 存储 Codex CLI 返回的 JSON 样例。
    const stdout = JSON.stringify({
      installed: [
        {
          id: "browser@openai-bundled",
          name: "browser",
          marketplace: "openai-bundled",
          version: "1.0.0",
          enabled: true,
          install_path: "/tmp/browser",
          last_updated: "2026-06-29T08:10:22.693Z",
        },
      ],
      available: [{ id: "browser@openai-bundled", version: "1.1.0" }],
    });

    // result 存储解析后的统一插件更新结果。
    const result = parseCodexPluginUpdateCheckOutput(stdout, "warning: stale");

    expect(result.plugins[0].marketplace).toBe("openai-bundled");
    expect(result.plugins[0].update_status).toBe("newer");
    expect(result.diagnostics).toBe("warning: stale");
  });

  // 验证 Codex CLI 失败时可以从本地 config/cache 构造降级结果。
  it("builds Codex fallback results from local config and cache", () => {
    // codexHome 存储测试专属 Codex home。
    const codexHome = makeTempCodexHome();
    // pluginDir 存储模拟插件 manifest 目录。
    const pluginDir = join(
      codexHome,
      "plugins",
      "cache",
      "superpowers-dev",
      "superpowers",
      "6.0.3",
      ".codex-plugin",
    );
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(pluginDir, "plugin.json"),
      JSON.stringify({ name: "superpowers", version: "6.0.3" }),
    );
    writeFileSync(
      join(codexHome, "config.toml"),
      "[plugins.\"superpowers@superpowers-dev\"]\nenabled = true\n",
    );

    // result 存储 fallback 解析结果。
    const result = buildCodexFallbackResult(codexHome, "marketplace broken");

    expect(result.plugins[0].id).toBe("superpowers@superpowers-dev");
    expect(result.plugins[0].current_version).toBe("6.0.3");
    expect(result.plugins[0].update_status).toBe("unknown");
    rmSync(codexHome, { recursive: true, force: true });
  });

  // 验证全局 npm 更新参数固定使用官方 registry。
  it("builds npm update args with the official registry", () => {
    expect(buildUpdateToolArgs("@openai/codex")).toEqual([
      "install",
      "-g",
      "@openai/codex",
      "--registry=https://registry.npmjs.org",
    ]);
  });

  // 验证 Claude 插件启停参数会保留安装作用域，避免 project/local 插件被切到错误位置。
  it("builds Claude plugin enable and disable args with scope", () => {
    expect(buildClaudePluginToggleArgs("superpowers@superpowers-dev", "user", true)).toEqual([
      "plugin",
      "enable",
      "superpowers@superpowers-dev",
      "-s",
      "user",
    ]);
    expect(buildClaudePluginToggleArgs("superpowers@superpowers-dev", "project", false)).toEqual([
      "plugin",
      "disable",
      "superpowers@superpowers-dev",
      "-s",
      "project",
    ]);
  });

  // 验证 Codex 插件启停会写回已存在的 config.toml 插件表。
  it("toggles an existing Codex plugin in config.toml", () => {
    // codexHome 存储测试专属 Codex home。
    const codexHome = makeTempCodexHome();
    writeFileSync(
      join(codexHome, "config.toml"),
      "[plugins.\"browser@openai-bundled\"]\nenabled = true\n",
    );

    setCodexPluginEnabled(codexHome, "browser@openai-bundled", false);

    // nextRoot 存储切换后重新解析的 TOML 根对象。
    const nextRoot = TOML.parse(readFileSync(join(codexHome, "config.toml"), "utf8"));
    expect(nextRoot.plugins["browser@openai-bundled"].enabled).toBe(false);
    rmSync(codexHome, { recursive: true, force: true });
  });

  // 验证 Codex 插件启停能为已有安装但缺失配置的插件创建配置表。
  it("creates a Codex plugin table when toggling a missing plugin entry", () => {
    // codexHome 存储测试专属 Codex home。
    const codexHome = makeTempCodexHome();
    writeFileSync(join(codexHome, "config.toml"), "model = \"gpt-5\"\n");

    setCodexPluginEnabled(codexHome, "browser@openai-bundled", true);

    // nextRoot 存储切换后重新解析的 TOML 根对象。
    const nextRoot = TOML.parse(readFileSync(join(codexHome, "config.toml"), "utf8"));
    expect(nextRoot.plugins["browser@openai-bundled"].enabled).toBe(true);
    rmSync(codexHome, { recursive: true, force: true });
  });
});
