import { describe, expect, it } from "vitest";
import {
  binForTool,
  buildPackageSpec,
  buildUpdateToolArgs,
  buildVoltaUpdateToolArgs,
  installManagerForToolPath,
  npmPackageForTool,
  parseLatestVersionStdout,
  parseToolVersionStdout,
  releaseNotesUrlForTool,
} from "../../src/core/system.js";

describe("core system", () => {
  // 验证工具标识映射到正确 npm 包名。
  it("maps tool ids to npm package names", () => {
    expect(npmPackageForTool("claude")).toBe("@anthropic-ai/claude-code");
    expect(npmPackageForTool("codex")).toBe("@openai/codex");
  });

  // 验证工具标识映射到对应的官方更新内容页面。
  it("maps tool ids to official release notes", () => {
    expect(releaseNotesUrlForTool("claude")).toBe(
      "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
    );
    expect(releaseNotesUrlForTool("codex")).toBe("https://github.com/openai/codex/releases");
    expect(releaseNotesUrlForTool("unknown")).toBe("");
  });

  // 验证工具标识映射到正确 CLI 名称。
  it("maps tool ids to CLI binary names", () => {
    expect(binForTool("claude")).toBe("claude");
    expect(binForTool("codex")).toBe("codex");
  });

  // 验证 npm view 输出会去除换行。
  it("trims npm version output", () => {
    expect(parseLatestVersionStdout("2.1.196\n")).toBe("2.1.196");
  });

  // 验证 CLI 版本输出可提取真实 semver，供更新后校验使用。
  it("extracts versions from CLI stdout", () => {
    expect(parseToolVersionStdout("2.1.177 (Claude Code)")).toBe("2.1.177");
    expect(parseToolVersionStdout("codex-cli 0.143.0")).toBe("0.143.0");
  });

  // 验证包规格会显式携带目标版本，避免重复安装旧版本。
  it("builds versioned package specs", () => {
    expect(buildPackageSpec("@anthropic-ai/claude-code", "2.1.204")).toBe(
      "@anthropic-ai/claude-code@2.1.204",
    );
    expect(buildPackageSpec("@openai/codex")).toBe("@openai/codex@latest");
  });

  // 验证全局安装参数使用官方 registry 和精确目标版本。
  it("builds global npm update args", () => {
    expect(buildUpdateToolArgs("@anthropic-ai/claude-code", "2.1.204")).toEqual([
      "install",
      "-g",
      "@anthropic-ai/claude-code@2.1.204",
      "--registry=https://registry.npmjs.org",
    ]);
  });

  // 验证 Volta 安装参数使用精确目标版本，确保 Volta shim 会指向最新版。
  it("builds Volta update args", () => {
    expect(buildVoltaUpdateToolArgs("@anthropic-ai/claude-code", "2.1.204")).toEqual([
      "install",
      "@anthropic-ai/claude-code@2.1.204",
    ]);
  });

  // 验证 Volta shim 路径会走 Volta 更新，普通 Node 全局路径继续走 npm。
  it("detects update manager from CLI path", () => {
    expect(installManagerForToolPath("/Users/test/.volta/bin/claude")).toBe("volta");
    expect(installManagerForToolPath("/Users/test/.nvm/versions/node/v24/bin/codex")).toBe(
      "npm",
    );
  });
});
