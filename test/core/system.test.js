import { describe, expect, it } from "vitest";
import { buildUpdateToolArgs, npmPackageForTool, parseLatestVersionStdout } from "../../src/core/system.js";

describe("core system", () => {
  // 验证工具标识映射到正确 npm 包名。
  it("maps tool ids to npm package names", () => {
    expect(npmPackageForTool("claude")).toBe("@anthropic-ai/claude-code");
    expect(npmPackageForTool("codex")).toBe("@openai/codex");
  });

  // 验证 npm view 输出会去除换行。
  it("trims npm version output", () => {
    expect(parseLatestVersionStdout("2.1.196\n")).toBe("2.1.196");
  });

  // 验证全局安装参数使用官方 registry。
  it("builds global npm update args", () => {
    expect(buildUpdateToolArgs("@anthropic-ai/claude-code")).toEqual([
      "install",
      "-g",
      "@anthropic-ai/claude-code",
      "--registry=https://registry.npmjs.org",
    ]);
  });
});
