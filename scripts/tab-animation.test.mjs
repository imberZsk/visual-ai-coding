import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("app shell keeps Ant Design wrapper full height for centered loading", () => {
  // cssText 存储全局样式文件内容，用于检查应用壳层高度能传递到首屏 loading。
  const cssText = readFileSync("src/styles/index.css", "utf8");

  expect(cssText).toMatch(/\.ant-app\s*\{[^}]*height:\s*100%;/s);
});

test("tab content animation avoids positional translation", () => {
  // cssText 存储全局样式文件内容，用于检查 tab 动画不会制造位置抖动。
  const cssText = readFileSync("src/styles/index.css", "utf8");

  expect(cssText).toContain("tabContentEnter");
  expect(cssText).not.toContain("translateX");
  expect(cssText).not.toContain("translateY");
});
