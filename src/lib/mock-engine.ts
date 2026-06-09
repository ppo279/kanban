/**
 * Lightweight Mock.js-style data generator.
 * Supports common @placeholder syntax for generating mock data.
 */

/** Mock field definition */
export interface MockFieldDef {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  mock: string;
  desc: string;
  required: boolean;
  /** 子字段 — 仅 array/object 类型生效，定义每个元素/属性的结构 */
  children?: MockFieldDef[];
}

// ========== Placeholder generators ==========

const NAMES_CN = ["张三", "李四", "王五", "赵六", "钱七", "孙八", "周九", "吴十", "郑十一", "冯十二"];
const NAMES_EN = ["John", "Jane", "Bob", "Alice", "Charlie", "David", "Emma", "Frank", "Grace", "Henry"];
const CITIES = ["北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京", "重庆", "西安"];
const WORDS_CN = ["你好", "世界", "数据", "接口", "系统", "管理", "用户", "订单", "商品", "支付"];
const TITLES = ["工程师", "设计师", "产品经理", "测试", "架构师", "主管", "总监", "实习生"];
const EMAILS = ["test@example.com", "admin@demo.com", "user@site.com", "dev@corp.com", "info@mock.com"];
const IMAGES = [
  "https://picsum.photos/200/200",
  "https://picsum.photos/400/300",
  "https://via.placeholder.com/150",
  "https://placehold.co/200x200",
];
const URLS = ["https://example.com", "https://api.demo.com/v1", "https://docs.example.com"];
const UUIDS = ["550e8400-e29b-41d4-a716-446655440000", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, fixed: number = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(fixed));
}

