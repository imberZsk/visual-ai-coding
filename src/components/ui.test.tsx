import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge, Button, Card, EmptyState, LoadingIcon, PageShell } from "./ui";

describe("shared UI primitives", () => {
  // 验证公共 loading 使用 Ant Design Spin，而不是项目内自绘 border spinner。
  it("renders loading with Ant Design Spin", () => {
    // rendered 存储 LoadingIcon 的渲染容器，用于检查底层结构。
    const rendered = render(<LoadingIcon />);
    // loadingIcon 存储兼容既有页面测试的 loading 标记节点。
    const loadingIcon = screen.getByTestId("loading-icon");

    expect(loadingIcon.querySelector(".ant-spin")).toBeInTheDocument();
    expect(loadingIcon).toHaveClass("h-3.5");
    expect(loadingIcon).toHaveClass("w-3.5");
    expect(loadingIcon).toHaveClass("shrink-0");
    expect(loadingIcon).toHaveClass("items-center");
    expect(loadingIcon).toHaveClass("justify-center");
    expect(rendered.container.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  // 验证公共按钮切换到 visual-worktree 一致的 Ant Design loading 按钮。
  it("renders buttons with Ant Design loading state", () => {
    render(
      <Button loading variant="primary">
        保存
      </Button>
    );

    // saveButton 存储进入 loading 状态的公共按钮。
    const saveButton = screen.getByRole("button", { name: "保存" });
    expect(saveButton).toHaveClass("ant-btn");
    expect(saveButton).toHaveClass("ant-btn-loading");
    expect(saveButton).toBeDisabled();
    expect(within(saveButton).getByTestId("loading-icon")).toBeInTheDocument();
  });

  // 验证状态徽章复用 Ant Design Tag，便于和 visual-worktree 的系统控件统一。
  it("renders badges with Ant Design Tag", () => {
    render(<Badge tone="success">已安装</Badge>);

    // badge 存储状态徽章节点，用于确认 Ant Design 类名存在。
    const badge = screen.getByText("已安装");
    expect(badge).toHaveClass("ant-tag");
  });

  // 验证公共卡片复用 Ant Design Card，统一面板边距、边框和暗色适配。
  it("renders cards with Ant Design Card", () => {
    render(<Card>插件信息</Card>);

    // cardText 存储卡片正文节点，用于向上定位 Ant Design Card 容器。
    const cardText = screen.getByText("插件信息");
    expect(cardText.closest(".ant-card")).toBeInTheDocument();
  });

  // 验证空状态复用 Ant Design Empty，统一列表为空时的视觉表达。
  it("renders empty state with Ant Design Empty", () => {
    render(<EmptyState text="暂无数据" />);

    // emptyText 存储空状态文案节点，用于向上定位 Ant Design Empty 容器。
    const emptyText = screen.getByText("暂无数据");
    expect(emptyText.closest(".ant-empty")).toBeInTheDocument();
  });

  // 验证页面外壳提供统一宽度和内边距，避免各页面自行散落 p-6。
  it("renders page shell with the console content rhythm", () => {
    render(<PageShell>页面内容</PageShell>);

    // shell 存储页面外壳节点，用于确认全局布局约束。
    const shell = screen.getByText("页面内容");
    expect(shell).toHaveClass("mx-auto");
    expect(shell).toHaveClass("max-w-7xl");
    expect(shell).toHaveClass("px-6");
  });
});
