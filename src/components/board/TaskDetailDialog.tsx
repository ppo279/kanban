"use client";

/**
 * TaskDetailDialog — 任务详情弹层 (Plan A 重构)
 *
 * 视觉/结构改动:
 *   - 3 个 Tab: 详情 / 关联 / 历史   ←  之前是 7 块平铺
 *   - 统一卡片样式(同色边框 + 微阴影,不再 amber/indigo/orange 三色乱炖)
 *   - 宽度 max-w-3xl,内部 padding 加大,不再 space-y-4 挤成一块
 *   - 状态/类型用 segmented control + 图标语义,而不是等宽色块
 *   - 关联文档:已关联 + 搜索候选 视觉分组(分两段,中间 divider)
 *   - 删除按钮挪到 header 右侧下拉,不再跟保存同一行
 *   - footer 只剩 Cancel / Save
 *
 * 触发方式: 由 Board.tsx 挂载,通过 task + open props 控制
 */

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Trash2,
  Plus,
  ListChecks,
  CornerDownRight,
  FileText,
  Unlink,
  ExternalLink,
  Type as TypeIcon,
  Flag,
  User as UserIcon,
  Calendar,
  MoreVertical,
  History,
  Info,
  Link2,
  Zap,
  Layers,
  Eye,
  Pencil,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBoardStore, selectChildrenOf, computeSubtaskProgress } from "@/store/board";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  TASK_TYPES,
  TASK_TYPE_LABEL,
  HTTP_METHODS,
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
import { cn } from "@/lib/util";

