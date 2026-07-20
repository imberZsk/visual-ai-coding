import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";
import { useAppStore } from "../store";

// revealInFinderMock 存储 Finder 打开命令的测试替身。
const revealInFinderMock = vi.fn();
// openInVscodeMock 存储 VSCode 打开命令的测试替身。
const openInVscodeMock = vi.fn();
// openExternalUrlMock 存储系统浏览器打开外部网址命令的测试替身。
const openExternalUrlMock = vi.fn();
// checkToolLatestVersionMock 存储查询工具最新版本命令的测试替身。
const checkToolLatestVersionMock = vi.fn();
// updateToolCliMock 存储更新工具 CLI 命令的测试替身。
const updateToolCliMock = vi.fn();
// detectToolsMock 存储重新探测工具状态命令的测试替身。
const detectToolsMock = vi.fn();
// savePreferencesMock 存储偏好保存命令的测试替身。
const savePreferencesMock = vi.fn();

// DeferredValue 描述测试中可手动结束的 Promise。
interface DeferredValue<T> {
  promise: Promise<T>; // promise 存储被测异步流程等待的 Promise。
  resolve: (value: T) => void; // resolve 存储手动完成 Promise 的函数。
}

// createDeferred 创建可手动 resolve 的 Promise，便于断言 loading 中间态。
// T 为 Promise 完成时返回的数据类型。
function createDeferred<T>(): DeferredValue<T> {
  // resolveDeferred 存储当前 Promise 的 resolve 函数。
  let resolveDeferred: (value: T) => void = () => undefined;
  // promise 存储交给被测代码等待的 Promise。
  const promise = new Promise<T>((resolve) => {
    resolveDeferred = resolve;
  });

  return { promise, resolve: resolveDeferred };
}

vi.mock("../api", () => ({
  revealInFinder: (...args: unknown[]) => revealInFinderMock(...args),
  openInVscode: (...args: unknown[]) => openInVscodeMock(...args),
  openExternalUrl: (...args: unknown[]) => openExternalUrlMock(...args),
  checkToolLatestVersion: (...args: unknown[]) => checkToolLatestVersionMock(...args),
  updateToolCli: (...args: unknown[]) => updateToolCliMock(...args),
  detectTools: (...args: unknown[]) => detectToolsMock(...args),
  savePreferences: (...args: unknown[]) => savePreferencesMock(...args),
}));

// resetDashboardStore 重置 Dashboard 测试所需的真实 zustand store。
function resetDashboardStore() {
  useAppStore.setState({
    prefs: {
      theme: "system",
      vscode_path: "code",
      claude_home: "/Users/test/.claude",
      codex_home: "/Users/test/.codex",
      last_active_tab: "dashboard",
      hidden_visual_config_fields: {},
    },
    tools: [
      {
        id: "claude",
        name: "Claude Code",
        installed: true,
        version: "2.1.177",
        path: "/opt/homebrew/bin/claude",
      },
    ],
    loaded: true,
    toolVersionChecks: {},
    toolVersionChecking: {},
    toolVersionUpdating: {},
  });
}

