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
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
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
