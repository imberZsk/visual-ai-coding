import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("tab content animation avoids horizontal translation", () => {
  // cssText 存储全局样式文件内容，用于检查 tab 动画不会制造横向溢出。
  const cssText = readFileSync("src/styles/index.css", "utf8");

  expect(cssText).toContain("tabContentEnter");
  expect(cssText).not.toContain("translateX");
});
