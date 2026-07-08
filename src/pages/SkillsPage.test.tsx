import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsPage from "./SkillsPage";

// invokeMock 存储 Electron preload API 的测试替身，保留旧 command 形状便于断言参数。
const invokeMock = vi.fn();

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

describe("SkillsPage", () => {
  beforeEach(() => {
    window.api = {
      listSkills: (payload: { claudeHome: string; codexHome: string }) =>
        invokeMock("list_skills", payload),
      openInVscode: (payload: { vscodePath: string; target: string }) =>
        invokeMock("open_in_vscode", payload),
    } as Window["api"];
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      skills: [
        {
          name: "openai-docs",
          description: "Use when the user asks how to build with OpenAI products.",
          source: "Codex 系统",
          tool: "codex",
          plugin: "",
          path: "/Users/test/.codex/skills/.system/openai-docs/SKILL.md",
        },
        {
          name: "brainstorming",
          description: "Explores user intent, requirements and design before implementation.",
          source: "Codex 插件",
          tool: "codex",
          plugin: "superpowers@superpowers-dev",
          path: "/Users/test/.codex/plugins/cache/superpowers-dev/superpowers/6.0.3/skills/brainstorming/SKILL.md",
        },
      ],
      diagnostics: "",
    });
  });

  // 验证技能页会展示可用 skill 的用途、来源、插件归属与本地路径，帮助用户理解当前可用能力。
  it("renders available skills with descriptions and origins", async () => {
    render(<SkillsPage />);

    expect(await screen.findByText("openai-docs")).toBeInTheDocument();
    expect(screen.getByText("brainstorming")).toBeInTheDocument();
    expect(
      screen.getByText("Use when the user asks how to build with OpenAI products.")
    ).toBeInTheDocument();
    expect(screen.getByText("Codex 系统")).toBeInTheDocument();
    expect(screen.getByText("superpowers@superpowers-dev")).toBeInTheDocument();
    expect(screen.getByText(/openai-docs\/SKILL\.md/)).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("list_skills", {
      claudeHome: "/Users/test/.claude",
      codexHome: "/Users/test/.codex",
    });
  });

  // 验证技能页使用 Ant Design Table 展示信息，避免继续维护手写 role/grid 表格。
  it("uses an Ant Design directory table with clear columns", async () => {
    render(<SkillsPage />);

    // skillName 存储首个 skill 名称节点，用于向上定位 Ant Design Table 容器。
    const skillName = await screen.findByText("openai-docs");
    // table 存储 Ant Design Table 根节点，用于确认表格能力来自 antd。
    const table = skillName.closest(".ant-table");

    expect(table).toBeInTheDocument();
    expect(within(table as HTMLElement).getByText("Skill")).toBeInTheDocument();
    expect(within(table as HTMLElement).getByText("用途")).toBeInTheDocument();
    expect(within(table as HTMLElement).getByText("来源")).toBeInTheDocument();
    expect(within(table as HTMLElement).getByText("路径")).toBeInTheDocument();
  });

  // 验证路径列改用 Ant Design Typography 省略能力承接长路径展示。
  it("renders long paths with Ant Design Typography ellipsis", async () => {
    render(<SkillsPage />);

    expect(await screen.findByText("brainstorming")).toBeInTheDocument();

    // pathNode 存储某条长路径文本节点，用于确认路径文本允许断词与行数控制。
    const pathNode = screen.getByText(
      "/Users/test/.codex/plugins/cache/superpowers-dev/superpowers/6.0.3/skills/brainstorming/SKILL.md"
    );

    expect(pathNode).toHaveClass("skill-path-text");
    expect(pathNode.closest(".ant-typography")).toBeInTheDocument();
    expect(pathNode.closest(".ant-table")).toBeInTheDocument();
  });

  // 验证点击 Skill 行的 VSCode 按钮会用配置的 VSCode CLI 打开对应 SKILL.md 文件。
  it("opens a skill file in VSCode", async () => {
    // user 存储用户交互模拟器，用于点击 VSCode 打开按钮。
    const user = userEvent.setup();

    render(<SkillsPage />);

    expect(await screen.findByText("openai-docs")).toBeInTheDocument();

    // rows 存储技能清单中的数据行，第一行是表头，所以取包含 openai-docs 的行。
    const rows = screen.getAllByRole("row");
    // targetRow 存储 openai-docs 对应的数据行。
    const targetRow = rows.find((row) => within(row).queryByText("openai-docs"));

    if (!targetRow) {
      throw new Error("未找到 openai-docs 对应行");
    }

    await user.click(within(targetRow).getByRole("button", { name: "VSCode" }));

    expect(invokeMock).toHaveBeenCalledWith("open_in_vscode", {
      vscodePath: "code",
      target: "/Users/test/.codex/skills/.system/openai-docs/SKILL.md",
    });
  });

  // 验证 VSCode 打开入口使用图标按钮，视觉上与 visual-worktree 的操作按钮保持一致。
  it("renders the VSCode action as an icon button", async () => {
    render(<SkillsPage />);

    expect(await screen.findByText("openai-docs")).toBeInTheDocument();

    // button 存储第一个 VSCode 图标按钮，用于确认其仍保留可访问名称。
    const button = screen.getAllByRole("button", { name: "VSCode" })[0];
    expect(within(button).getByRole("img", { name: "vscode" })).toBeInTheDocument();
    expect(button).toHaveClass("ant-btn-icon-only");
    expect(button).toHaveClass("ant-btn-text");
    expect(button).not.toHaveTextContent("VSCode");
  });

  // 验证刷新按钮在重新加载 skill 时使用 Ant Design Button 的内置 loading。
  it("shows Ant Design button loading while refreshing skills", async () => {
    // user 存储用户交互模拟器，用于点击刷新按钮。
    const user = userEvent.setup();

    render(<SkillsPage />);

    expect(await screen.findByText("openai-docs")).toBeInTheDocument();

    invokeMock.mockReturnValue(new Promise(() => undefined));
    await user.click(screen.getByRole("button", { name: "刷新" }));

    // refreshButton 存储进入刷新状态的按钮，用于确认 loading 图标存在且按钮禁用。
    const refreshButton = screen.getByRole("button", { name: "刷新" });
    await waitFor(() => expect(refreshButton).toBeDisabled());
    expect(refreshButton.querySelector(".ant-btn-loading-icon")).toBeInTheDocument();
    expect(refreshButton.querySelector(".anticon-loading")).toBeInTheDocument();
    expect(within(refreshButton).queryByTestId("loading-icon")).not.toBeInTheDocument();
  });

  // 验证搜索框可按描述过滤 skill，用户能快速定位自己关心的能力。
  it("filters skills by name and description", async () => {
    // user 存储用户交互模拟器，用于输入搜索关键词。
    const user = userEvent.setup();

    render(<SkillsPage />);

    expect(await screen.findByText("openai-docs")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("搜索 skill、用途、来源"), "design");

    await waitFor(() => {
      expect(screen.queryByText("openai-docs")).not.toBeInTheDocument();
      expect(screen.getByText("brainstorming")).toBeInTheDocument();
    });
  });
});
