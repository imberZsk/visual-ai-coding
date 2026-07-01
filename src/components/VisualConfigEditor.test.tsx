import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigFileSpec } from "../config";
import { CODEX_CONFIG_SCHEMA } from "../config/codexConfigSchema";
import type { VisualConfigSchema } from "./visual-config/schemaTypes";
import VisualConfigEditor from "./VisualConfigEditor";

// invokeMock 存储 Tauri invoke 的测试替身。
const invokeMock = vi.fn();
// prefsMock 存储可视化配置编辑器测试用的应用偏好。
let prefsMock = {
  claude_home: "/Users/test/.claude",
  codex_home: "/Users/test/.codex",
  hidden_visual_config_fields: {} as Record<string, string[]>,
  last_active_tab: "",
  theme: "system",
  vscode_path: "code",
};
// updatePrefsMock 存储更新应用偏好的测试替身，用于断言隐藏配置会持久化。
const updatePrefsMock = vi.fn();

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
      prefs: prefsMock,
      updatePrefs: updatePrefsMock,
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
    vi.useRealTimers();
    invokeMock.mockReset();
    updatePrefsMock.mockReset();
    prefsMock = {
      claude_home: "/Users/test/.claude",
      codex_home: "/Users/test/.codex",
      hidden_visual_config_fields: {},
      last_active_tab: "",
      theme: "system",
      vscode_path: "code",
    };
    updatePrefsMock.mockImplementation(async (patch: Partial<typeof prefsMock>) => {
      // nextPrefs 存储应用偏好更新后的内存快照，模拟 zustand store 的乐观更新。
      const nextPrefs = { ...prefsMock, ...patch };
      prefsMock = nextPrefs;
    });
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders known fields and unknown advanced fields", async () => {
    render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("opus")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "默认模型 配置项" }));
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
    fireEvent.click(screen.getByRole("button", { name: "默认模型 配置项" }));

    // detailsRegion 存储字段详情展开区域，用于确认折叠动画结构存在。
    const detailsRegion = screen.getByTestId("field-details-model");
    expect(detailsRegion).toHaveAttribute("data-expanded", "true");
    await waitFor(() => {
      expect(detailsRegion).toHaveAttribute("data-animation-state", "open");
    });
    expect(detailsRegion).toHaveClass("grid-rows-[1fr]");
    expect(detailsRegion).toHaveClass("transition-[grid-template-rows,opacity,margin-top]");
  });

  it("starts field expansion from a collapsed animation state before opening", async () => {
    render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "默认模型 配置项" }));
    });

    // detailsRegion 存储刚挂载的详情区域，用于确认展开动画从折叠态起步。
    const detailsRegion = screen.getByTestId("field-details-model");
    expect(detailsRegion).toHaveAttribute("data-animation-state", "opening");
    expect(detailsRegion).toHaveClass("grid-rows-[0fr]");

    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    expect(detailsRegion).toHaveAttribute("data-animation-state", "open");
    expect(detailsRegion).toHaveClass("grid-rows-[1fr]");
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
    fireEvent.click(screen.getByRole("button", { name: "环境变量 配置项" }));
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

    fireEvent.click(screen.getByRole("button", { name: "默认模型 配置项" }));
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

    fireEvent.click(screen.getByRole("button", { name: "默认模型 配置项" }));
    expect(screen.getByDisplayValue("sonnet")).toBeInTheDocument();
  });

  it("saves visual edits while preserving unknown fields", async () => {
    render(<VisualConfigEditor spec={spec} schema={schema} />);

    // input 存储默认模型输入框。
    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "默认模型 配置项" }));
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

  it("saves one visual field without committing other unsaved fields", async () => {
    invokeMock.mockResolvedValueOnce({
      id: "claude-settings",
      title: "settings.json",
      path: "/Users/test/.claude/settings.json",
      format: "json",
      content: JSON.stringify(
        { model: "opus", autoUpdates: false, customFutureFlag: true },
        null,
        2
      ),
      exists: true,
      readonly: false,
    });

    render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "默认模型 配置项" }));
    fireEvent.change(screen.getByDisplayValue("opus"), { target: { value: "sonnet" } });

    fireEvent.click(screen.getByRole("button", { name: "自动更新 配置项" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "打开" }));

    fireEvent.click(screen.getByRole("button", { name: "保存默认模型" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_config_file", {
        path: "/Users/test/.claude/settings.json",
        content: expect.stringContaining('"model": "sonnet"'),
        format: "json",
      });
    });

    // saveCall 存储字段保存命令的调用参数。
    const saveCall = invokeMock.mock.calls.find((call) => call[0] === "save_config_file");
    // content 存储字段保存时生成的配置文本。
    const content = saveCall?.[1]?.content as string;
    expect(content).toContain('"autoUpdates": false');
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "保存默认模型" })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: "保存自动更新" })).not.toBeDisabled();
  });

  it("keeps the edited field open and enables saving again after a successful save", async () => {
    invokeMock.mockImplementation(async (command: string, args?: { content?: string }) => {
      if (command === "read_config_file") {
        return {
          id: "claude-settings",
          title: "settings.json",
          path: "/Users/test/.claude/settings.json",
          format: "json",
          content: JSON.stringify({ model: "opus" }, null, 2),
          exists: true,
          readonly: false,
        };
      }

      if (command === "save_config_file") {
        return undefined;
      }

      return args;
    });

    render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "默认模型 配置项" }));

    // modelInput 存储第一次编辑使用的模型输入控件。
    const modelInput = screen.getByDisplayValue("opus");
    fireEvent.change(modelInput, { target: { value: "sonnet" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_config_file", {
        path: "/Users/test/.claude/settings.json",
        content: expect.stringContaining('"model": "sonnet"'),
        format: "json",
      });
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    });

    expect(screen.getByDisplayValue("sonnet")).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("sonnet"), { target: { value: "fable" } });
    expect(screen.getByRole("button", { name: "保存" })).not.toBeDisabled();
  });

  it("renders the current custom select value even when it is not in schema options", async () => {
    // selectSchema 存储带模型下拉框的 schema，故意不包含 custom-local-model 选项。
    const selectSchema: VisualConfigSchema = {
      ...schema,
      groups: [
        {
          ...schema.groups[0],
          fields: schema.groups[0].fields.map((field) =>
            field.path === "model"
              ? {
                  ...field,
                  control: "select",
                  options: [{ value: "sonnet5", label: "sonnet5" }],
                }
              : field
          ),
        },
      ],
    };

    invokeMock.mockResolvedValueOnce({
      id: "claude-settings",
      title: "settings.json",
      path: "/Users/test/.claude/settings.json",
      format: "json",
      content: JSON.stringify({ model: "custom-local-model" }, null, 2),
      exists: true,
      readonly: false,
    });

    render(<VisualConfigEditor spec={spec} schema={selectSchema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "默认模型 配置项" }));

    // modelSelect 存储默认模型下拉选择控件。
    const modelSelect = screen.getByRole("combobox");
    expect(modelSelect).toHaveValue("custom-local-model");
    expect(
      screen.getByRole("option", { name: "custom-local-model（当前值）" })
    ).toBeInTheDocument();
  });

  it("does not clip model select popovers inside expanded field details", async () => {
    // selectSchema 存储带模型下拉框的 schema，用于验证真实 select 的展开容器样式。
    const selectSchema: VisualConfigSchema = {
      ...schema,
      groups: [
        {
          ...schema.groups[0],
          fields: schema.groups[0].fields.map((field) =>
            field.path === "model"
              ? {
                  ...field,
                  control: "select",
                  options: [{ value: "opus", label: "opus" }],
                }
              : field
          ),
        },
      ],
    };

    render(<VisualConfigEditor spec={spec} schema={selectSchema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "默认模型 配置项" }));

    // modelSelect 存储默认模型下拉选择控件。
    const modelSelect = screen.getByRole("combobox");
    // detailsRegion 存储展开后的字段详情区域。
    const detailsRegion = screen.getByTestId("field-details-model");
    // detailsContent 存储 select 所在的详情内容容器。
    const detailsContent = modelSelect.parentElement;

    await waitFor(() => {
      expect(detailsRegion).toHaveAttribute("data-animation-state", "open");
    });
    expect(detailsRegion).toHaveClass("overflow-visible");
    expect(detailsContent).toHaveClass("overflow-visible");
  });

  it("lets users choose a model from the dropdown and save it", async () => {
    // user 存储模拟真实点击和下拉选择的用户事件工具。
    const user = userEvent.setup();
    // selectSchema 存储模型字段为下拉控件的 schema。
    const selectSchema: VisualConfigSchema = {
      ...schema,
      groups: [
        {
          ...schema.groups[0],
          fields: schema.groups[0].fields.map((field) =>
            field.path === "model"
              ? {
                  ...field,
                  control: "select",
                  options: [
                    { value: "opus", label: "opus" },
                    { value: "sonnet5", label: "sonnet5" },
                  ],
                }
              : field
          ),
        },
      ],
    };

    render(<VisualConfigEditor spec={spec} schema={selectSchema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "默认模型 配置项" }));
    await user.selectOptions(screen.getByRole("combobox"), "sonnet5");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_config_file", {
        path: "/Users/test/.claude/settings.json",
        content: expect.stringContaining('"model": "sonnet5"'),
        format: "json",
      });
    });
  });

  it("persists manually hidden fields and shows them only after expanding more config", async () => {
    // renderedEditor 存储渲染工具，用于在 mock store 更新后模拟组件重新渲染。
    const renderedEditor = render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "隐藏默认模型" }));

    expect(updatePrefsMock).toHaveBeenCalledWith({
      hidden_visual_config_fields: {
        "claude-settings": ["model"],
      },
    });
    renderedEditor.rerender(<VisualConfigEditor spec={spec} schema={schema} />);
    expect(screen.queryByText("默认模型")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /显示更多配置/ }));

    expect(screen.getByText("默认模型")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消隐藏默认模型" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "默认模型 配置项" }));
    expect(screen.getByRole("combobox")).toHaveValue("gpt-5");
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

    // modelInput 存储默认模型下拉控件。
    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "默认模型 配置项" }));
    const modelInput = screen.getByRole("combobox");
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
