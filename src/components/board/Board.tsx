"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  closestCenter,
} from "@dnd-kit/core";
import { Plus, LogOut, PanelRightOpen } from "lucide-react";
import { toast } from "sonner";
import { Column } from "./Column";
import { NewTaskDialog } from "./NewTaskDialog";
import { TaskDetailDialog } from "./TaskDetailDialog";
import { TaskCard } from "./TaskCard";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useBoardStore, selectByStatus } from "@/store/board";
import { useSocket } from "@/hooks/useSocket";
import { between } from "@/lib/fractional";
import { STATUSES, ROLE_COLOR, ROLE_LABEL, type Task, type Status } from "@/types";
import { useRouter } from "next/navigation";
import { DocSidebar } from "@/components/docs/DocSidebar";

export function Board() {
  const router = useRouter();
  const me = useBoardStore((s) => s.me);
  const users = useBoardStore((s) => s.users);
  const tasks = useBoardStore((s) => s.tasks);
  const hydrated = useBoardStore((s) => s.hydrated);
  const moveTaskLocal = useBoardStore((s) => s.moveTaskLocal);
  const upsertTask = useBoardStore((s) => s.upsertTask);

  useSocket();

  const [newOpen, setNewOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const byStatus = useMemo(() => selectByStatus({ tasks } as any), [tasks]);
  const activeTask = useMemo(() => tasks.find((t) => t.id === activeId) ?? null, [tasks, activeId]);

  function findStatusOfId(id: string): Status | null {
    for (const s of STATUSES) {
      if (byStatus[s].some((t) => t.id === id)) return s;
    }
    return null;
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;

    // overId 可能是列 id 或卡片 id
    const isColumnOver = (STATUSES as readonly string[]).includes(overId);
    const newStatus: Status = (isColumnOver ? overId : findStatusOfId(overId)) as Status;
    if (!newStatus) return;

    // 计算目标位置
    const colTasks = byStatus[newStatus].filter((t) => t.id !== id);
    let newPos: number;
    if (isColumnOver || colTasks.length === 0) {
      // 拖到空列或列底
      const last = colTasks[colTasks.length - 1];
      newPos = between(last?.position ?? null, null);
    } else {
      // 拖到某张卡上 → 插到该卡之前
      const overIdx = colTasks.findIndex((t) => t.id === overId);
      const before = colTasks[overIdx - 1]?.position ?? null;
      const after = colTasks[overIdx]?.position ?? null;
      newPos = between(before, after);
    }

    const oldStatus = findStatusOfId(id);
    if (oldStatus === newStatus) {
      const sameCol = byStatus[newStatus].find((t) => t.id === id);
      if (sameCol && sameCol.position === newPos) return;
    }

    // 乐观更新
    moveTaskLocal(id, newStatus, newPos);

    try {
      const r = await fetch(`/api/tasks/${id}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus, position: newPos }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "移动失败");
        // 回滚：刷新全量
        const all = await fetch("/api/tasks", { credentials: "include" }).then((r) => r.json());
        if (all.ok) useBoardStore.getState().setTasks(all.tasks);
        return;
      }
      upsertTask(data.task);
    } catch {
      toast.error("网络错误");
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    useBoardStore.getState().setMe(null);
    router.push("/login");
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        加载中…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部栏 */}
      <header className="flex items-center justify-between border-b bg-card px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-blue-500 to-violet-500" />
          <h1 className="text-lg font-bold">团队看板</h1>
          <span className="text-xs text-muted-foreground">实时协作</span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={sidebarOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <PanelRightOpen className="mr-1 h-4 w-4" /> 文档
          </Button>
          <Button onClick={() => setNewOpen(true)} size="sm">
            <Plus className="mr-1 h-4 w-4" /> 新建任务
          </Button>
          {me && (
            <div className="flex items-center gap-2 pl-3 border-l">
              <Avatar name={me.name} color={ROLE_COLOR[me.role]} size="sm" />
              <div className="hidden sm:block text-sm leading-tight">
                <div className="font-medium">{me.name}</div>
                <div className="text-[10px] text-muted-foreground">{ROLE_LABEL[me.role]}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} title="登出">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* 看板 + 侧边栏 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 看板 */}
        <main className="flex-1 overflow-x-auto bg-slate-50 p-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
            onDragEnd={onDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <div className="flex gap-3">
              {STATUSES.map((s) => (
                <Column
                  key={s}
                  status={s}
                  tasks={byStatus[s]}
                  users={users}
                    onCardClick={(t) => {
                      setDetailTask(t);
                      setDetailOpen(true);
                      setSelectedTaskId(t.id);
                      if (!sidebarOpen) setSidebarOpen(true);
                    }}
                />
              ))}
            </div>
            <DragOverlay>
              {activeTask ? (
                <div className="rotate-1 opacity-90">
                  <TaskCard
                    task={activeTask}
                    assignee={users.find((u) => u.id === activeTask.assigneeId)}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </main>

        {/* 文档侧边栏 */}
        <DocSidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          selectedTaskId={selectedTaskId}
        />
      </div>

      <NewTaskDialog open={newOpen} onOpenChange={setNewOpen} />
      <TaskDetailDialog task={detailTask} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
