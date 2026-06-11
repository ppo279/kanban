"use client";

import { useDroppable } from "@dnd-kit/core";
import { TaskCard } from "./TaskCard";
import type { Status, Task, User } from "@/types";
import { STATUS_LABEL } from "@/types";

interface Props {
  status: Status;
  tasks: Task[];
  users: User[];
  onCardClick: (t: Task) => void;
  onViewTask: (t: Task) => void;
  onEditTask: (t: Task) => void;
  /** 当前正在闪的任务 ID(协作文档跳转高亮) */
  flashTaskId?: string | null;
  /** 聚合模式:列不可拖入,任务卡显示 ws 来源 */
  isAggregate?: boolean;
  /** wsId → ws name(给任务卡显示来源) */
  workspaceNameById?: Record<string, string>;
}

const STATUS_HEADER: Record<Status, string> = {
  todo: "border-t-slate-400",
  doing: "border-t-blue-500",
  review: "border-t-amber-500",
  done: "border-t-emerald-500",
};

export function Column({ status, tasks, users, onCardClick, onViewTask, onEditTask, flashTaskId, isAggregate, workspaceNameById }: Props) {
  // 聚合模式:列不是 droppable,任务不可拖入
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: isAggregate });

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/30">
      <div className={`rounded-t-lg border-t-4 ${STATUS_HEADER[status]} bg-card px-3 py-2.5`}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{STATUS_LABEL[status]}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {tasks.length}
          </span>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 p-2 min-h-[120px] transition-colors ${
          isOver && !isAggregate ? "bg-primary/5 ring-2 ring-primary/20 ring-inset" : ""
        }`}
      >
        {tasks.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-md border-2 border-dashed border-muted text-xs text-muted-foreground">
            {isAggregate ? "无任务" : "拖动到这里"}
          </div>
        )}
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            assignee={users.find((u) => u.id === t.assigneeId)}
            onClick={onCardClick}
            onView={onViewTask}
            onEdit={onEditTask}
            flash={flashTaskId === t.id}
            isAggregate={isAggregate}
            workspaceName={isAggregate ? workspaceNameById?.[t.workspaceId] : undefined}
          />
        ))}
      </div>
    </div>
  );
}
