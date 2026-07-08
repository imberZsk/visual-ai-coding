import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigFileSpec } from "../config";
import { CODEX_CONFIG_SCHEMA } from "../config/codexConfigSchema";
import type { VisualConfigSchema } from "./visual-config/schemaTypes";
import VisualConfigEditor from "./VisualConfigEditor";

// invokeMock 存储 Electron preload API 的测试替身，保留旧 command 形状便于断言参数。
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

// getFieldToggle 按字段标题找到对应的 Ant Design Collapse 头部按钮。
// title 参数存储字段中文标题。
function getFieldToggle(title: string): HTMLElement {
  // titleNode 存储字段标题文本节点。
  const titleNode = screen.getByText(title);
  // toggleNode 存储字段标题所在的 Collapse header。
  const toggleNode = titleNode.closest(".ant-collapse-header") as HTMLElement | null;

  if (!toggleNode) {
    throw new Error(`未找到 ${title} 的配置项折叠头`);
  }

  return toggleNode;
}

// clickFieldToggle 点击指定字段的 Ant Design Collapse 头部。
// title 参数存储字段中文标题。
function clickFieldToggle(title: string) {
  fireEvent.click(getFieldToggle(title));
}

// getFieldShell 按字段标题找到对应的配置项根节点。
// title 参数存储字段中文标题。
function getFieldShell(title: string): HTMLElement {
  // toggleNode 存储字段折叠头。
  const toggleNode = getFieldToggle(title);
  // shellNode 存储字段对应的 Ant Design Collapse 根节点。
  const shellNode = toggleNode.closest(".visual-config-field") as HTMLElement | null;

  if (!shellNode) {
    throw new Error(`未找到 ${title} 的配置项容器`);
  }

  return shellNode;
}

// getAntSelectText 读取指定字段 Ant Design Select 当前展示的文本。
// title 参数存储字段中文标题。
function getAntSelectText(title: string): string {
  // fieldShell 存储字段对应的配置项根节点。
  const fieldShell = getFieldShell(title);
  // selectionNode 存储 Ant Design Select 当前选中项展示节点。
  const selectionNode = fieldShell.querySelector(".ant-select-selection-item");

  return selectionNode?.textContent ?? "";
}

