export type Role = "frontend" | "backend" | "testing";

export type Status = "todo" | "doing" | "review" | "done";

export type Priority = "low" | "med" | "high";

export type TaskType = "feature" | "bug" | "mock-api" | "doc";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type InterfaceStatus = "draft" | "active" | "deprecated";

export interface User {
  id: string;
  name: string;
  role: Role;
  createdAt: number;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  type: TaskType;
  assigneeId: string;
  createdById: string;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface ApiModule {
  id: string;
  name: string;
  description: string | null;
  responseWrapper: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface MockField {
  key: string;        // Field name (English)
  label: string;      // Chinese name
  type: "string" | "number" | "boolean" | "array" | "object";
  mock: string;       // Mock rule, e.g. @name, @integer(1,100)
  desc: string;       // Description
  required: boolean;  // Whether field is required
  children?: MockField[];  // 子字段 — 仅 array/object 类型生效
}

export interface ApiInterface {
  id: string;
  moduleId: string;
  taskId: string | null;
  name: string;
  method: HttpMethod;
  path: string;
  description: string | null;
  requestSchema: string | null;
  responseSchema: string | null;
  mockResponse: string | null;
  requestFields: string | MockField[] | null;
  mockFields: string | MockField[] | null;
  responseMode: ResponseMode;
  customWrapper: string | ResponseWrapper | null;
  mockStatusCode: number;
  mockHeaders: string | null;
  swaggerUrl: string | null;
  status: InterfaceStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Document {
  id: string;
  title: string;
  content: string | null;
  createdById: string;
  createdAt: number;
  updatedAt: number;
}

export const STATUSES: readonly Status[] = ["todo", "doing", "review", "done"] as const;
export const PRIORITIES: readonly Priority[] = ["low", "med", "high"] as const;
export const ROLES: readonly Role[] = ["frontend", "backend", "testing"] as const;
export const TASK_TYPES: readonly TaskType[] = ["feature", "bug", "mock-api", "doc"] as const;
export const HTTP_METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
export const INTERFACE_STATUSES: readonly InterfaceStatus[] = ["draft", "active", "deprecated"] as const;

export const STATUS_LABEL: Record<Status, string> = {
  todo: "Todo",
  doing: "Doing",
  review: "Review",
  done: "Done",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "低",
  med: "中",
  high: "高",
};

export const PRIORITY_BAR: Record<Priority, string> = {
  low: "bg-emerald-500",
  med: "bg-amber-500",
  high: "bg-rose-500",
};

export const ROLE_LABEL: Record<Role, string> = {
  frontend: "前端",
  backend: "后端",
  testing: "测试",
};

export const ROLE_COLOR: Record<Role, string> = {
  frontend: "bg-sky-500",
  backend: "bg-violet-500",
  testing: "bg-emerald-500",
};

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  feature: "功能",
  bug: "Bug",
  "mock-api": "Mock API",
  doc: "文档",
};

export const TASK_TYPE_COLOR: Record<TaskType, string> = {
  feature: "bg-blue-500",
  bug: "bg-red-500",
  "mock-api": "bg-orange-500",
  doc: "bg-teal-500",
};

export const HTTP_METHOD_COLOR: Record<HttpMethod, string> = {
  GET: "bg-emerald-500",
  POST: "bg-blue-500",
  PUT: "bg-amber-500",
  DELETE: "bg-red-500",
  PATCH: "bg-purple-500",
};

export const INTERFACE_STATUS_LABEL: Record<InterfaceStatus, string> = {
  draft: "草稿",
  active: "活跃",
  deprecated: "已废弃",
};

export const MOCK_FIELD_TYPES = ["string", "number", "boolean", "array", "object"] as const;

export type MockFieldType = (typeof MOCK_FIELD_TYPES)[number];

/** Response wrapper configuration */
export interface ResponseWrapper {
  enabled: boolean;
  codeField: string;
  messageField: string;
  dataField: string;
  successCode: number;
}

/** Default response wrapper */
export const DEFAULT_RESPONSE_WRAPPER: ResponseWrapper = {
  enabled: true,
  codeField: "code",
  messageField: "message",
  dataField: "data",
  successCode: 200,
};

/** Response mode per interface */
export type ResponseMode = "inherit" | "custom" | "raw";

/** Mock placeholder presets grouped by type */
export const MOCK_PLACEHOLDER_PRESETS: Record<string, { value: string; label: string }[]> = {
  string: [
    { value: "@cname", label: "中文姓名" },
    { value: "@name", label: "英文姓名" },
    { value: "@email", label: "邮箱" },
    { value: "@phone", label: "手机号" },
    { value: "@city", label: "城市" },
    { value: "@province", label: "省份" },
    { value: "@image", label: "图片URL" },
    { value: "@url", label: "网址" },
    { value: "@id", label: "ID" },
    { value: "@uuid", label: "UUID" },
    { value: "@date", label: "日期" },
    { value: "@datetime", label: "日期时间" },
    { value: "@time", label: "时间" },
    { value: "@word", label: "随机字符串" },
    { value: "@cword(2,6)", label: "中文词" },
    { value: "@sentence", label: "中文句子" },
    { value: "@title", label: "职称" },
    { value: "@color", label: "颜色" },
    { value: "@ip", label: "IP地址" },
    { value: "@status", label: "状态" },
  ],
  number: [
    { value: "@integer(1,100)", label: "整数 1-100" },
    { value: "@integer(1,1000)", label: "整数 1-1000" },
    { value: "@natural(0,1000)", label: "自然数" },
    { value: "@float(0,100,2)", label: "浮点数" },
    { value: "@float(10,9999,2)", label: "金额" },
  ],
  boolean: [
    { value: "@boolean", label: "布尔值" },
  ],
  array: [
    { value: "@cname", label: "中文姓名列表" },
    { value: "@cword(2,4)", label: "中文词列表" },
  ],
  object: [],
};
