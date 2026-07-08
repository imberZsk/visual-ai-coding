// jest-dom 扩展 Vitest 的 DOM 断言能力，例如 toBeInTheDocument。
import "@testing-library/jest-dom/vitest";

// jsdomMatchMedia 存储供 Ant Design 响应式观察器使用的 matchMedia 测试替身。
const jsdomMatchMedia =
  window.matchMedia ??
  ((query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));

// Ant Design Form/Grid 在测试环境会读取 matchMedia；jsdom 默认未实现，需要补齐。
window.matchMedia = jsdomMatchMedia;

// originalGetComputedStyle 存储 jsdom 原生 getComputedStyle，用于包装 Ant Design 动画读取。
const originalGetComputedStyle = window.getComputedStyle.bind(window);

// Ant Design 动画会读取伪元素样式；jsdom 对 pseudoElt 参数会打印未实现警告，这里忽略第二参数。
window.getComputedStyle = (element: Element) => originalGetComputedStyle(element);
