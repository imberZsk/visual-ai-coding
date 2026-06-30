import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigFileSpec } from "../config";
import { CODEX_CONFIG_SCHEMA } from "../config/codexConfigSchema";
import type { VisualConfigSchema } from "./visual-config/schemaTypes";
import VisualConfigEditor from "./VisualConfigEditor";

// invokeMock 存储 Tauri invoke 的测试替身。
const invokeMock = vi.fn();

// createDeferred 创建可手动 resolve/reject 的 Promise，方便测试 loading 过程。
function createDeferred<T>() {
  // resolveDeferred 存储 Promise 成功完成回调。
  let resolveDeferred!: (value: T | PromiseLike<T>) => void;
  // rejectDeferred 存储 Promise 失败完成回调。
  let rejectDeferred!: (reason?: unknown) => void;
  // promise 存储暴露给被测代码等待的异步对象。
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });

  return {
    promise,
    resolve: resolveDeferred,
    reject: rejectDeferred,
  };
}

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
          path: "autoUpdates",
          title: "自动更新",
          description: "自动更新说明",
          control: "switch",
          scope: "用户级",
          risk: "normal",
        },
        {
          path: "model",
          title: "默认模型",
          description: "默认模型说明",
          control: "text",
          scope: "用户级",
          risk: "normal",
        },
        {
          path: "apiKeyHelper",
          title: "API Key Helper",
          description: "低频敏感配置说明",
          control: "text",
          scope: "用户级",
          risk: "sensitive",
          sensitive: true,
        },
        {
          path: "env",
          title: "环境变量",
          description: "启动时注入的环境变量",
          control: "json-object",
          scope: "用户级",
          risk: "sensitive",
          sensitive: true,
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
    expect(screen.queryByDisplayValue("opus")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /默认模型/ }));
    expect(screen.getByDisplayValue("opus")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /显示高级字段/ })).toBeInTheDocument();
    expect(screen.queryByText("customFutureFlag")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /显示高级字段/ }));
    expect(screen.getByText("customFutureFlag")).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
  });

  it("uses an animated details container when expanding a field", async () => {
    render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /默认模型/ }));

    // detailsRegion 存储字段详情展开区域，用于确认折叠动画结构存在。
    const detailsRegion = screen.getByTestId("field-details-model");
    expect(detailsRegion).toHaveAttribute("data-expanded", "true");
    expect(detailsRegion).toHaveClass("grid-rows-[1fr]");
    expect(detailsRegion).toHaveClass("transition-[grid-template-rows,opacity,margin-top]");
  });

  it("opens complex object fields in a large modal editor and applies edits", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "claude-settings",
      title: "settings.json",
      path: "/Users/test/.claude/settings.json",
      format: "json",
      content: JSON.stringify({ model: "opus", env: { FOO: "bar" } }, null, 2),
      exists: true,
      readonly: false,
    });

    render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("环境变量")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /环境变量/ }));
    fireEvent.click(screen.getByRole("button", { name: "打开环境变量编辑" }));

    expect(screen.getByRole("dialog", { name: "编辑环境变量" })).toBeInTheDocument();
    // modalEditor 存储大弹窗中的环境变量 JSON 草稿。
    const modalEditor = screen.getByLabelText("环境变量 内容") as HTMLTextAreaElement;
    expect(modalEditor.value).toContain('"FOO": "bar"');

    fireEvent.change(modalEditor, {
      target: { value: JSON.stringify({ FOO: "baz", NEW_FLAG: "1" }, null, 2) },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用到配置" }));
    expect(screen.queryByRole("dialog", { name: "编辑环境变量" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_config_file", {
        path: "/Users/test/.claude/settings.json",
        content: expect.stringContaining('"FOO": "baz"'),
        format: "json",
      });
    });
  });

  it("sorts configured fields first and hides uncommon unset fields by default", async () => {
    render(<VisualConfigEditor spec={spec} schema={schema} />);

    // configuredField 存储已设置字段标题节点，用于比较排序位置。
    const configuredField = await screen.findByText("默认模型");
    // unsetField 存储普通未设置字段标题节点，用于比较排序位置。
    const unsetField = screen.getByText("自动更新");

    expect(
      configuredField.compareDocumentPosition(unsetField) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.queryByText("API Key Helper")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /显示更多配置/ }));

    expect(screen.getByText("API Key Helper")).toBeInTheDocument();
  });

  it("switches visual field sort order from clickable sort buttons", async () => {
    render(<VisualConfigEditor spec={spec} schema={schema} />);

    // configuredField 存储已设置字段标题节点，用于比较排序位置。
    const configuredField = await screen.findByText("默认模型");
    // unsetField 存储普通未设置字段标题节点，用于比较排序位置。
    const unsetField = screen.getByText("自动更新");

    fireEvent.click(screen.getByRole("button", { name: "未设置优先" }));
    expect(
      unsetField.compareDocumentPosition(configuredField) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "默认顺序" }));
    expect(
      unsetField.compareDocumentPosition(configuredField) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "已设置优先" }));
    expect(
      configuredField.compareDocumentPosition(unsetField) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("reloads the current config from the refresh button with loading state", async () => {
    // refreshDeferred 存储点击刷新后的读取 Promise，用于断言 loading 状态。
    const refreshDeferred = createDeferred<unknown>();
    invokeMock
      .mockResolvedValueOnce({
        id: "claude-settings",
        title: "settings.json",
        path: "/Users/test/.claude/settings.json",
        format: "json",
        content: JSON.stringify({ model: "opus" }, null, 2),
        exists: true,
        readonly: false,
      })
      .mockReturnValueOnce(refreshDeferred.promise);

    render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    expect(screen.getByRole("button", { name: "刷新" })).toBeDisabled();

    refreshDeferred.resolve({
      id: "claude-settings",
      title: "settings.json",
      path: "/Users/test/.claude/settings.json",
      format: "json",
      content: JSON.stringify({ model: "haiku" }, null, 2),
      exists: true,
      readonly: false,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "刷新" })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /默认模型/ }));
    expect(screen.getByDisplayValue("haiku")).toBeInTheDocument();
  });

  it("uses command+r to refresh the current config instead of browser reload", async () => {
    invokeMock
      .mockResolvedValueOnce({
        id: "claude-settings",
        title: "settings.json",
        path: "/Users/test/.claude/settings.json",
        format: "json",
        content: JSON.stringify({ model: "opus" }, null, 2),
        exists: true,
        readonly: false,
      })
      .mockResolvedValueOnce({
        id: "claude-settings",
        title: "settings.json",
        path: "/Users/test/.claude/settings.json",
        format: "json",
        content: JSON.stringify({ model: "sonnet" }, null, 2),
        exists: true,
        readonly: false,
      });

    render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    // refreshEvent 存储模拟的 Command+R 键盘事件，用于确认默认浏览器刷新被阻止。
    const refreshEvent = new KeyboardEvent("keydown", {
      key: "r",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      window.dispatchEvent(refreshEvent);
    });

    expect(refreshEvent.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole("button", { name: /默认模型/ }));
    expect(screen.getByDisplayValue("sonnet")).toBeInTheDocument();
  });

  it("saves visual edits while preserving unknown fields", async () => {
    render(<VisualConfigEditor spec={spec} schema={schema} />);

    // input 存储默认模型输入框。
    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /默认模型/ }));
    const input = screen.getByDisplayValue("opus");
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

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /默认模型/ }));
    expect(screen.getByDisplayValue("gpt-5")).toBeInTheDocument();
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
    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /默认模型/ }));
    const modelInput = screen.getByDisplayValue("gpt-5");
    fireEvent.change(modelInput, { target: { value: "gpt-5-codex" } });

    fireEvent.click(screen.getByRole("button", { name: /显示高级字段/ }));
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
