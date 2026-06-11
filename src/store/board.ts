"use client";

import { create } from "zustand";
import type { Task, User, Status, Workspace } from "@/types";
import { STATUSES } from "@/types";

interface BoardState {
  // 数据
  me: User | null;
  users: User[];
  tasks: Task[];
  /** 所有 workspace 列表 */
  workspaces: Workspace[];
  /** 当前 workspace id(用于 fetch /api/tasks?workspaceId=, 轮 4 会替换为持久化的 store) */
  currentWorkspaceId: string | null;
  /** 首次 hydrate 后是否查过 workspaces(决定要不要弹强制向导) */
  workspacesHydrated: boolean;

  // 状态
  hydrated: boolean;

  // actions
  setMe: (me: User | null) => void;
  setUsers: (users: User[]) => void;
  setTasks: (tasks: Task[]) => void;
  setWorkspaces: (ws: Workspace[]) => void;
  setCurrentWorkspaceId: (id: string | null) => void;
  setWorkspacesHydrated: (b: boolean) => void;
  upsertTask: (t: Task) => void;
  removeTask: (id: string) => void;
  moveTaskLocal: (id: string, status: Status, position: number) => void;
  /** 批量插入/更新(给 import-tasks 用) */
  upsertTasks: (ts: Task[]) => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  me: null,
  users: [],
  tasks: [],
  workspaces: [],
  currentWorkspaceId: null,
  workspacesHydrated: false,
  hydrated: false,

  setMe: (me) => set({ me }),
  setUsers: (users) => set({ users }),
  setTasks: (tasks) => set({ tasks, hydrated: true }),
  setWorkspaces: (ws) =>
    set({
      workspaces: ws,
      workspacesHydrated: true,
      // 第一次 hydrate 时,自动选第一个 ws(老的逻辑里 user 没显式选)
      currentWorkspaceId: ws.length > 0 ? ws[0].id : null,
    }),
  setCurrentWorkspaceId: (id) => set({ currentWorkspaceId: id }),
  setWorkspacesHydrated: (b) => set({ workspacesHydrated: b }),
  upsertTask: (t) =>
    set((s) => {
      const idx = s.tasks.findIndex((x) => x.id === t.id);
      if (idx === -1) return { tasks: [...s.tasks, t] };
      const next = s.tasks.slice();
      next[idx] = t;
      return { tasks: next };
    }),
  upsertTasks: (ts) =>
    set((s) => {
      const map = new Map(s.tasks.map((t) => [t.id, t]));
      for (const t of ts) map.set(t.id, t);
      return { tasks: Array.from(map.values()) };
    }),
  removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  moveTaskLocal: (id, status, position) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, status, position } : t)),
    })),
}));

// 选择器：按列分组的任务，按 position 排序
export function selectByStatus(state: BoardState): Record<Status, Task[]> {
  const map: Record<Status, Task[]> = { todo: [], doing: [], review: [], done: [] };
  for (const t of state.tasks) map[t.status].push(t);
  for (const s of STATUSES) map[s].sort((a, b) => a.position - b.position);
  return map;
}

/** 拿到 task 的所有子任务(已排序) */
export function selectChildrenOf(state: BoardState, parentId: string): Task[] {
  return state.tasks
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => a.position - b.position);
}

/** 拿到 task 的父任务(没有就 null) */
export function selectParentOf(state: BoardState, task: Task): Task | null {
  if (!task.parentId) return null;
  return state.tasks.find((t) => t.id === task.parentId) ?? null;
}

/** 计算一组子任务的进度 */
export interface SubtaskProgress {
  total: number;
  done: number;
  /** 0-1 的比例 */
  ratio: number;
}
export function computeSubtaskProgress(children: Task[]): SubtaskProgress {
  const total = children.length;
  const done = children.filter((c) => c.status === "done").length;
  return { total, done, ratio: total === 0 ? 0 : done / total };
}
