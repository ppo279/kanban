"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Key, Eye, EyeOff, ExternalLink, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AI_PROVIDERS,
  type AIProvider,
  setAPIKey,
  hasAPIKey,
  clearAPIKey,
} from "@/lib/ai-keys";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** 设置完后通知父组件(触发刷新 key 状态等) */
  onConfigured?: () => void;
}

/**
 * AI API Key 配置弹窗
 * - 选 provider
 * - 输明文 key(保存时 AES-GCM 加密存 localStorage)
 * - 显示"已配置"状态(已配过的 provider 显示"已配置 / 清除"按钮)
 */
export function AISettingsDialog({ open, onOpenChange, onConfigured }: Props) {
  const [provider, setProvider] = useState<AIProvider>("deepseek");
  const [keyValue, setKeyValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState<Record<AIProvider, boolean>>({
    minimax: false,
    deepseek: false,
  });

  // 每次打开时刷新"已配置"状态
  useEffect(() => {
    if (!open) return;
    setConfigured({
      minimax: hasAPIKey("minimax"),
      deepseek: hasAPIKey("deepseek"),
    });
    // 切到第一个未配置的 provider
    if (!hasAPIKey("deepseek")) setProvider("deepseek");
    else if (!hasAPIKey("minimax")) setProvider("minimax");
    setKeyValue("");
    setShowKey(false);
  }, [open]);

  async function handleSave() {
    if (!keyValue.trim()) {
      toast.error("请输入 API key");
      return;
    }
    setSaving(true);
    try {
      await setAPIKey(provider, keyValue.trim());
      toast.success(`${AI_PROVIDERS.find((p) => p.id === provider)?.label} key 已保存(浏览器本地加密)`);
      setConfigured((c) => ({ ...c, [provider]: true }));
      setKeyValue("");
      onConfigured?.();
    } catch (e: any) {
      toast.error(`保存失败:${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  function handleClear(p: AIProvider) {
    if (!confirm(`确定清除 ${AI_PROVIDERS.find((x) => x.id === p)?.label} 的 API key?`)) return;
    clearAPIKey(p);
    setConfigured((c) => ({ ...c, [p]: false }));
    toast.success("已清除");
    onConfigured?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            AI API Key 配置
          </DialogTitle>
          <DialogDescription>
            Key 加密后存在你的浏览器里(本机可读,别人拿不到)。
            <span className="inline-flex items-center gap-1 ml-1 text-emerald-600">
              <ShieldCheck className="h-3 w-3" />
              AES-GCM 256
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Provider 选择 */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">服务商</Label>
            <div className="grid grid-cols-2 gap-2">
              {AI_PROVIDERS.map((p) => {
                const isConfigured = configured[p.id];
                const isSelected = provider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProvider(p.id)}
                    className={`flex flex-col items-start text-left rounded-md border-2 p-2.5 transition-all ${
                      isSelected
                        ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-semibold">{p.label}</span>
                      {isConfigured ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-0.5">
                          <ShieldCheck className="h-2.5 w-2.5" />
                          已配置
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                          未配置
                        </span>
                      )}
                    </div>
                    <a
                      href={p.helpUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5 mt-1"
                    >
                      获取 key
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Key 输入 */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {AI_PROVIDERS.find((p) => p.id === provider)?.label} API Key
            </Label>
            <div className="flex gap-1">
              <Input
                type={showKey ? "text" : "password"}
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder={AI_PROVIDERS.find((p) => p.id === provider)?.placeholder}
                className="h-9 text-xs font-mono"
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setShowKey(!showKey)}
                title={showKey ? "隐藏" : "显示"}
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              保存后会立即加密,原文不会留在 localStorage。
            </p>
          </div>

          {/* 已配置的 provider 允许清除 */}
          {(configured.minimax || configured.deepseek) && (
            <div className="space-y-1 border-t pt-3">
              <Label className="text-xs text-muted-foreground">已配置的 key</Label>
              {AI_PROVIDERS.filter((p) => configured[p.id]).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-slate-50"
                >
                  <span>{p.label}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] text-muted-foreground hover:text-red-600"
                    onClick={() => handleClear(p.id)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    清除
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !keyValue.trim()}>
            加密保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
