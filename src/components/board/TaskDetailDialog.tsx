"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
import { useBoardStore } from "@/store/board";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  TASK_TYPES,
  TASK_TYPE_LABEL,
  HTTP_METHODS,
  HTTP_METHOD_COLOR,
  type Priority,
  type TaskType,
  type Task,
  type ApiInterface,
} from "@/types";

interface Props {
  task: Task | null;
  open: boolean;
  onOpenChange: (b: boolean) => void;
}

export function TaskDetailDialog({ task, open, onOpenChange }: Props) {
  const me = useBoardStore((s) => s.me);
  const users = useBoardStore((s) => s.users);
  const upsertTask = useBoardStore((s) => s.upsertTask);
  const removeTask = useBoardStore((s) => s.removeTask);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("med");
  const [type, setType] = useState<TaskType>("feature");
  const [assigneeId, setAssigneeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Mock API 关联接口状态
  const [linkedInterfaces, setLinkedInterfaces] = useState<ApiInterface[]>([]);
  const [mockMethod, setMockMethod] = useState<string>("GET");
  const [mockPath, setMockPath] = useState("");
  const [mockResponse, setMockResponse] = useState('{"code": 200, "data": {}}');
  const [mockStatusCode, setMockStatusCode] = useState(200);
  const [mockTestResult, setMockTestResult] = useState<string | null>(null);
  const [mockTesting, setMockTesting] = useState(false);

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
    }
  }, [task]);

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
