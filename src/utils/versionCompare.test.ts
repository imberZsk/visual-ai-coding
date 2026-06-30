import { describe, expect, it } from "vitest";
import { comparePluginVersions } from "./versionCompare";

describe("comparePluginVersions", () => {
  // 该回调用于验证标准语义版本的升降序比较结果。
  it("detects semver updates", () => {
    expect(comparePluginVersions("1.2.3", "1.3.0")).toBe("newer");
    expect(comparePluginVersions("1.2.3", "1.2.3")).toBe("same");
  });

  // 该回调用于验证正式版不会被误判为低于同主版本的预发布版。
  it("treats a stable release as different from a same-version prerelease", () => {
    // currentVersion 存储当前已安装的正式版版本号。
    const currentVersion = "1.0.0";
    // availableVersion 存储可升级到的同主版本预发布版本号。
    const availableVersion = "1.0.0-beta1";

    expect(comparePluginVersions(currentVersion, availableVersion)).toBe(
      "different"
    );
  });

  // 该回调用于验证预发布版本升级正式版时也能按更新方向识别。
  it("treats a prerelease as older than the matching stable release", () => {
    // currentVersion 存储当前安装的预发布版本号。
    const currentVersion = "1.0.0-beta1";
    // availableVersion 存储可升级到的同版本正式版版本号。
    const availableVersion = "1.0.0";

    expect(comparePluginVersions(currentVersion, availableVersion)).toBe(
      "newer"
    );
  });

  // 该回调用于验证预发布版本也会按语义顺序比较。
  it("detects prerelease updates using semver-like ordering", () => {
    expect(comparePluginVersions("0.3.0-alpha10", "0.3.0-alpha11")).toBe(
      "newer"
    );
  });

  // 该回调用于验证带点号分段的 prerelease 会按 semver-like 规则逐段比较，而不是按整串字典序误判。
  it("detects prerelease updates across dot-separated identifiers", () => {
    // currentVersion 存储当前安装的较旧 prerelease 版本号。
    const currentVersion = "1.0.0-alpha.2";
    // availableVersion 存储同前缀下更高数字分段的 prerelease 版本号。
    const availableVersion = "1.0.0-alpha.10";

    expect(comparePluginVersions(currentVersion, availableVersion)).toBe(
      "newer"
    );
  });

  // 该回调用于验证非 semver 字符串与空字符串的兜底分支。
  it("marks non-semver unequal versions as different", () => {
    expect(comparePluginVersions("local-dev", "remote-dev")).toBe("different");
    expect(comparePluginVersions("", "1.0.0")).toBe("unknown");
  });
});
