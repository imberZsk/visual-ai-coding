import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigFileSpec } from "../config";
import { CODEX_CONFIG_SCHEMA } from "../config/codexConfigSchema";
import type { VisualConfigSchema } from "./visual-config/schemaTypes";
import VisualConfigEditor from "./VisualConfigEditor";

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
        vscode_path: "code",
      },
    }),
}));

// spec 存储测试用配置文件描述。
const spec: ConfigFileSpec = {
  id: "claude-settings",
  title: "settings.json",
  relPath: "settings.json",
  tool: "claude",
  readonly: false,
  desc: "Claude settings",
};

// schema 存储测试用可视化字段 schema。
const schema: VisualConfigSchema = {
  id: "claude-settings",
  title: "Claude settings",
  format: "json",
  groups: [
    {
      id: "model",
      title: "模型",
      description: "模型设置",
      fields: [
        {
          path: "model",
          title: "默认模型",
          description: "默认模型说明",
          control: "text",
          scope: "用户级",
          risk: "normal",
        },
        {
          path: "autoUpdates",
          title: "自动更新",
          description: "自动更新说明",
          control: "switch",
          scope: "用户级",
          risk: "normal",
        },
      ],
    },
  ],
};

// codexSpec 存储测试用 Codex 配置文件描述。
const codexSpec: ConfigFileSpec = {
  id: "codex-config",
  title: "config.toml",
  relPath: "config.toml",
  tool: "codex",
  readonly: false,
  desc: "Codex config",
};

// tomlContent 存储从磁盘读取到的、尚未被 stringify 规范化的 TOML 文本。
const tomlContent = `
model = "gpt-5"
approval_policy="never"
custom_flag = { enabled = true, level = 2 }
`.trim();

describe("VisualConfigEditor", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      id: "claude-settings",
      title: "settings.json",
      path: "/Users/test/.claude/settings.json",
      format: "json",
      content: JSON.stringify({ model: "opus", customFutureFlag: true }, null, 2),
      exists: true,
      readonly: false,
    });
  });

  it("renders known fields and unknown advanced fields", async () => {
    render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    expect(screen.getByDisplayValue("opus")).toBeInTheDocument();
    expect(screen.getByText("高级字段")).toBeInTheDocument();
    expect(screen.getByText("customFutureFlag")).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
  });

  it("saves visual edits while preserving unknown fields", async () => {
    render(<VisualConfigEditor spec={spec} schema={schema} />);

    // input 存储默认模型输入框。
    const input = await screen.findByDisplayValue("opus");
    fireEvent.change(input, { target: { value: "sonnet" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_config_file", {
        path: "/Users/test/.claude/settings.json",
        content: expect.stringContaining('"model": "sonnet"'),
        format: "json",
      });
    });

    // saveCall 存储保存命令的调用参数。
    const saveCall = invokeMock.mock.calls.find((call) => call[0] === "save_config_file");
    // content 存储保存时生成的配置文本。
    const content = saveCall?.[1]?.content as string;
    expect(content).toContain('"customFutureFlag": true');
  });

  it("falls back to raw view when parsing fails", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "claude-settings",
      title: "settings.json",
      path: "/Users/test/.claude/settings.json",
      format: "json",
      content: "{not json}",
      exists: true,
      readonly: false,
    });

    render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("配置解析失败")).toBeInTheDocument();
    expect(screen.getByDisplayValue("{not json}")).toBeInTheDocument();
  });

  it("does not mark toml visual mode dirty immediately after normalized load", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "codex-config",
      title: "config.toml",
      path: "/Users/test/.codex/config.toml",
      format: "toml",
      content: tomlContent,
      exists: true,
      readonly: false,
    });

    render(<VisualConfigEditor spec={codexSpec} schema={CODEX_CONFIG_SCHEMA} />);

    expect(await screen.findByDisplayValue("gpt-5")).toBeInTheDocument();
    expect(screen.queryByText("未保存")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("saves toml visual edits while preserving unknown fields and normalizing output", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "codex-config",
      title: "config.toml",
      path: "/Users/test/.codex/config.toml",
      format: "toml",
      content: tomlContent,
      exists: true,
      readonly: false,
    });

    render(<VisualConfigEditor spec={codexSpec} schema={CODEX_CONFIG_SCHEMA} />);

    // modelInput 存储默认模型输入框。
    const modelInput = await screen.findByDisplayValue("gpt-5");
    fireEvent.change(modelInput, { target: { value: "gpt-5-codex" } });

    expect(screen.getByText("custom_flag")).toBeInTheDocument();
    expect(screen.getByText(/"enabled": true/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_config_file", {
        path: "/Users/test/.codex/config.toml",
        content: expect.stringContaining('model = "gpt-5-codex"'),
        format: "toml",
      });
    });

    // saveCall 存储保存命令的调用参数。
    const saveCall = invokeMock.mock.calls.find((call) => call[0] === "save_config_file");
    // content 存储保存时生成的 TOML 文本。
    const content = saveCall?.[1]?.content as string;
    expect(content).toContain('approval_policy = "never"');
    expect(content).toContain("[custom_flag]");
    expect(content).toContain("enabled = true");
    expect(content).toContain("level = 2");
  });
});
