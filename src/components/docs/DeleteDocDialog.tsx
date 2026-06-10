"use client";

import { useState } from "react";
import { AlertTriangle, FileText, Loader2, Trash2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DocSummary {
  id: string;
  title: string;
}

interface Props {
  /** 要删除的文档,null = dialog 关闭 */
  target: DocSummary | null;
  onOpenChange: (open: boolean) => void;
  /** 确认删除,返回 Promise,resolve 后 dialog 关闭,reject 后显示 error */
  onConfirm: (id: string) => Promise<void>;
}

/**
 * 删除文档的确认弹窗
 * - 显示文档标题让用户二次确认(防止误删)
 * - 删除按钮用 destructive 风格(红色),loading 态清晰
 * - 提示"关联任务不会被删除"让用户安心
 * - 默认取消按钮获焦,避免误触
 */
export function DeleteDocDialog({ target, onOpenChange, onConfirm }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 关闭时清掉 error + loading
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setDeleting(false);
      setError(null);
    }
    onOpenChange(open);
  };

  async function handleConfirm() {
    if (!target) return;
    setDeleting(true);
    setError(null);
    try {
      await onConfirm(target.id);
      handleOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <AlertTriangle className="h-4 w-4" />
            删除文档
          </DialogTitle>
          <DialogDescription>
            此操作不可撤销,确认要删除以下文档吗?
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-3">
            {/* 文档标题卡片 */}
            <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50/50 p-2.5">
              <FileText className="h-4 w-4 mt-0.5 shrink-0 text-rose-500" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium break-words">
                  {target.title}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                  id:{target.id}
                </div>
              </div>
            </div>

            {/* 关联任务提示 */}
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <Link2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div>
                此文档关联的任务不会被删除,只是断开关联关系。
                <span className="block text-amber-700 mt-0.5">
                  协作文档内容、版本历史会一起清除。
                </span>
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={deleting}
            autoFocus
          >
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                删除中…
              </>
            ) : (
              <>
                <Trash2 className="h-3 w-3 mr-1" />
                确认删除
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
