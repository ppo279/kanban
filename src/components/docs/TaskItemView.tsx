"use client";

import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { CheckCircle2, Circle, Link2 } from "lucide-react";
import { cn } from "@/lib/util";

/**
 * TaskItem 节点的 React NodeView
 * - 渲染 checkbox 切换 done
 * - 如果有 taskId,显示一个"已关联"标签
 * - "关联到任务" 按钮:点击后 emit 自定义事件,父组件(DocPanel)弹 dialog
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
        <span
          className="shrink-0 inline-flex items-center gap-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-mono px-1 py-0.5 mt-0.5"
          title={`已关联任务 ${taskId}`}
        >
          <Link2 className="h-2.5 w-2.5" />
          {taskId.slice(0, 6)}
        </span>
      ) : (
        <button
          type="button"
          onClick={handleOpenAssociateDialog}
          className="shrink-0 opacity-0 group-hover:opacity-100 hover:bg-accent rounded text-[9px] text-muted-foreground hover:text-foreground px-1 py-0.5 mt-0.5 transition-opacity"
          title="关联到任务 / 创建任务"
        >
          + 任务
        </button>
      )}
    </NodeViewWrapper>
  );
}
