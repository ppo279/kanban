"use client";

import { useState, useMemo, useEffect } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, ListChecks, CornerDownRight, FileText, Eye, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Avatar } from "@/components/ui/avatar";
import {
  PRIORITY_BAR,
  ROLE_COLOR,
  PRIORITY_LABEL,
  TASK_TYPE_LABEL,
  TASK_TYPE_COLOR,
  STATUS_LABEL,
  DOC_MODE_LABEL,
  DOC_MODE_COLOR,
  type Status,
  type DocMode,
} from "@/types";
import type { Task, User } from "@/types";
import { cn } from "@/lib/util";
import { useBoardStore, selectChildrenOf, computeSubtaskProgress } from "@/store/board";

const STATUS_BADGE: Record<Status, string> = {
  todo: "bg-slate-100 text-slate-700 border-slate-300",
  doing: "bg-amber-100 text-amber-800 border-amber-300",
  review: "bg-blue-100 text-blue-700 border-blue-300",
  done: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

interface Props {
  task: Task;
  assignee?: User;
  onClick?: (t: Task) => void;
  onView?: (t: Task) => void;
  onEdit?: (t: Task) => void;
  /** 是否正在被"跳转"高亮(从协作文档点徽章跳过来) */
  flash?: boolean;
}

export function TaskCard({ task, assignee, onClick, onView, onEdit, flash = false }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const me = useBoardStore((s) => s.me);
  const removeTask = useBoardStore((s) => s.removeTask);
  const canEdit = me?.id === task.createdById || me?.id === task.assigneeId;

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const r = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await r.json();

      if (r.ok && data.ok) {
        removeTask(task.id);
        toast.success("已删除");
      } else {
        toast.error(data.error ?? "删除失败");
      }
    } catch {
      toast.error("网络错误");
    }
  };

  const [expanded, setExpanded] = useState(false);

  // 拿稳定的 tasks 引用 + 在 useMemo 里 filter/sort — 避免 zustand selector 每次返回新数组导致无限循环
  const allTasks = useBoardStore((s) => s.tasks);
  const children = useMemo(
    () => selectChildrenOf({ tasks: allTasks } as any, task.id),
    [allTasks, task.id]
  );
  const progress = useMemo(() => computeSubtaskProgress(children), [children]);
  const hasChildren = children.length > 0;
  const hasParent = !!task.parentId;

  // 子任务的负责人表(为了展开时显示)
  const users = useBoardStore((s) => s.users);

  // 关联的文档数(用作卡片上的小徽章 — 轻量提示)
  const [docCount, setDocCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tasks/${task.id}/documents`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.ok) setDocCount(d.links.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [task.id, task.updatedAt]); // task 变化时刷新

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  // 拖拽只在 header 触发,展开按钮/子任务行不触发
  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // 不触发卡片的 onClick
    setExpanded((v) => !v);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          className={cn(
            "group relative rounded-md border bg-card shadow-sm hover:shadow transition-shadow",
            isDragging && "ring-2 ring-primary",
            flash && "ring-2 ring-amber-400 shadow-lg shadow-amber-200 animate-pulse",
            hasParent && "border-l-4 border-l-sky-400" // 子任务左边色条
          )}
          data-task-card-id={task.id}
        >
          {/* 优先级色条 */}
          <div
            className={cn("absolute left-0 top-0 h-full w-1 rounded-l-md", PRIORITY_BAR[task.priority])}
            aria-label={`priority-${task.priority}`}
          />

          {/* 卡片主体(可拖拽) */}
          <div
            {...listeners}
            {...attributes}
            onClick={() => !isDragging && onClick?.(task)}
            className={cn(
              "flex items-start gap-2 p-3 cursor-grab active:cursor-grabbing select-none",
              hasChildren && "pb-2"
            )}
          >
            <div className="flex-1 min-w-0 pl-2">
              {/* 类型徽章 + 父子标识 */}
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span
                  className={cn(
                    "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white",
                    TASK_TYPE_COLOR[task.type ?? "feature"]
                  )}
                >
                  {TASK_TYPE_LABEL[task.type ?? "feature"]}
                </span>
                {hasParent && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 text-[9px] font-medium"
                    title="这是子任务,有上级"
                  >
                    <CornerDownRight className="h-2.5 w-2.5" />
                    子任务
                  </span>
                )}
                {docCount > 0 && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[9px] font-medium"
                    title={`关联 ${docCount} 个文档,点任务详情查看`}
                  >
                    <FileText className="h-2.5 w-2.5" />
                    {docCount} 文档
                  </span>
                )}
              </div>
              <div className="text-sm font-medium leading-snug line-clamp-2 break-words">
                {task.title}
              </div>
              {task.description && (
                <div className="mt-1 text-xs text-muted-foreground line-clamp-1">
                  {task.description}
                </div>
              )}

              {/* 父任务:进度条 + 子任务计数 */}
              {hasChildren && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground tabular-nums shrink-0">
                    {progress.done}/{progress.total}
                  </span>
                </div>
              )}

              {/* 底部:优先级 + 头像 */}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {PRIORITY_LABEL[task.priority]}
                </span>
                {assignee && (
                  <Avatar name={assignee.name} color={ROLE_COLOR[assignee.role]} size="sm" />
                )}
              </div>
            </div>
          </div>

          {/* 展开/折叠按钮 + 子任务计数(在卡片底部,独立可点) */}
          {hasChildren && (
            <>
              <button
                type="button"
                onClick={handleExpandClick}
                className="w-full flex items-center justify-between gap-1 px-3 py-1.5 border-t text-[10px] text-muted-foreground hover:bg-muted/50 transition-colors"
                title={expanded ? "折叠子任务" : "展开子任务"}
              >
                <span className="inline-flex items-center gap-1">
                  <ListChecks className="h-3 w-3" />
                  {expanded ? "收起" : "展开"} {children.length} 个子任务
                </span>
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>

              {expanded && (
                <div className="border-t bg-slate-50/50 px-2 py-1.5 space-y-0.5">
                  {children.map((c) => {
                    const ca = users.find((u) => u.id === c.assigneeId);
                    return (
                      <div
                        key={c.id}
                        onClick={() => onClick?.(c)}
                        className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-white cursor-pointer text-[11px] group/sub"
                        data-subtask-id={c.id}
                      >
                        <span
                          className={cn(
                            "shrink-0 inline-flex items-center gap-0.5 rounded border px-1 py-0 text-[8px] font-bold",
                            STATUS_BADGE[c.status]
                          )}
                        >
                          {STATUS_LABEL[c.status]}
                        </span>
                        <span
                          className={cn(
                            "flex-1 min-w-0 truncate",
                            c.status === "done" && "line-through text-muted-foreground"
                          )}
                        >
                          {c.title}
                        </span>
                        {ca && (
                          <Avatar name={ca.name} color={ROLE_COLOR[ca.role]} size="sm" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => onView?.(task)}>
          <Eye className="mr-2 h-4 w-4" />
          查看详情
        </ContextMenuItem>
        {canEdit && (
          <>
            <ContextMenuItem onClick={() => onEdit?.(task)}>
              <Pencil className="mr-2 h-4 w-4" />
              编辑
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={handleDelete}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              删除
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
