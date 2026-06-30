// VersionParts 存储从版本字符串中解析出的主版本、次版本、补丁与预发布信息。
type VersionParts = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
};

// CompareResult 存储插件版本比较函数对外返回的分类结果。
type CompareResult = "newer" | "same" | "different" | "unknown";

// PrereleaseIdentifier 存储 prerelease 中单个点分段的原始值与是否纯数字的判定结果。
type PrereleaseIdentifier = {
  value: string;
  isNumeric: boolean;
};

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

// 将 prerelease 字符串拆成 semver-like 点分段，prerelease 参数存储待拆分的预发布标签，后续比较需要逐段判断数字与字符串优先级。
function splitPrerelease(prerelease: string): PrereleaseIdentifier[] {
  // identifiers 存储 prerelease 按点号拆分后的所有分段。
  const identifiers = prerelease.split(".");

  return identifiers.map((identifier) => ({
    // value 存储单个 prerelease 分段的原始文本。
    value: identifier,
    // isNumeric 存储当前分段是否为纯数字，纯数字段需要按数值排序。
    isNumeric: /^\d+$/.test(identifier),
  }));
}

// 比较两个预发布标记，left 和 right 分别存储左右两侧的 prerelease 标签，按 semver-like 规则逐段比较点分段。
function comparePrerelease(left: string, right: string): number {
  // leftIdentifiers 存储左侧 prerelease 按点号拆分后的分段列表。
  const leftIdentifiers = splitPrerelease(left);
  // rightIdentifiers 存储右侧 prerelease 按点号拆分后的分段列表。
  const rightIdentifiers = splitPrerelease(right);
  // sharedLength 存储左右两侧可逐段对齐比较的最短长度。
  const sharedLength = Math.min(leftIdentifiers.length, rightIdentifiers.length);

  // index 存储当前正在比较的 prerelease 分段位置。
  for (let index = 0; index < sharedLength; index += 1) {
    // leftIdentifier 存储左侧当前分段的值与类型信息。
    const leftIdentifier = leftIdentifiers[index];
    // rightIdentifier 存储右侧当前分段的值与类型信息。
    const rightIdentifier = rightIdentifiers[index];

    if (leftIdentifier.value === rightIdentifier.value) {
      continue;
    }

    // semver 规定纯数字分段优先级低于非数字分段，因此这里需要先按类型分流。
    if (leftIdentifier.isNumeric && rightIdentifier.isNumeric) {
      return Number(leftIdentifier.value) - Number(rightIdentifier.value);
    }

    // 一边是数字一边是字符串时，数字分段代表更早的 prerelease。
    if (leftIdentifier.isNumeric !== rightIdentifier.isNumeric) {
      return leftIdentifier.isNumeric ? -1 : 1;
    }

    return leftIdentifier.value.localeCompare(rightIdentifier.value);
  }

  // 当前缀完全一致时，段数更少的 prerelease 优先级更低，符合 semver 对附加分段的定义。
  return leftIdentifiers.length - rightIdentifiers.length;
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
