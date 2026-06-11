"use client";

/**
 * WorkspaceSwitcher — 顶部 workspace 下拉
 *
 * 显示当前 workspace 名字 + techStack 标签(可选)
 * 下拉:列表(可切) + "新建" + "项目设置"
 *
 * 数据加载:通过 prop 注入(workspaces + currentId + onSwitch + onCreateNew + onEdit)
 * 不直接调 fetch — 跟父组件 store 解耦,这样测试 / 强制刷新 / 多 ws 切都很灵活
 */

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Plus, Settings, Check, FolderOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/util";
import { type Workspace } from "@/types";

interface Props {
  workspaces: Workspace[];
  currentId: string | null;
  onSwitch: (id: string) => void;
  onCreateNew: () => void;
  /** 跳到"项目设置"页(本轮先 stub — 后面接) */
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function WorkspaceSwitcher({
  workspaces,
  currentId,
  onSwitch,
  onCreateNew,
  onEdit,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // 点外面关
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const current = workspaces.find((w) => w.id === currentId);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className="h-8 text-xs min-w-[140px] max-w-[220px] justify-start gap-1.5"
      >
        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-blue-600" />
        <span className="truncate flex-1 text-left">
          {current ? current.name : "选择项目"}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform shrink-0",
            open && "rotate-180"
          )}
        />
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-md border bg-white shadow-lg">
          {/* 列表 */}
          <div className="max-h-[320px] overflow-y-auto p-1">
            {workspaces.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                还没有项目,先建一个
              </div>
            ) : (
              workspaces.map((w) => (
                <div
                  key={w.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-100 group cursor-pointer",
                    w.id === currentId && "bg-blue-50"
                  )}
                  onClick={() => {
                    onSwitch(w.id);
                    setOpen(false);
                  }}
                >
                  <FolderOpen
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      w.id === currentId ? "text-blue-600" : "text-muted-foreground"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{w.name}</div>
                    {w.techStack.length > 0 && (
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {w.techStack.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="text-[9px] px-1 rounded bg-slate-200 text-slate-600"
                          >
                            {t}
                          </span>
                        ))}
                        {w.techStack.length > 3 && (
                          <span className="text-[9px] text-muted-foreground">
                            +{w.techStack.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {w.id === currentId && (
                    <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  )}
                  {onEdit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(w.id);
                        setOpen(false);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-blue-600"
                      title="项目设置"
                    >
                      <Settings className="h-3 w-3" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`确定删除「${w.name}」?\n该项目下所有任务、文档、接口都会被删除。`)) {
                          onDelete(w.id);
                          setOpen(false);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-600"
                      title="删除"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* 底部操作 */}
          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => {
                onCreateNew();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
            >
              <Plus className="h-3.5 w-3.5" />
              新建项目
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
