export type Role = "frontend" | "backend" | "testing";

export type Status = "todo" | "doing" | "review" | "done";

export type Priority = "low" | "med" | "high";

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
  assigneeId: string;
  createdById: string;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export const STATUSES: readonly Status[] = ["todo", "doing", "review", "done"] as const;
export const PRIORITIES: readonly Priority[] = ["low", "med", "high"] as const;
export const ROLES: readonly Role[] = ["frontend", "backend", "testing"] as const;

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
