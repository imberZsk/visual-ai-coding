import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// storeState 存储测试用的全局状态快照。
let storeState: {
  loaded: boolean;
  prefs: {
    theme: string;
    vscode_path: string;
    claude_home: string;
    codex_home: string;
    last_active_tab: string;
  };
  tools: unknown[];
};

// rerenderApp 存储当前测试中的重新渲染函数。
let rerenderApp: (() => void) | null = null;

vi.mock("./store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      ...storeState,
      init: vi.fn(async () => undefined),
      refreshTools: vi.fn(async () => undefined),
      updatePrefs: async (patch: Record<string, string>) => {
        storeState = {
          ...storeState,
          prefs: { ...storeState.prefs, ...patch },
        };
        rerenderApp?.();
      },
    }),
}));

vi.mock("./hooks/useTheme", () => ({
  useTheme: vi.fn(),
}));

vi.mock("./pages/Dashboard", () => ({
  DashboardContent: () => <div>概览内嵌内容</div>,
  default: () => <div>概览页面</div>,
}));

vi.mock("./pages/ClaudePage", () => ({
  default: () => <div>Claude 页面</div>,
}));

vi.mock("./pages/CodexPage", () => ({
  default: () => <div>Codex 页面</div>,
}));

vi.mock("./pages/PluginsPage", () => ({
  default: () => <div>插件页面</div>,
}));

vi.mock("./pages/SkillsPage", () => ({
  default: () => <div>技能页面</div>,
}));

vi.mock("./pages/HooksPage", () => ({
  default: () => <div>Hooks 页面</div>,
}));

vi.mock("./pages/McpPage", () => ({
  default: () => <div>MCP 页面</div>,
}));

vi.mock("./pages/AgentsPage", () => ({
  default: () => <div>Agents 页面</div>,
}));