function randomId(len: number = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function randomCWord(min: number = 1, max: number = 3): string {
  const len = min === max ? min : randInt(min, max);
  return Array.from({ length: len }, () => pick(WORDS_CN)).join("");
}

function padZero(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function randomDate(): string {
  const y = randInt(2020, 2025);
  const m = padZero(randInt(1, 12));
  const d = padZero(randInt(1, 28));
  return `${y}-${m}-${d}`;
}

function randomDateTime(): string {
  return `${randomDate()}T${padZero(randInt(0, 23))}:${padZero(randInt(0, 59))}:${padZero(randInt(0, 59))}Z`;
}

// ========== Parse mock rule ==========

interface MockToken {
  type: "placeholder" | "literal";
  name?: string;
  args?: string[];
  text?: string;
}

function tokenizeMock(rule: string): MockToken[] {
  const tokens: MockToken[] = [];
  let i = 0;
  while (i < rule.length) {
    if (rule[i] === "@") {
      // Read placeholder name
      let j = i + 1;
      while (j < rule.length && /[a-zA-Z0-9_]/.test(rule[j])) j++;
      const name = rule.slice(i + 1, j);
      // Check for args: @func(min,max)
      if (j < rule.length && rule[j] === "(") {
        let k = rule.indexOf(")", j);
        if (k === -1) k = rule.length - 1;
        const argsStr = rule.slice(j + 1, k);
        const args = argsStr.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
        tokens.push({ type: "placeholder", name, args });
        i = k + 1;
      } else {
        tokens.push({ type: "placeholder", name });
        i = j;
      }
    } else {
      // Literal text until next @
      let j = i;
      while (j < rule.length && rule[j] !== "@") j++;
      tokens.push({ type: "literal", text: rule.slice(i, j) });
      i = j;
    }
  }
  return tokens;
}

function evalPlaceholder(name: string, args?: string[]): unknown {
  switch (name) {
    // Strings
    case "name":
    case "cname":
      return pick(NAMES_CN);
    case "name_en":
      return pick(NAMES_EN);
    case "cword":
      return randomCWord(args ? parseInt(args[0]) || 1 : 1, args?.[1] ? parseInt(args[1]) || 3 : 3);
    case "title":
      return pick(TITLES);
    case "email":
      return pick(EMAILS);
    case "phone":
      return `1${randInt(30, 99)}${randomId(8)}`;
    case "image":
      return pick(IMAGES);
    case "url":
      return pick(URLS);
    case "uuid":
      return pick(UUIDS);
    case "id":
    case "guid":
      return randomId(12);
    case "city":
      return pick(CITIES);
    case "province":
      return pick(["北京市", "上海市", "广东省", "浙江省", "四川省", "湖北省"]);
    case "zip":
      return String(randInt(100000, 999999));
    case "date":
      return randomDate();
    case "now":
    case "datetime":
      return randomDateTime();
    case "time":
      return `${padZero(randInt(0, 23))}:${padZero(randInt(0, 59))}:${padZero(randInt(0, 59))}`;
    case "word":
      return randomId(randInt(3, 8));
    case "sentence":
      return `${pick(WORDS_CN)}${pick(WORDS_CN)}${pick(WORDS_CN)}${pick(WORDS_CN)}。`;
    case "paragraph":
      return `${pick(WORDS_CN)}${pick(WORDS_CN)}。${pick(WORDS_CN)}${pick(WORDS_CN)}${pick(WORDS_CN)}。`;
    case "color":
      return `#${randomId(6)}`;
    case "ip":
      return `${randInt(10, 239)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
    case "boolean":
    case "bool":
      return Math.random() > 0.5;
    case "status":
      return pick(["active", "inactive", "pending"]);

    // Numbers
    case "integer":
    case "int":
      return randInt(
        args?.[0] ? parseInt(args[0]) : 1,
        args?.[1] ? parseInt(args[1]) : 1000
      );
    case "natural":
      return randInt(
        args?.[0] ? parseInt(args[0]) : 0,
        args?.[1] ? parseInt(args[1]) : 1000
      );
    case "float":
      return randFloat(
        args?.[0] ? parseFloat(args[0]) : 0,
        args?.[1] ? parseFloat(args[1]) : 100,
        args?.[2] ? parseInt(args[2]) : 2
      );
    case "increment":
      return randInt(1, 100);

    default:
      // Unknown placeholder, return as-is
      return `@${name}`;
  }
}

// ========== Main API ==========

/** Evaluate a single mock rule string */
export function evalMockRule(rule: string): unknown {
  const tokens = tokenizeMock(rule);
  if (tokens.length === 1 && tokens[0].type === "placeholder" && tokens[0].name) {
    return evalPlaceholder(tokens[0].name, tokens[0].args);
  }
  // Multi-token: concatenate results
  return tokens
    .map((t) =>
      t.type === "placeholder" && t.name ? String(evalPlaceholder(t.name, t.args)) : t.text ?? ""
    )
    .join("");
}

/** Generate a mock object from field definitions */
export function generateMockData(fields: MockFieldDef[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (!field.required && Math.random() < 0.2) continue; // 20% chance to skip optional fields
    result[field.key] = generateField(field);
  }
  return result;
}

function generateField(field: MockFieldDef): unknown {
  const rule = field.mock.trim();

  // If the rule is a raw value (no @), return as-is with type coercion
  if (!rule.startsWith("@")) {
    switch (field.type) {
      case "number":
        return parseFloat(rule) || 0;
      case "boolean":
        return rule === "true";
      default:
        return rule;
    }
  }

  switch (field.type) {
    case "string":
      return String(evalMockRule(rule));
    case "number":
      const num = evalMockRule(rule);
      return typeof num === "number" ? num : parseFloat(String(num)) || 0;
    case "boolean":
      const bool = evalMockRule(rule);
      return typeof bool === "boolean" ? bool : bool === "true";
    case "array": {
      // 有 children 时生成结构化数组元素
      if (field.children && field.children.length > 0) {
        const count = parseInt(field.mock) || randInt(3, 8);
        return Array.from({ length: count }, () => generateMockData(field.children!));
      }
      // 回退：无 children 时用 mock 规则生成简单值数组
      const count = randInt(2, 5);
      const childRule = rule.replace(/^@\w+(\([^)]*\))?\s*/, "") || "@cword(2,4)";
      return Array.from({ length: count }, () => evalMockRule(childRule.startsWith("@") ? childRule : `@cword`));
    }
    case "object":
      // 有 children 时生成结构化对象
      if (field.children && field.children.length > 0) {
        return generateMockData(field.children);
      }
      return evalMockRule(rule);
    default:
      return evalMockRule(rule);
  }
}

/** Generate flat key-value object from fields */
function generateMockResponseFlat(fields: MockFieldDef[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.required || Math.random() > 0.15) {
      result[field.key] = generateField(field);
    }
  }
  return result;
}

/** Wrap response data with envelope */
export function wrapResponse(
  data: Record<string, unknown>,
  wrapper: { enabled: boolean; codeField: string; messageField: string; dataField: string; successCode: number }
): Record<string, unknown> {
  if (!wrapper.enabled) return data;
  return {
    [wrapper.codeField]: wrapper.successCode,
    [wrapper.messageField]: "success",
    [wrapper.dataField]: data,
  };
}

/** 请求参数预设模板 — 用于"请求参数" Tab 的模板填充 */
export const REQUEST_PRESETS: { name: string; fields: MockFieldDef[] }[] = [
  {
    name: "通用分页",
    fields: [
      { key: "page", label: "页码", type: "number", mock: "@integer(1,10)", desc: "当前页码", required: true },
      { key: "pageSize", label: "每页数量", type: "number", mock: "@integer(10,50)", desc: "每页条数", required: true },
      { key: "sortBy", label: "排序字段", type: "string", mock: "@word", desc: "排序字段名", required: false },
      { key: "sortOrder", label: "排序方向", type: "string", mock: "desc", desc: "asc/desc", required: false },
    ],
  },
  {
    name: "游标分页",
    fields: [
      { key: "cursor", label: "游标", type: "string", mock: "@id", desc: "翻页游标", required: false },
      { key: "limit", label: "数量", type: "number", mock: "@integer(10,50)", desc: "每页条数", required: true },
    ],
  },
  {
    name: "时间范围筛选",
    fields: [
      { key: "startTime", label: "开始时间", type: "string", mock: "@datetime", desc: "筛选起始时间", required: false },
      { key: "endTime", label: "结束时间", type: "string", mock: "@datetime", desc: "筛选结束时间", required: false },
    ],
  },
  {
    name: "关键词搜索",
    fields: [
      { key: "keyword", label: "关键词", type: "string", mock: "@cword(2,4)", desc: "搜索关键词", required: false },
    ],
  },
  {
    name: "列表请求（分页+搜索）",
    fields: [
      { key: "page", label: "页码", type: "number", mock: "@integer(1,10)", desc: "当前页码", required: true },
      { key: "pageSize", label: "每页数量", type: "number", mock: "@integer(10,50)", desc: "每页条数", required: true },
      { key: "keyword", label: "关键词", type: "string", mock: "@cword(2,4)", desc: "搜索关键词", required: false },
      { key: "sortBy", label: "排序字段", type: "string", mock: "id", desc: "排序字段名", required: false },
      { key: "sortOrder", label: "排序方向", type: "string", mock: "desc", desc: "asc/desc", required: false },
    ],
  },
  {
    name: "用户筛选",
    fields: [
      { key: "name", label: "用户名", type: "string", mock: "@cname", desc: "按姓名模糊筛选", required: false },
      { key: "email", label: "邮箱", type: "string", mock: "@email", desc: "按邮箱筛选", required: false },
      { key: "phone", label: "手机号", type: "string", mock: "@phone", desc: "按手机号筛选", required: false },
      { key: "status", label: "状态", type: "string", mock: "active", desc: "active/inactive", required: false },
    ],
  },
  {
    name: "状态筛选",
    fields: [
      { key: "status", label: "状态", type: "string", mock: "active", desc: "例如 active/pending/done", required: false },
      { key: "startTime", label: "开始时间", type: "string", mock: "@datetime", desc: "筛选起始时间", required: false },
      { key: "endTime", label: "结束时间", type: "string", mock: "@datetime", desc: "筛选结束时间", required: false },
    ],
  },
];

/** @deprecated 用 REQUEST_PRESETS 代替，保留别名以兼容旧引用 */
export const PAGINATION_PRESETS = REQUEST_PRESETS;

/** Mock preset field templates for quick start */
export const MOCK_PRESETS: { name: string; fields: MockFieldDef[] }[] = [
  {
    name: "用户信息",
    fields: [
      { key: "id", label: "ID", type: "number", mock: "@integer(1,1000)", desc: "用户ID", required: true },
      { key: "name", label: "用户名", type: "string", mock: "@cname", desc: "中文姓名", required: true },
      { key: "email", label: "邮箱", type: "string", mock: "@email", desc: "邮箱地址", required: true },
      { key: "phone", label: "手机号", type: "string", mock: "@phone", desc: "手机号码", required: false },
      { key: "avatar", label: "头像", type: "string", mock: "@image", desc: "头像URL", required: false },
      { key: "city", label: "城市", type: "string", mock: "@city", desc: "所在城市", required: false },
    ],
  },
  {
    name: "商品信息",
    fields: [
      { key: "id", label: "ID", type: "number", mock: "@integer(1,10000)", desc: "商品ID", required: true },
      { key: "title", label: "商品名", type: "string", mock: "@cword(2,6)", desc: "商品标题", required: true },
      { key: "price", label: "价格", type: "number", mock: "@float(10,9999,2)", desc: "商品价格", required: true },
      { key: "stock", label: "库存", type: "number", mock: "@integer(0,500)", desc: "库存数量", required: false },
      { key: "image", label: "图片", type: "string", mock: "@image", desc: "商品图片", required: false },
      { key: "status", label: "状态", type: "string", mock: "@status", desc: "上架状态", required: false },
    ],
  },
  {
    name: "订单信息",
    fields: [
      { key: "id", label: "订单号", type: "string", mock: "@id", desc: "订单编号", required: true },
      { key: "userId", label: "用户ID", type: "number", mock: "@integer(1,1000)", desc: "下单用户", required: true },
      { key: "amount", label: "金额", type: "number", mock: "@float(1,10000,2)", desc: "订单金额", required: true },
      { key: "status", label: "状态", type: "string", mock: "@status", desc: "订单状态", required: true },
      { key: "createdAt", label: "创建时间", type: "string", mock: "@datetime", desc: "下单时间", required: true },
    ],
  },
  {
    name: "分页列表响应",
    fields: [
      { key: "total", label: "总数", type: "number", mock: "@integer(50,500)", desc: "数据总条数", required: true },
      { key: "page", label: "当前页", type: "number", mock: "@integer(1,10)", desc: "当前页码", required: true },
      { key: "pageSize", label: "每页数量", type: "number", mock: "20", desc: "每页条数", required: true },
      {
        key: "list", label: "数据列表", type: "array", mock: "5", desc: "列表数据（展开可编辑元素结构）", required: true,
        children: [
          { key: "id", label: "ID", type: "number", mock: "@integer(1,1000)", desc: "数据ID", required: true },
          { key: "name", label: "名称", type: "string", mock: "@cname", desc: "数据名称", required: true },
          { key: "status", label: "状态", type: "string", mock: "@status", desc: "数据状态", required: false },
          { key: "createdAt", label: "创建时间", type: "string", mock: "@datetime", desc: "创建时间", required: false },
        ],
      },
    ],
  },
];
