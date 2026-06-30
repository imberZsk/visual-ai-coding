import { describe, expect, it } from "vitest";
import {
  deleteValueAtPath,
  getValueAtPath,
  isSensitiveKey,
  listUnknownTopLevelKeys,
  maskSensitiveValue,
  setValueAtPath,
} from "./configPath";

describe("configPath helpers", () => {
  // 该回调验证读取嵌套路径与带引号片段的配置值。
  it("reads nested object paths and quoted path segments", () => {
    // sourceConfig 存储包含普通嵌套 key 和带点号 key 的配置对象。
    const sourceConfig = {
      permissions: { defaultMode: "bypassPermissions" },
      plugins: { "browser@openai-bundled": { enabled: true } },
    };

    expect(getValueAtPath(sourceConfig, "permissions.defaultMode")).toBe(
      "bypassPermissions"
    );
    expect(
      getValueAtPath(
        sourceConfig,
        'plugins."browser@openai-bundled".enabled'
      )
    ).toBe(true);
  });

  // 该回调验证写入嵌套路径时不会原地修改源对象。
  it("writes nested object paths without mutating the original object", () => {
    // sourceConfig 存储写入前的原始配置对象。
    const sourceConfig = { permissions: { allow: [] as string[] } };
    // nextConfig 存储写入后的新配置对象。
    const nextConfig = setValueAtPath(
      sourceConfig,
      "permissions.defaultMode",
      "default"
    );

    expect(nextConfig).toEqual({
      permissions: { allow: [], defaultMode: "default" },
    });
    expect(sourceConfig).toEqual({ permissions: { allow: [] } });
  });

  // 该回调验证删除嵌套路径后会保留同级字段。
  it("deletes nested values and leaves sibling values intact", () => {
    // sourceConfig 存储包含待删除字段和保留字段的配置对象。
    const sourceConfig = {
      permissions: { allow: ["Bash(ls)"], defaultMode: "default" },
    };
    // nextConfig 存储删除 defaultMode 后的配置对象。
    const nextConfig = deleteValueAtPath(sourceConfig, "permissions.defaultMode");

    expect(nextConfig).toEqual({ permissions: { allow: ["Bash(ls)"] } });
  });

  // 该回调验证删除目标字段时不会额外清理父级空对象。
  it("deletes only the requested path and keeps empty parent objects", () => {
    // sourceConfig 存储只有一个嵌套叶子字段的配置对象。
    const sourceConfig = { permissions: { nested: { enabled: true } } };
    // nextConfig 存储删除叶子字段后的新配置对象。
    const nextConfig = deleteValueAtPath(
      sourceConfig,
      "permissions.nested.enabled"
    );

    expect(nextConfig).toEqual({ permissions: { nested: {} } });
  });

  // 该回调验证已知 schema 路径之外的顶层字段能被识别出来。
  it("lists top-level keys not covered by known schema paths", () => {
    // sourceConfig 存储带已知字段和未知字段的配置对象。
    const sourceConfig = {
      model: "gpt-5.5",
      permissions: { defaultMode: "default" },
      customFutureFlag: true,
    };
    // knownPaths 存储 schema 已声明支持的字段路径。
    const knownPaths = ["model", "permissions.defaultMode"];

    expect(listUnknownTopLevelKeys(sourceConfig, knownPaths)).toEqual([
      "customFutureFlag",
    ]);
  });

  // 该回调验证敏感字段识别与掩码显示的默认行为。
  it("detects and masks sensitive keys", () => {
    expect(isSensitiveKey("ANTHROPIC_AUTH_TOKEN")).toBe(true);
    expect(isSensitiveKey("jira_password")).toBe(true);
    expect(isSensitiveKey("model")).toBe(false);
    expect(maskSensitiveValue("secret-value")).toBe("••••••");
    expect(maskSensitiveValue("")).toBe("");
  });
});
