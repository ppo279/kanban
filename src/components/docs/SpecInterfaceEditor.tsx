"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  Wand2,
  ExternalLink,
  CheckCircle2,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/util";
import type { DocMode } from "@/types";

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

const METHOD_COLOR: Record<HttpMethod, string> = {
  GET: "bg-emerald-500",
  POST: "bg-blue-500",
  PUT: "bg-amber-500",
  DELETE: "bg-red-500",
  PATCH: "bg-purple-500",
};

interface SpecInterface {
  id: string;
  documentId: string;
  method: HttpMethod;
  path: string;
  name: string;
  description: string | null;
  requestSchema: string | null;
  responseSchema: string | null;
  mockResponse: string | null;
  mockStatusCode: number;
  derivedTaskId: string | null;
  derivedInterfaceId: string | null;
}

interface Props {
  documentId: string;
  /** spec/tdd 模式才显示,free 模式这个组件不挂载 */
  docMode: DocMode;
}

/**
 * 结构化的「接口设计」编辑器
 *
 * - 取代原来 spec 的"接口设计"section 里的纯 markdown 文本
 * - 每一行是一个结构化接口(method/path/desc/mock response)
 * - 「生成 mock」按钮 → 一键转成 mock-api 任务 + api_interface
 * - 已生成的接口会标记"已建 mock" + 显示 taskId 链接
 */
