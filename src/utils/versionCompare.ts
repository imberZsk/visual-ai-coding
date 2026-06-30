// VersionParts 存储从版本字符串中解析出的主版本、次版本、补丁与预发布信息。
type VersionParts = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
};

// CompareResult 存储插件版本比较函数对外返回的分类结果。
type CompareResult = "newer" | "same" | "different" | "unknown";

// 判断版本字符串是否为空，version 参数存储待校验的版本字符串，空值通常代表上游没有给出有效版本。
function isMissingVersion(version: string): boolean {
  return version.trim().length === 0;
}

// 尝试解析 semver 主干与预发布段，version 参数存储待解析的版本字符串，失败时返回 null 交给兜底分支处理。
function parseVersion(version: string): VersionParts | null {
  // match 存储版本字符串与 semver 结构匹配后的捕获组。
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);

  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

// 比较两个预发布标记，left 和 right 分别存储左右两侧的 prerelease 标签，数字后缀按数值大小排序，其余按字典序排序。
function comparePrerelease(left: string, right: string): number {
  // leftMatch 存储左侧预发布标记的字母前缀与数字后缀。
  const leftMatch = left.match(/^([a-zA-Z-]+)(\d+)?$/);
  // rightMatch 存储右侧预发布标记的字母前缀与数字后缀。
  const rightMatch = right.match(/^([a-zA-Z-]+)(\d+)?$/);

  if (!leftMatch || !rightMatch) {
    return left.localeCompare(right);
  }

  if (leftMatch[1] !== rightMatch[1]) {
    return leftMatch[1].localeCompare(rightMatch[1]);
  }

  // leftNumber 存储左侧预发布标记中用于排序的数字后缀。
  const leftNumber = leftMatch[2];
  // rightNumber 存储右侧预发布标记中用于排序的数字后缀。
  const rightNumber = rightMatch[2];

  if (leftNumber && rightNumber) {
    return Number(leftNumber) - Number(rightNumber);
  }

  return left.localeCompare(right);
}

// 按插件版本比较规则判断当前版本相对可用版本是更新、相同、不同还是未知，current 存储当前版本，available 存储可用版本。
export function comparePluginVersions(
  current: string,
  available: string
): CompareResult {
  if (isMissingVersion(current) || isMissingVersion(available)) {
    return "unknown";
  }

  // currentParts 存储当前版本解析后的结构化结果。
  const currentParts = parseVersion(current);
  // availableParts 存储可用版本解析后的结构化结果。
  const availableParts = parseVersion(available);

  if (!currentParts || !availableParts) {
    return current === available ? "same" : "different";
  }

  if (currentParts.major !== availableParts.major) {
    return currentParts.major < availableParts.major ? "newer" : "different";
  }

  if (currentParts.minor !== availableParts.minor) {
    return currentParts.minor < availableParts.minor ? "newer" : "different";
  }

  if (currentParts.patch !== availableParts.patch) {
    return currentParts.patch < availableParts.patch ? "newer" : "different";
  }

  // prerelease 相同说明两边代表完全一致的发布状态。
  if (currentParts.prerelease === availableParts.prerelease) {
    return "same";
  }

  // 当前是正式版、可用版本是同号预发布版时，正式版不能被当成升级目标。
  if (!currentParts.prerelease && availableParts.prerelease) {
    return "different";
  }

  // 当前是预发布版、可用版本是同号正式版时，属于稳定版升级。
  if (currentParts.prerelease && !availableParts.prerelease) {
    return "newer";
  }

  // 两边都带 prerelease 时，继续按预发布后缀的先后顺序比较。
  if (!currentParts.prerelease || !availableParts.prerelease) {
    return "different";
  }

  return comparePrerelease(currentParts.prerelease, availableParts.prerelease) < 0
    ? "newer"
    : "different";
}
