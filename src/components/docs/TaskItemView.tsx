"use client";

import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { CheckCircle2, Circle, Link2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/util";
import { useBoardStore } from "@/store/board";
import { STATUS_LABEL, PRIORITY_LABEL } from "@/types";

/** 状态 → 徽章配色 */
const STATUS_BADGE: Record<string, string> = {
  todo: "bg-slate-100 text-slate-700 border-slate-200",
  doing: "bg-amber-100 text-amber-800 border-amber-200",
  review: "bg-blue-100 text-blue-700 border-blue-200",
  done: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

/**
 * TaskItem 节点的 React NodeView
 * - 渲染 checkbox 切换 done
 * - 如果有关联 taskId:从 store 拿最新任务数据,显示状态徽章 + hover tooltip
 *   - 状态徽章展示看板当前状态(Todo/Doing/Review/Done)
 *   - tooltip 展示完整信息(标题、负责人、优先级)
 *   - 点徽章 → 跳转看板那张卡片(emit CustomEvent 让 DocPanel 切 tab + 滚动)
 * - 未关联时显示"+ 任务"按钮(关联/创建任务)
 *
 * NodeViewContent 渲染 taskItem 的 inline 内容(text)。内容 schema 是 "inline*",
 * 所以这里放一个 <span> 容器让 ProseMirror 接管 inline 编辑。
 */
export function TaskItemView({
  node,
  updateAttributes,
  editor,
  getPos,
}: NodeViewProps) {
  const done: boolean = !!node.attrs.done;
  const taskId: string | null = node.attrs.taskId;

  // 从 store 拿最新任务数据(只用 taskId 变化或 task 对象引用变化才重渲染)
  const task = useBoardStore((s) =>
    taskId ? s.tasks.find((t) => t.id === taskId) : undefined
  );
  const assignee = useBoardStore((s) =>
    task?.assigneeId ? s.users.find((u) => u.id === task.assigneeId) : undefined
  );

  function handleToggleDone() {
    updateAttributes({ done: !done });
  }

  function handleOpenAssociateDialog() {
    const pos = typeof getPos === "function" ? getPos() : null;
    const target = (editor.view.dom as HTMLElement).closest(
      "[data-doc-panel-root]"
    );
    if (target) {
      target.dispatchEvent(
        new CustomEvent("checklist:associate-task", {
          bubbles: true,
          detail: {
            currentTaskId: taskId,
            editor,
            position: pos,
          },
        })
      );
    }
  }

  /** 点击已关联的徽章 → 跳到看板那张任务卡片 */
  function handleJumpToTask() {
    if (!taskId) return;
    const target = (editor.view.dom as HTMLElement).closest(
      "[data-doc-panel-root]"
    );
    if (target) {
      target.dispatchEvent(
        new CustomEvent("checklist:jump-to-task", {
          bubbles: true,
          detail: { taskId },
        })
      );
    }
  }

  const status = task?.status ?? "todo";
  const badgeClass = STATUS_BADGE[status] ?? STATUS_BADGE.todo;

  // tooltip 文本 — 关联信息汇总
  const tooltipLines = task
    ? [
        `任务: ${task.title}`,
        `状态: ${STATUS_LABEL[task.status]}`,
        assignee ? `负责人: ${assignee.name}` : "负责人: 未分配",
        `优先级: ${PRIORITY_LABEL[task.priority]}`,
        "点击跳转到看板",
      ].join("\n")
    : `任务 ${taskId}(加载中…)`;

  return (
    <NodeViewWrapper
      className={cn(
        "flex items-start gap-2 my-0.5 list-none group",
        done && "opacity-60"
      )}
    >
      <button
        type="button"
        onClick={handleToggleDone}
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        title={done ? "取消勾选" : "勾选完成"}
      >
        {done ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </button>

      <NodeViewContent
        className={cn(
          "flex-1 min-w-0 outline-none",
          "before:content-[''] before:mr-1",
          done && "text-muted-foreground"
        )}
      />

      {taskId ? (
        // 已关联 — 显示看板状态徽章,hover 看完整信息,点跳看板
        <button
          type="button"
          onClick={handleJumpToTask}
          className={cn(
            "shrink-0 inline-flex items-center gap-0.5 rounded border text-[9px] font-bold px-1.5 py-0.5 mt-0.5 transition-opacity",
            "opacity-70 group-hover:opacity-100 hover:scale-105",
            badgeClass
          )}
          title={tooltipLines}
        >
          {STATUS_LABEL[status]}
          <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
        </button>
      ) : (
        // 未关联 — 显示"+ 任务"按钮
        <button
          type="button"
          onClick={handleOpenAssociateDialog}
          className="shrink-0 opacity-0 group-hover:opacity-100 hover:bg-accent rounded text-[9px] text-muted-foreground hover:text-foreground px-1 py-0.5 mt-0.5 transition-opacity inline-flex items-center gap-0.5"
          title="关联到任务 / 创建任务"
        >
          <Link2 className="h-2.5 w-2.5" />
          + 任务
        </button>
      )}
    </NodeViewWrapper>
  );
}