export function SpecInterfaceEditor({ documentId, docMode }: Props) {
  const [items, setItems] = useState<SpecInterface[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // 草稿
  const [draft, setDraft] = useState({
    method: "GET" as HttpMethod,
    path: "/api/example",
    name: "示例接口",
    description: "",
    mockResponse: '{\n  "code": 200,\n  "data": null,\n  "message": "ok"\n}',
    mockStatusCode: 200,
  });

  // 编辑中的接口
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<SpecInterface>>({});
  // 待二次确认删除的接口 id(替代原生 window.confirm,保持与项目其他删除一致)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [documentId]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/spec-interfaces?documentId=${documentId}`,
        { credentials: "include" }
      );
      const data = await r.json();
      if (data.ok) setItems(data.interfaces);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!draft.path.trim() || !draft.name.trim()) {
      toast.error("接口路径和名称必填");
      return;
    }
    try {
      const r = await fetch("/api/spec-interfaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...draft, documentId }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "创建失败");
        return;
      }
      setItems((prev) => [...prev, data.interface]);
      setShowAdd(false);
      // 重置草稿
      setDraft({
        method: "GET",
        path: "/api/example",
        name: "示例接口",
        description: "",
        mockResponse: '{\n  "code": 200,\n  "data": null,\n  "message": "ok"\n}',
        mockStatusCode: 200,
      });
      toast.success("接口已加入");
    } catch (e: any) {
      toast.error(`网络错误:${e?.message ?? e}`);
    }
  }

  async function handleDelete(id: string) {
    // 二次确认:点删除按钮后变成"确认删除"+"取消",避免误触
    // 之前用 window.confirm 跟项目其他地方的 Radix Dialog 风格不一致,且有些环境会被拦截
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      // 3s 没点自动撤销
      setTimeout(() => {
        setConfirmDeleteId((cur) => (cur === id ? null : cur));
      }, 3000);
      return;
    }
    setConfirmDeleteId(null);
    try {
      const r = await fetch(`/api/spec-interfaces/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "删除失败");
        return;
      }
      setItems((prev) => prev.filter((it) => it.id !== id));
      toast.success("接口已删除");
    } catch {
      toast.error("网络错误");
    }
  }

  async function handleSaveEdit(id: string) {
    try {
      const r = await fetch(`/api/spec-interfaces/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editDraft),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "保存失败");
        return;
      }
      setItems((prev) =>
        prev.map((it) => (it.id === id ? data.interface : it))
      );
      setEditingId(null);
      setEditDraft({});
      toast.success("已保存");
    } catch (e: any) {
      toast.error(`网络错误:${e?.message ?? e}`);
    }
  }

  async function handleCreateMock(id: string) {
    try {
      const r = await fetch(`/api/spec-interfaces/${id}/create-mock`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "生成 mock 失败");
        return;
      }
      if (data.alreadyCreated) {
        toast.info("已生成过 mock 了,见关联任务");
      } else {
        toast.success("已生成 mock-api 任务,跳到看板查看");
      }
      // 刷新让 derivedTaskId / derivedInterfaceId 同步
      await load();
    } catch (e: any) {
      toast.error(`网络错误:${e?.message ?? e}`);
    }
  }

  function handleJumpToMock(taskId: string) {
    // 关掉当前 doc 对话框,跳到看板对应任务
    window.dispatchEvent(
      new CustomEvent("kanban:close-doc-and-jump-task", { detail: { taskId } })
    );
  }

  return (
    <div className="space-y-2">
      {/* 标题 + 添加按钮 */}
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1">
          <Code2 className="h-3 w-3" />
          结构化接口({items.length})
        </Label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] px-2"
          onClick={() => setShowAdd(!showAdd)}
        >
          <Plus className="h-3 w-3 mr-0.5" />
          {showAdd ? "取消" : "添加接口"}
        </Button>
      </div>

      {/* 添加草稿 */}
      {showAdd && (
        <div className="rounded-md border border-orange-200 bg-orange-50/30 p-2 space-y-1.5">
          <div className="grid grid-cols-[80px_1fr_1fr] gap-1">
            <select
              value={draft.method}
              onChange={(e) => setDraft({ ...draft, method: e.target.value as HttpMethod })}
              className="h-7 text-xs rounded border px-1"
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <Input
              value={draft.path}
              onChange={(e) => setDraft({ ...draft, path: e.target.value })}
              placeholder="/api/xxx"
              className="h-7 text-xs font-mono"
            />
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="接口名(如:获取用户列表)"
              className="h-7 text-xs"
            />
          </div>
          <Input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="描述(可选)"
            className="h-7 text-xs"
          />
          <Textarea
            value={draft.mockResponse}
            onChange={(e) => setDraft({ ...draft, mockResponse: e.target.value })}
            placeholder="Mock 响应体 (JSON)"
            rows={4}
            className="font-mono text-[10px] resize-none"
          />
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={draft.mockStatusCode}
              onChange={(e) =>
                setDraft({ ...draft, mockStatusCode: Number(e.target.value) })
              }
              className="h-7 text-xs w-20"
              placeholder="状态码"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              className="h-7 text-xs"
            >
              <Plus className="h-3 w-3 mr-0.5" />
              加入
            </Button>
          </div>
        </div>
      )}

      {/* 列表 */}
      {loading ? (
        <div className="text-[11px] text-muted-foreground text-center py-2">
          <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
          加载中…
        </div>
      ) : items.length === 0 ? (
        <div className="text-[11px] text-muted-foreground text-center py-2 italic">
          还没有结构化接口 —
          {docMode === "spec" ? " 点「添加接口」开始" : " spec 模式才需要"}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((it) => {
            const isEditing = editingId === it.id;
            const isDerived = !!it.derivedTaskId;
            if (isEditing) {
              return (
                <div
                  key={it.id}
                  className="rounded-md border border-blue-300 bg-blue-50/30 p-2 space-y-1.5"
                >
                  <div className="grid grid-cols-[80px_1fr_1fr] gap-1">
                    <select
                      value={(editDraft.method as HttpMethod) ?? it.method}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, method: e.target.value as HttpMethod })
                      }
                      className="h-7 text-xs rounded border px-1"
                      disabled={isDerived}
                      title={isDerived ? "已生成 mock,method 不能改" : ""}
                    >
                      {HTTP_METHODS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <Input
                      value={(editDraft.path as string) ?? it.path}
                      onChange={(e) => setEditDraft({ ...editDraft, path: e.target.value })}
                      className="h-7 text-xs font-mono"
                      disabled={isDerived}
                    />
                    <Input
                      value={(editDraft.name as string) ?? it.name}
                      onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                      className="h-7 text-xs"
                    />
                  </div>
                  <Input
                    value={(editDraft.description as string | null) ?? it.description ?? ""}
                    onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                    placeholder="描述"
                    className="h-7 text-xs"
                  />
                  <Textarea
                    value={(editDraft.mockResponse as string | null) ?? it.mockResponse ?? ""}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, mockResponse: e.target.value })
                    }
                    rows={4}
                    className="font-mono text-[10px] resize-none"
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={(editDraft.mockStatusCode as number) ?? it.mockStatusCode}
                      onChange={(e) =>
                        setEditDraft({
                          ...editDraft,
                          mockStatusCode: Number(e.target.value),
                        })
                      }
                      className="h-7 text-xs w-20"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSaveEdit(it.id)}
                      className="h-7 text-xs"
                    >
                      保存
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(null);
                        setEditDraft({});
                      }}
                      className="h-7 text-xs"
                    >
                      取消
                    </Button>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={it.id}
                className={cn(
                  "rounded-md border p-2 group",
                  isDerived
                    ? "border-emerald-200 bg-emerald-50/30"
                    : "border-slate-200 bg-white"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold text-white",
                      METHOD_COLOR[it.method]
                    )}
                  >
                    {it.method}
                  </span>
                  <code className="text-[11px] font-mono text-slate-700 flex-1 truncate">
                    {it.path}
                  </code>
                  {isDerived && (
                    <span
                      className="shrink-0 inline-flex items-center gap-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-medium"
                      title={`已生成 mock,关联 task: ${it.derivedTaskId}`}
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      已建 mock
                    </span>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(it.id);
                      setEditDraft({});
                    }}
                    className="h-5 px-1.5 text-[10px] opacity-0 group-hover:opacity-100"
                  >
                    编辑
                  </Button>
                  {!isDerived && (
                    <Button
                      type="button"
                      size="sm"
                      variant={confirmDeleteId === it.id ? "destructive" : "ghost"}
                      onClick={() => handleDelete(it.id)}
                      className={cn(
                        "h-5 px-1.5 text-[10px] text-rose-500 opacity-0 group-hover:opacity-100",
                        confirmDeleteId === it.id && "opacity-100"
                      )}
                      title={
                        confirmDeleteId === it.id ? "再点一次确认删除" : "删除接口"
                      }
                    >
                      {confirmDeleteId === it.id ? "确认" : <Trash2 className="h-3 w-3" />}
                    </Button>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {it.name}
                  {it.description ? ` · ${it.description}` : ""}
                </div>
                <div className="mt-1 flex items-center gap-1">
                  {isDerived ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => it.derivedTaskId && handleJumpToMock(it.derivedTaskId)}
                      className="h-5 text-[9px] px-1.5 text-emerald-700 border-emerald-300"
                    >
                      <ExternalLink className="h-2.5 w-2.5 mr-0.5" />
                      跳到 mock 任务
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleCreateMock(it.id)}
                      className="h-5 text-[9px] px-1.5 bg-orange-500 hover:bg-orange-600"
                      title="生成 mock-api 任务 + api_interface"
                    >
                      <Wand2 className="h-2.5 w-2.5 mr-0.5" />
                      生成 mock
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
