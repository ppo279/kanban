"use client";

import { useState, useEffect } from "react";
import { FileText, Code2, PanelRightClose } from "lucide-react";
import { cn } from "@/lib/util";
import { ApiDocPanel } from "./ApiDocPanel";
import { DocPanel } from "./DocPanel";

type Tab = "api" | "docs";

interface Props {
  open: boolean;
  onToggle: () => void;
  selectedTaskId?: string | null;
}

export function DocSidebar({ open, onToggle, selectedTaskId }: Props) {
  const [tab, setTab] = useState<Tab>("api");

  // 外部跳转到 doc 时,强制切到 docs tab
  useEffect(() => {
    const onSwitch = () => setTab("docs");
    window.addEventListener("kanban:switch-to-docs-tab", onSwitch);
    return () =>
      window.removeEventListener("kanban:switch-to-docs-tab", onSwitch);
  }, []);

  return (
    <div
      className={cn(
        "flex flex-col border-l bg-card transition-all duration-300 overflow-hidden",
        open ? "w-[420px] min-w-[420px]" : "w-0 min-w-0 border-l-0"
      )}
    >
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex gap-1">
          <button
            onClick={() => setTab("api")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              tab === "api"
                ? "bg-orange-100 text-orange-700"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Code2 className="h-3.5 w-3.5" />
            API 文档
          </button>
          <button
            onClick={() => setTab("docs")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              tab === "docs"
                ? "bg-blue-100 text-blue-700"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            协作文档
          </button>
        </div>
        <button
          onClick={onToggle}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          title="收起侧边栏"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {tab === "api" ? <ApiDocPanel selectedTaskId={selectedTaskId} /> : <DocPanel />}
      </div>
    </div>
  );
}