// chooseAntSelectOption 打开当前页面的 Ant Design Select 并选择指定选项。
// optionText 参数存储要点击的选项展示文本。
async function chooseAntSelectOption(optionText: string) {
  // selectorNode 存储当前展开字段里的 Select 可点击区域。
  const selectorNode = document.querySelector(".ant-select-selector") as HTMLElement | null;

  if (!selectorNode) {
    throw new Error("未找到 Ant Design Select 控件");
  }

  fireEvent.mouseDown(selectorNode);

  // optionNode 存储下拉弹层中匹配目标文本的选项内容节点。
  let optionNode: HTMLElement | null = null;
  await waitFor(() => {
    // optionNodes 存储当前弹层中的全部选项内容节点。
    const optionNodes = Array.from(
      document.body.querySelectorAll(".ant-select-item-option-content")
    ) as HTMLElement[];
    optionNode = optionNodes.find((node) => node.textContent?.includes(optionText)) ?? null;
    expect(optionNode).not.toBeNull();
  });

  fireEvent.click(optionNode!.closest(".ant-select-item-option") as HTMLElement);
}

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
          defaultValue: true,
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
          path: "outputStyle",
          title: "输出风格",
          description: "输出风格说明",
          control: "claude-output-style",
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
    window.api = {
      readConfigFile: (payload: {
        id: string;
        title: string;
        path: string;
        readonly: boolean;
      }) => invokeMock("read_config_file", payload),
      saveConfigFile: (payload: { path: string; content: string; format: string }) =>
        invokeMock("save_config_file", payload),
      listClaudeOutputStyles: (claudeHome: string) =>
        invokeMock("list_claude_output_styles", { claudeHome }),
      createClaudeOutputStyle: (payload: { claudeHome: string; name: string }) =>
        invokeMock("create_claude_output_style", payload),
    } as Window["api"];
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
    // modelFieldButton 存储默认模型字段卡片的折叠按钮，用于确认中文标题旁显示真实配置 key。
    const modelFieldButton = getFieldToggle("默认模型");
    expect(within(modelFieldButton).getByText("model")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("opus")).not.toBeInTheDocument();
    fireEvent.click(modelFieldButton);
    expect(screen.getByDisplayValue("opus")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /显示高级字段/ })).toBeInTheDocument();
    expect(screen.queryByText("customFutureFlag")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /显示高级字段/ }));
    expect(screen.getByText("customFutureFlag")).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
  });

  it("renders visual config controls with Ant Design building blocks", async () => {
    // selectSchema 存储带模型下拉框的 schema，用于确认配置项候选值走 Ant Design Select。
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
    invokeMock.mockResolvedValueOnce({
      id: "claude-settings",
      title: "settings.json",
      path: "/Users/test/.claude/settings.json",
      format: "json",
      content: JSON.stringify({ model: "opus", env: { FOO: "bar" } }, null, 2),
      exists: true,
      readonly: false,
    });

    // rendered 存储编辑器渲染结果，用于检查 Ant Design 类名结构。
    const rendered = render(<VisualConfigEditor spec={spec} schema={selectSchema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    expect(rendered.container.querySelector(".ant-collapse")).toBeInTheDocument();
    expect(rendered.container.querySelector(".ant-segmented")).toBeInTheDocument();

    clickFieldToggle("默认模型");

    expect(rendered.container.querySelector(".ant-select")).toBeInTheDocument();

    clickFieldToggle("环境变量");

    expect(screen.getByLabelText("环境变量 内容")).toBeInTheDocument();
    expect(rendered.container.querySelector(".visual-config-inline-textarea")).toBeInTheDocument();
    expect(document.body.querySelector(".ant-modal")).not.toBeInTheDocument();
  });

  it("renders a clearer file module header and visual toolbar", async () => {
    // rendered 存储编辑器渲染结果，用于检查配置文件模块的结构类名。
    const rendered = render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();

    // moduleNode 存储配置文件模块根节点，用于确认文件级信息被独立承载。
    const moduleNode = screen.getByTestId("visual-config-module");
    expect(moduleNode).toHaveClass("visual-config-module");
    expect(within(moduleNode).getByText("settings.json")).toBeInTheDocument();

    // moduleMeta 存储文件说明与绝对路径的元信息区，避免标题行继续堆挤所有信息。
    const moduleMeta = rendered.container.querySelector(".visual-config-module-meta");
    expect(moduleMeta).not.toBeNull();
    expect(moduleMeta).toHaveTextContent("Claude settings");
    expect(moduleMeta).toHaveTextContent("/Users/test/.claude/settings.json");

    // toolbarNode 存储字段排序工具条，保证排序控制从字段列表中被清楚分离出来。
    const toolbarNode = screen.getByTestId("visual-config-toolbar");
    expect(toolbarNode).toHaveClass("visual-config-toolbar");
    expect(within(toolbarNode).getByText("字段排序")).toBeInTheDocument();
  });

  it("keeps the file header separate from the visual content panels", async () => {
    // rendered 存储编辑器渲染结果，用于检查模块化布局不会回退为一个大外框。
    const rendered = render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();

    // headerPanel 存储独立的文件头模块，只承载标题、路径和文件级操作。
    const headerPanel = rendered.container.querySelector(".visual-config-header-panel");
    expect(headerPanel).not.toBeNull();
    expect(headerPanel).toHaveTextContent("settings.json");
    expect(headerPanel!.querySelector(".visual-config-toolbar")).toBeNull();
    expect(headerPanel!.querySelector(".visual-config-group")).toBeNull();

    // contentStack 存储字段内容区，排序与分组应与文件头保持视觉间距。
    const contentStack = rendered.container.querySelector(".visual-config-content-stack");
    expect(contentStack).not.toBeNull();
    expect(contentStack).toHaveClass("space-y-3");
    expect(contentStack!.querySelector(".visual-config-toolbar")).toBeInTheDocument();
    expect(contentStack!.querySelector(".visual-config-group")).toBeInTheDocument();

    // directCards 存储配置模块下一层的 Ant Design Card；只有文件头应直接使用卡片，避免大卡片套全部内容。
    const moduleNode = screen.getByTestId("visual-config-module");
    const directCards = Array.from(moduleNode.children).filter((child) =>
      child.classList.contains("ant-card")
    );
    expect(directCards).toHaveLength(1);
  });

  it("shows the schema-declared default value next to a field", async () => {
    render(<VisualConfigEditor spec={spec} schema={schema} />);

    // autoUpdatesField 存储带 defaultValue 声明的自动更新字段标题节点。
    const autoUpdatesField = await screen.findByText("自动更新");
    expect(
      within(autoUpdatesField.closest(".ant-collapse-header")!).getByText("默认值：true")
    ).toBeInTheDocument();
    // modelField 存储未声明 defaultValue 的默认模型字段标题节点，不应展示默认值文案。
    const modelField = screen.getByText("默认模型");
    expect(
      within(modelField.closest(".ant-collapse-header")!).queryByText(/默认值：/)
    ).not.toBeInTheDocument();
  });

  it("opens field details without a nested delayed animation", async () => {
    render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    clickFieldToggle("默认模型");

    // detailsRegion 存储字段详情展开区域，用于确认不再存在二段式内层动画。
    const detailsRegion = screen.getByTestId("field-details-model");
    expect(detailsRegion).toHaveAttribute("data-expanded", "true");
    expect(detailsRegion).toHaveAttribute("data-animation-state", "open");
    expect(detailsRegion).toHaveClass("overflow-visible");
    expect(detailsRegion.className).not.toContain("transition-[grid-template-rows");
  });

  it("does not wait for a timer before showing expanded field details", async () => {
    render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("默认模型")).toBeInTheDocument();

    await act(async () => {
      clickFieldToggle("默认模型");
    });

    // detailsRegion 存储刚挂载的详情区域，展开后应立即进入可交互状态。
    const detailsRegion = screen.getByTestId("field-details-model");
    expect(detailsRegion).toHaveAttribute("data-animation-state", "open");
    expect(screen.getByDisplayValue("opus")).toBeInTheDocument();
  });

  it("edits complex object fields with an inline large textarea", async () => {
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
    clickFieldToggle("环境变量");

    // inlineEditor 存储内联大文本框中的环境变量 JSON 草稿。
    const inlineEditor = screen.getByLabelText("环境变量 内容") as HTMLTextAreaElement;
    expect(inlineEditor.value).toContain('"FOO": "bar"');

    fireEvent.change(inlineEditor, {
      target: { value: JSON.stringify({ FOO: "baz", NEW_FLAG: "1" }, null, 2) },
    });
    expect(screen.getByText("未保存")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_config_file", {
        path: "/Users/test/.claude/settings.json",
        content: expect.stringContaining('"FOO": "baz"'),
        format: "json",
      });
    });
  });

  it("blocks visual saves while an inline JSON editor is invalid", async () => {
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
    clickFieldToggle("环境变量");

    // inlineEditor 存储内联 JSON 编辑器，用于模拟用户输入不完整 JSON。
    const inlineEditor = screen.getByLabelText("环境变量 内容") as HTMLTextAreaElement;
    fireEvent.change(inlineEditor, {
      target: { value: "{ invalid json" },
    });

    expect(screen.getByText(/JSON 格式不正确/)).toBeInTheDocument();
    expect(screen.getByText("格式错误")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();

    fireEvent.change(inlineEditor, {
      target: { value: JSON.stringify({ FOO: "baz" }, null, 2) },
    });

    expect(screen.queryByText(/JSON 格式不正确/)).not.toBeInTheDocument();
    expect(screen.queryByText("格式错误")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).not.toBeDisabled();
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

    fireEvent.click(screen.getByRole("radio", { name: "未设置优先" }));
    expect(
      unsetField.compareDocumentPosition(configuredField) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "默认顺序" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "已设置优先" }));
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

    clickFieldToggle("默认模型");
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

    clickFieldToggle("默认模型");
    expect(screen.getByDisplayValue("sonnet")).toBeInTheDocument();
  });

  it("saves visual edits while preserving unknown fields", async () => {
    render(<VisualConfigEditor spec={spec} schema={schema} />);

    // input 存储默认模型输入框。
    expect(await screen.findByText("默认模型")).toBeInTheDocument();
    clickFieldToggle("默认模型");
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
    clickFieldToggle("默认模型");
    fireEvent.change(screen.getByDisplayValue("opus"), { target: { value: "sonnet" } });

    clickFieldToggle("自动更新");
    fireEvent.click(screen.getByRole("switch", { name: "打开" }));

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
    clickFieldToggle("默认模型");

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
    clickFieldToggle("默认模型");

    expect(getAntSelectText("默认模型")).toBe("custom-local-model（当前值）");
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
    clickFieldToggle("默认模型");

    // detailsRegion 存储展开后的字段详情区域。
    const detailsRegion = screen.getByTestId("field-details-model");
    // collapseBody 存储 Ant Design Collapse 的内容容器，避免 Select 弹层被父级裁切。
    const collapseBody = detailsRegion.closest(".ant-collapse-content-box");

    expect(detailsRegion).toHaveAttribute("data-animation-state", "open");
    expect(detailsRegion).toHaveClass("overflow-visible");
    expect(collapseBody).toBeInTheDocument();
  });

  it("lets users choose a model from the dropdown and save it", async () => {
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
    clickFieldToggle("默认模型");
    await chooseAntSelectOption("sonnet5");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_config_file", {
        path: "/Users/test/.claude/settings.json",
        content: expect.stringContaining('"model": "sonnet5"'),
        format: "json",
      });
    });
  });

  it("warns when the selected Claude output style is missing and can create it", async () => {
    // outputStylesAfterCreate 存储创建动作是否已经发生，用于模拟后端重新扫描后的列表变化。
    let outputStylesAfterCreate = false;
    invokeMock.mockImplementation(async (command: string, args?: { name?: string }) => {
      if (command === "read_config_file") {
        return {
          id: "claude-settings",
          title: "settings.json",
          path: "/Users/test/.claude/settings.json",
          format: "json",
          content: JSON.stringify({ outputStyle: "毒舌" }, null, 2),
          exists: true,
          readonly: false,
        };
      }

      if (command === "list_claude_output_styles") {
        return {
          directory: "/Users/test/.claude/output-styles",
          exists: outputStylesAfterCreate,
          diagnostics: outputStylesAfterCreate ? "" : "目录不存在",
          styles: [
            { name: "default", kind: "builtin", path: "", description: "默认输出风格" },
            { name: "Explanatory", kind: "builtin", path: "", description: "解释型输出风格" },
            { name: "Learning", kind: "builtin", path: "", description: "学习型输出风格" },
            ...(outputStylesAfterCreate
              ? [
                  {
                    name: "毒舌",
                    kind: "custom",
                    path: "/Users/test/.claude/output-styles/毒舌.md",
                    description: "自定义输出风格：毒舌",
                  },
                ]
              : []),
          ],
        };
      }

      if (command === "create_claude_output_style") {
        outputStylesAfterCreate = true;
        return {
          name: args?.name ?? "毒舌",
          kind: "custom",
          path: "/Users/test/.claude/output-styles/毒舌.md",
          description: "自定义输出风格：毒舌",
        };
      }

      return undefined;
    });

    render(<VisualConfigEditor spec={spec} schema={schema} />);

    expect(await screen.findByText("输出风格")).toBeInTheDocument();
    clickFieldToggle("输出风格");

    expect(await screen.findByText("“毒舌”未找到")).toBeInTheDocument();
    expect(screen.getByText("/Users/test/.claude/output-styles/毒舌.md")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "创建“毒舌”风格文件" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("create_claude_output_style", {
        claudeHome: "/Users/test/.claude",
        name: "毒舌",
      });
    });
    expect(await screen.findByText("已找到自定义风格")).toBeInTheDocument();
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
    clickFieldToggle("默认模型");
    expect(getAntSelectText("默认模型")).toBe("gpt-5");
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
    clickFieldToggle("默认模型");
    await chooseAntSelectOption("gpt-5-codex");

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
