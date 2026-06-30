import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PluginsPage from "./PluginsPage";

// invokeMock 存储 Tauri invoke 的测试替身。
const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/tauri", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("../store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      prefs: {
        claude_home: "/Users/test/.claude",
        codex_home: "/Users/test/.codex",
      },
    }),
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

  // 验证页面会同时渲染 Claude 与 Codex 插件区块以及更新状态文案。
  it("renders Claude and Codex plugin update sections", async () => {
    render(<PluginsPage />);

    expect(await screen.findByText("Claude 插件")).toBeInTheDocument();
    expect(screen.getByText("Codex 插件")).toBeInTheDocument();
    expect(screen.getByText("superpowers@superpowers-dev")).toBeInTheDocument();
    expect(screen.getByText("browser@openai-bundled")).toBeInTheDocument();
    expect(screen.getByText("可更新")).toBeInTheDocument();
    expect(screen.getByText("已最新")).toBeInTheDocument();
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
