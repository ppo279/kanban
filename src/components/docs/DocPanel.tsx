"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  FileText,
  Users,
  Link2,
  Unlink,
  X,
  ListChecks,
  PenLine,
  FileCheck,
  TestTube2,
  Sparkles,
  Key,
  RefreshCw,
  PanelRightOpen,
  PanelRightClose,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/util";
import { useBoardStore } from "@/store/board";
import { getSocketInstance } from "@/hooks/useSocket";
import { wsFetch, useCurrentWorkspaceId } from "@/lib/wsFetch";
import { CollaborativeEditor, type CollaborativeEditorHandle } from "./CollaborativeEditor";
import { AISettingsDialog } from "./AISettingsDialog";
import { AIDrawer } from "./AIDrawer";
import { DeleteDocDialog } from "./DeleteDocDialog";
import { ImportToKanbanDialog, parseChecklistFromDocJson } from "./ImportToKanbanDialog";
import { SpecInterfaceEditor } from "./SpecInterfaceEditor";
import { PendingReviewPanel } from "./PendingReviewPanel";
import type { TiptapNode } from "@/lib/specDetector";
import { hasAPIKey } from "@/lib/ai-keys";
import {
  DOC_MODES,
  DOC_MODE_LABEL,
  DOC_MODE_COLOR,
  buildTemplateContent,
  type DocMode,
  type Document,
  type Task,
  type Priority,
  PRIORITY_LABEL,
  PRIORITIES,
  STATUSES,
  STATUS_LABEL,
  type Status,
} from "@/types";

// ── User colour palette ──
const CURSOR_COLORS = [
  "#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16",
];

function hashUserId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getCursorColor(userId: string): string {
  return CURSOR_COLORS[hashUserId(userId) % CURSOR_COLORS.length];
}

/** 文档顶部进度条 — 反映 checklist 行的勾选进度 */
function ChecklistProgressBar({
  total,
  checked,
}: {
  total: number;
  checked: number;
}) {
  const pct = total === 0 ? 0 : Math.round((checked / total) * 100);
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-gradient-to-r from-blue-50 to-emerald-50 border border-blue-100">
      <ListChecks className="h-3.5 w-3.5 text-blue-600 shrink-0" />
      <span className="text-xs font-medium text-slate-700 shrink-0">
        Spec 进度
      </span>
      <div className="flex-1 h-1.5 bg-white/70 rounded-full overflow-hidden border border-blue-100">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono tabular-nums text-slate-700 shrink-0">
        <span className={checked === total ? "text-emerald-600 font-semibold" : ""}>
          {checked}
        </span>
        <span className="text-muted-foreground"> / {total}</span>
        <span className="text-muted-foreground ml-1">({pct}%)</span>
      </span>
    </div>
  );
}

// ── 模式卡片元数据(给"新建文档"弹窗用) ──
interface ModeCardMeta {
  mode: DocMode;
  Icon: React.ElementType;
  label: string;
  blurb: string;
  // 选中态视觉
  selectedBorder: string;
  selectedBg: string;
  iconColor: string;
  recommendation: string; // 适合什么场景
}

const MODE_CARDS: ModeCardMeta[] = [
  {
    mode: "free",
    Icon: PenLine,
    label: "自由写作",
    blurb: "空白页面,纯 markdown 协作",
    selectedBorder: "border-slate-400 ring-2 ring-slate-200",
    selectedBg: "bg-slate-50",
    iconColor: "text-slate-500",
    recommendation: "会议纪要、临时记录",
  },
  {
    mode: "spec",
    Icon: FileCheck,
    label: "Spec 模式",
    blurb: "预置 6 个 section 骨架 + checklist",
    selectedBorder: "border-blue-500 ring-2 ring-blue-200",
    selectedBg: "bg-blue-50",
    iconColor: "text-blue-500",
    recommendation: "产品需求、接口设计",
  },
  {
    mode: "tdd",
    Icon: TestTube2,
    label: "TDD 模式",
    blurb: "红/绿/重构 4 阶段 + checklist",
    selectedBorder: "border-purple-500 ring-2 ring-purple-200",
    selectedBg: "bg-purple-50",
    iconColor: "text-purple-500",
    recommendation: "测试用例、后端实现",
  },
];

// 角色 → 推荐模式
const ROLE_RECOMMENDATION: Record<string, DocMode> = {
  frontend: "spec",
  backend: "tdd",
  testing: "tdd",
};

/** 模式预览缩略(灰色 markdown 文本缩略) */
function ModePreview({ mode }: { mode: DocMode }) {
  if (mode === "free") {
    return (
      <div className="h-[68px] flex items-center justify-center text-[10px] text-muted-foreground italic">
        空白页,自由发挥
      </div>
    );
  }
  const sections =
    mode === "spec"
      ? ["背景", "目标", "范围", "接口设计", "数据模型", "验收标准"]
      : ["🔴 红:失败的测试", "🟢 绿:实现", "🔵 重构:决策记录", "📊 当前进度"];
  return (
    <div className="h-[68px] overflow-hidden text-[9px] font-mono leading-snug text-slate-500 px-1.5 py-1 space-y-0.5">
      {sections.map((s) => (
        <div key={s} className="flex items-center gap-1 truncate">
          <span className="text-blue-400 shrink-0">##</span>
          <span className="truncate">{s}</span>
        </div>
      ))}
    </div>
  );
}

