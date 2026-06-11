"use client";

import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { useBoardStore } from "@/store/board";
import { wsFetch } from "@/lib/wsFetch";
import type { Task } from "@/types";

/**
 * 单例 Socket.IO 客户端（模块级，跨组件共享）。
 * 每次组件挂载都注册监听器、卸载时清理。
 * 自动订阅 4 个 board 事件并落入 Zustand store。
 */
let socket: Socket | null = null;
let socketInitPromise: Promise<Socket> | null = null;

function getSocket(): Socket {
  if (socket) return socket;
  if (typeof window === "undefined") {
    throw new Error("socket.io client can only be used in the browser");
  }
  socket = io({
    path: "/socket.io",
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 500,
  });
  return socket;
}

async function resync(setTasks: (t: Task[]) => void) {
  // 没切 ws → 不拉(让 wsFetch 抛错,我们吞掉)
  const wsId = useBoardStore.getState().currentWorkspaceId;
  if (!wsId) return;
  try {
    // wsFetch 会自动拼 ?workspaceId=wsId(GET 走 URL)
    const r = await wsFetch("/api/tasks");
    if (r.ok) {
      const data = await r.json();
      setTasks(data.tasks);
    }
  } catch (e) {
    console.error("[resync] failed", e);
  }
}

export function useSocket() {
  const setTasks = useBoardStore((s) => s.setTasks);
  const upsertTask = useBoardStore((s) => s.upsertTask);
  const removeTask = useBoardStore((s) => s.removeTask);
  const moveTaskLocal = useBoardStore((s) => s.moveTaskLocal);
  const currentWorkspaceId = useBoardStore((s) => s.currentWorkspaceId);

  useEffect(() => {
    const s = getSocket();

    const onConnect = () => {
      console.log("[socket] connected, resync…");
      resync(setTasks);
    };
    const onTaskCreated = (t: Task) => upsertTask(t);
    const onTaskUpdated = (t: Task) => upsertTask(t);
    const onTaskMoved = (p: { id: string; status: Task["status"]; position: number }) =>
      moveTaskLocal(p.id, p.status, p.position);
    const onTaskDeleted = (p: { id: string }) => removeTask(p.id);

    s.on("connect", onConnect);
    s.on("task:created", onTaskCreated);
    s.on("task:updated", onTaskUpdated);
    s.on("task:moved", onTaskMoved);
    s.on("task:deleted", onTaskDeleted);

    // 已连接：立刻拉一次（避免依赖时序）
    if (s.connected) onConnect();

    return () => {
      s.off("connect", onConnect);
      s.off("task:created", onTaskCreated);
      s.off("task:updated", onTaskUpdated);
      s.off("task:moved", onTaskMoved);
      s.off("task:deleted", onTaskDeleted);
    };
  }, [setTasks, upsertTask, removeTask, moveTaskLocal]);

  // 切 ws 后,立刻 resync(避免等 socket 重连)
  useEffect(() => {
    if (!currentWorkspaceId) return;
    resync(setTasks);
  }, [currentWorkspaceId, setTasks]);
}

export function getSocketInstance() {
  return socket;
}
