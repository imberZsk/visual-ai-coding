import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PluginsPage from "./PluginsPage";
import { useAppStore } from "../store";

// invokeMock 存储 Tauri invoke 的测试替身。
const invokeMock = vi.fn();

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

vi.mock("@tauri-apps/api/tauri", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

// getUpdateButtonInSection 按工具区块标题定位“拉取更新”按钮，避免多个同名按钮导致测试脆弱。
// sectionTitle 为工具区块标题。
function getUpdateButtonInSection(sectionTitle: string): HTMLElement {
  // sectionHeading 存储对应工具区块的标题节点，用于反向定位父级 section。
  const sectionHeading = screen.getByText(sectionTitle);
  // sectionElement 存储工具区块根节点，当前页面每个工具都包裹在独立 section 中。
  const sectionElement = sectionHeading.closest("section");

  if (!sectionElement) {
    throw new Error(`未找到 ${sectionTitle} 对应的区块`);
  }

  return within(sectionElement).getByRole("button", { name: "拉取更新" });
}

describe("PluginsPage", () => {
  beforeEach(() => {
    useAppStore.setState({
      prefs: {
        theme: "system",
        vscode_path: "",
        claude_home: "/Users/test/.claude",
        codex_home: "/Users/test/.codex",
        last_active_tab: "plugins",
      },
      tools: [],
      loaded: true,
    });
    invokeMock.mockReset();
    invokeMock.mockImplementation((command: string) => {
      if (command === "check_claude_plugin_updates") {
        return Promise.resolve({
          tool: "claude",
          raw_output: "{}",
          diagnostics: "",
          plugins: [
            {
              id: "superpowers@superpowers-dev",
              name: "superpowers",
              marketplace: "superpowers-dev",
              current_version: "6.0.3",
              available_version: "6.0.4",
              scope: "user",
              enabled: true,
              install_path: "/tmp/superpowers",
              last_updated: "2026-06-29T08:10:22.693Z",
              update_status: "newer",
            },
          ],
        });
      }
      if (command === "check_codex_plugin_updates") {
        return Promise.resolve({
          tool: "codex",
          raw_output: "{}",
          diagnostics: "",
          plugins: [
            {
              id: "browser@openai-bundled",
              name: "browser",
              marketplace: "openai-bundled",
              current_version: "1.0.0",
              available_version: "1.0.0",
              scope: "",
              enabled: true,
              install_path: "/tmp/browser",
              last_updated: "",
              update_status: "same",
            },
          ],
        });
      }
      return Promise.resolve([]);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAppStore.setState({
      prefs: null,
      tools: [],
      loaded: false,
    });
  });

  // 验证插件页首次渲染先让页面完成挂载，再延迟触发 CLI 检查，降低切入插件 tab 时的卡顿。
  it("defers initial plugin checks until after the first frame", async () => {
    vi.useFakeTimers();

    try {
      render(<PluginsPage />);

      expect(invokeMock).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(220);
      });

      expect(invokeMock).toHaveBeenCalledWith("check_claude_plugin_updates", {
        claudeHome: "/Users/test/.claude",
      });
      expect(invokeMock).toHaveBeenCalledWith("check_codex_plugin_updates", {
        codexHome: "/Users/test/.codex",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // 验证页面会同时渲染 Claude 与 Codex 插件区块以及更新状态文案。
  it("renders Claude and Codex plugin update sections", async () => {
    render(<PluginsPage />);

    expect(await screen.findByText("Claude 插件")).toBeInTheDocument();
    expect(screen.getByText("Codex 插件")).toBeInTheDocument();
    expect(await screen.findByText("superpowers@superpowers-dev")).toBeInTheDocument();
    expect(screen.getByText("browser@openai-bundled")).toBeInTheDocument();
    expect(screen.getByText("可更新")).toBeInTheDocument();
    expect(screen.getByText("已最新")).toBeInTheDocument();
  });

  // 验证点击顶部“刷新全部”后，按钮会展示 loading 并在两类工具检查结束后恢复。
  it("shows loading on refresh all until both plugin checks finish", async () => {
    // user 存储用户交互模拟器，用于点击刷新按钮。
    const user = userEvent.setup();

    render(<PluginsPage />);

    expect(await screen.findByText("superpowers@superpowers-dev")).toBeInTheDocument();

    // claudeDeferred 存储本次刷新中的 Claude 检查 Promise。
    const claudeDeferred = createDeferred<unknown>();
    // codexDeferred 存储本次刷新中的 Codex 检查 Promise。
    const codexDeferred = createDeferred<unknown>();

    invokeMock.mockImplementation((command: string) => {
      if (command === "check_claude_plugin_updates") {
        return claudeDeferred.promise;
      }
      if (command === "check_codex_plugin_updates") {
        return codexDeferred.promise;
      }
      return Promise.resolve([]);
    });

    await user.click(screen.getByRole("button", { name: "刷新全部" }));

    // refreshingButton 存储进入 loading 状态后的刷新按钮，文案保持稳定，loading 用图标表达。
    const refreshingButton = screen.getByRole("button", { name: "刷新全部" });
    expect(refreshingButton).toBeDisabled();
    expect(within(refreshingButton).getByTestId("loading-icon")).toBeInTheDocument();

    claudeDeferred.resolve({
      tool: "claude",
      raw_output: "{}",
      diagnostics: "",
      plugins: [],
    });
    codexDeferred.resolve({
      tool: "codex",
      raw_output: "{}",
      diagnostics: "",
      plugins: [],
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "刷新全部" })).not.toBeDisabled();
    });
  });

  // 验证单工具检查时只让对应按钮进入 loading，并保留旧列表内容供用户继续操作。
  it("keeps existing plugin list visible while a single tool check is loading", async () => {
    // user 存储用户交互模拟器，用于点击 Claude 区块检查按钮。
    const user = userEvent.setup();

    render(<PluginsPage />);

    expect(await screen.findByText("superpowers@superpowers-dev")).toBeInTheDocument();

    // claudeDeferred 存储手动触发的 Claude 检查 Promise，便于断言中间 loading 状态。
    const claudeDeferred = createDeferred<unknown>();

    invokeMock.mockImplementation((command: string) => {
      if (command === "check_claude_plugin_updates") {
        return claudeDeferred.promise;
      }
      if (command === "check_codex_plugin_updates") {
        return Promise.resolve({
          tool: "codex",
          raw_output: "{}",
          diagnostics: "",
          plugins: [],
        });
      }
      return Promise.resolve([]);
    });

    // claudeSection 存储 Claude 插件区块根节点，用于限定按钮与列表断言范围。
    const claudeSection = screen.getByText("Claude 插件").closest("section");
    expect(claudeSection).not.toBeNull();

    await user.click(
      within(claudeSection as HTMLElement).getByRole("button", { name: "检查更新" })
    );

    // checkingButton 存储进入 loading 状态的 Claude 检查按钮。
    const checkingButton = within(claudeSection as HTMLElement).getByRole("button", {
      name: "检查更新",
    });
    expect(checkingButton).toBeDisabled();
    expect(within(checkingButton).getByTestId("loading-icon")).toBeInTheDocument();
    expect(screen.getByText("superpowers@superpowers-dev")).toBeInTheDocument();
    expect(within(claudeSection as HTMLElement).queryByText("加载中…")).not.toBeInTheDocument();

    claudeDeferred.resolve({
      tool: "claude",
      raw_output: "{}",
      diagnostics: "",
      plugins: [],
    });

    await waitFor(() => {
      expect(checkingButton).not.toBeDisabled();
    });
  });

  // 验证单个插件更新时只有该插件按钮进入 loading，其他插件按钮仍保持可操作。
  it("shows loading only on the plugin update button being updated", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "check_claude_plugin_updates") {
        return Promise.resolve({
          tool: "claude",
          raw_output: "{}",
          diagnostics: "",
          plugins: [
            {
              id: "superpowers@superpowers-dev",
              name: "superpowers",
              marketplace: "superpowers-dev",
              current_version: "6.0.3",
              available_version: "6.0.4",
              scope: "user",
              enabled: true,
              install_path: "/tmp/superpowers",
              last_updated: "",
              update_status: "newer",
            },
            {
              id: "workflow@superpowers-dev",
              name: "workflow",
              marketplace: "superpowers-dev",
              current_version: "1.0.0",
              available_version: "1.0.1",
              scope: "user",
              enabled: true,
              install_path: "/tmp/workflow",
              last_updated: "",
              update_status: "newer",
            },
          ],
        });
      }
      if (command === "check_codex_plugin_updates") {
        return Promise.resolve({
          tool: "codex",
          raw_output: "{}",
          diagnostics: "",
          plugins: [],
        });
      }
      return Promise.resolve([]);
    });

    // user 存储用户交互模拟器，用于触发指定插件更新。
    const user = userEvent.setup();

    render(<PluginsPage />);

    expect(await screen.findByText("workflow@superpowers-dev")).toBeInTheDocument();

    // updateDeferred 存储 Claude 插件更新 Promise，用于保持按钮 loading 中间态。
    const updateDeferred = createDeferred<string>();

    invokeMock.mockImplementation((command: string) => {
      if (command === "update_claude_plugin") {
        return updateDeferred.promise;
      }
      if (command === "check_claude_plugin_updates") {
        return Promise.resolve({
          tool: "claude",
          raw_output: "{}",
          diagnostics: "",
          plugins: [],
        });
      }
      if (command === "check_codex_plugin_updates") {
        return Promise.resolve({
          tool: "codex",
          raw_output: "{}",
          diagnostics: "",
          plugins: [],
        });
      }
      return Promise.resolve([]);
    });

    // pluginCards 存储当前页面所有插件卡片，便于分别定位两个插件按钮。
    const pluginCards = screen
      .getAllByText(/@superpowers-dev/)
      .map((node) => node.closest(".rounded-xl"));
    // firstCard 存储第一个待更新插件的卡片。
    const firstCard = pluginCards[0] as HTMLElement;
    // secondCard 存储第二个待更新插件的卡片。
    const secondCard = pluginCards[1] as HTMLElement;

    await user.click(within(firstCard).getByRole("button", { name: "拉取更新" }));

    // firstUpdateButton 存储正在更新的插件按钮。
    const firstUpdateButton = within(firstCard).getByRole("button", { name: "拉取更新" });
    // secondUpdateButton 存储未更新插件的按钮。
    const secondUpdateButton = within(secondCard).getByRole("button", { name: "拉取更新" });
    expect(firstUpdateButton).toBeDisabled();
    expect(within(firstUpdateButton).getByTestId("loading-icon")).toBeInTheDocument();
    expect(secondUpdateButton).not.toBeDisabled();

    updateDeferred.resolve("updated");

    await waitFor(() => {
      expect(firstUpdateButton).not.toBeDisabled();
    });
  });

  // 验证检查中的状态存放在 store，页面卸载再挂载后仍保留按钮 loading，并在 Promise 完成后更新结果。
  it("preserves in-flight check loading and result across unmount and remount", async () => {
    vi.useFakeTimers();

    try {
      // claudeDeferred 存储首轮 Claude 检查 Promise，用于跨卸载验证仍在进行。
      const claudeDeferred = createDeferred<unknown>();

      invokeMock.mockImplementation((command: string) => {
        if (command === "check_claude_plugin_updates") {
          return claudeDeferred.promise;
        }
        if (command === "check_codex_plugin_updates") {
          return Promise.resolve({
            tool: "codex",
            raw_output: "{}",
            diagnostics: "",
            plugins: [],
          });
        }
        return Promise.resolve([]);
      });

      // firstRenderResult 存储首次渲染结果，后续会卸载模拟 tab 切换。
      const firstRenderResult = render(<PluginsPage />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(220);
      });

      // firstClaudeSection 存储首次挂载时的 Claude 区块。
      const firstClaudeSection = screen.getByText("Claude 插件").closest("section");
      expect(firstClaudeSection).not.toBeNull();
      expect(
        within(firstClaudeSection as HTMLElement).getByRole("button", { name: "检查更新" })
      ).toBeDisabled();

      firstRenderResult.unmount();

      render(<PluginsPage />);

      // remountedClaudeSection 存储重新挂载后的 Claude 区块。
      const remountedClaudeSection = screen.getByText("Claude 插件").closest("section");
      expect(remountedClaudeSection).not.toBeNull();
      expect(
        within(remountedClaudeSection as HTMLElement).getByRole("button", {
          name: "检查更新",
        })
      ).toBeDisabled();

      await act(async () => {
        claudeDeferred.resolve({
          tool: "claude",
          raw_output: "{}",
          diagnostics: "",
          plugins: [
            {
              id: "persistent@superpowers-dev",
              name: "persistent",
              marketplace: "superpowers-dev",
              current_version: "1.0.0",
              available_version: "1.0.1",
              scope: "user",
              enabled: true,
              install_path: "/tmp/persistent",
              last_updated: "",
              update_status: "newer",
            },
          ],
        });
      });

      expect(await screen.findByText("persistent@superpowers-dev")).toBeInTheDocument();
      expect(
        within(remountedClaudeSection as HTMLElement).getByRole("button", {
          name: "检查更新",
        })
      ).not.toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  // 验证 Codex 检查失败时，Claude 区块仍然可以独立展示，避免单工具失败阻断整页。
  it("keeps Claude section visible when Codex check fails", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "check_claude_plugin_updates") {
        return Promise.resolve({
          tool: "claude",
          raw_output: "{}",
          diagnostics: "",
          plugins: [],
        });
      }
      if (command === "check_codex_plugin_updates") {
        return Promise.reject("检查 Codex 插件更新失败");
      }
      return Promise.resolve([]);
    });

    render(<PluginsPage />);

    await waitFor(() => {
      expect(screen.getByText("Claude 插件")).toBeInTheDocument();
      expect(screen.getByText("Codex 插件检查失败")).toBeInTheDocument();
    });
    // codexSection 存储 Codex 插件区块根节点，后续断言只检查失败区块内部。
    const codexSection = screen.getByText("Codex 插件").closest("section");

    expect(codexSection).not.toBeNull();
    expect(
      within(codexSection as HTMLElement).getByText("该工具插件检查失败，请查看上方错误信息。")
    ).toBeInTheDocument();
    expect(within(codexSection as HTMLElement).queryByText("未发现已安装插件")).not.toBeInTheDocument();
  });

  // 验证 Codex CLI marketplace 损坏但后端 fallback 成功时，页面展示插件但隐藏底层 CLI 诊断。
  it("shows Codex fallback plugins without diagnostics when marketplace snapshot is invalid", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "check_claude_plugin_updates") {
        return Promise.resolve({
          tool: "claude",
          raw_output: "{}",
          diagnostics: "",
          plugins: [],
        });
      }
      if (command === "check_codex_plugin_updates") {
        return Promise.resolve({
          tool: "codex",
          raw_output: "",
          diagnostics:
            "执行命令失败:\nmarketplace root does not contain a supported manifest",
          plugins: [
            {
              id: "superpowers@superpowers-dev",
              name: "superpowers",
              marketplace: "superpowers-dev",
              current_version: "6.0.3",
              available_version: "",
              scope: "",
              enabled: true,
              install_path: "/Users/test/.codex/plugins/cache/superpowers-dev/superpowers/6.0.3",
              last_updated: "",
              update_status: "unknown",
            },
          ],
        });
      }
      return Promise.resolve([]);
    });

    render(<PluginsPage />);

    expect(await screen.findByText("superpowers@superpowers-dev")).toBeInTheDocument();
    expect(screen.queryByText("Codex 插件诊断")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/marketplace root does not contain a supported manifest/)
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Codex 插件检查失败")).not.toBeInTheDocument();
  });

  // 验证点击 Claude 区块的“拉取更新”后，会调用 Claude 更新命令并重新检查该区块状态。
  it("updates Claude plugin and refreshes Claude status after clicking update", async () => {
    // user 存储用户交互模拟器，用于触发真实点击流程。
    const user = userEvent.setup();

    render(<PluginsPage />);

    expect(await screen.findByText("superpowers@superpowers-dev")).toBeInTheDocument();

    // updateButton 存储 Claude 区块内的“拉取更新”按钮，确保不会误点到其他工具区块。
    const updateButton = getUpdateButtonInSection("Claude 插件");
    await user.click(updateButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("update_claude_plugin", {
        pluginName: "superpowers@superpowers-dev",
        scope: "user",
      });
    });

    await waitFor(() => {
      // claudeCheckCalls 存储 Claude 更新检查命令的调用次数，期望包含首次加载与更新后的二次检查。
      const claudeCheckCalls = invokeMock.mock.calls.filter(
        ([command]) => command === "check_claude_plugin_updates"
      );
      expect(claudeCheckCalls).toHaveLength(2);
    });
  });

  // 验证点击 Codex 区块的“拉取更新”后，会先刷新 marketplace，再更新插件并重新检查该区块状态。
  it("updates Codex marketplace and plugin in order after clicking update", async () => {
    // codexCheckCount 存储 Codex 检查命令的调用次数，用于区分首次渲染与更新后的复查。
    let codexCheckCount = 0;

    invokeMock.mockImplementation((command: string, payload?: Record<string, string>) => {
      if (command === "check_claude_plugin_updates") {
        return Promise.resolve({
          tool: "claude",
          raw_output: "{}",
          diagnostics: "",
          plugins: [],
        });
      }
      if (command === "check_codex_plugin_updates") {
        codexCheckCount += 1;
        return Promise.resolve({
          tool: "codex",
          raw_output: "{}",
          diagnostics: "",
          plugins: [
            {
              id: "browser@openai-bundled",
              name: "browser",
              marketplace: "openai-bundled",
              current_version: "1.0.0",
              available_version: codexCheckCount === 1 ? "1.0.1" : "1.0.1",
              scope: "",
              enabled: true,
              install_path: "/tmp/browser",
              last_updated: "",
              update_status: codexCheckCount === 1 ? "newer" : "same",
            },
          ],
        });
      }
      if (command === "update_codex_marketplace") {
        return Promise.resolve(`updated marketplace ${payload?.marketplaceName || ""}`);
      }
      if (command === "update_codex_plugin") {
        return Promise.resolve(`updated plugin ${payload?.pluginId || ""}`);
      }
      return Promise.resolve([]);
    });

    // user 存储用户交互模拟器，用于触发真实点击流程。
    const user = userEvent.setup();

    render(<PluginsPage />);

    expect(await screen.findByText("browser@openai-bundled")).toBeInTheDocument();

    // updateButton 存储 Codex 区块内的“拉取更新”按钮，避免同名按钮匹配到其他区块。
    const updateButton = getUpdateButtonInSection("Codex 插件");
    await user.click(updateButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("update_codex_marketplace", {
        marketplaceName: "openai-bundled",
      });
      expect(invokeMock).toHaveBeenCalledWith("update_codex_plugin", {
        pluginId: "browser@openai-bundled",
        marketplace: "openai-bundled",
      });
    });

    await waitFor(() => {
      // codexUpdateMarketplaceCallIndex 存储 marketplace 更新调用在 mock 调用序列中的位置。
      const codexUpdateMarketplaceCallIndex = invokeMock.mock.calls.findIndex(
        ([command]) => command === "update_codex_marketplace"
      );
      // codexUpdatePluginCallIndex 存储插件更新调用在 mock 调用序列中的位置。
      const codexUpdatePluginCallIndex = invokeMock.mock.calls.findIndex(
        ([command]) => command === "update_codex_plugin"
      );

      expect(codexUpdateMarketplaceCallIndex).toBeGreaterThan(-1);
      expect(codexUpdatePluginCallIndex).toBeGreaterThan(codexUpdateMarketplaceCallIndex);
    });

    await waitFor(() => {
      // codexCheckCalls 存储 Codex 更新检查命令的调用次数，期望包含首次加载与更新后的二次检查。
      const codexCheckCalls = invokeMock.mock.calls.filter(
        ([command]) => command === "check_codex_plugin_updates"
      );
      expect(codexCheckCalls).toHaveLength(2);
    });
  });
});
