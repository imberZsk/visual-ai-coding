import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FieldRenderer from "./FieldRenderer";
import type { VisualConfigField } from "./schemaTypes";

// jsonField 存储测试用复杂对象字段元数据。
const jsonField: VisualConfigField = {
  path: "env",
  title: "环境变量",
  description: "启动时注入的环境变量",
  control: "json-object",
  scope: "用户级",
  risk: "sensitive",
  sensitive: true,
};

// renderFieldRenderer 渲染测试用字段，并允许覆盖部分 props。
// props 参数存储当前测试要覆盖的 FieldRenderer 属性。
function renderFieldRenderer(props: Partial<ComponentProps<typeof FieldRenderer>> = {}) {
  return render(
    <FieldRenderer
      expanded={false}
      field={jsonField}
      hidden={false}
      home="/Users/test/.claude"
      isSet
      saveDisabled
      saving={false}
      showSaveButton
      value={{ FOO: "bar" }}
      onChange={vi.fn()}
      onSave={vi.fn()}
      onToggle={vi.fn()}
      onToggleHidden={vi.fn()}
      onValidationChange={vi.fn()}
      onUnset={vi.fn()}
      {...props}
    />
  );
}

describe("FieldRenderer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not prepare complex editor previews while collapsed", () => {
    // throwingValue 存储模拟超重预览序列化的字段值；收起状态不应读取它的 JSON 预览。
    const throwingValue = {
      // toJSON 用于在被错误序列化时抛出异常，让测试能捕捉懒渲染回归。
      toJSON() {
        throw new Error("不应在收起状态序列化复杂字段");
      },
    };

    renderFieldRenderer({ value: throwingValue });

    expect(screen.getByText("环境变量")).toBeInTheDocument();
    expect(screen.queryByTestId("field-details-env")).not.toBeInTheDocument();
  });

  it("renders field header with separated title, key, state and metadata", () => {
    // rendered 存储字段渲染结果，用于检查配置项头部的层级结构。
    const rendered = renderFieldRenderer();

    // fieldShell 存储字段折叠项根节点，承载新的文件属性行视觉。
    const fieldShell = rendered.container.querySelector(".visual-config-field");
    expect(fieldShell).not.toBeNull();

    // fieldTitle 存储字段中文标题节点，保证标题独立于路径和状态。
    const fieldTitle = rendered.container.querySelector(".visual-config-field-title");
    expect(fieldTitle).toHaveTextContent("环境变量");

    // fieldKey 存储字段真实配置路径节点，保证机器键名以低噪等宽样式展示。
    const fieldKey = rendered.container.querySelector(".visual-config-field-key");
    expect(fieldKey).toHaveTextContent("env");

    // fieldState 存储字段设置状态节点，避免已设置/未设置只依赖颜色表达。
    const fieldState = rendered.container.querySelector(".visual-config-field-state");
    expect(fieldState).toHaveTextContent("已设置");
    expect(fieldState).toHaveClass("visual-config-field-state--set");
    expect(fieldState).toHaveAttribute("data-state", "set");

    // fieldMeta 存储字段说明、作用域和默认值等辅助信息。
    const fieldMeta = rendered.container.querySelector(".visual-config-field-meta");
    expect(fieldMeta).toHaveTextContent("启动时注入的环境变量");
    expect(fieldMeta).toHaveTextContent("范围：用户级");
  });

  it("keeps unset field state visually neutral", () => {
    // rendered 存储未设置字段渲染结果，用于检查未设置标识不使用成功态。
    const rendered = renderFieldRenderer({ isSet: false });

    // fieldState 存储字段设置状态节点，确保未设置字段不会误用绿色确认标识。
    const fieldState = rendered.container.querySelector(".visual-config-field-state");
    expect(fieldState).toHaveTextContent("未设置");
    expect(fieldState).toHaveClass("visual-config-field-state--unset");
    expect(fieldState).toHaveAttribute("data-state", "unset");
    expect(fieldState).not.toHaveClass("visual-config-field-state--set");
  });

  it("opens field details without a delayed inner animation phase", () => {
    // rendered 存储字段组件渲染工具，用于模拟从收起切换到展开。
    const rendered = renderFieldRenderer();

    expect(screen.queryByTestId("field-details-env")).not.toBeInTheDocument();

    rendered.rerender(
      <FieldRenderer
        expanded
        field={jsonField}
        hidden={false}
        home="/Users/test/.claude"
        isSet
        saveDisabled
        saving={false}
        showSaveButton
        value={{ FOO: "bar" }}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onToggle={vi.fn()}
        onToggleHidden={vi.fn()}
        onValidationChange={vi.fn()}
        onUnset={vi.fn()}
      />
    );

    // detailsRegion 存储展开后的详情区域；不应再经历 opening -> open 的第二段状态。
    const detailsRegion = screen.getByTestId("field-details-env");
    expect(detailsRegion).toHaveAttribute("data-expanded", "true");
    expect(detailsRegion).toHaveAttribute("data-animation-state", "open");
    expect(detailsRegion.className).not.toContain("grid-rows-[0fr]");
    expect(detailsRegion.className).not.toContain("transition-[grid-template-rows");
  });

  it("renders complex fields as inline textarea editors and applies valid JSON", () => {
    // onChangeMock 存储字段值变更回调，用于确认合法 JSON 会直接同步给父组件。
    const onChangeMock = vi.fn();

    renderFieldRenderer({ expanded: true, onChange: onChangeMock });

    // inlineEditor 存储展开后的复杂字段内联 textarea。
    const inlineEditor = screen.getByLabelText("环境变量 内容") as HTMLTextAreaElement;
    expect(inlineEditor.value).toContain('"FOO": "bar"');
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.change(inlineEditor, {
      target: { value: '{ "FOO": "baz", "NEW_FLAG": "1" }' },
    });

    expect(onChangeMock).toHaveBeenLastCalledWith({ FOO: "baz", NEW_FLAG: "1" });
  });

  it("keeps invalid inline JSON local without applying it", () => {
    // onChangeMock 存储字段值变更回调，用于确认错误 JSON 不会写入父级草稿。
    const onChangeMock = vi.fn();

    renderFieldRenderer({ expanded: true, onChange: onChangeMock });

    // inlineEditor 存储展开后的复杂字段内联 textarea。
    const inlineEditor = screen.getByLabelText("环境变量 内容") as HTMLTextAreaElement;
    fireEvent.change(inlineEditor, {
      target: { value: "{ invalid json" },
    });

    expect(screen.getByText(/JSON 格式不正确/)).toBeInTheDocument();
    expect(onChangeMock).not.toHaveBeenCalled();
  });

  it("keeps field details mounted while closing", () => {
    vi.useFakeTimers();

    // rendered 存储字段组件渲染工具，用于模拟从展开切换到收起。
    const rendered = renderFieldRenderer({ expanded: true });

    expect(screen.getByTestId("field-details-env")).toHaveAttribute(
      "data-animation-state",
      "open"
    );

    rendered.rerender(
      <FieldRenderer
        expanded={false}
        field={jsonField}
        hidden={false}
        home="/Users/test/.claude"
        isSet
        saveDisabled
        saving={false}
        showSaveButton
        value={{ FOO: "bar" }}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onToggle={vi.fn()}
        onToggleHidden={vi.fn()}
        onValidationChange={vi.fn()}
        onUnset={vi.fn()}
      />
    );

    // closingDetails 存储收起动画期间仍保留的详情内容，供 AntD Collapse 正常测量高度。
    const closingDetails = screen.getByTestId("field-details-env");
    expect(closingDetails).toHaveAttribute("data-expanded", "false");
    expect(closingDetails).toHaveAttribute("data-animation-state", "closing");

    act(() => {
      vi.advanceTimersByTime(260);
    });

    expect(screen.queryByTestId("field-details-env")).not.toBeInTheDocument();
  });
});
