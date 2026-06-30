import { describe, expect, it } from "vitest";
import { CLAUDE_SETTINGS_SCHEMA } from "./claudeSettingsSchema";
import { CODEX_CONFIG_SCHEMA } from "./codexConfigSchema";

// 该测试套件回调用于验证可视化配置 schema 是否覆盖任务要求的核心字段与敏感元数据。
describe("visual config schemas", () => {
  // 该回调用于验证 Claude settings schema 至少覆盖需求中列出的核心字段。
  it("covers required Claude settings groups and fields", () => {
    // claudePaths 存储 Claude schema 已声明的全部字段路径。
    const claudePaths = CLAUDE_SETTINGS_SCHEMA.groups.flatMap(
      // group 参数存储当前遍历到的 Claude schema 分组定义。
      (group) => group.fields.map(
        // field 参数存储当前分组中的单个字段定义。
        (field) => field.path
      )
    );

    expect(CLAUDE_SETTINGS_SCHEMA.format).toBe("json");
    expect(claudePaths).toEqual(
      expect.arrayContaining([
        "model",
        "fallbackModel",
        "effortLevel",
        "permissions.defaultMode",
        "permissions.allow",
        "permissions.deny",
        "env",
        "hooks",
        "mcpServers",
        "enabledPlugins",
        "extraKnownMarketplaces",
        "autoUpdates",
        "autoUpdatesChannel",
        "statusLine",
      ])
    );
  });

  // 该回调用于验证 Codex config schema 至少覆盖需求中列出的核心字段。
  it("covers required Codex config groups and fields", () => {
    // codexPaths 存储 Codex schema 已声明的全部字段路径。
    const codexPaths = CODEX_CONFIG_SCHEMA.groups.flatMap(
      // group 参数存储当前遍历到的 Codex schema 分组定义。
      (group) => group.fields.map(
        // field 参数存储当前分组中的单个字段定义。
        (field) => field.path
      )
    );

    expect(CODEX_CONFIG_SCHEMA.format).toBe("toml");
    expect(codexPaths).toEqual(
      expect.arrayContaining([
        "model_provider",
        "model",
        "review_model",
        "model_reasoning_effort",
        "disable_response_storage",
        "sandbox_mode",
        "approval_policy",
        "network_access",
        "notify",
        "features",
        "desktop",
        "tui",
        "mcp_servers",
        "plugins",
        "marketplaces",
        "projects",
      ])
    );
  });

  // 该回调用于验证敏感对象字段会被 schema 显式标记，便于后续 UI 做默认脱敏。
  it("marks sensitive object fields", () => {
    // claudeFields 存储 Claude schema 中展平后的全部字段定义。
    const claudeFields = CLAUDE_SETTINGS_SCHEMA.groups.flatMap(
      // group 参数存储当前遍历到的 Claude schema 分组定义。
      (group) => group.fields
    );
    // envField 存储路径为 env 的字段定义，用于校验敏感标记。
    const envField = claudeFields.find(
      // field 参数存储当前遍历到的单个字段定义。
      (field) => field.path === "env"
    );

    expect(envField?.sensitive).toBe(true);
  });
});