describe("Dashboard", () => {
  beforeEach(() => {
    revealInFinderMock.mockReset();
    openInVscodeMock.mockReset();
    openExternalUrlMock.mockReset();
    checkToolLatestVersionMock.mockReset();
    updateToolCliMock.mockReset();
    detectToolsMock.mockReset();
    savePreferencesMock.mockReset();
    detectToolsMock.mockResolvedValue([
      {
        id: "claude",
        name: "Claude Code",
        installed: true,
        version: "2.1.196",
        path: "/opt/homebrew/bin/claude",
      },
    ]);
    savePreferencesMock.mockResolvedValue(undefined);
    openExternalUrlMock.mockResolvedValue(undefined);
    resetDashboardStore();
  });

  // 验证重新探测执行期间，按钮会进入 loading 并禁用，防止重复触发探测。
  it("shows loading while refreshing tool detection", async () => {
    // user 存储用户交互模拟器，用于点击重新探测按钮。
    const user = userEvent.setup();
    // refreshDeferred 存储重新探测动作的 Promise，完成值模拟后端返回的工具列表。
    const refreshDeferred = createDeferred<
      Array<{
        id: string;
        name: string;
        installed: boolean;
        version: string;
        path: string;
      }>
    >();

    detectToolsMock.mockReturnValue(refreshDeferred.promise);

    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: "重新探测" }));

    // refreshingButton 存储进入 loading 状态后的重新探测按钮，文案保持稳定，loading 用图标表达。
    const refreshingButton = screen.getByRole("button", { name: "重新探测" });
    expect(refreshingButton).toBeDisabled();
    expect(within(refreshingButton).getByTestId("loading-icon")).toBeInTheDocument();

    refreshDeferred.resolve([
      {
        id: "claude",
        name: "Claude Code",
        installed: true,
        version: "2.1.196",
        path: "/opt/homebrew/bin/claude",
      },
    ]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "重新探测" })).not.toBeDisabled();
    });
  });

  // 验证用户可以查询 Claude Code 最新版本，并看到可更新状态。
  it("checks latest Claude Code version and shows update availability", async () => {
    // user 存储用户交互模拟器，用于点击版本查询按钮。
    const user = userEvent.setup();
    // versionDeferred 存储查询最新版本动作的 Promise。
    const versionDeferred = createDeferred<{
      tool_id: string;
      package_name: string;
      latest_version: string;
      release_notes_url: string;
    }>();

    checkToolLatestVersionMock.mockReturnValue(versionDeferred.promise);
    detectToolsMock.mockResolvedValue([
      {
        id: "claude",
        name: "Claude Code",
        installed: true,
        version: "2.1.177",
        path: "/opt/homebrew/bin/claude",
      },
    ]);

    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: "查询最新版本" }));

    // versionButton 存储进入 loading 状态后的版本查询按钮。
    const versionButton = screen.getByRole("button", { name: "查询最新版本" });
    expect(versionButton).toBeDisabled();
    expect(within(versionButton).getByTestId("loading-icon")).toBeInTheDocument();
    expect(checkToolLatestVersionMock).toHaveBeenCalledWith("claude");

    versionDeferred.resolve({
      tool_id: "claude",
      package_name: "@anthropic-ai/claude-code",
      latest_version: "2.1.196",
      release_notes_url: "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
    });

    expect(await screen.findByText("最新版本：2.1.196")).toBeInTheDocument();
    expect(screen.getByText("可更新")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看更新内容" }));
    expect(openExternalUrlMock).toHaveBeenCalledWith(
      "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
    );
  });

  // 验证查询最新版本时会同步刷新本地 CLI 版本，避免展示已过期的启动时缓存。
  it("refreshes local tool detection after checking latest version", async () => {
    // user 存储用户交互模拟器，用于点击版本查询按钮。
    const user = userEvent.setup();

    checkToolLatestVersionMock.mockResolvedValue({
      tool_id: "claude",
      package_name: "@anthropic-ai/claude-code",
      latest_version: "2.1.196",
    });
    detectToolsMock.mockResolvedValue([
      {
        id: "claude",
        name: "Claude Code",
        installed: true,
        version: "2.1.196",
        path: "/opt/homebrew/bin/claude",
      },
    ]);

    render(<Dashboard />);

    expect(screen.getByText("版本：2.1.177")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查询最新版本" }));

    expect(await screen.findByText("版本：2.1.196")).toBeInTheDocument();
    expect(screen.getByText("已最新")).toBeInTheDocument();
    expect(detectToolsMock).toHaveBeenCalled();
  });

  // 验证查询到新版本后会展示更新按钮，并在更新完成后重新探测本机工具状态。
  it("shows an update button for outdated Claude Code and refreshes tools after updating", async () => {
    // user 存储用户交互模拟器，用于点击查询与更新按钮。
    const user = userEvent.setup();
    // updateDeferred 存储 CLI 更新动作的 Promise，用于断言更新 loading 中间态。
    const updateDeferred = createDeferred<string>();

    checkToolLatestVersionMock.mockResolvedValue({
      tool_id: "claude",
      package_name: "@anthropic-ai/claude-code",
      latest_version: "2.1.196",
    });
    updateToolCliMock.mockReturnValue(updateDeferred.promise);
    detectToolsMock
      .mockResolvedValueOnce([
        {
          id: "claude",
          name: "Claude Code",
          installed: true,
          version: "2.1.177",
          path: "/opt/homebrew/bin/claude",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "claude",
          name: "Claude Code",
          installed: true,
          version: "2.1.196",
          path: "/opt/homebrew/bin/claude",
        },
      ]);

    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: "查询最新版本" }));

    expect(await screen.findByRole("button", { name: "更新到最新版" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "更新到最新版" }));

    // updateButton 存储进入 loading 状态后的 CLI 更新按钮。
    const updateButton = screen.getByRole("button", { name: "更新到最新版" });
    expect(updateButton).toBeDisabled();
    expect(within(updateButton).getByTestId("loading-icon")).toBeInTheDocument();
    expect(updateToolCliMock).toHaveBeenCalledWith("claude");

    updateDeferred.resolve("updated");

    expect(await screen.findByText("更新完成")).toBeInTheDocument();
    await waitFor(() => {
      expect(detectToolsMock).toHaveBeenCalled();
    });
  });

  // 验证最新版本查询在 Dashboard 卸载后仍继续，重新挂载时保留按钮 loading 并展示完成结果。
  it("preserves latest-version check progress across unmount and remount", async () => {
    // user 存储用户交互模拟器，用于点击版本查询按钮。
    const user = userEvent.setup();
    // versionDeferred 存储查询最新版本动作的 Promise，用于模拟切 tab 时仍在执行。
    const versionDeferred = createDeferred<{
      tool_id: string;
      package_name: string;
      latest_version: string;
      release_notes_url: string;
    }>();

    checkToolLatestVersionMock.mockReturnValue(versionDeferred.promise);

    // firstRender 存储首次渲染结果，后续卸载模拟切走概览 tab。
    const firstRender = render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: "查询最新版本" }));
    expect(screen.getByRole("button", { name: "查询最新版本" })).toBeDisabled();

    firstRender.unmount();

    render(<Dashboard />);

    // remountedButton 存储重新挂载后的查询按钮，应继续呈现 loading。
    const remountedButton = screen.getByRole("button", { name: "查询最新版本" });
    expect(remountedButton).toBeDisabled();
    expect(within(remountedButton).getByTestId("loading-icon")).toBeInTheDocument();

    versionDeferred.resolve({
      tool_id: "claude",
      package_name: "@anthropic-ai/claude-code",
      latest_version: "2.1.196",
      release_notes_url: "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
    });

    expect(await screen.findByText("最新版本：2.1.196")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查询最新版本" })).not.toBeDisabled();
  });
});
