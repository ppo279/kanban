"use client";

import { useMemo, useState, useEffect, useRef } from "react";
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
import { Plus, LogOut, PanelRightOpen, Layers } from "lucide-react";
import { toast } from "sonner";
import { Column } from "./Column";
import { NewTaskDialog } from "./NewTaskDialog";
import { TaskDetailDialog } from "./TaskDetailDialog";
import { DocDetailDialog } from "@/components/docs/DocDetailDialog";
import { TaskCard } from "./TaskCard";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useBoardStore, selectByStatus } from "@/store/board";
import { useSocket } from "@/hooks/useSocket";
import { between } from "@/lib/fractional";
import { STATUSES, ROLE_COLOR, ROLE_LABEL, type Task, type Status } from "@/types";
import { useRouter } from "next/navigation";
import { DocSidebar } from "@/components/docs/DocSidebar";
import { CreateWorkspaceWizard } from "@/components/workspace/CreateWorkspaceWizard";
import { WorkspaceSwitcher } from "@/components/workspace/WorkspaceSwitcher";
import { wsFetch } from "@/lib/wsFetch";

export function Board() {
  const router = useRouter();
  const me = useBoardStore((s) => s.me);
  const users = useBoardStore((s) => s.users);
  const tasks = useBoardStore((s) => s.tasks);
  const hydrated = useBoardStore((s) => s.hydrated);
  const moveTaskLocal = useBoardStore((s) => s.moveTaskLocal);
  const upsertTask = useBoardStore((s) => s.upsertTask);
  // ── workspace 状态(轮 3) ──
  const workspaces = useBoardStore((s) => s.workspaces);
  const currentWorkspaceId = useBoardStore((s) => s.currentWorkspaceId);
  const workspacesHydrated = useBoardStore((s) => s.workspacesHydrated);
  const isAggregate = useBoardStore((s) => s.isAggregate);
  const setWorkspaces = useBoardStore((s) => s.setWorkspaces);
  const setCurrentWorkspaceId = useBoardStore((s) => s.setCurrentWorkspaceId);
  const setIsAggregate = useBoardStore((s) => s.setIsAggregate);
  // 切 ws 立即清空 store.tasks,避免旧 ws 任务闪一下(useSocket 异步 resync 会很快填充)
  const setTasks = useBoardStore((s) => s.setTasks);

  useSocket();

  // ── 切 ws 立刻清空任务列表(useSocket resync 异步补新数据) ──
  useEffect(() => {
    setTasks([]);
  }, [currentWorkspaceId, setTasks]);

  // ── 拉 workspace 列表(只拉一次) ──
  useEffect(() => {
    if (workspacesHydrated) return;
    (async () => {
      try {
        const r = await fetch("/api/workspaces", { credentials: "include" });
        const data = await r.json();
        if (data.ok) setWorkspaces(data.workspaces);
      } catch {
        // 静默失败 — 让用户在 wizard 看到错误
      }
    })();
  }, [workspacesHydrated, setWorkspaces]);

  const [newOpen, setNewOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // 协作文档跳转高亮 — TaskItemView 点徽章 → 关文档侧栏 → 滚动到任务卡 → 闪一下
  const [flashTaskId, setFlashTaskId] = useState<string | null>(null);
  // 4 步向导开关
  const [wizardOpen, setWizardOpen] = useState(false);
  // 首次进入 + 没 ws + 已经 hydrate 过 → 强制弹向导
  const [forceWizard, setForceWizard] = useState(false);
  useEffect(() => {
    if (workspacesHydrated && workspaces.length === 0) {
      setForceWizard(true);
      setWizardOpen(true);
    }
  }, [workspacesHydrated, workspaces.length]);

  async function handleCreateNew() {
    setWizardOpen(true);
  }
  async function handleSwitch(id: string) {
    if (id === currentWorkspaceId) return;
    setCurrentWorkspaceId(id);
    // 切 ws 后清掉 tasks(让 byStatus 不带老数据)
    // 真实 fetch 留给轮 4
    // toast 提示一下
    const w = workspaces.find((x) => x.id === id);
    if (w) toast.success(`已切换到「${w.name}」`);
  }
  async function handleWsCreated(w: any) {
    // 把新 ws 塞进 list,自动切到它
    setWorkspaces([...workspaces, w]);
    setCurrentWorkspaceId(w.id);
    setForceWizard(false);
    setWizardOpen(false);
    toast.success(`已创建并切到「${w.name}」`);
  }
  async function handleDeleteWs(id: string) {
    try {
      const r = await fetch(`/api/workspaces/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await r.json();
      if (!data.ok) {
        toast.error(data.error ?? "删除失败");
        return;
      }
      setWorkspaces(workspaces.filter((w) => w.id !== id));
      if (id === currentWorkspaceId) {
        setCurrentWorkspaceId(workspaces.find((w) => w.id !== id)?.id ?? null);
      }
      toast.success("项目已删除");
    } catch (e: any) {
      toast.error(`网络错误: ${e?.message ?? e}`);
    }
  }

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
      const r = await fetch(`/api/tasks/${id}/move?workspaceId=${currentWorkspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus, position: newPos }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "移动失败");
        // 回滚：刷新全量(用 wsFetch 自动拼 wsId)
        if (currentWorkspaceId) {
          const all = await wsFetch(`/api/tasks?workspaceId=${currentWorkspaceId}`).then((r) => r.json());
          if (all.ok) useBoardStore.getState().setTasks(all.tasks);
        }
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

  function handleViewTask(t: Task) {
    setDetailTask(t);
    setDetailOpen(true);
    setSelectedTaskId(t.id);
    if (!sidebarOpen) setSidebarOpen(true);
  }

  function handleEditTask(t: Task) {
    setDetailTask(t);
    setDetailOpen(true);
    setSelectedTaskId(t.id);
    if (!sidebarOpen) setSidebarOpen(true);
  }

  // ── 监听"从协作文档跳到看板任务"事件(DocPanel 转发) ──
  useEffect(() => {
    const onJump = (e: Event) => {
      const ce = e as CustomEvent<{ taskId: string }>;
      const taskId = ce.detail?.taskId;
      if (!taskId) return;
      // 1. 关文档侧栏(让看板主区显示)
      if (sidebarOpen) setSidebarOpen(false);
      // 2. 滚动到对应 TaskCard
      const el = document.querySelector(
        `[data-task-card-id="${taskId}"]`
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      // 3. 闪一下高亮
      setFlashTaskId(taskId);
      setTimeout(() => {
        setFlashTaskId((curr) => (curr === taskId ? null : curr));
}, 1600);
    };
    window.addEventListener("kanban:jump-to-task", onJump);
    return () => window.removeEventListener("kanban:jump-to-task", onJump);
  }, [sidebarOpen]);

  // ── 监听"跳转到文档"事件(TaskCard 徽章 / TaskDetailDialog / ApiDocPanel 派发) ──
  useEffect(() => {
    const onJump = (e: Event) => {
      const ce = e as CustomEvent<{ docId: string }>;
      const docId = ce.detail?.docId;
      if (!docId) return;
      // 1. 开 sidebar,切到 docs tab
      if (!sidebarOpen) setSidebarOpen(true);
      window.dispatchEvent(
        new CustomEvent("kanban:switch-to-docs-tab", { detail: { docId } })
      );
      // 2. 让 DocPanel 打开指定 doc(再走 fetch + setSelectedDoc)
      window.dispatchEvent(
        new CustomEvent("kanban:open-doc", { detail: { docId } })
      );
    };
    window.addEventListener("kanban:jump-to-doc", onJump);
    return () => window.removeEventListener("kanban:jump-to-doc", onJump);
  }, [sidebarOpen]);

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
          <WorkspaceSwitcher
            workspaces={workspaces}
            currentId={currentWorkspaceId}
            onSwitch={handleSwitch}
            onCreateNew={handleCreateNew}
            onDelete={handleDeleteWs}
          />
          <Button
            variant={isAggregate ? "default" : "outline"}
            size="sm"
            onClick={() => setIsAggregate(!isAggregate)}
            title="聚合视图(只读):看所有项目的任务"
          >
            <Layers className="mr-1 h-4 w-4" /> {isAggregate ? "退出聚合" : "聚合视图"}
          </Button>
          <Button
            variant={sidebarOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <PanelRightOpen className="mr-1 h-4 w-4" /> 文档
          </Button>
          <Button
            onClick={() => setNewOpen(true)}
            size="sm"
            disabled={isAggregate}
            title={isAggregate ? "聚合视图只读,不能新建任务" : "新建任务"}
          >
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
            onDragStart={(e: DragStartEvent) => {
              if (isAggregate) return; // 聚合只读
              setActiveId(String(e.active.id));
            }}
            onDragEnd={onDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            {/* 聚合模式横幅 */}
            {isAggregate && (
              <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                聚合视图(只读):展示所有项目的任务,不可编辑/移动/新建。
                任务卡左侧带 <span className="font-mono text-xs">📁</span> 标签标识所属项目。
              </div>
            )}

            <div className="flex gap-3">
              {STATUSES.map((s) => (
                <Column
                  key={s}
                  status={s}
                  tasks={byStatus[s]}
                  users={users}
                  isAggregate={isAggregate}
                  workspaceNameById={Object.fromEntries(workspaces.map((w) => [w.id, w.name]))}
                  onCardClick={(t) => {
                    setDetailTask(t);
                    setDetailOpen(true);
                    setSelectedTaskId(t.id);
                    if (!sidebarOpen) setSidebarOpen(true);
                  }}
                  onViewTask={handleViewTask}
                  onEditTask={handleEditTask}
                  flashTaskId={flashTaskId}
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
      <TaskDetailDialog
        task={detailTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        isAggregate={isAggregate}
      />
      <DocDetailDialog />
      <CreateWorkspaceWizard
        open={wizardOpen}
        onOpenChange={(o) => {
          setWizardOpen(o);
          if (!o) setForceWizard(false);
        }}
        onCreated={handleWsCreated}
      />
    </div>
  );
}