describe("App tab loading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storeState = {
      loaded: true,
      prefs: {
        theme: "dark",
        vscode_path: "code",
        claude_home: "/Users/test/.claude",
        codex_home: "/Users/test/.codex",
        last_active_tab: "dashboard",
      },
      tools: [],
    };
    rerenderApp = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    rerenderApp = null;
  });

  // 验证切换任意页签时只保留内容过渡，不再叠加整页 loading 遮罩。
  it("switches tabs with content animation without stacked loading", async () => {
    // rendered 存储 App 渲染结果，供 mock store 触发重渲染。
    const rendered = render(<App />);
    rerenderApp = () => rendered.rerender(<App />);

    // codexPluginItem 存储 Codex 一级分组下的插件二级入口。
    const codexPluginItem = screen.getAllByRole("menuitem", { name: "插件" })[0];
    fireEvent.click(codexPluginItem);

    // 切到“插件”后该导航项应处于 Ant Design Menu 选中态。
    expect(codexPluginItem).toHaveClass("ant-menu-item-selected");

    expect(screen.queryByText("页面加载中…")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tab-loading-indicator")).not.toBeInTheDocument();
    expect(screen.getByText("插件页面")).toBeInTheDocument();
    expect(screen.getByTestId("tab-content")).toHaveClass("tab-content-enter");
  });

  // 验证应用使用桌面控制台式左侧栏，而不是顶部页签栏布局。
  it("renders a desktop sidebar navigation instead of a top tab bar", () => {
    // rendered 存储 App 渲染结果，供布局断言查询 DOM。
    const rendered = render(<App />);

    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(rendered.container.querySelector("aside")).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("app-sidebar")).toHaveClass("w-64");
    expect(screen.getByTestId("app-sidebar")).not.toHaveClass("border-r");
    // menu 存储 Ant Design 导航根节点，用于锁定其默认右边框已被移除。
    const menu = rendered.container.querySelector(".sidebar-menu");
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveStyle({ borderInlineEnd: 0 });
    expect(screen.getByTestId("app-shell")).toHaveClass("flex-row");
  });

  // 验证 Dashboard 作为左侧导航的第一入口，并在默认页显示选中态。
  it("keeps overview available as the first sidebar entry", () => {
    // rendered 存储 App 渲染结果，供 Dashboard 初始状态断言使用。
    const rendered = render(<App />);
    rerenderApp = () => rendered.rerender(<App />);

    expect(screen.getByText("概览页面")).toBeInTheDocument();
    // overviewButton 存储左侧导航中的概览入口，用于确认当前页语义态。
    const overviewButton = within(screen.getByRole("navigation", { name: "主导航" })).getByRole(
      "menuitem",
      { name: "概览" }
    );
    expect(overviewButton).toHaveClass("ant-menu-item-selected");
  });

  // 验证设置入口不混入主导航，而是保留为左侧栏底部操作。
  it("keeps settings as a sidebar utility action outside main navigation", () => {
    // rendered 存储 App 渲染结果，供导航断言查询 DOM。
    const rendered = render(<App />);
    rerenderApp = () => rendered.rerender(<App />);

    // nav 存储主导航区域，避免页面内容或工具区操作影响导航断言。
    const nav = screen.getByRole("navigation", { name: "主导航" });
    expect(within(nav).getByRole("menuitem", { name: "概览" })).toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "设置" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
  });

  // 验证 Codex 与 Claude Code 作为一级入口，并以手风琴方式只展开一个工具分组。
  it("renders tool groups as an accordion with scoped capability entries", async () => {
    // rendered 存储 App 渲染结果，供 mock store 在页签切换时触发重渲染。
    const rendered = render(<App />);
    rerenderApp = () => rendered.rerender(<App />);

    // nav 存储主导航区域，用于限定按钮查询范围。
    const nav = screen.getByRole("navigation", { name: "主导航" });
    // codexGroup 存储默认展开的 Codex 一级菜单。
    const codexGroup = within(nav).getByRole("menuitem", { name: "Codex" });
    // claudeGroup 存储默认收起的 Claude Code 一级菜单。
    const claudeGroup = within(nav).getByRole("menuitem", { name: "Claude Code" });
    expect(codexGroup).toHaveAttribute("aria-expanded", "true");
    expect(claudeGroup).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(within(nav).getByRole("menuitem", { name: "Hooks" }));
    expect(screen.getByText("Hooks 页面")).toBeInTheDocument();

    fireEvent.click(claudeGroup);
    expect(codexGroup).toHaveAttribute("aria-expanded", "false");
    expect(claudeGroup).toHaveAttribute("aria-expanded", "true");

    // claudeMcpItem 存储 Claude Code 分组下具有稳定路由 key 的 MCP 入口。
    const claudeMcpItem = nav.querySelector('[data-menu-id$="-claude-mcp"]');
    expect(claudeMcpItem).toBeInTheDocument();
    fireEvent.click(claudeMcpItem as HTMLElement);
    expect(screen.getByText("MCP 页面")).toBeInTheDocument();

    // claudeAgentsItem 存储 Claude Code 分组下具有稳定路由 key 的 Agents 入口。
    const claudeAgentsItem = nav.querySelector('[data-menu-id$="-claude-agents"]');
    expect(claudeAgentsItem).toBeInTheDocument();
    fireEvent.click(claudeAgentsItem as HTMLElement);
    expect(screen.getByText("Agents 页面")).toBeInTheDocument();
  });

  // 验证设置按钮可从左侧栏打开右侧抽屉，并直接展示概览与真实设置表单内容。
  it("opens the settings drawer from the sidebar settings button", () => {
    // rendered 存储 App 渲染结果，供 mock store 触发重渲染。
    const rendered = render(<App />);
    rerenderApp = () => rendered.rerender(<App />);

    fireEvent.click(screen.getByRole("button", { name: "设置" }));

    // drawer 存储设置抽屉，确保标题与设置内容都在抽屉内出现。
    const drawer = screen.getByRole("dialog", { name: "设置" });
    expect(drawer).toBeInTheDocument();
    expect(drawer).toHaveClass("ant-drawer-content");
    expect(within(drawer).getByText("概览内嵌内容")).toBeInTheDocument();
    expect(within(drawer).getByText("主题")).toBeInTheDocument();
    expect(within(drawer).getByLabelText("VSCode CLI 路径（默认 code）")).toBeInTheDocument();
    expect(within(drawer).getByLabelText("Claude 配置目录")).toBeInTheDocument();
    expect(within(drawer).getByLabelText("Codex 配置目录")).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  // 验证抽屉里的概览是内嵌内容，不再切换到 Dashboard 路由。
  it("keeps overview embedded in the settings drawer without changing routes", () => {
    storeState = {
      ...storeState,
      prefs: {
        ...storeState.prefs,
        last_active_tab: "claude",
      },
    };

    // rendered 存储 App 渲染结果，供抽屉入口触发重渲染。
    const rendered = render(<App />);
    rerenderApp = () => rendered.rerender(<App />);

    fireEvent.click(screen.getByRole("button", { name: "设置" }));

    expect(storeState.prefs.last_active_tab).toBe("claude");
    expect(screen.getByText("Claude 页面")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByText("概览内嵌内容")).toBeInTheDocument();
  });

  // 验证主题快捷按钮只显示图标，依旧能按 light/dark/system 循环更新偏好。
  it("cycles theme from an icon-only quick theme button", () => {
    // rendered 存储 App 渲染结果，供主题切换后刷新按钮状态。
    const rendered = render(<App />);
    rerenderApp = () => rendered.rerender(<App />);

    // themeButton 存储顶部主题快捷切换按钮。
    const themeButton = screen.getByRole("button", { name: "切换到跟随系统主题" });
    expect(themeButton.querySelector(".anticon")).toBeInTheDocument();
    expect(themeButton).not.toHaveTextContent("浅色");
    expect(themeButton).not.toHaveTextContent("深色");
    expect(themeButton).not.toHaveTextContent("跟随系统");

    fireEvent.click(themeButton);

    expect(storeState.prefs.theme).toBe("system");
  });
});