const SUBTASK_STATUS_BADGE: Record<Status, string> = {
  todo: "bg-slate-100 text-slate-700 border-slate-300",
  doing: "bg-amber-100 text-amber-800 border-amber-300",
  review: "bg-blue-100 text-blue-700 border-blue-300",
  done: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

// 优先级色阶 — 给 segmented control 用,从弱到强,统一一种语义
const PRIORITY_DOT: Record<Priority, string> = {
  low: "bg-slate-400",
  med: "bg-blue-500",
  high: "bg-orange-500",
};

// 任务类型图标
const TYPE_ICON: Record<TaskType, React.ComponentType<{ className?: string }>> = {
  feature: Layers,
  bug: Flag,
  doc: TypeIcon,
  "mock-api": Zap,
};

interface Props {
  task: Task | null;
  open: boolean;
  onOpenChange: (b: boolean) => void;
}

type TabId = "detail" | "relations" | "history";

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
  const [menuOpen, setMenuOpen] = useState(false);

  // 子任务
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [creatingSubtask, setCreatingSubtask] = useState(false);

  // Mock API
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
  const [linkDocInput, setLinkDocInput] = useState("");
  const [docSearchResults, setDocSearchResults] = useState<
    Array<{ id: string; title: string; mode: DocMode }>
  >([]);

  // Tab
  const [activeTab, setActiveTab] = useState<TabId>("detail");

  // 派生
  const children = useMemo(
    () => (task ? selectChildrenOf({ tasks: allTasks } as any, task.id) : []),
    [task, allTasks]
  );
  const progress = useMemo(() => computeSubtaskProgress(children), [children]);
  const hasParent = !!task?.parentId;
  const canHaveSubtasks = !!task && !hasParent;
  const canEdit = !!task && (me?.id === task.createdById || me?.id === task.assigneeId);

  // 初始化 / 切换 task 时回填
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setPriority(task.priority);
      setType(task.type ?? "feature");
      setAssigneeId(task.assigneeId);
      setActiveTab("detail");
      if (task.type === "mock-api") loadLinkedInterfaces(task.id);
      loadLinkedDocs(task.id);
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 关闭弹层时清掉未保存输入
  useEffect(() => {
    if (!open) {
      setLinkDocInput("");
      setDocSearchResults([]);
      setNewSubtaskTitle("");
      setMenuOpen(false);
    }
  }, [open]);

  // ── 网络操作 ──
  async function loadLinkedDocs(taskId: string) {
    try {
      const r = await fetch(`/api/tasks/${taskId}/documents`, { credentials: "include" });
      const data = await r.json();
      if (data.ok) setLinkedDocs(data.links);
    } catch {/* ignore */}
  }

  // 搜索文档 debounce
  useEffect(() => {
    const q = linkDocInput.trim();
    if (!q) {
      setDocSearchResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const r = await fetch(`/api/documents?q=${encodeURIComponent(q)}`, { credentials: "include" });
        const data = await r.json();
        if (data.ok) {
          const linkedIds = new Set(linkedDocs.map((l) => l.documentId));
          setDocSearchResults(data.documents.filter((d: any) => !linkedIds.has(d.id)).slice(0, 8));
        }
      } catch {/* ignore */}
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
    window.dispatchEvent(new CustomEvent("kanban:view-doc", { detail: { docId } }));
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
    } catch {/* ignore */}
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
        await fetch(`/api/interfaces/${linkedInterfaces[0].id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(ifaceData),
        });
      } else {
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
    } catch {/* ignore */}
  }

  async function handleDelete() {
    if (!task) return;
    if (!confirm("确定删除这个任务?")) return;
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
      setNewSubtaskTitle("");
      toast.success("子任务已创建");
    } catch {
      toast.error("网络错误");
    } finally {
      setCreatingSubtask(false);
    }
  }

  if (!task) return null;

  // 关联 tab 的「子任务」和「Mock API」是按 type 决定显示的
  const showMockTab = type === "mock-api";
  const showSubtaskSection = canHaveSubtasks || children.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        {/* ── Header ── */}
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    "bg-slate-100 text-slate-700 border border-slate-200"
                  )}
                >
                  {(() => {
                    const TypeIcon = TYPE_ICON[type];
                    return <TypeIcon className="h-3 w-3" />;
                  })()}
                  {TASK_TYPE_LABEL[type]}
                </span>
                <span className="text-[10px] text-muted-foreground">#{task.id.slice(0, 6)}</span>
                {!canEdit && (
                  <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                    <Eye className="h-3 w-3" />
                    只读
                  </span>
                )}
              </div>
              <DialogTitle className="text-lg font-semibold leading-snug">
                {task.title}
              </DialogTitle>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-0.5">
                  <Calendar className="h-3 w-3" />
                  创建 {new Date(task.createdAt).toLocaleString("zh-CN")}
                </span>
                <span>·</span>
                <span>
                  更新 {new Date(task.updatedAt).toLocaleString("zh-CN")}
                </span>
              </div>
            </div>

            {/* 右上角:更多菜单(放破坏动作) */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                title="更多"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-md border bg-popover text-popover-foreground shadow-md p-1"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        handleDelete();
                      }}
                      className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      删除任务
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenChange(false);
                    }}
                    className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                  >
                    关闭弹层
                  </button>
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* ── Tab 切换栏 ── */}
        <div className="flex items-center gap-0 px-6 pt-0 border-b bg-muted/20">
          <TabButton active={activeTab === "detail"} onClick={() => setActiveTab("detail")} icon={Info}>
            详情
          </TabButton>
          <TabButton
            active={activeTab === "relations"}
            onClick={() => setActiveTab("relations")}
            icon={Link2}
          >
            关联
            <span className="ml-1.5 text-[10px] text-muted-foreground">
              ({linkedDocs.length + children.length + (showMockTab ? 1 : 0)})
            </span>
          </TabButton>
          <TabButton active={activeTab === "history"} onClick={() => setActiveTab("history")} icon={History}>
            历史
          </TabButton>
        </div>

        {/* ── Tab 内容 ── */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          {activeTab === "detail" && (
            <DetailTab
              task={task}
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              priority={priority}
              setPriority={setPriority}
              type={type}
              setType={setType}
              assigneeId={assigneeId}
              setAssigneeId={setAssigneeId}
              users={users}
              canEdit={canEdit}
            />
          )}

          {activeTab === "relations" && (
            <RelationsTab
              task={task}
              linkedDocs={linkedDocs}
              handleLinkDoc={handleLinkDoc}
              handleUnlinkDoc={handleUnlinkDoc}
              handleJumpToDoc={handleJumpToDoc}
              linkDocInput={linkDocInput}
              setLinkDocInput={setLinkDocInput}
              docSearchResults={docSearchResults}
              linkingDoc={linkingDoc}
              children={children}
              progress={progress}
              hasParent={hasParent}
              canHaveSubtasks={canHaveSubtasks}
              newSubtaskTitle={newSubtaskTitle}
              setNewSubtaskTitle={setNewSubtaskTitle}
              creatingSubtask={creatingSubtask}
              handleAddSubtask={handleAddSubtask}
              showMockSection={showMockTab}
              mockMethod={mockMethod}
              setMockMethod={setMockMethod}
              mockPath={mockPath}
              setMockPath={setMockPath}
              mockResponse={mockResponse}
              setMockResponse={setMockResponse}
              mockStatusCode={mockStatusCode}
              setMockStatusCode={setMockStatusCode}
              mockTestResult={mockTestResult}
              mockTesting={mockTesting}
              handleTestMock={handleTestMock}
              canEdit={canEdit}
            />
          )}

          {activeTab === "history" && (
            <HistoryTab task={task} />
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-2 border-t px-6 py-3 bg-muted/20">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!canEdit || saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab 切换按钮 — 比完整 Radix Tabs 简单,够用了
// ────────────────────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 子 tab 组件
// ────────────────────────────────────────────────────────────────────────────

function DetailTab(props: {
  task: Task;
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  priority: Priority;
  setPriority: (v: Priority) => void;
  type: TaskType;
  setType: (v: TaskType) => void;
  assigneeId: string;
  setAssigneeId: (v: string) => void;
  users: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const {
    title, setTitle, description, setDescription,
    priority, setPriority, type, setType,
    assigneeId, setAssigneeId, users, canEdit,
  } = props;

  return (
    <div className="space-y-5">
      {/* 标题 */}
      <Section title="标题" icon={Pencil}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={!canEdit}
          className="text-sm"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          {title.length} / 200
        </p>
      </Section>

      {/* 描述 */}
      <Section title="描述" icon={TypeIcon}>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={5000}
          rows={5}
          disabled={!canEdit}
          className="text-sm"
        />
      </Section>

      {/* 类型 + 优先级 — 并排,统一 segmented control 样式 */}
      <div className="grid grid-cols-2 gap-5">
        <Section title="任务类型" icon={Layers}>
          <SegmentedControl<TaskType>
            value={type}
            onChange={setType}
            disabled={!canEdit}
            options={TASK_TYPES.map((t) => ({
              value: t,
              label: TASK_TYPE_LABEL[t],
              icon: TYPE_ICON[t],
            }))}
          />
        </Section>

        <Section title="优先级" icon={Flag}>
          <SegmentedControl<Priority>
            value={priority}
            onChange={setPriority}
            disabled={!canEdit}
            options={PRIORITIES.map((p) => ({
              value: p,
              label: PRIORITY_LABEL[p],
              dot: PRIORITY_DOT[p],
            }))}
          />
        </Section>
      </div>

      {/* 指派人 */}
      <Section title="指派给" icon={UserIcon}>
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          disabled={!canEdit}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </Section>
    </div>
  );
}

function RelationsTab(props: {
  task: Task;
  linkedDocs: Array<{
    documentId: string;
    taskId: string;
    sectionKey: string | null;
    document: { id: string; title: string; mode: DocMode; createdAt: number; updatedAt: number };
  }>;
  handleLinkDoc: (id: string) => void;
  handleUnlinkDoc: (id: string) => void;
  handleJumpToDoc: (id: string) => void;
  linkDocInput: string;
  setLinkDocInput: (v: string) => void;
  docSearchResults: Array<{ id: string; title: string; mode: DocMode }>;
  linkingDoc: boolean;
  children: Task[];
  progress: { total: number; done: number };
  hasParent: boolean;
  canHaveSubtasks: boolean;
  newSubtaskTitle: string;
  setNewSubtaskTitle: (v: string) => void;
  creatingSubtask: boolean;
  handleAddSubtask: () => void;
  showMockSection: boolean;
  mockMethod: string;
  setMockMethod: (v: string) => void;
  mockPath: string;
  setMockPath: (v: string) => void;
  mockResponse: string;
  setMockResponse: (v: string) => void;
  mockStatusCode: number;
  setMockStatusCode: (v: number) => void;
  mockTestResult: string | null;
  mockTesting: boolean;
  handleTestMock: () => void;
  canEdit: boolean;
}) {
  const p = props;

  return (
    <div className="space-y-5">
      {/* 关联文档 */}
      <Section
        title={`关联文档 (${p.linkedDocs.length})`}
        icon={FileText}
        action={
          p.canEdit && (
            <span className="text-[10px] text-muted-foreground">搜索标题或粘贴 ID</span>
          )
        }
      >
        {p.linkedDocs.length > 0 && (
          <ul className="space-y-1 mb-2">
            {p.linkedDocs.map((l) => (
              <li
                key={l.documentId}
                className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs"
              >
                <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0 truncate font-medium">{l.document.title}</span>
                <span
                  className={cn(
                    "shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium",
                    DOC_MODE_COLOR[l.document.mode]
                  )}
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
                  onClick={() => p.handleJumpToDoc(l.documentId)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  title="查看文档(弹层)"
                >
                  <ExternalLink className="h-3 w-3" />
                </button>
                {p.canEdit && (
                  <button
                    type="button"
                    onClick={() => p.handleUnlinkDoc(l.documentId)}
                    className="text-muted-foreground hover:text-rose-500 shrink-0"
                    title="解除关联"
                  >
                    <Unlink className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {p.canEdit && (
          <div className="space-y-1.5">
            <Input
              value={p.linkDocInput}
              onChange={(e) => p.setLinkDocInput(e.target.value)}
              placeholder="搜索文档标题…"
              className="h-8 text-xs"
            />
            {p.docSearchResults.length > 0 && (
              <ul className="rounded-md border bg-popover text-popover-foreground max-h-32 overflow-y-auto">
                {p.docSearchResults.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => p.handleLinkDoc(d.id)}
                      disabled={p.linkingDoc}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent text-left"
                    >
                      <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{d.title}</span>
                      <span
                        className={cn(
                          "shrink-0 text-[9px] px-1 rounded",
                          DOC_MODE_COLOR[d.mode]
                        )}
                      >
                        {DOC_MODE_LABEL[d.mode]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      {/* 子任务 */}
      {(p.canHaveSubtasks || p.children.length > 0) && (
        <Section
          title={`子任务 (${p.progress.done}/${p.progress.total})`}
          icon={ListChecks}
          action={
            p.hasParent ? (
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                <CornerDownRight className="h-3 w-3" />
                已是子任务
              </span>
            ) : null
          }
        >
          {p.children.length > 0 && (
            <ul className="space-y-1 mb-2">
              {p.children.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs"
                >
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold",
                      SUBTASK_STATUS_BADGE[c.status]
                    )}
                  >
                    {STATUS_LABEL[c.status]}
                  </span>
                  <span
                    className={cn(
                      "flex-1 min-w-0 truncate",
                      c.status === "done" && "line-through text-muted-foreground"
                    )}
                  >
                    {c.title}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {p.canHaveSubtasks && (
            <div className="flex gap-1">
              <Input
                value={p.newSubtaskTitle}
                onChange={(e) => p.setNewSubtaskTitle(e.target.value)}
                placeholder="新子任务标题…"
                className="h-8 text-xs"
                maxLength={200}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    p.handleAddSubtask();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                onClick={p.handleAddSubtask}
                disabled={p.creatingSubtask || !p.newSubtaskTitle.trim()}
                className="h-8"
              >
                <Plus className="h-3 w-3 mr-1" />
                添加
              </Button>
            </div>
          )}
        </Section>
      )}

      {/* Mock API */}
      {p.showMockSection && (
        <Section title="Mock API 配置" icon={Zap}>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">方法</label>
              <select
                value={p.mockMethod}
                onChange={(e) => p.setMockMethod(e.target.value)}
                disabled={!p.canEdit}
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                {HTTP_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">路径</label>
              <Input
                value={p.mockPath}
                onChange={(e) => p.setMockPath(e.target.value)}
                placeholder="/api/mock/users"
                disabled={!p.canEdit}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Mock 响应体 (JSON)</label>
            <Textarea
              value={p.mockResponse}
              onChange={(e) => p.setMockResponse(e.target.value)}
              rows={6}
              disabled={!p.canEdit}
              className="font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-2 items-end">
            <div>
              <label className="text-[10px] text-muted-foreground">状态码</label>
              <Input
                type="number"
                value={p.mockStatusCode}
                onChange={(e) => p.setMockStatusCode(Number(e.target.value))}
                disabled={!p.canEdit}
                className="h-8 text-xs"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={p.handleTestMock}
              disabled={p.mockTesting}
              className="h-8"
            >
              {p.mockTesting ? "测试中…" : "▶ 测试调用"}
            </Button>
          </div>
          {p.mockTestResult && (
            <pre className="rounded-md border bg-muted/40 p-2 text-xs font-mono overflow-auto max-h-40">
              {p.mockTestResult}
            </pre>
          )}
        </Section>
      )}
    </div>
  );
}

function HistoryTab({ task }: { task: Task }) {
  return (
    <div className="space-y-4">
      <Section title="创建信息" icon={Calendar}>
        <dl className="grid grid-cols-[100px_1fr] gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">创建时间</dt>
          <dd>{new Date(task.createdAt).toLocaleString("zh-CN")}</dd>
          <dt className="text-muted-foreground">创建人</dt>
          <dd>{task.createdById}</dd>
          <dt className="text-muted-foreground">任务 ID</dt>
          <dd className="font-mono text-[11px]">{task.id}</dd>
        </dl>
      </Section>

      <Section title="变更记录" icon={History}>
        <div className="rounded-md border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          活动流(创建/状态变化/指派变化)即将推出。
          <br />
          现在可以从看板的主时间轴看每个任务的最新更新时间。
        </div>
      </Section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 共享视觉原子
// ────────────────────────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </h3>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{
    value: T;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    dot?: string;
  }>;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex w-full rounded-md border bg-muted/40 p-0.5",
        disabled && "opacity-50"
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-all",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.icon && <opt.icon className="h-3 w-3" />}
            {opt.dot && <span className={cn("h-1.5 w-1.5 rounded-full", opt.dot)} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 文件结束
// ────────────────────────────────────────────────────────────────────────────