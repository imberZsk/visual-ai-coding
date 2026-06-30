import { render, screen, waitFor } from "@testing-library/react";
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
});
