"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Trash2, FileText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/util";
import { useBoardStore } from "@/store/board";
import { getSocketInstance } from "@/hooks/useSocket";
import { CollaborativeEditor } from "./CollaborativeEditor";
import type { Document } from "@/types";

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

export function DocPanel() {
  const currentUser = useBoardStore((s) => s.me);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState("");
  const [newDocTitle, setNewDocTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialContent, setInitialContent] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<{ userId: string; userName: string }[]>([]);

  // ── Load doc list ──
  const loadDocuments = useCallback(async () => {
    try {
      const r = await fetch("/api/documents", { credentials: "include" });
      const data = await r.json();
      if (data.ok) setDocuments(data.documents);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  // ── Socket events for users list ──
  useEffect(() => {
    const socket = getSocketInstance();
    if (!socket) return;

    if (!selectedDoc) {
      setOnlineUsers([]);
      return;
    }

    const myId = currentUser?.id ?? "anonymous";

    const onDocUsers = (users: { userId: string; userName: string }[]) => {
      setOnlineUsers(users.filter((u) => u.userId !== myId));
    };

    socket.on("doc:users", onDocUsers);

    return () => {
      socket.off("doc:users", onDocUsers);
    };
  }, [selectedDoc?.id, currentUser]);

  // ── Open document dialog ──
  async function handleSelectDoc(doc: Document) {
    setSelectedDoc(doc);
    setEditingTitle(doc.title);
    setLoading(true);
    setDialogOpen(true);
    setInitialContent("");

    try {
      const r = await fetch(`/api/documents/${doc.id}`, { credentials: "include" });
      const data = await r.json();
      if (data.ok) {
        setInitialContent(data.document.content ?? "");
      }
    } catch { /* ignore */ }

    setLoading(false);
  }

  // ── Save document ──
  async function handleSaveDoc(content: string) {
    if (!selectedDoc) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/documents/${selectedDoc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: editingTitle, content }),
      });
      const data = await r.json();
      if (data.ok) {
        setSelectedDoc(data.document);
        setDocuments((prev) =>
          prev.map((d) => (d.id === data.document.id ? data.document : d))
        );
        toast.success("已保存");
      }
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  // ── Create document ──
  async function handleCreateDoc() {
    if (!newDocTitle.trim()) {
      toast.error("标题不能为空");
      return;
    }
    try {
      const r = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: newDocTitle.trim(), content: "" }),
      });
      const data = await r.json();
      if (data.ok) {
        setDocuments((prev) => [...prev, data.document]);
        setNewDocTitle("");
        toast.success("文档已创建");
      }
    } catch {
      toast.error("创建失败");
    }
  }

  // ── Delete document ──
  async function handleDeleteDoc(id: string) {
    if (!confirm("确定删除此文档？")) return;
    try {
      const r = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await r.json();
      if (data.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== id));
        if (selectedDoc?.id === id) {
          setSelectedDoc(null);
          setDialogOpen(false);
        }
        toast.success("已删除");
      }
    } catch {
      toast.error("删除失败");
    }
  }

  return (
    <div className="flex flex-col h-full">
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
        <div className="flex gap-1 mb-2">
          <Input
            value={newDocTitle}
            onChange={(e) => setNewDocTitle(e.target.value)}
            placeholder="新文档标题"
            className="h-7 text-xs"
            onKeyDown={(e) => e.key === "Enter" && handleCreateDoc()}
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={handleCreateDoc}>
            <Plus className="h-3 w-3 mr-1" />
            新建
          </Button>
        </div>

        <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
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
                  handleDeleteDoc(doc.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500"
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
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
          选择或创建一个文档开始编辑
        </div>
      )}

      {/* ── Editing Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Input
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                className="h-7 text-sm font-semibold border-0 focus-visible:ring-0 px-0"
                placeholder="文档标题"
              />
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                <Users className="h-3 w-3" />
                {onlineUsers.length + 1}
              </div>
            </DialogTitle>
            {onlineUsers.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-1">
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
          </DialogHeader>

          {/* Editor */}
          <div className="flex-1 min-h-0 relative overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                加载中…
              </div>
            ) : selectedDoc && currentUser ? (
              <CollaborativeEditor
                key={selectedDoc.id}
                docId={selectedDoc.id}
                initialContent={initialContent}
                userId={currentUser.id}
                userName={currentUser.name}
                cursorColor={getCursorColor(currentUser.id)}
                onSave={handleSaveDoc}
              />
            ) : null}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between mt-2">
            <span className="text-[10px] text-muted-foreground">
              {selectedDoc?.updatedAt
                ? `最后更新: ${new Date(selectedDoc.updatedAt).toLocaleString("zh-CN")}`
                : ""}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setDialogOpen(false)}
              >
                关闭
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
