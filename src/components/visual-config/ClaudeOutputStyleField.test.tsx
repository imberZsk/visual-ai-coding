import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClaudeOutputStyleField from "./ClaudeOutputStyleField";

// listClaudeOutputStylesMock 存储扫描 Claude output style 的测试替身。
const listClaudeOutputStylesMock = vi.fn();
// createClaudeOutputStyleMock 存储创建 Claude output style 的测试替身。
const createClaudeOutputStyleMock = vi.fn();

vi.mock("../../api", () => ({
  listClaudeOutputStyles: (...args: unknown[]) => listClaudeOutputStylesMock(...args),
  createClaudeOutputStyle: (...args: unknown[]) => createClaudeOutputStyleMock(...args),
}));

// DeferredValue 描述测试中可手动结束的 Promise。
interface DeferredValue<T> {
  promise: Promise<T>; // promise 存储被测异步流程等待的 Promise。
  resolve: (value: T) => void; // resolve 存储手动完成 Promise 的函数。
}

// createDeferred 创建可手动 resolve 的 Promise，便于断言 loading 中间态。
// T 为 Promise 完成时返回的数据类型。
function createDeferred<T>(): DeferredValue<T> {
  // resolveDeferred 存储当前 Promise 的 resolve 函数。
  let resolveDeferred: (value: T) => void = () => undefined;
  // promise 存储交给被测代码等待的 Promise。
  const promise = new Promise<T>((resolve) => {
    resolveDeferred = resolve;
  });

  return { promise, resolve: resolveDeferred };
}

describe("ClaudeOutputStyleField", () => {
  beforeEach(() => {
    listClaudeOutputStylesMock.mockReset();
    createClaudeOutputStyleMock.mockReset();
    listClaudeOutputStylesMock.mockResolvedValue({
      directory: "/Users/test/.claude/output-styles",
      exists: true,
      diagnostics: "",
      styles: [
        { name: "default", kind: "builtin", path: "", description: "默认输出风格" },
      ],
    });
    createClaudeOutputStyleMock.mockResolvedValue({
      name: "毒舌",
      kind: "custom",
      path: "/Users/test/.claude/output-styles/毒舌.md",
      description: "自定义输出风格：毒舌",
    });
  });

  it("shows unified loading while creating a missing style", async () => {
    // user 存储用户交互模拟器，用于点击创建按钮。
    const user = userEvent.setup();
    // createDeferredValue 存储创建 output style 的 Promise，用于断言 loading 中间态。
    const createDeferredValue = createDeferred<
      {
        name: string;
        kind: string;
        path: string;
        description: string;
      }
    >();

    listClaudeOutputStylesMock.mockResolvedValueOnce({
      directory: "/Users/test/.claude/output-styles",
      exists: true,
      diagnostics: "",
      styles: [
        { name: "default", kind: "builtin", path: "", description: "默认输出风格" },
      ],
    }).mockResolvedValueOnce({
      directory: "/Users/test/.claude/output-styles",
      exists: true,
      diagnostics: "",
      styles: [
        { name: "default", kind: "builtin", path: "", description: "默认输出风格" },
        {
          name: "毒舌",
          kind: "custom",
          path: "/Users/test/.claude/output-styles/毒舌.md",
          description: "自定义输出风格：毒舌",
        },
      ],
    });
    createClaudeOutputStyleMock.mockReturnValue(createDeferredValue.promise);

    render(<ClaudeOutputStyleField value="毒舌" claudeHome="/Users/test/.claude" onChange={() => undefined} />);

    expect(await screen.findByText("“毒舌”未找到")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "创建“毒舌”风格文件" }));

    // createButton 存储进入 loading 状态的创建按钮。
    const createButton = screen.getByRole("button", { name: /创建中/ });
    expect(createButton).toBeDisabled();
    expect(within(createButton).getByRole("img", { name: "loading" })).toBeInTheDocument();

    createDeferredValue.resolve({
      name: "毒舌",
      kind: "custom",
      path: "/Users/test/.claude/output-styles/毒舌.md",
      description: "自定义输出风格：毒舌",
    });

    await waitFor(() => {
      expect(screen.getByText("已找到自定义风格")).toBeInTheDocument();
    });
  });
});
