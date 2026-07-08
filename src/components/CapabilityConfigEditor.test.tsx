import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CapabilityConfigEditor, { filterSchemaByFieldPaths } from "./CapabilityConfigEditor";
import type { ConfigFileSpec } from "../config";
import type { VisualConfigSchema } from "./visual-config/schemaTypes";

// readConfigFileMock 存储配置读取 API 的测试替身。
const readConfigFileMock = vi.fn();
// saveConfigFileMock 存储配置保存 API 的测试替身。
const saveConfigFileMock = vi.fn();

vi.mock("../api", () => ({
  readConfigFile: (...args: unknown[]) => readConfigFileMock(...args),
  saveConfigFile: (...args: unknown[]) => saveConfigFileMock(...args),
  openInVscode: vi.fn(async () => undefined),
  revealInFinder: vi.fn(async () => undefined),
}));

vi.mock("../store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      prefs: {
        vscode_path: "code",
        claude_home: "/Users/test/.claude",
        codex_home: "/Users/test/.codex",
      },
    }),
}));

// schema 存储测试用可视化配置 schema，包含应展示和应隐藏的字段。
const schema: VisualConfigSchema = {
  id: "test-schema",
  title: "测试 Schema",
  format: "json",
  groups: [
    {
      id: "runtime",
      title: "运行时",
      description: "运行时字段",
      fields: [
        {
          path: "hooks",
          title: "Hooks",
          description: "Hook 配置",
          control: "json-object",
          scope: "用户级",
          risk: "danger",
        },
        {
          path: "model",
          title: "模型",
          description: "模型配置",
          control: "text",
          scope: "用户级",
          risk: "normal",
        },
      ],
    },
    {
      id: "mcp",
      title: "MCP",
      description: "MCP 字段",
      fields: [
        {
          path: "mcpServers",
          title: "MCP Servers",
          description: "MCP server 配置",
          control: "json-object",
          scope: "用户级",
          risk: "sensitive",
          sensitive: true,
        },
      ],
    },
  ],
};

// spec 存储测试用配置文件描述。
const spec: ConfigFileSpec = {
  id: "claude-settings",
  title: "settings.json",
  relPath: "settings.json",
  tool: "claude",
  readonly: false,
  desc: "测试配置",
};

// getFieldToggle 按字段标题查找 Ant Design Collapse 头部按钮。
// title 参数存储字段显示标题。
function getFieldToggle(title: string): HTMLElement {
  // titleNode 存储字段标题文本节点。
  const titleNode = screen.getByText(title);
  // toggle 存储字段标题所在的 Collapse header。
  const toggle = titleNode.closest(".ant-collapse-header");

  if (!(toggle instanceof HTMLElement)) {
    throw new Error(`未找到 ${title} 配置项`);
  }

  return toggle;
}

describe("CapabilityConfigEditor", () => {
  beforeEach(() => {
    readConfigFileMock.mockResolvedValue({
      id: "claude-settings",
      title: "settings.json",
      path: "/Users/test/.claude/settings.json",
      format: "json",
      content: JSON.stringify(
        {
          hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }] },
          model: "sonnet",
          customValue: true,
        },
        null,
        2
      ),
      exists: true,
      readonly: false,
    });
    saveConfigFileMock.mockResolvedValue(undefined);
  });

  it("filters schema groups to the requested field paths", () => {
    // filteredSchema 存储按能力字段路径筛选后的 schema。
    const filteredSchema = filterSchemaByFieldPaths(schema, ["hooks"]);

    expect(filteredSchema.groups).toHaveLength(1);
    expect(filteredSchema.groups[0].fields.map((field) => field.path)).toEqual(["hooks"]);
    expect(filteredSchema.groups[0].title).toBe("运行时");
  });

  it("renders only requested fields and preserves hidden config values when saving", async () => {
    render(
      <CapabilityConfigEditor
        description="只显示 Hooks 相关配置"
        fieldPaths={["hooks"]}
        schema={schema}
        spec={spec}
        title="Claude Hooks"
      />
    );

    expect(await screen.findByText("Claude Hooks")).toBeInTheDocument();
    expect(screen.getByText("Hooks")).toBeInTheDocument();
    expect(screen.queryByText("模型")).not.toBeInTheDocument();
    expect(screen.queryByText("MCP Servers")).not.toBeInTheDocument();

    fireEvent.click(getFieldToggle("Hooks"));

    // textarea 存储 Hooks 对象的内联 JSON 草稿。
    const textarea = screen.getByLabelText("Hooks 内容");
    fireEvent.change(textarea, {
      target: { value: '{ "Stop": [{ "hooks": [{ "type": "command", "command": "echo ok" }] }] }' },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(saveConfigFileMock).toHaveBeenCalled());

    // savedContent 存储保存 API 接收到的配置文本。
    const savedContent = saveConfigFileMock.mock.calls[0][1] as string;
    // savedConfig 存储保存文本解析后的配置对象，用于检查隐藏字段未丢失。
    const savedConfig = JSON.parse(savedContent) as Record<string, unknown>;
    expect(savedConfig.model).toBe("sonnet");
    expect(savedConfig.customValue).toBe(true);
    expect(savedContent).toContain("echo ok");
  });
});
