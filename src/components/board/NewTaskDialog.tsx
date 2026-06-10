"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
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
import { FileText, Plus } from "lucide-react";
import { useBoardStore } from "@/store/board";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  TASK_TYPES,
  TASK_TYPE_LABEL,
  HTTP_METHODS,
  DOC_MODE_LABEL,
  DOC_MODE_COLOR,
  type Priority,
  type TaskType,
  type DocMode,
  type ApiModule,
} from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}

const DEFAULT_MOCK_RESPONSE = `{
  "code": 200,
  "data": [],
  "message": "success"
}`;

export function NewTaskDialog({ open, onOpenChange }: Props) {
  const me = useBoardStore((s) => s.me);
  const users = useBoardStore((s) => s.users);
  const upsertTask = useBoardStore((s) => s.upsertTask);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("med");
  const [type, setType] = useState<TaskType>("feature");
  const [assigneeId, setAssigneeId] = useState(me?.id ?? "");
  const [loading, setLoading] = useState(false);

  // Mock API specific fields
  const [modules, setModules] = useState<ApiModule[]>([]);
  const [moduleId, setModuleId] = useState("");
  const [newModuleName, setNewModuleName] = useState("");
  const [mockMethod, setMockMethod] = useState("GET");
  const [mockPath, setMockPath] = useState("");
  const [mockResponse, setMockResponse] = useState(DEFAULT_MOCK_RESPONSE);
  const [mockStatusCode, setMockStatusCode] = useState(200);

  useEffect(() => {
    if (me && !assigneeId) {
      setAssigneeId(me.id);
    }
  }, [me, assigneeId]);

  // Load modules when dialog opens
  useEffect(() => {
    if (open) {
      fetch("/api/modules", { credentials: "include" })
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) setModules(data.modules);
        })
        .catch(() => {});
    }
  }, [open]);

  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setPriority("med");
    setType("feature");
    setModuleId("");
    setNewModuleName("");
    setMockMethod("GET");
    setMockPath("");
    setMockResponse(DEFAULT_MOCK_RESPONSE);
    setMockStatusCode(200);
    // doc-type state
    setDocMode("free");
    setNewDocTitle("");
    setLinkExistingDocId("");
  }, []);

  // ── doc-type 专属 state ──
  const [docMode, setDocMode] = useState<DocMode>("free");
  const [newDocTitle, setNewDocTitle] = useState("");
  const [linkExistingDocId, setLinkExistingDocId] = useState("");
  const [existingDocs, setExistingDocs] = useState<
    Array<{ id: string; title: string; mode: DocMode }>
  >([]);

  useEffect(() => {
    if (open) {
      // 拉可关联的文档列表(让用户选已有)
      fetch("/api/documents", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          if (d.ok) setExistingDocs(d.documents);
        })
        .catch(() => {});
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("标题不能为空");
      return;
    }

    // Validate mock-api specific fields
    if (type === "mock-api") {
      if (!mockPath.trim()) {
        toast.error("Mock API 路径不能为空");
        return;
      }
    }

    // Validate doc-type specific fields
    if (type === "doc") {
      if (!linkExistingDocId && !newDocTitle.trim()) {
        toast.error("选已有文档,或填新文档标题");
        return;
      }
    }

    setLoading(true);
    try {
      const r = await fetch("/api/tasks", {
        method: "POST",
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
        toast.error(data.error ?? "创建失败");
        return;
      }
      upsertTask(data.task);

      // If mock-api type, create associated interface
      if (type === "mock-api" && data.task) {
        await createMockInterface(data.task.id);
      }

      // If doc type, create-or-link a document + associate
      if (type === "doc" && data.task) {
        await linkOrCreateDoc(data.task.id);
      }

      toast.success("任务已创建");
      onOpenChange(false);
      resetForm();
    } catch (err) {
      toast.error("网络错误");
    } finally {
      setLoading(false);
    }
  }

  /** 选已有文档关联,或新建一个文档再关联 */
  async function linkOrCreateDoc(taskId: string) {
    try {
      let docId = linkExistingDocId;
      if (!docId && newDocTitle.trim()) {
        // 新建一个 free 文档
        const r = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ title: newDocTitle.trim(), mode: docMode }),
        });
        const data = await r.json();
        if (data.ok) docId = data.document.id;
      }
      if (docId) {
        await fetch("/api/document-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ documentId: docId, taskId }),
        });
      }
    } catch {
      toast.warning("任务已创建,但文档关联失败");
    }
  }

  async function createMockInterface(taskId: string) {
    try {
      // Determine module ID: use existing or create new
      let finalModuleId = moduleId;

      if (!finalModuleId && newModuleName.trim()) {
        // Create new module
        const modR = await fetch("/api/modules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: newModuleName.trim() }),
        });
        const modData = await modR.json();
        if (modData.ok) finalModuleId = modData.module.id;
      }

      if (!finalModuleId) {
        // Use or create a default "Mock API" module
        const existing = modules.find((m) => m.name === "Mock API");
        if (existing) {
          finalModuleId = existing.id;
        } else {
          const modR = await fetch("/api/modules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name: "Mock API" }),
          });
          const modData = await modR.json();
          if (modData.ok) finalModuleId = modData.module.id;
        }
      }

      if (finalModuleId) {
        await fetch("/api/interfaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            moduleId: finalModuleId,
            taskId,
            name: title.trim(),
            method: mockMethod,
            path: mockPath.trim(),
            description: description.trim() || null,
            mockResponse,
            mockStatusCode,
            status: "active",
          }),
        });
      }
    } catch {
      // Interface creation failed, but task was created
      toast.warning("任务已创建，但 Mock 接口配置失败");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新建任务</DialogTitle>
          <DialogDescription>任务创建后会出现在「Todo」列</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="t-title">标题 *</Label>
            <Input
              id="t-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="例如：实现登录页"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-desc">描述</Label>
            <Textarea
              id="t-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              placeholder="可选，任务详情"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>任务类型</Label>
            <div className="flex gap-1">
              {TASK_TYPES.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                    type === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  }`}
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
                    onClick={() => setPriority(p)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                      priority === p
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {PRIORITY_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-assignee">指派给</Label>
              <select
                id="t-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Mock API Configuration Panel */}
          {type === "mock-api" && (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-orange-700">
                ⚡ Mock API 配置
              </div>

              {/* API Module Selection */}
              <div className="space-y-1">
                <Label className="text-xs">API 模块分类</Label>
                <div className="flex gap-1">
                  <select
                    value={moduleId}
                    onChange={(e) => {
                      setModuleId(e.target.value);
                      if (e.target.value) setNewModuleName("");
                    }}
                    className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="">选择模块…</option>
                    {modules.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <Input
                    value={newModuleName}
                    onChange={(e) => {
                      setNewModuleName(e.target.value);
                      if (e.target.value) setModuleId("");
                    }}
                    placeholder="或新建模块"
                    className="h-8 text-xs flex-1"
                  />
                </div>
              </div>

              {/* Method + Path */}
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">方法</Label>
                  <select
                    value={mockMethod}
                    onChange={(e) => setMockMethod(e.target.value)}
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
                    placeholder="/users"
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Mock Response */}
              <div className="space-y-1">
                <Label className="text-xs">Mock 响应体 (JSON)</Label>
                <Textarea
                  value={mockResponse}
                  onChange={(e) => setMockResponse(e.target.value)}
                  rows={5}
                  className="font-mono text-xs"
                />
              </div>

              {/* Status Code */}
              <div className="space-y-1">
                <Label className="text-xs">状态码</Label>
                <Input
                  type="number"
                  value={mockStatusCode}
                  onChange={(e) => setMockStatusCode(Number(e.target.value))}
                  className="h-8 text-xs w-24"
                />
              </div>
            </div>
          )}

          {/* Doc 配置面板 — type=doc 时显示 */}
          {type === "doc" && (
            <div className="rounded-md border border-teal-200 bg-teal-50 p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-teal-700">
                <FileText className="h-3.5 w-3.5" />
                文档配置
              </div>
              <p className="text-[10px] text-muted-foreground -mt-1">
                任务的 deliverable 是一份文档。可以选已有文档关联,或新建一份。
              </p>

              {/* 选项 1:关联已有 */}
              <div className="space-y-1">
                <Label className="text-xs">关联到已有文档</Label>
                <select
                  value={linkExistingDocId}
                  onChange={(e) => {
                    setLinkExistingDocId(e.target.value);
                    if (e.target.value) setNewDocTitle("");
                  }}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">— 不关联已有 —</option>
                  {existingDocs.map((d) => (
                    <option key={d.id} value={d.id}>
                      [{DOC_MODE_LABEL[d.mode]}] {d.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-[10px] text-muted-foreground text-center">— 或 —</div>

              {/* 选项 2:新建 */}
              <div className="space-y-1">
                <Label className="text-xs">新建文档(填标题)</Label>
                <Input
                  value={newDocTitle}
                  onChange={(e) => {
                    setNewDocTitle(e.target.value);
                    if (e.target.value) setLinkExistingDocId("");
                  }}
                  placeholder="例如:用户列表 API 文档"
                  className="h-8 text-xs"
                />
                <div className="flex gap-1">
                  {(["free", "spec", "tdd"] as DocMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDocMode(m)}
                      className={`flex-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-all ${
                        docMode === m
                          ? "border-teal-500 bg-white ring-1 ring-teal-200"
                          : "border-slate-200 bg-white/50 hover:border-slate-300"
                      }`}
                    >
                      {DOC_MODE_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "创建中…" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
