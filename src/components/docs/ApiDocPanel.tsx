"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Play,
  FolderOpen,
  Download,
  Upload,
  Copy,
  Check,
  Settings,
  RotateCcw,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/util";
import { useBoardStore } from "@/store/board";
import {
  HTTP_METHODS,
  HTTP_METHOD_COLOR,
  INTERFACE_STATUS_LABEL,
  type ApiModule,
  type ApiInterface,
  type MockField,
  type Task,
} from "@/types";
import { MockFieldEditor } from "./MockFieldEditor";
import { type ResponseMode, type ResponseWrapper } from "@/types";
import { PAGINATION_PRESETS, type MockFieldDef } from "@/lib/mock-engine";

interface ModuleWithInterfaces extends ApiModule {
  interfaces: ApiInterface[];
}

export function ApiDocPanel({ selectedTaskId }: { selectedTaskId?: string | null }) {
  const tasks = useBoardStore((s) => s.tasks);
  const upsertTask = useBoardStore((s) => s.upsertTask);

  const [modules, setModules] = useState<ModuleWithInterfaces[]>([]);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [selectedIface, setSelectedIface] = useState<ApiInterface | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // New module state
  const [newModuleName, setNewModuleName] = useState("");
  const [showNewModule, setShowNewModule] = useState(false);

  // Interface edit state
  const [editMethod, setEditMethod] = useState("GET");
  const [editPath, setEditPath] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMockFields, setEditMockFields] = useState<MockField[]>([]);
  const [editRequestFields, setEditRequestFields] = useState<MockField[]>([]);
  const [editMockResponse, setEditMockResponse] = useState("{}");
  const [editResponseMode, setEditResponseMode] = useState<ResponseMode>("raw");
  const [editCustomWrapper, setEditCustomWrapper] = useState<string | ResponseWrapper | null>(null);
  const [activeTab, setActiveTab] = useState<"request" | "response">("response");
  const [editMockStatusCode, setEditMockStatusCode] = useState(200);
  const [editStatus, setEditStatus] = useState<"draft" | "active" | "deprecated">("draft");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  // New interface state
  const [showNewIface, setShowNewIface] = useState<string | null>(null);
  const [newIfaceName, setNewIfaceName] = useState("");
  const [newIfaceMethod, setNewIfaceMethod] = useState("GET");
  const [newIfacePath, setNewIfacePath] = useState("");

  // Swagger import
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importJson, setImportJson] = useState("");
  const [importing, setImporting] = useState(false);

  // Copy URL
  const [copied, setCopied] = useState(false);

  const loadModulesAndInterfaces = useCallback(async () => {
    try {
      const [modR, ifaceR] = await Promise.all([
        fetch("/api/modules", { credentials: "include" }),
        fetch("/api/interfaces", { credentials: "include" }),
      ]);
      const modData = await modR.json();
      const ifaceData = await ifaceR.json();
      if (modData.ok && ifaceData.ok) {
        const allInterfaces: ApiInterface[] = ifaceData.interfaces;
        const moduleList: ModuleWithInterfaces[] = modData.modules.map((m: ApiModule) => ({
          ...m,
          interfaces: allInterfaces.filter((i) => i.moduleId === m.id),
        }));
        setModules(moduleList);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadModulesAndInterfaces();
  }, [loadModulesAndInterfaces]);

  // When a task is selected from the board, find and highlight its interface
  useEffect(() => {
    if (selectedTaskId) {
      const task = tasks.find((t) => t.id === selectedTaskId);
      if (task) {
        setSelectedTask(task);
        // Find associated interface
        for (const mod of modules) {
          const iface = mod.interfaces.find((i) => i.taskId === task.id);
          if (iface) {
            selectInterface(iface);
            setExpandedModules((prev) => new Set([...prev, mod.id]));
            return;
          }
        }
        // No interface found, just show task info
        setSelectedIface(null);
      }
    }
  }, [selectedTaskId, tasks, modules]);

  function toggleModule(moduleId: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  function selectInterface(iface: ApiInterface, openDialog = true) {
    setSelectedIface(iface);
    if (openDialog) setDetailOpen(true);
    setEditMethod(iface.method);
    setEditPath(iface.path);
    setEditName(iface.name);
    setEditDescription(iface.description ?? "");
    // Parse mockFields (may be string from API or array from store)
    if (iface.mockFields) {
      try {
        const raw = typeof iface.mockFields === "string" ? iface.mockFields : JSON.stringify(iface.mockFields);
        const parsed = JSON.parse(raw);
        setEditMockFields(Array.isArray(parsed) ? parsed : []);
      } catch {
        setEditMockFields([]);
      }
    } else {
      setEditMockFields([]);
    }
    if (iface.requestFields) {
      try {
        const raw = typeof iface.requestFields === "string" ? iface.requestFields : JSON.stringify(iface.requestFields);
        const parsed = JSON.parse(raw);
        setEditRequestFields(Array.isArray(parsed) ? parsed : []);
      } catch {
        setEditRequestFields([]);
      }
    } else {
      setEditRequestFields([]);
    }
    setEditResponseMode(iface.responseMode ?? "raw");
    setEditCustomWrapper(iface.customWrapper ?? null);
    setEditMockResponse(iface.mockResponse ?? "{}");
    setEditMockStatusCode(iface.mockStatusCode ?? 200);
    setEditStatus(iface.status as any);
    setTestResult(null);

    // Also find and set the associated task
    const task = tasks.find((t) => t.id === iface.taskId);
    if (task) setSelectedTask(task);
  }

  async function handleCreateModule() {
    if (!newModuleName.trim()) return;
    try {
      const r = await fetch("/api/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newModuleName.trim() }),
      });
      const data = await r.json();
      if (data.ok) {
        setModules((prev) => [...prev, { ...data.module, interfaces: [] }]);
        setNewModuleName("");
        setShowNewModule(false);
        toast.success("模块已创建");
      }
    } catch {
      toast.error("创建失败");
    }
  }

  async function handleCreateInterface(moduleId: string) {
    if (!newIfaceName.trim() || !newIfacePath.trim()) return;
    try {
      const r = await fetch("/api/interfaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          moduleId,
          name: newIfaceName.trim(),
          method: newIfaceMethod,
          path: newIfacePath.trim(),
          mockResponse: '{"code": 200, "data": {}}',
          status: "active",
        }),
      });
      const data = await r.json();
      if (data.ok) {
        setModules((prev) =>
          prev.map((m) =>
            m.id === moduleId ? { ...m, interfaces: [...m.interfaces, data.interface] } : m
          )
        );
        setNewIfaceName("");
        setNewIfacePath("");
        setShowNewIface(null);
        toast.success("接口已创建");
      }
    } catch {
      toast.error("创建失败");
    }
  }

  async function handleSaveInterface() {
    if (!selectedIface) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/interfaces/${selectedIface.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
          body: JSON.stringify({
            method: editMethod,
            path: editPath,
            name: editName,
            description: editDescription || null,
            mockResponse: editMockResponse,
            mockFields: editMockFields.length > 0 ? JSON.stringify(editMockFields) : null,
            requestFields: editRequestFields.length > 0 ? JSON.stringify(editRequestFields) : null,
            responseMode: editResponseMode,
            customWrapper: editCustomWrapper,
            mockStatusCode: editMockStatusCode,
            status: editStatus,
          }),
      });
      const data = await r.json();
      if (data.ok) {
        setSelectedIface(data.interface);
        setModules((prev) =>
          prev.map((m) => ({
            ...m,
            interfaces: m.interfaces.map((i) =>
              i.id === data.interface.id ? data.interface : i
            ),
          }))
        );
        toast.success("已保存");
      } else {
        toast.error(data.error ?? "保存失败");
      }
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteInterface(id: string) {
    if (!confirm("确定删除此接口？")) return;
    try {
      const r = await fetch(`/api/interfaces/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await r.json();
      if (data.ok) {
        setModules((prev) =>
          prev.map((m) => ({
            ...m,
            interfaces: m.interfaces.filter((i) => i.id !== id),
          }))
        );
        if (selectedIface?.id === id) {
          setSelectedIface(null);
          setSelectedTask(null);
        }
        toast.success("已删除");
      }
    } catch {
      toast.error("删除失败");
    }
  }

  async function handleTestMock() {
    if (!editPath) {
      toast.error("请填写路径");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const url = `/api/mock${editPath.startsWith("/") ? editPath : `/${editPath}`}`;
      const r = await fetch(url, { method: editMethod });
      const text = await r.text();
      setTestResult(`${r.status} ${r.statusText}\n${text}`);
    } catch (e: any) {
      setTestResult(`错误: ${e.message}`);
    } finally {
      setTesting(false);
    }
  }

  function handleCopyUrl() {
    const url = `/api/mock${editPath.startsWith("/") ? editPath : `/${editPath}`}`;
    navigator.clipboard.writeText(`${window.location.origin}${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Swagger Export
  async function handleExportSwagger() {
    try {
      const r = await fetch("/api/docs/openapi", { credentials: "include" });
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "openapi.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("OpenAPI spec 已导出");
    } catch {
      toast.error("导出失败");
    }
  }

  // Swagger Import
  async function handleImportSwagger() {
    setImporting(true);
    try {
      let spec: string = importJson.trim();

      // If URL is provided, fetch it
      if (!spec && importUrl.trim()) {
        const r = await fetch(importUrl.trim());
        spec = await r.text();
      }

      if (!spec) {
        toast.error("请输入 Swagger JSON 或 URL");
        setImporting(false);
        return;
      }

      const r = await fetch("/api/docs/import-swagger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ spec: JSON.parse(spec) }),
      });
      const data = await r.json();
      if (data.ok) {
        toast.success(`导入成功：${data.moduleCount} 个模块，${data.interfaceCount} 个接口`);
        setShowImport(false);
        setImportUrl("");
        setImportJson("");
        loadModulesAndInterfaces();
      } else {
        toast.error(data.error ?? "导入失败");
      }
    } catch (e: any) {
      toast.error(`导入失败: ${e.message}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Global Mock URL Bar */}
      <div className="mx-3 mt-3 rounded-md bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 p-2.5">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-orange-500 font-medium uppercase tracking-wider mb-0.5">
              Mock Base URL
            </div>
            <code className="text-xs font-mono text-orange-800 break-all">
              {typeof window !== "undefined" ? window.location.origin : ""}/api/mock
            </code>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs shrink-0 ml-2"
            onClick={handleCopyUrl}
            title="复制 Mock URL"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b">
        <div className="flex-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          模块列表
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => setShowImport(!showImport)}
        >
          <Upload className="h-3 w-3 mr-1" />
          导入
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handleExportSwagger}
        >
          <Download className="h-3 w-3 mr-1" />
          导出
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => setShowNewModule(!showNewModule)}
        >
          <Plus className="h-3 w-3 mr-1" />
          新建
        </Button>
      </div>

      {/* Swagger Import Panel */}
      {showImport && (
        <div className="mx-3 mb-2 rounded-md border border-blue-200 bg-blue-50 p-3 space-y-2">
          <div className="text-xs font-medium text-blue-700">导入 Swagger / OpenAPI</div>
          <Input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="Swagger URL (如 http://localhost:8080/v3/api-docs)"
            className="h-7 text-xs"
          />
          <div className="text-[10px] text-muted-foreground text-center">或</div>
          <Textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder="粘贴 OpenAPI/Swagger JSON..."
            rows={4}
            className="font-mono text-xs"
          />
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setShowImport(false)}>
              取消
            </Button>
            <Button size="sm" className="h-6 text-xs" onClick={handleImportSwagger} disabled={importing}>
              {importing ? "导入中…" : "导入"}
            </Button>
          </div>
        </div>
      )}

      {/* New Module Input */}
      {showNewModule && (
        <div className="px-3 mb-2">
          <div className="flex gap-1">
            <Input
              value={newModuleName}
              onChange={(e) => setNewModuleName(e.target.value)}
              placeholder="模块名称"
              className="h-7 text-xs"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreateModule()}
            />
            <Button size="sm" className="h-7 px-2 text-xs" onClick={handleCreateModule}>
              创建
            </Button>
          </div>
        </div>
      )}

      {/* Module List + Interface Details */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Module Tree */}
        <div className={cn(
          "overflow-y-auto border-r",
          selectedIface ? "w-[180px] min-w-[180px]" : "flex-1"
        )}>
          <div className="p-2 space-y-0.5">
            {modules.map((m) => {
              const isExpanded = expandedModules.has(m.id);
              return (
                <div key={m.id}>
                  <div
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer group"
                    onClick={() => toggleModule(m.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="flex-1 text-xs font-medium truncate">{m.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {m.interfaces.length}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowNewIface(showNewIface === m.id ? null : m.id);
                        setNewIfaceName("");
                        setNewIfacePath("");
                      }}
                      className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-accent"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="ml-4 space-y-0.5">
                      {m.interfaces.map((iface) => (
                        <div
                          key={iface.id}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md px-2 py-1 cursor-pointer group text-xs",
                            selectedIface?.id === iface.id
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-muted"
                          )}
                          onClick={() => selectInterface(iface)}
                        >
                          <span
                            className={cn(
                              "inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold text-white min-w-[36px] justify-center shrink-0",
                              HTTP_METHOD_COLOR[iface.method as keyof typeof HTTP_METHOD_COLOR] ?? "bg-gray-400"
                            )}
                          >
                            {iface.method}
                          </span>
                          <span className="flex-1 truncate font-mono text-[11px]">{iface.path}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteInterface(iface.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}

                      {showNewIface === m.id && (
                        <div className="flex flex-col gap-1 p-2 bg-muted/50 rounded-md">
                          <div className="flex gap-1">
                            <select
                              value={newIfaceMethod}
                              onChange={(e) => setNewIfaceMethod(e.target.value)}
                              className="h-7 rounded border px-1 text-xs"
                            >
                              {HTTP_METHODS.map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                            <Input
                              value={newIfaceName}
                              onChange={(e) => setNewIfaceName(e.target.value)}
                              placeholder="接口名称"
                              className="h-7 text-xs flex-1"
                            />
                          </div>
                          <Input
                            value={newIfacePath}
                            onChange={(e) => setNewIfacePath(e.target.value)}
                            placeholder="/users"
                            className="h-7 text-xs font-mono"
                          />
                          <Button
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => handleCreateInterface(m.id)}
                          >
                            创建接口
                          </Button>
                        </div>
                      )}

                      {m.interfaces.length === 0 && showNewIface !== m.id && (
                        <div className="text-[11px] text-muted-foreground py-1 pl-2">
                          暂无接口
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {modules.length === 0 && (
              <div className="text-xs text-muted-foreground py-4 text-center">
                暂无模块，点击上方「新建」创建
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interface Detail Dialog */}
      <Dialog open={detailOpen && !!selectedIface} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedIface && (
                <span
                  className={cn(
                    "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold text-white",
                    HTTP_METHOD_COLOR[selectedIface.method as keyof typeof HTTP_METHOD_COLOR] ?? "bg-gray-400"
                  )}
                >
                  {selectedIface.method}
                </span>
              )}
              <span>{editName || "接口配置"}</span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded ml-auto",
                  editStatus === "active"
                    ? "bg-green-100 text-green-700"
                    : editStatus === "deprecated"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700"
                )}
              >
                {INTERFACE_STATUS_LABEL[editStatus]}
              </span>
            </DialogTitle>
            <DialogDescription>
              <code className="text-xs font-mono">{selectedIface?.path}</code>
              {selectedTask && (
                <span className="ml-2 text-muted-foreground">
                  · 关联任务：{selectedTask.title}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Basic Info (always visible) */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">名称</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">方法</Label>
                  <select
                    value={editMethod}
                    onChange={(e) => setEditMethod(e.target.value)}
                    className="flex h-8 w-full rounded-md border px-2 text-xs"
                  >
                    {HTTP_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">路径</Label>
                  <Input
                    value={editPath}
                    onChange={(e) => setEditPath(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">状态码</Label>
                  <Input
                    type="number"
                    value={editMockStatusCode}
                    onChange={(e) => setEditMockStatusCode(Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">状态</Label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="flex h-8 w-full rounded-md border px-2 text-xs"
                  >
                    <option value="draft">草稿</option>
                    <option value="active">活跃</option>
                    <option value="deprecated">已废弃</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">描述</Label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="可选"
                />
              </div>
            </div>

            {/* Tabs: Request | Response */}
            <div className="border-b">
              <div className="flex gap-0">
                <button
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium border-b-2 transition-colors",
                    activeTab === "request"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setActiveTab("request")}
                >
                  请求参数
                </button>
                <button
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium border-b-2 transition-colors",
                    activeTab === "response"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setActiveTab("response")}
                >
                  响应配置
                </button>
              </div>
            </div>

            {/* Request Tab */}
            {activeTab === "request" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">请求字段定义</Label>
                  {editRequestFields.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setEditRequestFields([])}
                      className="text-[10px] text-muted-foreground hover:text-red-500 transition-colors flex items-center gap-1"
                      title="清空所有请求字段"
                    >
                      <RotateCcw className="h-3 w-3" />
                      重置
                    </button>
                  )}
                </div>
                <MockFieldEditor
                  fields={editRequestFields}
                  onChange={setEditRequestFields}
                  presetMode="request"
                />
                {editRequestFields.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    定义请求参数（查询参数 / 请求体字段），用于文档展示和校验。
                  </p>
                )}
              </div>
            )}

            {/* Response Tab */}
            {activeTab === "response" && (
              <div className="space-y-3">
                {/* Response Mode */}
                <div className="flex items-center gap-3">
                  <Label className="text-xs shrink-0">返回模式</Label>
                  <select
                    value={editResponseMode}
                    onChange={(e) => setEditResponseMode(e.target.value as ResponseMode)}
                    className="flex h-8 rounded-md border px-2 text-xs"
                  >
                    <option value="raw">原始 JSON</option>
                    <option value="custom">自定义包装</option>
                    <option value="inherit">继承模块</option>
                  </select>
                </div>

                {/* Inherit Mode — show parent module's wrapper config */}
                {editResponseMode === "inherit" && selectedIface && (() => {
                  const parentModule = modules.find((m) => m.id === selectedIface.moduleId);
                  let wrapper: ResponseWrapper = { enabled: true, codeField: "code", messageField: "message", dataField: "data", successCode: 200 };
                  if (parentModule?.responseWrapper) {
                    try {
                      const parsed = JSON.parse(parentModule.responseWrapper);
                      wrapper = { ...wrapper, ...parsed };
                    } catch { /* use defaults */ }
                  }
                  return (
                    <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Info className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-xs font-semibold text-blue-700">
                          继承模块「{parentModule?.name ?? "—"}」的响应包装
                        </span>
                      </div>
                      <p className="text-[10px] text-blue-600/80">
                        该接口将使用父模块定义的响应信封（code + message + data），无需重复配置。
                        如需独立设置，请切换为「自定义包装」。
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                        <div><span className="text-muted-foreground">状态码字段：</span><code className="text-blue-700">{wrapper.codeField}</code></div>
                        <div><span className="text-muted-foreground">消息字段：</span><code className="text-blue-700">{wrapper.messageField}</code></div>
                        <div><span className="text-muted-foreground">数据字段：</span><code className="text-blue-700">{wrapper.dataField}</code></div>
                        <div><span className="text-muted-foreground">成功值：</span><code className="text-blue-700">{wrapper.successCode}</code></div>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        包装{ wrapper.enabled ? "已" : "未" }启用 · 模块字段定义继承自父模块的 Mock 字段配置
                      </div>
                    </div>
                  );
                })()}

                {/* Custom Wrapper Config */}
                {editResponseMode === "custom" && (
                  <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                    <Label className="text-xs font-semibold">响应包装配置</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">成功字段名</Label>
                        <Input
                          value={(() => {
                            if (typeof editCustomWrapper === "string") {
                              try {
                                const p = JSON.parse(editCustomWrapper);
                                return (p as ResponseWrapper).codeField ?? "code";
                              } catch { return "code"; }
                            }
                            return (editCustomWrapper as ResponseWrapper)?.codeField ?? "code";
                          })()}
                          onChange={(e) => {
                            const current = typeof editCustomWrapper === "object" && editCustomWrapper
                              ? { ...editCustomWrapper }
                              : { enabled: true, codeField: "code", messageField: "message", dataField: "data", successCode: 200 };
                            setEditCustomWrapper(JSON.stringify({ ...current, codeField: e.target.value }));
                          }}
                          className="h-7 text-xs"
                          placeholder="code"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">消息字段名</Label>
                        <Input
                          value={(() => {
                            if (typeof editCustomWrapper === "string") {
                              try {
                                const p = JSON.parse(editCustomWrapper);
                                return (p as ResponseWrapper).messageField ?? "message";
                              } catch { return "message"; }
                            }
                            return (editCustomWrapper as ResponseWrapper)?.messageField ?? "message";
                          })()}
                          onChange={(e) => {
                            const current = typeof editCustomWrapper === "object" && editCustomWrapper
                              ? { ...editCustomWrapper }
                              : { enabled: true, codeField: "code", messageField: "message", dataField: "data", successCode: 200 };
                            setEditCustomWrapper(JSON.stringify({ ...current, messageField: e.target.value }));
                          }}
                          className="h-7 text-xs"
                          placeholder="message"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">数据字段名</Label>
                        <Input
                          value={(() => {
                            if (typeof editCustomWrapper === "string") {
                              try {
                                const p = JSON.parse(editCustomWrapper);
                                return (p as ResponseWrapper).dataField ?? "data";
                              } catch { return "data"; }
                            }
                            return (editCustomWrapper as ResponseWrapper)?.dataField ?? "data";
                          })()}
                          onChange={(e) => {
                            const current = typeof editCustomWrapper === "object" && editCustomWrapper
                              ? { ...editCustomWrapper }
                              : { enabled: true, codeField: "code", messageField: "message", dataField: "data", successCode: 200 };
                            setEditCustomWrapper(JSON.stringify({ ...current, dataField: e.target.value }));
                          }}
                          className="h-7 text-xs"
                          placeholder="data"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">成功状态码</Label>
                        <Input
                          type="number"
                          value={(() => {
                            if (typeof editCustomWrapper === "string") {
                              try {
                                const p = JSON.parse(editCustomWrapper);
                                return (p as ResponseWrapper).successCode ?? 200;
                              } catch { return 200; }
                            }
                            return (editCustomWrapper as ResponseWrapper)?.successCode ?? 200;
                          })()}
                          onChange={(e) => {
                            const current = typeof editCustomWrapper === "object" && editCustomWrapper
                              ? { ...editCustomWrapper }
                              : { enabled: true, codeField: "code", messageField: "message", dataField: "data", successCode: 200 };
                            setEditCustomWrapper(JSON.stringify({ ...current, successCode: Number(e.target.value) }));
                          }}
                          className="h-7 text-xs"
                          placeholder="200"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="wrapper-enabled"
                        checked={(() => {
                          if (typeof editCustomWrapper === "string") {
                            try {
                              const p = JSON.parse(editCustomWrapper);
                              return (p as ResponseWrapper).enabled !== false;
                            } catch { return true; }
                          }
                          return (editCustomWrapper as ResponseWrapper)?.enabled !== false;
                        })()}
                        onChange={(e) => {
                          const current = typeof editCustomWrapper === "object" && editCustomWrapper
                            ? { ...editCustomWrapper }
                            : { enabled: true, codeField: "code", messageField: "message", dataField: "data", successCode: 200 };
                          setEditCustomWrapper(JSON.stringify({ ...current, enabled: e.target.checked }));
                        }}
                        className="h-3 w-3"
                      />
                      <Label htmlFor="wrapper-enabled" className="text-[10px]">启用包装</Label>
                    </div>
                  </div>
                )}

                {/* Pagination Presets */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">分页预设</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {PAGINATION_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        className="rounded-md border p-2 text-left text-xs hover:bg-accent transition-colors"
                        onClick={() => {
                          const newFields = preset.fields.map((f: MockFieldDef) => ({
                            key: f.key,
                            label: f.label,
                            type: f.type as "string" | "number" | "boolean" | "array" | "object",
                            mock: f.mock,
                            desc: f.desc,
                            required: f.required,
                          }));
                          const existingKeys = new Set(editMockFields.map((f) => f.key));
                          const merged = [
                            ...editMockFields,
                            ...newFields.filter((f: { key: string }) => !existingKeys.has(f.key)),
                          ];
                          setEditMockFields(merged);
                          toast.success(`已添加分页预设: ${preset.name}`);
                        }}
                      >
                        <div className="font-medium text-[11px] mb-0.5 capitalize">{preset.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {preset.fields.length} 个字段
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mock Fields */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Mock 字段定义</Label>
                    {editMockFields.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setEditMockFields([])}
                        className="text-[10px] text-muted-foreground hover:text-red-500 transition-colors flex items-center gap-1"
                        title="清空所有响应字段"
                      >
                        <RotateCcw className="h-3 w-3" />
                        重置
                      </button>
                    )}
                  </div>
                  <MockFieldEditor
                    fields={editMockFields}
                    onChange={setEditMockFields}
                    presetMode="response"
                  />
                  {editMockFields.length === 0 && (
                    <div className="space-y-1 mt-2">
                      <div className="text-[10px] text-muted-foreground">
                        未定义字段时，使用静态 Mock 响应体：
                      </div>
                      <Textarea
                        value={editMockResponse}
                        onChange={(e) => setEditMockResponse(e.target.value)}
                        rows={4}
                        className="font-mono text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between sm:justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleCopyUrl}
              >
                {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                复制 URL
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleTestMock}
                disabled={testing}
              >
                <Play className="h-3 w-3 mr-1" />
                {testing ? "测试中…" : "▶ 测试"}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDetailOpen(false)}>
                取消
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={handleSaveInterface} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </DialogFooter>

          {/* Test Result */}
          {testResult && (
            <div className="mt-2">
              <Label className="text-[10px] text-muted-foreground mb-1">测试结果</Label>
              <pre className="rounded-md bg-gray-900 text-green-400 p-3 text-xs font-mono overflow-auto max-h-48">
                {testResult}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
