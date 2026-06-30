// PathSegment 存储路径字符串拆分后的单个片段。
type PathSegment = string;

// 判断输入值是否为可继续向下访问的普通对象，value 参数存储待检查的数据。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 判断字符串片段是否被双引号包裹，segment 参数存储路径中的单个片段。
function isQuotedSegment(segment: string): boolean {
  return segment.startsWith('"') && segment.endsWith('"') && segment.length >= 2;
}

// 去除路径片段两端的双引号，segment 参数存储需要去引号处理的路径片段。
function unquoteSegment(segment: string): string {
  return isQuotedSegment(segment) ? segment.slice(1, -1) : segment;
}

// 将点号路径拆成片段，path 参数存储待解析的点号路径，带引号片段中的点号会被保留。
function splitPath(path: string): PathSegment[] {
  // segments 存储按层级拆分后的路径片段列表。
  const segments: PathSegment[] = [];
  // currentSegment 存储正在累积的当前路径片段内容。
  let currentSegment = "";
  // inQuotes 存储当前是否处于双引号包裹的片段中。
  let inQuotes = false;

  // index 存储当前正在扫描的路径字符位置。
  for (let index = 0; index < path.length; index += 1) {
    // character 存储当前正在解析的单个路径字符。
    const character = path[index];

    // 引号用于允许 key 本身包含点号，因此需要切换解析状态而不是结束片段。
    if (character === '"') {
      inQuotes = !inQuotes;
      currentSegment += character;
      continue;
    }

    // 只有不在引号内的点号才代表路径层级分隔。
    if (character === "." && !inQuotes) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = "";
      }
      continue;
    }

    currentSegment += character;
  }

  // 末尾片段不会再遇到分隔符，需要在循环结束后补入结果。
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  // segment 参数存储待去除引号的路径片段。
  return segments.map((segment) => unquoteSegment(segment));
}

// 递归读取对象路径上的值，source 参数存储原始数据，path 参数存储点号路径，路径为空时返回源值本身。
export function getValueAtPath(source: unknown, path: string): unknown {
  if (!path) {
    return source;
  }

  // segments 存储需要逐层读取的路径片段。
  const segments = splitPath(path);
  // currentValue 存储当前正在读取的对象或最终值。
  let currentValue: unknown = source;

  for (const segment of segments) {
    // 非对象值无法继续按配置层级读取，说明路径不存在。
    if (!isRecord(currentValue)) {
      return undefined;
    }

    currentValue = currentValue[segment];
  }

  return currentValue;
}

// 递归写入对象路径上的值，source 参数存储原始数据，path 参数存储点号路径，value 参数存储要写入的新值，返回新的对象副本以避免原地修改。
export function setValueAtPath<T>(source: T, path: string, value: unknown): T {
  if (!path) {
    return value as T;
  }

  // segments 存储需要逐层写入的路径片段。
  const segments = splitPath(path);

  // cloneAndSet 负责沿着 path 逐层复制对象并写入 value，currentValue 参数存储当前层级的原始值，index 参数存储当前处理的路径层级，避免修改原始 source。
  function cloneAndSet(currentValue: unknown, index: number): unknown {
    // segment 存储当前层级需要写入的路径片段。
    const segment = segments[index];

    if (index === segments.length - 1) {
      // baseObject 存储当前层级的浅拷贝对象，用于避免原地修改。
      const baseObject = isRecord(currentValue) ? { ...currentValue } : {};
      baseObject[segment] = value;
      return baseObject;
    }

    // nextValue 存储下一层递归要继续处理的原始值。
    const nextValue = isRecord(currentValue) ? currentValue[segment] : undefined;
    // nextObject 存储当前层级的浅拷贝对象，用于承接递归写入结果。
    const nextObject = isRecord(currentValue) ? { ...currentValue } : {};
    nextObject[segment] = cloneAndSet(nextValue, index + 1);
    return nextObject;
  }

  return cloneAndSet(source, 0) as T;
}

// 递归删除对象路径上的值，source 参数存储原始数据，path 参数存储点号路径，返回新的对象副本以避免原地修改。
export function deleteValueAtPath<T>(source: T, path: string): T {
  if (!path) {
    return source;
  }

  // segments 存储需要逐层删除的路径片段。
  const segments = splitPath(path);

  // cloneAndDelete 负责沿着 path 逐层复制对象并删除目标字段，currentValue 参数存储当前层级的原始值，index 参数存储当前处理的路径层级，避免修改原始 source。
  function cloneAndDelete(currentValue: unknown, index: number): unknown {
    if (!isRecord(currentValue)) {
      return currentValue;
    }

    // segment 存储当前层级需要删除的路径片段。
    const segment = segments[index];
    // nextObject 存储当前层级的浅拷贝对象，用于避免原地修改。
    const nextObject: Record<string, unknown> = { ...currentValue };

    if (index === segments.length - 1) {
      delete nextObject[segment];
      return nextObject;
    }

    nextObject[segment] = cloneAndDelete(currentValue[segment], index + 1);
    return nextObject;
  }

  return cloneAndDelete(source, 0) as T;
}

// 计算顶层未被 knownPaths 覆盖的未知配置 key，source 参数存储完整配置对象，knownPaths 参数存储 schema 已知路径列表，供保守回退逻辑使用。
export function listUnknownTopLevelKeys(
  source: Record<string, unknown>,
  knownPaths: string[]
): string[] {
  // knownTopLevelKeys 存储 schema 已声明支持的顶层 key 集合。
  const knownTopLevelKeys = new Set(
    // 这里先把每条 schema 路径折叠成顶层 key，后续 unknown 检测只关心顶层字段是否已被 schema 覆盖。
    knownPaths
      .map(
        // knownPath 参数存储 schema 中的单个已知路径。
        (knownPath) => splitPath(knownPath)[0]
      )
      .filter(
        // topLevelKey 参数存储 map 后得到的顶层 key，空值需要过滤掉以避免污染已知 key 集合。
        (topLevelKey) => Boolean(topLevelKey)
      )
  );

  return Object.keys(source).filter(
    // key 参数存储 source 中待判断是否未知的顶层字段名。
    (key) => !knownTopLevelKeys.has(key)
  );
}

// 判断 key 是否包含常见敏感字段片段，key 参数存储待检查的字段名，用于决定是否掩码显示。
export function isSensitiveKey(key: string): boolean {
  // normalizedKey 存储用于匹配敏感关键字的小写 key。
  const normalizedKey = key.toLowerCase();
  return (
    normalizedKey.includes("token") ||
    normalizedKey.includes("password") ||
    normalizedKey.includes("secret") ||
    normalizedKey.includes("apikey") ||
    normalizedKey.includes("api_key") ||
    normalizedKey.includes("auth")
  );
}

// 将敏感值统一掩码为占位文本，value 参数存储待显示的数据，避免在界面中直接泄露原文。
export function maskSensitiveValue(value: unknown): string {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  return "••••••";
}
