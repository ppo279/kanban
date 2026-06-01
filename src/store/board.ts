"use client";

import { create } from "zustand";
import type { Task, User, Status } from "@/types";
import { STATUSES } from "@/types";

interface BoardState {
  // 数据
  me: User | null;
  users: User[];
  tasks: Task[];

  // 状态
  hydrated: boolean;

  // actions
  setMe: (me: User | null) => void;
  setUsers: (users: User[]) => void;
  setTasks: (tasks: Task[]) => void;
  upsertTask: (t: Task) => void;
  removeTask: (id: string) => void;
  moveTaskLocal: (id: string, status: Status, position: number) => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  me: null,
  users: [],
  tasks: [],
  hydrated: false,

  setMe: (me) => set({ me }),
  setUsers: (users) => set({ users }),
  setTasks: (tasks) => set({ tasks, hydrated: true }),
  upsertTask: (t) =>
    set((s) => {
      const idx = s.tasks.findIndex((x) => x.id === t.id);
      if (idx === -1) return { tasks: [...s.tasks, t] };
      const next = s.tasks.slice();
      next[idx] = t;
      return { tasks: next };
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
