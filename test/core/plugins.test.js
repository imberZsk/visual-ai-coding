import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as TOML from "smol-toml";
import {
  buildClaudePluginToggleArgs,
  buildCodexFallbackResult,
  buildUpdateToolArgs,
  checkClaudePluginUpdates,
  compareVersions,
  enrichClaudeAvailableVersions,
  enrichCodexAvailableVersions,
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

  // 验证 Claude CLI 的 available 不含已安装插件时，会从 marketplace 清单补齐最新版本。
  it("fills installed Claude plugin versions from the marketplace manifest", () => {
    // claudeHome 存储测试专属 Claude home。
    const claudeHome = join(tmpdir(), `visual-aicoding-claude-${process.pid}-${Date.now()}`);
    // marketplaceDir 存储测试 marketplace 标准清单目录。
    const marketplaceDir = join(
      claudeHome,
      "plugins",
      "marketplaces",
      "cyt-plugins",
      ".claude-plugin",
    );
    mkdirSync(marketplaceDir, { recursive: true });
    writeFileSync(
      join(marketplaceDir, "marketplace.json"),
      JSON.stringify({ plugins: [{ name: "cyt-dev-enhanced", version: "2.8.1" }] }),
    );

    // result 存储模拟 CLI 缺失 available 版本的统一结果。
    const result = enrichClaudeAvailableVersions(claudeHome, {
      tool: "claude",
      raw_output: "{}",
      diagnostics: "",
      plugins: [
        {
          id: "cyt-dev-enhanced@cyt-plugins",
          name: "cyt-dev-enhanced",
          marketplace: "cyt-plugins",
          current_version: "2.6.0",
          available_version: "",
          scope: "user",
          enabled: true,
          install_path: "/tmp/cyt-dev-enhanced",
          last_updated: "",
          update_status: "unknown",
        },
      ],
    });

    expect(result.plugins[0].available_version).toBe("2.8.1");
    expect(result.plugins[0].update_status).toBe("newer");
    rmSync(claudeHome, { recursive: true, force: true });
  });

  // 验证真实检查会先刷新 marketplace，避免本地清单滞后于远程版本。
  it("refreshes Claude marketplaces before checking available plugin versions", async () => {
    // claudeHome 存储测试专属 Claude home。
    const claudeHome = join(tmpdir(), `visual-aicoding-claude-check-${process.pid}-${Date.now()}`);
    mkdirSync(claudeHome, { recursive: true });
    // calls 存储命令执行顺序与参数。
    const calls = [];
    // commandRunner 模拟 Claude CLI，并为插件列表返回稳定 JSON。
    const commandRunner = async (bin, args, homeEnvKey, homeDir) => {
      calls.push({ bin, args, homeEnvKey, homeDir });
      return args.includes("list")
        ? { stdout: JSON.stringify({ installed: [], available: [] }), stderr: "" }
        : { stdout: "marketplace updated", stderr: "" };
    };

    await checkClaudePluginUpdates(claudeHome, commandRunner);

    expect(calls.map((call) => call.args)).toEqual([
      ["plugin", "marketplace", "update"],
      ["plugin", "list", "--json", "--available"],
    ]);
    rmSync(claudeHome, { recursive: true, force: true });
  });

  // 验证 marketplace 暂时刷新失败时仍可返回本地缓存结果，并向界面提供诊断原因。
  it("falls back to cached Claude marketplace data when refresh fails", async () => {
    // claudeHome 存储测试专属 Claude home。
    const claudeHome = join(tmpdir(), `visual-aicoding-claude-fallback-${process.pid}-${Date.now()}`);
    mkdirSync(claudeHome, { recursive: true });
    // callCount 存储当前模拟命令的调用次数，用于区分刷新与列表查询。
    let callCount = 0;
    // commandRunner 模拟 marketplace 网络失败后插件列表仍能正常读取。
    const commandRunner = async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error("network unavailable");
      }
      return { stdout: JSON.stringify({ installed: [], available: [] }), stderr: "" };
    };

    // result 存储降级后的插件检查结果。
    const result = await checkClaudePluginUpdates(claudeHome, commandRunner);

    expect(callCount).toBe(2);
    expect(result.diagnostics).toContain("network unavailable");
    rmSync(claudeHome, { recursive: true, force: true });
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

  // 验证新版 Codex CLI 的 pluginId/marketplaceName 字段仍能被正确解析。
  it("parses current Codex plugin field names", () => {
    // stdout 存储新版 Codex CLI 返回的 JSON 样例。
    const stdout = JSON.stringify({
      installed: [
        {
          pluginId: "superpowers@superpowers-dev",
          name: "superpowers",
          marketplaceName: "superpowers-dev",
          version: "6.0.3",
          enabled: false,
          source: { source: "git", url: "/tmp/superpowers-marketplace" },
        },
      ],
      available: [],
    });

    // result 存储解析后的统一插件结果。
    const result = parseCodexPluginUpdateCheckOutput(stdout, "");

    expect(result.plugins[0].id).toBe("superpowers@superpowers-dev");
    expect(result.plugins[0].marketplace).toBe("superpowers-dev");
    expect(result.plugins[0].current_version).toBe("6.0.3");
    expect(result.plugins[0].install_path).toBe("/tmp/superpowers-marketplace");
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

  // 验证 Codex CLI fallback 时会沿 config.toml marketplace source 补齐 bundled 插件版本。
  it("fills Codex bundled plugin versions from configured marketplace sources", () => {
    // codexHome 存储测试专属 Codex home。
    const codexHome = makeTempCodexHome();
    // marketplaceRoot 存储模拟 bundled marketplace 根目录。
    const marketplaceRoot = join(codexHome, "bundled-marketplace");
    // marketplaceManifestDir 存储 Codex marketplace 清单目录。
    const marketplaceManifestDir = join(marketplaceRoot, ".agents", "plugins");
    // pluginManifestDir 存储 browser 插件 manifest 目录。
    const pluginManifestDir = join(
      marketplaceRoot,
      "plugins",
      "browser",
      ".codex-plugin",
    );
    mkdirSync(marketplaceManifestDir, { recursive: true });
    mkdirSync(pluginManifestDir, { recursive: true });
    writeFileSync(
      join(marketplaceManifestDir, "marketplace.json"),
      JSON.stringify({
        plugins: [{ name: "browser", source: { source: "local", path: "./plugins/browser" } }],
      }),
    );
    writeFileSync(
      join(pluginManifestDir, "plugin.json"),
      JSON.stringify({ name: "browser", version: "26.707.51957" }),
    );
    writeFileSync(
      join(codexHome, "config.toml"),
      TOML.stringify({
        marketplaces: {
          "openai-bundled": {
            source_type: "local",
            source: marketplaceRoot,
          },
        },
      }),
    );

    // result 存储模拟 CLI fallback 中缺失可用版本的 browser 插件。
    const result = enrichCodexAvailableVersions(codexHome, {
      tool: "codex",
      raw_output: "",
      diagnostics: "snapshot failed",
      plugins: [
        {
          id: "browser@openai-bundled",
          name: "browser",
          marketplace: "openai-bundled",
          current_version: "26.707.51957",
          available_version: "",
          scope: "",
          enabled: true,
          install_path: "/tmp/browser",
          last_updated: "",
          update_status: "unknown",
        },
      ],
    });

    expect(result.plugins[0].available_version).toBe("26.707.51957");
    expect(result.plugins[0].update_status).toBe("same");
    rmSync(codexHome, { recursive: true, force: true });
  });

  // 验证 Git marketplace 使用 source.url 指向仓库根目录时可读取 Codex manifest 版本。
  it("fills Codex Git marketplace versions from source url", () => {
    // codexHome 存储测试专属 Codex home。
    const codexHome = makeTempCodexHome();
    // marketplaceRoot 存储 Codex Git marketplace 的标准快照目录。
    const marketplaceRoot = join(codexHome, ".tmp", "marketplaces", "superpowers-dev");
    // marketplaceManifestDir 存储 .agents marketplace 清单目录。
    const marketplaceManifestDir = join(marketplaceRoot, ".agents", "plugins");
    // pluginManifestDir 存储仓库根目录的 Codex 插件 manifest 目录。
    const pluginManifestDir = join(marketplaceRoot, ".codex-plugin");
    mkdirSync(marketplaceManifestDir, { recursive: true });
    mkdirSync(pluginManifestDir, { recursive: true });
    // cachedInstallPath 存储模拟的 Codex 具体版本安装缓存目录。
    const cachedInstallPath = join(
      codexHome,
      "plugins",
      "cache",
      "superpowers-dev",
      "superpowers",
      "6.0.3",
    );
    mkdirSync(cachedInstallPath, { recursive: true });
    writeFileSync(
      join(marketplaceManifestDir, "marketplace.json"),
      JSON.stringify({
        plugins: [{ name: "superpowers", source: { source: "url", url: "./" } }],
      }),
    );
    writeFileSync(
      join(pluginManifestDir, "plugin.json"),
      JSON.stringify({ name: "superpowers", version: "6.1.1" }),
    );

    // result 存储 Git marketplace 补齐前的插件版本状态。
    const result = enrichCodexAvailableVersions(
      codexHome,
      {
        tool: "codex",
        raw_output: "",
        diagnostics: "",
        plugins: [
          {
            id: "superpowers@superpowers-dev",
            name: "superpowers",
            marketplace: "superpowers-dev",
            current_version: "6.0.3",
            available_version: "",
            scope: "",
            enabled: false,
            install_path: "",
            last_updated: "",
            update_status: "unknown",
          },
        ],
      },
      {
        marketplaces: {
          "superpowers-dev": {
            source_type: "git",
            source: "https://github.com/obra/superpowers.git",
          },
        },
      },
    );

    expect(result.plugins[0].available_version).toBe("6.1.1");
    expect(result.plugins[0].update_status).toBe("newer");
    expect(result.plugins[0].install_path).toBe(cachedInstallPath);
    expect(result.plugins[0].last_updated).not.toBe("");
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