interface LinkedTask {
  documentId: string;
  taskId: string;
  sectionKey: string | null;
  createdAt: number;
  task: Task;
}

interface AssociateState {
  open: boolean;
  currentTaskId: string | null;
  position: number | null;
  // editor 实例从事件里传过来,保存到这里用于创建后写回 taskId attr
  editor: any | null;
}

export function DocPanel() {
  const me = useBoardStore((s) => s.me);
  const users = useBoardStore((s) => s.users);
  const tasks = useBoardStore((s) => s.tasks);
  const currentWorkspaceId = useCurrentWorkspaceId();

  const [documents, setDocuments] = useState<Document[]>([]);

  // ── hydrate 文档列表(切 ws / 首次进入都触发) ──
  useEffect(() => {
    if (!currentWorkspaceId) {
      setDocuments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await wsFetch("/api/documents");
        if (cancelled) return;
        const data = await r.json();
        if (data.ok) setDocuments(data.documents);
      } catch {
        // 静默 — 让用户手动创建
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentWorkspaceId]);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState("");
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocMode, setNewDocMode] = useState<DocMode>("spec");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialContent, setInitialContent] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<{ userId: string; userName: string }[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<LinkedTask[]>([]);
  const [modeChanging, setModeChanging] = useState(false);

  const [associateState, setAssociateState] = useState<AssociateState>({
    open: false,
    currentTaskId: null,
    position: null,
    editor: null,
  });

  // ── AI 抽屉(独立 Sheet,不再嵌在编辑 Dialog 里) — Notion AI 派
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  // ── 右侧 panel rail(待审 / 接口 / 任务)— 默认折叠,沉浸写作
  const [panelsOpen, setPanelsOpen] = useState(false);
  // AI 状态轮询 tick(显示在线/锁状态用)— 用数字递增触发 useEffect 重读
  const [aiKeysTick, setAiKeysTick] = useState(0);

  // 删除文档的 dialog 目标
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const [createForm, setCreateForm] = useState<{
    title: string;
    priority: Priority;
    status: Status;
    assigneeId: string;
  }>({
    title: "",
    priority: "med",
    status: "todo",
    assigneeId: "",
  });

  const rootRef = useRef<HTMLDivElement | null>(null);
  // 指向当前打开的 CollaborativeEditor — 让空状态快捷按钮能调用 insertChecklistRow
  const editorRef = useRef<CollaborativeEditorHandle | null>(null);

  // 监听外部跳转(Board 派发 kanban:open-doc)— fetch 文档 + 选中
  useEffect(() => {
    const onOpen = (e: Event) => {
      const ce = e as CustomEvent<{ docId: string }>;
      const docId = ce.detail?.docId;
      if (!docId) return;
      // 已经是同一个文档,跳过
      if (selectedDoc?.id === docId) return;
      (async () => {
        try {
          // doc 详情 GET 不需要 ?workspaceId(后端没要求),但跳 ws 校验走 query 路径
          const r = await wsFetch(`/api/documents/${docId}`, { skipWorkspace: true });
          const data = await r.json();
          if (!data.ok || !data.document) return;
          // 复用 handleSelectDoc 的初始化逻辑
          setSelectedDoc(data.document);
          setChecklistStats({ total: 0, checked: 0 });
          setEditingTitle(data.document.title);
          let content = "";
          if (data.document.content) {
            try {
              const parsed = JSON.parse(data.document.content);
              content = JSON.stringify(parsed);
              setLiveDocJson(parsed as TiptapNode);
            } catch {
              content = data.document.content;
              setLiveDocJson(null);
            }
          } else {
            setLiveDocJson(null);
          }
          setInitialContent(content);
          loadLinkedTasks(data.document.id);
          setDialogOpen(true);
        } catch {
          // 静默 — 让用户手动点列表里的文档
        }
      })();
    };
    window.addEventListener("kanban:open-doc", onOpen);
    return () => window.removeEventListener("kanban:open-doc", onOpen);
  }, [selectedDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 监听 TaskItemView 派发的 checklist:associate-task 事件
  // (编辑器内 hover checklist 行 → 点 + 任务 按钮 → 打开关联 dialog)
  // 之前漏接:按钮派了事件,没人监听 → dialog 永远打不开
  useEffect(() => {
    const onAssociate = (e: Event) => {
      const ce = e as CustomEvent<{
        currentTaskId: string | null;
        editor: any;
        position: number | null;
      }>;
      if (!ce.detail) return;
      // 文档没打开时不响应(避免幽灵 dialog)
      if (!dialogOpen) return;
      setAssociateState({
        open: true,
        currentTaskId: ce.detail.currentTaskId,
        position: ce.detail.position,
        editor: ce.detail.editor,
      });
    };
    window.addEventListener("checklist:associate-task", onAssociate);
    return () =>
      window.removeEventListener("checklist:associate-task", onAssociate);
  }, [dialogOpen]);
  // 标记当前文档是否已有 checklist 行(用于空状态文案分情况)
  // DocPanel 不能直接读 editor state(性能 + 时序问题),用一个乐观标记 + 手动更新
  const [hasChecklistRows, setHasChecklistRows] = useState(false);
// checklist 进度统计(给文档顶部进度条用)— { total, checked }
  const [checklistStats, setChecklistStats] = useState<{
    total: number;
    checked: number;
  } | null>(null);

  // 实时 Tiptap JSON(editor.update 触发)— 给「待审」面板做实时 detect
  const [liveDocJson, setLiveDocJson] = useState<TiptapNode | null>(null);

  // 导入 checklist 到看板的 dialog
  const [importTarget, setImportTarget] = useState<{
    id: string;
    title: string;
    items: { sectionKey: string; text: string }[];
  } | null>(null);

  // 打开/切换 doc — 同时初始化 liveDocJson(从 doc.content 解析)+ initialContent(给 editor)
  async function handleSelectDoc(doc: Document) {
    setSelectedDoc(doc);
    setChecklistStats({ total: 0, checked: 0 });
    setEditingTitle(doc.title);
    // 把持久化 JSON 解析后,作为 editor 的 initialContent
    let content = "";
    if (doc.content) {
      try {
        const parsed = JSON.parse(doc.content);
        content = JSON.stringify(parsed);
        setLiveDocJson(parsed as TiptapNode);
      } catch {
        content = doc.content;
        setLiveDocJson(null);
      }
    } else {
      setLiveDocJson(null);
    }
    setInitialContent(content);
    // 关键:点文档列表必须开 dialog(之前漏了,导致点了没反应)
    setDialogOpen(true);
  }

  // 把 editor 的 Tiptap JSON 字符串保存回文档
  async function handleSaveDoc(content: string) {
    if (!selectedDoc) return;
    setSaving(true);
    try {
      const r = await wsFetch(`/api/documents/${selectedDoc.id}`, {
        method: "PATCH",
        body: { title: editingTitle, content },
      });
      const data = await r.json();
      if (data.ok) {
        setSelectedDoc(data.document);
        setDocuments((prev) =>
          prev.map((d) => (d.id === data.document.id ? data.document : d))
        );
        toast.success("已保存");
      } else {
        toast.error(data.error ?? "保存失败");
      }
    } catch (e: any) {
      toast.error(`保存失败: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  // 取最新 task 数据(从 store,反映 socket 推送的状态)
  function resolveTask(linked: LinkedTask): Task {
    const fresh = tasks.find((t) => t.id === linked.taskId);
    return fresh ?? linked.task;
  }

  // ── 加载文档关联的 task 列表(关联任务面板用) ──
  async function loadLinkedTasks(documentId: string) {
    try {
      // /api/document-tasks?docId= 拿关联的 task 列表
      // docId 隐含 wsId(后端从 doc 反查),用 skipWorkspace
      const r = await wsFetch(`/api/document-tasks?docId=${documentId}`, {
        skipWorkspace: true,
      });
      const data = await r.json();
      if (data.ok) setLinkedTasks(data.items ?? []);
    } catch {
      // 静默失败 — 关联面板空着即可
    }
  }

  // 切模式(兼容两处调用点)
  //  - 新建文档弹窗:selectedDoc 为空,只更新 newDocMode 本地 state
  //  - 编辑器内模式切换(SpecInterfaceEditor 触发):有 selectedDoc,调 PATCH 接口
  function handleChangeMode(mode: DocMode) {
    if (!selectedDoc) {
      setNewDocMode(mode);
      return;
    }
    handleSwitchMode(mode);
  }

  // 新建文档(create dialog 的提交)— 关联任务面板的「升级为文档」按钮也可能复用
  async function handleCreateDoc() {
    if (!newDocTitle.trim()) {
      toast.error("标题不能为空");
      return;
    }
    try {
      // spec/tdd 模式要注入骨架(标题 + 各 section + 空 checklist 行)
      // free 模式直接空字符串 — 用户自由写
      const content =
        newDocMode === "free"
          ? ""
          : buildTemplateContent(newDocMode);
      const r = await wsFetch("/api/documents", {
        method: "POST",
        body: {
          title: newDocTitle.trim(),
          mode: newDocMode,
          content,
        },
      });
      const data = await r.json();
      if (data.ok) {
        setDocuments((prev) => [...prev, data.document]);
        setCreateDialogOpen(false);
        setNewDocTitle("");
        toast.success("已创建");
      } else {
        toast.error(data.error ?? "创建失败");
      }
    } catch (e: any) {
      toast.error(`创建失败: ${e?.message ?? e}`);
    }
  }

  // 在编辑器末尾插入一个空 taskList — DocPanel 顶部「+ 验收项」按钮调用
  function handleInsertChecklist() {
    const ok = editorRef.current?.insertChecklistRow();
    if (!ok) toast.error("插入失败(文档可能没打开)");
  }

  // ── AI 生成入口:由 AIDrawer 自己发请求,DocPanel 不再持有 AI state。
  // 老 handleAdvancedGenerate / handleQuickGenerate / aiGeneratedContent 已删 —
  // 它们走 dialog 模式,生成完就关,内容到不了 doc,等于纯摆设。
  // 现在 AIDrawer 常驻,内容直接 setContent 到编辑器,所见即所得。

  // AI 抽屉应用回调:kind="insert" 插到光标 / kind="replace" 替换全文
  function handleAIApply(kind: "insert" | "replace", md: string) {
    if (!editorRef.current) {
      toast.error("编辑器还没准备好");
      return;
    }
    const ok =
      kind === "replace"
        ? editorRef.current.replaceAllWithMarkdown(md)
        : editorRef.current.insertMarkdownAtCursor(md);
    if (ok) {
      toast.success(kind === "replace" ? "已替换全文" : "已插入到光标");
    } else {
      toast.error("写入失败");
    }
  }

  function handleOpenImport() {
    if (!selectedDoc) return;
    // 解析 doc.content(Tiptap JSON 格式)里的所有 checklist 项
    let items: { sectionKey: string; text: string }[] = [];
    if (selectedDoc.content) {
      try {
        const json = JSON.parse(selectedDoc.content);
        items = parseChecklistFromDocJson(json);
      } catch {
        // content 不是 JSON 就算了
        items = [];
      }
    }
    if (items.length === 0) {
      toast.info("当前文档没有可导入的 checklist 项");
      return;
    }
    setImportTarget({
      id: selectedDoc.id,
      title: selectedDoc.title,
      items,
    });
  }

  async function performDeleteDoc(id: string) {
    const r = await wsFetch(`/api/documents/${id}`, { method: "DELETE" });
    const data = await r.json();
    if (!data.ok) {
      throw new Error(data.error ?? "删除失败");
    }
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    if (selectedDoc?.id === id) {
      setSelectedDoc(null);
      setDialogOpen(false);
    }
    toast.success("已删除");
  }

  function handleDeleteClick(doc: Document) {
    setDeleteTarget({ id: doc.id, title: doc.title });
  }

  // ── Switch document mode (历史文档不强制升级,允许手动切) ──
  async function handleSwitchMode(targetMode: DocMode) {
    if (!selectedDoc || selectedDoc.mode === targetMode) return;
    setModeChanging(true);
    try {
      const r = await wsFetch(`/api/documents/${selectedDoc.id}`, {
        method: "PATCH",
        body: { mode: targetMode },
      });
      const data = await r.json();
      if (data.ok) {
        setSelectedDoc(data.document);
        setDocuments((prev) =>
          prev.map((d) => (d.id === data.document.id ? data.document : d))
        );
        toast.success(
          targetMode === "free"
            ? "已切换为自由写作模式"
            : `已切换为${DOC_MODE_LABEL[targetMode]},可在编辑器中手动添加 section 骨架`
        );
      }
    } catch {
      toast.error("切换失败");
    } finally {
      setModeChanging(false);
    }
  }

  // ── Unlink task from document ──
  async function handleUnlinkTask(taskId: string) {
    if (!selectedDoc) return;
    try {
      const r = await fetch(
        `/api/document-tasks?docId=${selectedDoc.id}&taskId=${taskId}`,
        { method: "DELETE", credentials: "include" }
      );
      const data = await r.json();
      if (data.ok) {
        setLinkedTasks((prev) => prev.filter((l) => l.taskId !== taskId));
        toast.success("已解除关联");
      }
    } catch {
      toast.error("解除失败");
    }
  }

  // ── 一键 checklist → task ──
  async function handleAssociateSubmit() {
    const title = createForm.title.trim();
    if (!title) {
      toast.error("请输入任务标题");
      return;
    }
    if (!selectedDoc) return;

    try {
      // 1) 创建 task — workspaceId 由 wsFetch 自动 merge
      const cr = await wsFetch("/api/tasks", {
        method: "POST",
        body: {
          title,
          priority: createForm.priority,
          status: createForm.status,
          type: "doc",
          assigneeId: createForm.assigneeId || me?.id || "",
        },
      });
      const cdata = await cr.json();
      if (!cdata.ok) {
        toast.error(cdata.error ?? "创建任务失败");
        return;
      }
      const newTask: Task = cdata.task;

      // 2) 关联(document-tasks 关联:id 隐含 wsId,后端从 doc 反查)
      const lr = await wsFetch("/api/document-tasks", {
        method: "POST",
        body: {
          documentId: selectedDoc.id,
          taskId: newTask.id,
          sectionKey: null,
        },
        skipWorkspace: true,
      });
      const ldata = await lr.json();
      if (!ldata.ok) {
        toast.error(ldata.error ?? "关联失败");
        return;
      }

      // 3) 写回 taskId 到 Tiptap 节点 attr
      if (
        associateState.editor &&
        typeof associateState.position === "number"
      ) {
        try {
          associateState.editor.commands.setNodeMarkup(
            associateState.position,
            undefined,
            { taskId: newTask.id }
          );
        } catch (err) {
          // 写回失败不阻塞主流程,关联已建立
          console.warn("[associate] writeback attr failed", err);
        }
      }

      // 4) 重新拉关联列表
      loadLinkedTasks(selectedDoc.id);

      toast.success(`任务 ${newTask.id} 已创建并关联`);
      setAssociateState({
        open: false,
        currentTaskId: null,
        position: null,
        editor: null,
      });
    } catch (e: any) {
      toast.error(`失败: ${e.message}`);
    }
  }

  return (
    <div ref={rootRef} className="flex flex-col h-full" data-doc-panel-root>
      {/* Doc list header */}
      <div className="p-3 space-y-1 border-b">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            文档列表
          </span>
          {selectedDoc && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              {onlineUsers.length + 1} 人在线
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs w-full"
          onClick={() => {
            // 按角色推荐默认模式,没匹配上就保持上次的(初次为 spec)
            const recommended = me && ROLE_RECOMMENDATION[me.role];
            if (recommended) setNewDocMode(recommended);
            setNewDocTitle("");
            setCreateDialogOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          新建文档
        </Button>

        <div className="space-y-0.5 max-h-[260px] overflow-y-auto mt-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer group text-xs",
                selectedDoc?.id === doc.id
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "hover:bg-muted"
              )}
              onClick={() => handleSelectDoc(doc)}
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{doc.title}</span>
              <span
                className={cn(
                  "text-[9px] px-1 rounded font-medium",
                  DOC_MODE_COLOR[doc.mode]
                )}
              >
                {DOC_MODE_LABEL[doc.mode]}
              </span>
              {selectedDoc?.id === doc.id && onlineUsers.length > 0 && (
                <span className="flex -space-x-1">
                  {onlineUsers.slice(0, 3).map((u, i) => (
                    <span
                      key={u.userId}
                      className="inline-block w-4 h-4 rounded-full border-2 border-background text-[7px] font-bold text-white flex items-center justify-center"
                      style={{ backgroundColor: getCursorColor(u.userId), zIndex: 3 - i }}
                      title={u.userName}
                    >
                      {u.userName.charAt(0)}
                    </span>
                  ))}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(doc);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500"
                title="删除文档"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}

          {documents.length === 0 && (
            <div className="text-[11px] text-muted-foreground py-2 text-center">
              暂无文档
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {!selectedDoc && (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground p-4 text-center">
          选择或创建一个文档开始编辑
        </div>
      )}

      {/* ── Editing Dialog (Notion 派:居中紧凑 + 右侧 panel rail) ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[min(1100px,calc(100vw-120px))] max-h-[88vh] flex flex-col p-0 overflow-hidden gap-0">
          {/* 顶栏 — 紧凑两行 */}
          <DialogHeader className="px-5 py-3 border-b space-y-2">
            {/* a11y:DialogTitle 必备,Radix 警告要求 DialogContent 至少含一个 DialogTitle
                视觉上标题由 Input + 模式徽章承担,sr-only 留个屏读节点即可 */}
            <DialogTitle>
              <VisuallyHidden>文档编辑器{editingTitle ? ` — ${editingTitle}` : ""}</VisuallyHidden>
            </DialogTitle>
            {/* 第一行:标题 + 模式 + 元数据 */}
            <div className="flex items-center gap-3 min-w-0">
              <Input
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                className="h-7 text-sm font-semibold border-0 focus-visible:ring-0 px-0 flex-1 min-w-[160px] shadow-none"
                placeholder="文档标题"
              />
              {selectedDoc && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium",
                      DOC_MODE_COLOR[selectedDoc.mode]
                    )}
                  >
                    {DOC_MODE_LABEL[selectedDoc.mode]}
                  </span>
                  <select
                    value={selectedDoc.mode}
                    onChange={(e) =>
                      handleSwitchMode(e.target.value as DocMode)
                    }
                    disabled={modeChanging}
                    className="h-6 text-[10px] rounded border px-1 bg-white"
                    title="切换文档模式"
                  >
                    {DOC_MODES.map((m) => (
                      <option key={m} value={m}>
                        {DOC_MODE_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {selectedDoc && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                  <Users className="h-3 w-3" />
                  {onlineUsers.length + 1} 人在线
                </div>
              )}
            </div>
            {/* 第二行:操作按钮组 + 元数据(在线用户) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* 导入 checklist 到看板 — spec/tdd 模式才有用 */}
              {selectedDoc && (selectedDoc.mode === "spec" || selectedDoc.mode === "tdd") && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                  onClick={handleOpenImport}
                  title="把文档里的 checklist 项批量导入到看板(自动建立父-子结构)"
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  导入看板
                </Button>
              )}
              {/* Panel rail 切换 */}
              {selectedDoc && (selectedDoc.mode === "spec" || selectedDoc.mode === "tdd") && (
                <Button
                  type="button"
                  size="sm"
                  variant={panelsOpen ? "secondary" : "ghost"}
                  className="h-7 text-xs gap-1"
                  onClick={() => setPanelsOpen((o) => !o)}
                  title="展开 / 收起右侧面板(待审 / 接口 / 任务)"
                >
                  <PanelRightOpen className={cn("h-3.5 w-3.5 transition-transform", panelsOpen && "rotate-180")} />
                  {panelsOpen ? "收起面板" : "面板"}
                </Button>
              )}
              {/* AI 写作 — 改成独立 Sheet,在 Dialog 外的根节点挂载 */}
              {selectedDoc && (
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs gap-1 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white border-0 shadow-sm"
                  onClick={() => setAiDrawerOpen(true)}
                  title="打开 AI 写作助手"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  AI 写作
                </Button>
              )}
              <span className="ml-auto" />
              {/* 在线用户 chips */}
              {onlineUsers.length > 0 && (
                <div className="flex gap-1 flex-wrap items-center">
                  {onlineUsers.map((u) => (
                    <span
                      key={u.userId}
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: getCursorColor(u.userId) }}
                    >
                      {u.userName}
                    </span>
                  ))}
                </div>
              )}
              {/* 元数据 — 贴右 */}
              {selectedDoc?.updatedAt && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  最后更新 {new Date(selectedDoc.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          </DialogHeader>

          {/* 主体:左 编辑器(沉浸) / 右 panel rail(可折叠)— 不要再塞 AI 抽屉 */}
          <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
            {/* 主区:编辑器 + 顶部 checklist 进度条 — 沉浸模式,撑满 */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              {selectedDoc && selectedDoc.mode !== "free" && (checklistStats?.total ?? 0) > 0 && (
                <div className="px-5 pt-3">
                  <ChecklistProgressBar
                    total={checklistStats?.total ?? 0}
                    checked={checklistStats?.checked ?? 0}
                  />
                </div>
              )}
              <div className="flex-1 overflow-hidden relative">
                {loading ? (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                    加载中…
                  </div>
                ) : selectedDoc && me ? (
                  <CollaborativeEditor
                    key={selectedDoc.id}
                    ref={editorRef}
                    docId={selectedDoc.id}
                    initialContent={initialContent}
                    userId={me.id}
                    userName={me.name}
                    cursorColor={getCursorColor(me.id)}
                    onSave={handleSaveDoc}
                    onChecklistChange={setHasChecklistRows}
                    onChecklistStatsChange={setChecklistStats}
                    onJsonChange={setLiveDocJson}
                    onAIRequest={() => setAiDrawerOpen(true)}
                    aiGenerating={aiGenerating}
                  />
                ) : null}
              </div>
            </div>

            {/* 右侧 panel rail(默认折叠)— spec/tdd 模式才显示 */}
            {selectedDoc && (selectedDoc.mode === "spec" || selectedDoc.mode === "tdd") && panelsOpen && (
              <div className="w-[340px] shrink-0 border-l bg-slate-50/50 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
                  <span className="text-xs font-semibold text-muted-foreground">
                    面板
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => setPanelsOpen(false)}
                    title="收起"
                  >
                    <PanelRightClose className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {/* 待审面板 */}
                  {liveDocJson && (
                    <PendingReviewPanel
                      documentId={selectedDoc.id}
                      docJson={liveDocJson}
                      markCodeBlockConverted={(hash, entityId) =>
                        editorRef.current?.markCodeBlockConverted(hash, entityId) ?? false
                      }
                      markTaskItemConverted={(text, taskId, sectionKey) =>
                        editorRef.current?.markTaskItemConverted(
                          text,
                          taskId,
                          sectionKey
                        ) ?? false
                      }
                      highlightSource={(kind, hash) =>
                        editorRef.current?.highlightSource(kind, hash) ?? false
                      }
                    />
                  )}
                  {/* 结构化接口 */}
                  <div className="border rounded-md bg-white">
                    <SpecInterfaceEditor
                      documentId={selectedDoc.id}
                      docMode={selectedDoc.mode}
                    />
                  </div>
                  {/* 关联任务 */}
                  <div className="border rounded-md bg-white">
                    <div className="flex items-center justify-between px-2 py-1.5 border-b">
                      <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                        <ListChecks className="h-3.5 w-3.5" />
                        关联任务
                        <span className="text-[10px] text-muted-foreground">
                          ({linkedTasks.length})
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {hasChecklistRows ? "hover checklist 转任务" : "先加 checklist"}
                      </span>
                    </div>
                    {linkedTasks.length === 0 ? (
                      <div className="px-3 py-3 text-[11px] text-muted-foreground text-center space-y-2">
                        {hasChecklistRows ? (
                          <p>暂无关联任务 — hover checklist 行,点 + 任务 按钮</p>
                        ) : (
                          <>
                            <p>暂无关联任务</p>
                            <p className="text-[10px] text-muted-foreground/80">
                              在编辑器里输入
                              <span className="font-mono mx-1 px-1 rounded bg-slate-200 text-slate-700">- [ ]</span>
                              + 内容按回车
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs mx-auto"
                              onClick={handleInsertChecklist}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              插入一行 checklist
                            </Button>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="divide-y">
                        {linkedTasks.map((link) => {
                          const t = resolveTask(link);
                          const assignee = users.find((u) => u.id === t.assigneeId);
                          const isParent = link.sectionKey === "__parent__";
                          return (
                            <div
                              key={link.taskId}
                              className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 group cursor-pointer"
                              onClick={() => {
                                setDialogOpen(false);
                                setTimeout(() => {
                                  window.dispatchEvent(
                                    new CustomEvent("kanban:jump-to-task", {
                                      detail: { taskId: link.taskId },
                                    })
                                  );
                                }, 100);
                              }}
                              title="点跳到看板"
                            >
                              <span
                                className={cn(
                                  "shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold text-white",
                                  t.status === "todo" && "bg-slate-400",
                                  t.status === "doing" && "bg-amber-500",
                                  t.status === "review" && "bg-blue-500",
                                  t.status === "done" && "bg-emerald-500"
                                )}
                              >
                                {STATUS_LABEL[t.status]}
                              </span>
                              {isParent ? (
                                <span
                                  className="shrink-0 inline-flex items-center gap-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 px-1 py-0.5 text-[9px] font-medium"
                                  title="这是从本 spec 导入时创建的父任务"
                                >
                                  <ListChecks className="h-2.5 w-2.5" />
                                  父
                                </span>
                              ) : link.sectionKey ? (
                                <span
                                  className="shrink-0 inline-flex items-center rounded bg-sky-50 text-sky-700 border border-sky-200 px-1 py-0.5 text-[9px] font-medium"
                                  title={`从本 spec 的「${link.sectionKey}」section 衍生`}
                                >
                                  {link.sectionKey}
                                </span>
                              ) : null}
                              <span className="flex-1 truncate font-medium">
                                {t.title}
                              </span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {assignee?.name ?? "—"}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 text-[9px] px-1 rounded",
                                  t.priority === "high" && "bg-rose-100 text-rose-700",
                                  t.priority === "med" && "bg-amber-100 text-amber-700",
                                  t.priority === "low" && "bg-emerald-100 text-emerald-700"
                                )}
                              >
                                {PRIORITY_LABEL[t.priority]}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnlinkTask(link.taskId);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-red-500 transition-opacity"
                                title="解除关联(不删除任务)"
                              >
                                <Unlink className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 一键创建任务 dialog(checklist 行触发) ── */}
      <Dialog
        open={associateState.open}
        onOpenChange={(o) => {
          setAssociateState((s) => ({ ...s, open: o }));
          if (!o) {
            // 关闭时重置表单 + 清掉 editor 引用,避免下次打开看到上次的标题
            setCreateForm({
              title: "",
              priority: "med",
              status: "todo",
              assigneeId: "",
            });
            setAssociateState({
              open: false,
              currentTaskId: null,
              position: null,
              editor: null,
            });
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              创建任务并关联到 checklist 行
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">任务标题</Label>
              <Input
                value={createForm.title}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="例如:实现 /users 列表接口"
                className="h-8 text-xs"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">负责人</Label>
                <select
                  value={createForm.assigneeId}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      assigneeId: e.target.value,
                    }))
                  }
                  className="flex h-8 w-full rounded-md border px-2 text-xs"
                >
                  <option value="">未分配</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">优先级</Label>
                <select
                  value={createForm.priority}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      priority: e.target.value as Priority,
                    }))
                  }
                  className="flex h-8 w-full rounded-md border px-2 text-xs"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">初始状态</Label>
              <select
                value={createForm.status}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    status: e.target.value as Status,
                  }))
                }
                className="flex h-8 w-full rounded-md border px-2 text-xs"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[10px] text-muted-foreground">
              创建后会自动出现在下方"关联任务"列表,队友也能在主看板上看到。
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setAssociateState((s) => ({ ...s, open: false }))
              }
            >
              取消
            </Button>
            <Button size="sm" onClick={handleAssociateSubmit}>
              <Plus className="h-3 w-3 mr-1" />
              创建并关联
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 新建文档弹窗(模式卡片 + 实时预览) ── */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(o) => {
          setCreateDialogOpen(o);
          if (!o) {
            // 关闭时清空标题;模式由"新建"按钮处决定(否则每次打开都跳回 free,与初始 spec 不一致)
            setNewDocTitle("");
            // 模式不重置:让"打开新建"按钮按角色推荐设值,关闭时保留用户上次选择
            // 之前这里写 setNewDocMode("free"),导致用户每次打开都看到 free 而不是他常用的 spec/tdd
            return;
          }
        }}
      >
        <DialogContent
          className="max-w-2xl"
          onOpenAutoFocus={(e) => {
            // 让我们的 input 自己抢焦点(避开 Radix 默认行为)
            e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              新建文档
            </DialogTitle>
            <DialogDescription>
              选一个模式建出合适的骨架,后续可在文档内随时切换。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 标题输入 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">文档标题</Label>
              <Input
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newDocTitle.trim()) {
                    e.preventDefault();
                    handleCreateDoc();
                  }
                }}
                placeholder="例:用户列表接口设计 / Q3 看板迭代规划"
                className="h-9 text-sm"
                autoFocus
              />
            </div>

            {/* 模式卡片 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">选择模式</Label>
                {me && ROLE_RECOMMENDATION[me.role] && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    根据你的角色推荐:
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={() =>
                        handleChangeMode(ROLE_RECOMMENDATION[me.role])
                      }
                    >
                      {DOC_MODE_LABEL[ROLE_RECOMMENDATION[me.role]]}
                    </button>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MODE_CARDS.map(({ mode, Icon, label, blurb, selectedBorder, selectedBg, iconColor, recommendation }) => {
                  const isSelected = newDocMode === mode;
                  const isRecommended =
                    me && ROLE_RECOMMENDATION[me.role] === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleChangeMode(mode)}
                      className={cn(
                        "relative flex flex-col text-left rounded-lg border-2 p-2.5 transition-all",
                        "hover:shadow-sm hover:border-slate-300",
                        isSelected
                          ? `${selectedBorder} ${selectedBg}`
                          : "border-slate-200 bg-white"
                      )}
                    >
                      {isRecommended && (
                        <span className="absolute -top-1.5 -right-1.5 inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                          <Sparkles className="h-2.5 w-2.5" />
                          推荐
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className={cn("h-4 w-4", iconColor)} />
                        <span className="text-xs font-semibold">{label}</span>
                        {isSelected && (
                          <span className="ml-auto inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500 text-white text-[8px]">
                            ✓
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-snug mb-1.5">
                        {blurb}
                      </p>
                      <ModePreview mode={mode} />
                      <div className="mt-1 text-[9px] text-muted-foreground/80 italic">
                        {recommendation}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* AI 区域 — 老 AIGenerateDialog 黄底块已删。
                AI 写作入口改到编辑器的 ✨ 按钮(右侧抽屉),不在新建阶段提示 */}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              size="sm"
              disabled={!newDocTitle.trim() || aiGenerating}
              onClick={handleCreateDoc}
            >
              {aiGenerating ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Plus className="h-3 w-3 mr-1" />
              )}
              创建
              {newDocMode !== "free" && (
                <span className="ml-1 text-[10px] opacity-80">
                  · {DOC_MODE_LABEL[newDocMode]}
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AI 设置 dialog(API key 配置) ── */}
      <AISettingsDialog
        open={aiSettingsOpen}
        onOpenChange={setAiSettingsOpen}
        onConfigured={() => setAiKeysTick((t) => t + 1)}
      />

      {/* ── AI 写作抽屉(独立 Sheet,从 Dialog 拆出来)— Notion AI 风格
          关键修复:不再嵌在编辑 Dialog 里,避免双层模态的 z-index/焦点打架
          用 fixed 容器包住 AIDrawer,撑满屏幕高度,AIDrawer 内部 h-full 自动适配 ── */}
      {selectedDoc && (
        <>
          {/* 遮罩 — 半透明黑,AIDrawer 打开时显示 */}
          {aiDrawerOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/30 transition-opacity"
              onClick={() => setAiDrawerOpen(false)}
              aria-hidden
            />
          )}
          {/* 抽屉容器 — fixed 右侧,撑满屏幕 */}
          <div
            className={cn(
              "fixed right-0 top-0 bottom-0 z-50 transition-transform duration-200 ease-out shadow-2xl",
              aiDrawerOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
            )}
            style={{ width: "320px" }}
          >
            <AIDrawer
              open={aiDrawerOpen}
              onOpenChange={setAiDrawerOpen}
              mode={selectedDoc.mode === "free" ? "spec" : selectedDoc.mode}
              title={selectedDoc.title}
              onGeneratingChange={setAiGenerating}
              onApply={handleAIApply}
              onRequestKeySetup={() => setAiSettingsOpen(true)}
            />
          </div>
        </>
      )}

      {/* ── 删除文档确认 dialog(替代 window.confirm) ── */}
      <DeleteDocDialog
        target={deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={performDeleteDoc}
      />

      {/* ── 导入 checklist 到看板的对话框 ── */}
      <ImportToKanbanDialog
        open={importTarget !== null}
        onOpenChange={(o) => !o && setImportTarget(null)}
        documentId={importTarget?.id ?? ""}
        documentTitle={importTarget?.title ?? ""}
        items={importTarget?.items ?? []}
      />
    </div>
  );
}
