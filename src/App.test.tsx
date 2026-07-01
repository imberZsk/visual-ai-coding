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
        theme: "system",
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

    fireEvent.click(screen.getByRole("button", { name: "插件" }));

    // activeIndicator 存储顶部 tab 背景滑块，切到“插件”时应显示但不再使用等分 translateX 算法。
    const activeIndicator = screen.getByTestId("tab-active-indicator");
    expect(activeIndicator).toHaveStyle({ opacity: "1" });
    expect(activeIndicator.style.transform).not.toBe("translateX(500%)");

    expect(screen.queryByText("页面加载中…")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tab-loading-indicator")).not.toBeInTheDocument();
    expect(screen.getByText("插件页面")).toBeInTheDocument();
    expect(screen.getByTestId("tab-content")).toHaveClass("tab-content-enter");
  });

  // 验证应用使用类似 visual-worktree 的顶部栏布局，而不是左侧栏布局。
  it("renders top navigation instead of a left sidebar", () => {
    // rendered 存储 App 渲染结果，供布局断言查询 DOM。
    const rendered = render(<App />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(rendered.container.querySelector("aside")).not.toBeInTheDocument();
    expect(screen.getByTestId("top-header")).toHaveClass("gap-3");
    expect(screen.getByTestId("top-header-main")).toHaveClass("flex-1");
    expect(screen.getByRole("navigation", { name: "主导航" })).toHaveClass("inline-flex");
    expect(screen.getByRole("navigation", { name: "主导航" })).toHaveClass("w-auto");
  });

  // 验证 Dashboard 不在主导航时仍显示页面内容，并隐藏导航滑块避免落在第一个页签上。
  it("hides the navigation indicator while dashboard remains active", () => {
    // rendered 存储 App 渲染结果，供 Dashboard 初始状态断言使用。
    const rendered = render(<App />);
    rerenderApp = () => rendered.rerender(<App />);

    expect(screen.getByText("概览页面")).toBeInTheDocument();
    expect(screen.getByTestId("tab-active-indicator")).toHaveStyle({ opacity: "0" });
  });

  // 验证主导航移除概览与应用设置，只保留核心工具入口。
  it("does not render dashboard or settings as main navigation tabs", () => {
    // rendered 存储 App 渲染结果，供导航断言查询 DOM。
    const rendered = render(<App />);
    rerenderApp = () => rendered.rerender(<App />);

    // nav 存储主导航区域，避免页面内容中的“概览”影响导航断言。
    const nav = screen.getByRole("navigation", { name: "主导航" });
    expect(within(nav).queryByRole("button", { name: "概览" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "应用设置" })).not.toBeInTheDocument();
  });

  // 验证 Hooks、MCP、Agents 作为跨工具能力入口出现在主导航，并能切换到对应页面。
  it("renders Hooks MCP and Agents as main navigation tabs", async () => {
    // rendered 存储 App 渲染结果，供 mock store 在页签切换时触发重渲染。
    const rendered = render(<App />);
    rerenderApp = () => rendered.rerender(<App />);

    // nav 存储主导航区域，用于限定按钮查询范围。
    const nav = screen.getByRole("navigation", { name: "主导航" });
    expect(within(nav).getByRole("button", { name: "Hooks" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "MCP" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Agents" })).toBeInTheDocument();

    fireEvent.click(within(nav).getByRole("button", { name: "Hooks" }));
    expect(screen.getByText("Hooks 页面")).toBeInTheDocument();

    fireEvent.click(within(nav).getByRole("button", { name: "MCP" }));
    expect(screen.getByText("MCP 页面")).toBeInTheDocument();

    fireEvent.click(within(nav).getByRole("button", { name: "Agents" }));
    expect(screen.getByText("Agents 页面")).toBeInTheDocument();
  });

  // 验证设置按钮可打开更宽的右侧抽屉，并直接展示概览与真实设置表单内容。
  it("opens the settings drawer from the top settings button", () => {
    // rendered 存储 App 渲染结果，供 mock store 触发重渲染。
    const rendered = render(<App />);
    rerenderApp = () => rendered.rerender(<App />);

    fireEvent.click(screen.getByRole("button", { name: "设置" }));

    // drawer 存储设置抽屉，确保标题与设置内容都在抽屉内出现。
    const drawer = screen.getByRole("dialog", { name: "设置" });
    expect(drawer).toBeInTheDocument();
    expect(drawer).toHaveClass("max-w-3xl");
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
    const themeButton = screen.getByRole("button", { name: "切换到浅色主题" });
    expect(themeButton).not.toHaveTextContent("浅色");
    expect(themeButton).not.toHaveTextContent("深色");
    expect(themeButton).not.toHaveTextContent("跟随系统");

    fireEvent.click(themeButton);

    expect(storeState.prefs.theme).toBe("light");
  });
});
