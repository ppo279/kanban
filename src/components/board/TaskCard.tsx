"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Avatar } from "@/components/ui/avatar";
import { PRIORITY_BAR, ROLE_COLOR, PRIORITY_LABEL, TASK_TYPE_LABEL, TASK_TYPE_COLOR } from "@/types";
import type { Task, User } from "@/types";
import { cn } from "@/lib/util";

interface Props {
  task: Task;
  assignee?: User;
  onClick?: (t: Task) => void;
}

export function TaskCard({ task, assignee, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => !isDragging && onClick?.(task)}
      className={cn(
        "group relative flex items-start gap-2 rounded-md border bg-card p-3 shadow-sm hover:shadow cursor-grab active:cursor-grabbing select-none transition-shadow",
        isDragging && "ring-2 ring-primary"
      )}
    >
      {/* 优先级色条 */}
      <div
        className={cn("absolute left-0 top-0 h-full w-1 rounded-l-md", PRIORITY_BAR[task.priority])}
        aria-label={`priority-${task.priority}`}
      />

      <div className="flex-1 min-w-0 pl-2">
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className={cn(
              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white",
              TASK_TYPE_COLOR[task.type ?? "feature"]
            )}
          >
            {TASK_TYPE_LABEL[task.type ?? "feature"]}
          </span>
        </div>
        <div className="text-sm font-medium leading-snug line-clamp-2 break-words">
          {task.title}
        </div>
        {task.description && (
          <div className="mt-1 text-xs text-muted-foreground line-clamp-1">
            {task.description}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {PRIORITY_LABEL[task.priority]}
          </span>
          {assignee && (
            <Avatar
              name={assignee.name}
              color={ROLE_COLOR[assignee.role]}
              size="sm"
            />
          )}
        </div>
      </div>
    </div>
  );
}
