import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "./useTheme";

// storeState 存储测试中模拟的偏好加载状态。
let storeState: { prefs: { theme: string } | null };

vi.mock("../store", () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

// ThemeHarness 用于在测试组件生命周期中挂载 useTheme。
function ThemeHarness() {
  useTheme();
  return null;
}

// installLightSystemPreference 安装浅色系统偏好的 matchMedia mock。
function installLightSystemPreference() {
  // matchMediaMock 存储模拟的系统主题查询函数。
  const matchMediaMock = vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));

  vi.stubGlobal("matchMedia", matchMediaMock);
}

describe("useTheme", () => {
  beforeEach(() => {
    // prefs 为 null 表示后端偏好尚未加载完成。
    storeState = { prefs: null };
    document.documentElement.className = "dark";
    window.localStorage.clear();
    installLightSystemPreference();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.className = "";
    window.localStorage.clear();
  });

  // 验证后端偏好还没返回时不覆盖 index.html 的首屏暗色类，避免暗色用户先闪白再变暗。
  it("keeps the bootstrapped dark class while preferences are still loading", () => {
    render(<ThemeHarness />);

    expect(document.documentElement).toHaveClass("dark");
  });

  // 验证加载完成的主题偏好会写入前端缓存，供下次启动首屏脚本同步读取。
  it("caches the loaded theme preference for the next startup paint", () => {
    // storeState 存储已加载的深色主题偏好。
    storeState = { prefs: { theme: "dark" } };

    render(<ThemeHarness />);

    expect(window.localStorage.getItem("visual-aicoding.theme")).toBe("dark");
  });
});
