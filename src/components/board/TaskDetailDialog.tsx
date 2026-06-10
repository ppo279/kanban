"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  Trash2,
  Plus,
  ListChecks,
  CornerDownRight,
  FileText,
  Unlink,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useBoardStore, selectChildrenOf, computeSubtaskProgress } from "@/store/board";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  TASK_TYPES,
  TASK_TYPE_LABEL,
  HTTP_METHODS,
  HTTP_METHOD_COLOR,
  STATUS_LABEL,
  DOC_MODE_LABEL,
  DOC_MODE_COLOR,
  type Priority,
  type TaskType,
  type Status,
  type Task,
  type DocMode,
  type ApiInterface,
} from "@/types";

const SUBTASK_STATUS_BADGE: Record<Status, string> = {
  todo: "bg-slate-100 text-slate-700 border-slate-300",
  doing: "bg-amber-100 text-amber-800 border-amber-300",
  review: "bg-blue-100 text-blue-700 border-blue-300",
  done: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

interface Props {
  task: Task | null;
  open: boolean;
  onOpenChange: (b: boolean) => void;
}

export function TaskDetailDialog({ task, open, onOpenChange }: Props) {
  const me = useBoardStore((s) => s.me);
  const users = useBoardStore((s) => s.users);
  const upsertTask = useBoardStore((s) => s.upsertTask);
  const upsertTasks = useBoardStore((s) => s.upsertTasks);
  const removeTask = useBoardStore((s) => s.removeTask);
  const allTasks = useBoardStore((s) => s.tasks);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("med");
  const [type, setType] = useState<TaskType>("feature");
  const [assigneeId, setAssigneeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 子任务相关
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [creatingSubtask, setCreatingSubtask] = useState(false);

  // Mock API 关联接口状态
  const [linkedInterfaces, setLinkedInterfaces] = useState<ApiInterface[]>([]);
  const [mockMethod, setMockMethod] = useState<string>("GET");
  const [mockPath, setMockPath] = useState("");
  const [mockResponse, setMockResponse] = useState('{"code": 200, "data": {}}');
  const [mockStatusCode, setMockStatusCode] = useState(200);
  const [mockTestResult, setMockTestResult] = useState<string | null>(null);
  const [mockTesting, setMockTesting] = useState(false);

  // 关联文档
  interface LinkedDoc {
    documentId: string;
    taskId: string;
    sectionKey: string | null;
    document: { id: string; title: string; mode: DocMode; createdAt: number; updatedAt: number };
  }
  const [linkedDocs, setLinkedDocs] = useState<LinkedDoc[]>([]);
  const [linkingDoc, setLinkingDoc] = useState(false);
  // 关联文档用的小输入:docId
  const [linkDocInput, setLinkDocInput] = useState("");
  // 搜索候选
  const [docSearchResults, setDocSearchResults] = useState<
    Array<{ id: string; title: string; mode: DocMode }>
  >([]);

  // 当前 task 的子任务 + 进度
  const children = useMemo(
    () => (task ? selectChildrenOf({ tasks: allTasks } as any, task.id) : []),
    [task, allTasks]
  );
  const progress = useMemo(() => computeSubtaskProgress(children), [children]);
  const hasParent = !!task?.parentId;
  // 软限 2 层:有 parent 的 task 不允许再添加子任务
  const canHaveSubtasks = !!task && !hasParent;

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setPriority(task.priority);
      setType(task.type ?? "feature");
      setAssigneeId(task.assigneeId);

      // 加载关联的接口
      if (task.type === "mock-api") {
        loadLinkedInterfaces(task.id);
      }
      // 加载关联的文档
      loadLinkedDocs(task.id);
    }
  }, [task]);

  async function loadLinkedDocs(taskId: string) {
    try {
      const r = await fetch(`/api/tasks/${taskId}/documents`, { credentials: "include" });
      const data = await r.json();
      if (data.ok) setLinkedDocs(data.links);
    } catch {
      // ignore
    }
  }

  // 搜索文档做关联候选 — 输入变化时 debounce
  useEffect(() => {
    const q = linkDocInput.trim();
    if (!q) {
      setDocSearchResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/documents?q=${encodeURIComponent(q)}`,
          { credentials: "include" }
        );
        const data = await r.json();
        if (data.ok) {
          // 过滤掉已经关联的
          const linkedIds = new Set(linkedDocs.map((l) => l.documentId));
          setDocSearchResults(
            data.documents
              .filter((d: any) => !linkedIds.has(d.id))
              .slice(0, 8)
          );
        }
      } catch {
        // ignore
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [linkDocInput, linkedDocs]);

  async function handleLinkDoc(docId: string) {
    if (!task) return;
    setLinkingDoc(true);
    try {
      const r = await fetch("/api/document-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ documentId: docId, taskId: task.id }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "关联失败");
        return;
      }
      toast.success("已关联文档");
      setLinkDocInput("");
      setDocSearchResults([]);
      await loadLinkedDocs(task.id);
    } catch (e: any) {
      toast.error(`网络错误:${e?.message ?? e}`);
    } finally {
      setLinkingDoc(false);
    }
  }

  async function handleUnlinkDoc(docId: string) {
    if (!task) return;
    try {
      const r = await fetch(
        `/api/document-tasks?docId=${encodeURIComponent(docId)}&taskId=${encodeURIComponent(task.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      const data = await r.json();
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "解除失败");
        return;
      }
      toast.success("已解除关联");
      await loadLinkedDocs(task.id);
    } catch {
      toast.error("网络错误");
    }
  }

  function handleJumpToDoc(docId: string) {
    // 触发全局事件让 DocPanel 切到对应 doc
    window.dispatchEvent(
      new CustomEvent("kanban:jump-to-doc", { detail: { docId } })
    );
  }

  async function loadLinkedInterfaces(taskId: string) {
    try {
      const r = await fetch(`/api/interfaces?taskId=${taskId}`, { credentials: "include" });
      const data = await r.json();
      if (data.ok && data.interfaces.length > 0) {
        setLinkedInterfaces(data.interfaces);
        const iface = data.interfaces[0];
        setMockMethod(iface.method);
        setMockPath(iface.path);
        setMockResponse(iface.mockResponse ?? '{"code": 200, "data": {}}');
        setMockStatusCode(iface.mockStatusCode ?? 200);
      }
    } catch {
      // ignore
    }
  }

  async function handleTestMock() {
    if (!mockPath) {
      toast.error("请填写 Mock 路径");
      return;
    }
    setMockTesting(true);
    setMockTestResult(null);
    try {
      const url = `/api/mock${mockPath.startsWith("/") ? mockPath : `/${mockPath}`}`;
      const r = await fetch(url, { method: mockMethod });
      const text = await r.text();
      setMockTestResult(`${r.status} ${r.statusText}\n${text}`);
    } catch (e: any) {
      setMockTestResult(`错误: ${e.message}`);
    } finally {
      setMockTesting(false);
    }
  }

  if (!task) return null;

  const canEdit = me?.id === task.createdById || me?.id === task.assigneeId;

  async function handleSave() {
    if (!task) return;
    if (!title.trim()) {
      toast.error("标题不能为空");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          type,
          assigneeId,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "保存失败");
        return;
      }
      upsertTask(data.task);

      // 如果是 mock-api 类型，保存接口配置
      if (type === "mock-api" && mockPath) {
        await saveMockInterface(task.id);
      }

      toast.success("已保存");
      onOpenChange(false);
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  }

  async function saveMockInterface(taskId: string) {
    try {
      const ifaceData = {
        moduleId: linkedInterfaces[0]?.moduleId ?? "",
        taskId,
        name: title.trim(),
        method: mockMethod,
        path: mockPath,
        description: description.trim() || null,
        mockResponse,
        mockStatusCode,
        status: "active" as const,
      };

      if (linkedInterfaces.length > 0) {
        // 更新现有接口
        await fetch(`/api/interfaces/${linkedInterfaces[0].id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(ifaceData),
        });
      } else {
        // 如果没有模块，先自动创建一个
        let moduleId = "";
        const modR = await fetch("/api/modules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: "自动创建模块" }),
        });
        const modData = await modR.json();
        if (modData.ok) moduleId = modData.module.id;

        if (moduleId) {
          await fetch("/api/interfaces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ ...ifaceData, moduleId }),
          });
        }
      }
    } catch {
      // ignore
    }
  }

  async function handleDelete() {
    if (!task) return;
    if (!confirm("确定删除这个任务？")) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "删除失败");
        return;
      }
      removeTask(task.id);
      toast.success("已删除");
      onOpenChange(false);
    } catch {
      toast.error("网络错误");
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddSubtask() {
    if (!task || !newSubtaskTitle.trim()) return;
    setCreatingSubtask(true);
    try {
      const r = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: newSubtaskTitle.trim(),
          parentId: task.id,
          assigneeId: me?.id ?? task.assigneeId,
          priority: "med",
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "创建子任务失败");
        return;
      }
      upsertTask(data.task);
      // 父任务状态可能 rollup 了(虽然新子任务都是 todo 通常不会)
      // 但保险起见,刷新父任务
      setNewSubtaskTitle("");
      toast.success("子任务已创建");
    } catch {
      toast.error("网络错误");
    } finally {
      setCreatingSubtask(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>任务详情</DialogTitle>
          <DialogDescription>
            创建于 {new Date(task.createdAt).toLocaleString("zh-CN")}
            {!canEdit && " · 你没有编辑权限"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>标题</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>描述</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={5}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>任务类型</Label>
            <div className="flex gap-1">
              {TASK_TYPES.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => canEdit && setType(t)}
                  disabled={!canEdit}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                    type === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  } ${!canEdit && "opacity-50 cursor-not-allowed"}`}
                >
                  {TASK_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>优先级</Label>
              <div className="flex gap-1">
                {PRIORITIES.map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => canEdit && setPriority(p)}
                    disabled={!canEdit}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                      priority === p
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    } ${!canEdit && "opacity-50 cursor-not-allowed"}`}
                  >
                    {PRIORITY_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>指派给</Label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                disabled={!canEdit}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 关联文档面板 */}
          <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
              <FileText className="h-3.5 w-3.5" />
              关联文档 ({linkedDocs.length})
            </div>

            {linkedDocs.length > 0 && (
              <div className="space-y-0.5">
                {linkedDocs.map((l) => (
                  <div
                    key={l.documentId}
                    className="flex items-center gap-2 rounded bg-white border border-amber-100 px-2 py-1 text-xs"
                  >
                    <FileText className="h-3 w-3 text-amber-500 shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{l.document.title}</span>
                    <span
                      className={`shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium ${DOC_MODE_COLOR[l.document.mode]}`}
                    >
                      {DOC_MODE_LABEL[l.document.mode]}
                    </span>
                    {l.sectionKey && (
                      <span className="text-[9px] text-muted-foreground shrink-0">
                        [{l.sectionKey}]
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleJumpToDoc(l.documentId)}
                      className="text-amber-600 hover:text-amber-700 shrink-0"
                      title="跳转到文档"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUnlinkDoc(l.documentId)}
                      className="text-muted-foreground hover:text-rose-500 shrink-0"
                      title="解除关联"
                    >
                      <Unlink className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 搜索/添加 */}
            <div className="space-y-1">
              <div className="flex gap-1">
                <Input
                  value={linkDocInput}
                  onChange={(e) => setLinkDocInput(e.target.value)}
                  placeholder="搜索文档标题…"
                  className="h-7 text-xs"
                />
              </div>
              {docSearchResults.length > 0 && (
                <div className="rounded border bg-white max-h-32 overflow-y-auto">
                  {docSearchResults.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => handleLinkDoc(d.id)}
                      disabled={linkingDoc}
                      className="w-full flex items-center gap-2 px-2 py-1 text-xs hover:bg-amber-50 text-left"
                    >
                      <FileText className="h-3 w-3 text-amber-500 shrink-0" />
                      <span className="flex-1 truncate">{d.title}</span>
                      <span
                        className={`shrink-0 text-[9px] px-1 rounded ${DOC_MODE_COLOR[d.mode]}`}
                      >
                        {DOC_MODE_LABEL[d.mode]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 子任务面板 — 软限 2 层(已经是子任务的不能再加子任务) */}
          {(canHaveSubtasks || children.length > 0) && (
            <div className="rounded-md border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-indigo-700">
                  <ListChecks className="h-3.5 w-3.5" />
                  子任务 ({progress.done}/{progress.total})
                </div>
                {hasParent && (
                  <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                    <CornerDownRight className="h-3 w-3" />
                    已是子任务
                  </span>
                )}
              </div>

              {/* 子任务列表 */}
              {children.length > 0 && (
                <div className="space-y-0.5">
                  {children.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 rounded bg-white border border-indigo-100 px-2 py-1 text-xs"
                    >
                      <span
                        className={`shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold ${SUBTASK_STATUS_BADGE[c.status]}`}
                      >
                        {STATUS_LABEL[c.status]}
                      </span>
                      <span
                        className={`flex-1 min-w-0 truncate ${
                          c.status === "done" ? "line-through text-muted-foreground" : ""
                        }`}
                      >
                        {c.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* 新增输入框 */}
              {canHaveSubtasks && (
                <div className="flex gap-1">
                  <Input
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="新子任务标题…"
                    className="h-7 text-xs"
                    maxLength={200}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAddSubtask();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddSubtask}
                    disabled={creatingSubtask || !newSubtaskTitle.trim()}
                    className="h-7"
                  >
                    <Plus className="h-3 w-3" />
                    添加
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Mock API 配置面板 */}
          {type === "mock-api" && (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-orange-700">
                ⚡ Mock API 配置
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">方法</Label>
                  <select
                    value={mockMethod}
                    onChange={(e) => setMockMethod(e.target.value)}
                    disabled={!canEdit}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {HTTP_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">路径</Label>
                  <Input
                    value={mockPath}
                    onChange={(e) => setMockPath(e.target.value)}
                    placeholder="/api/mock/users"
                    disabled={!canEdit}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mock 响应体 (JSON)</Label>
                <Textarea
                  value={mockResponse}
                  onChange={(e) => setMockResponse(e.target.value)}
                  rows={6}
                  disabled={!canEdit}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">状态码</Label>
                  <Input
                    type="number"
                    value={mockStatusCode}
                    onChange={(e) => setMockStatusCode(Number(e.target.value))}
                    disabled={!canEdit}
                    className="h-8 text-xs"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestMock}
                  disabled={mockTesting}
                  className="h-8"
                >
                  {mockTesting ? "测试中…" : "▶ 测试调用"}
                </Button>
              </div>
              {mockTestResult && (
                <pre className="rounded bg-white p-2 text-xs font-mono overflow-auto max-h-40 border">
                  {mockTestResult}
                </pre>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canEdit || deleting}
            size="sm"
          >
            <Trash2 className="mr-1 h-4 w-4" />
            {deleting ? "删除中…" : "删除"}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={!canEdit || saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
