import { describe, expect, it } from "vitest";
import { defaultPreferences } from "../../src/core/preferences.js";

describe("core preferences", () => {
  // 验证新安装或偏好损坏回退时默认进入深色主题，贴合桌面工具的首屏体验。
  it("defaults to dark theme", () => {
    // prefs 存储后端生成的默认偏好对象。
    const prefs = defaultPreferences();

    expect(prefs.theme).toBe("dark");
  });
});
