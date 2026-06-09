"use client";

import { useState } from "react";
import { Plus, Trash2, Wand2, GripVertical, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/util";
import {
  MOCK_FIELD_TYPES,
  MOCK_PLACEHOLDER_PRESETS,
  type MockField,
  type MockFieldType,
} from "@/types";
import { MOCK_PRESETS } from "@/lib/mock-engine";

interface Props {
  fields: MockField[];
  onChange: (fields: MockField[]) => void;
  disabled?: boolean;
}

export function MockFieldEditor({ fields, onChange, disabled }: Props) {
  const [showPresets, setShowPresets] = useState(false);
  const [mode, setMode] = useState<"visual" | "json">("visual");
  const [jsonText, setJsonText] = useState(() => JSON.stringify(fields, null, 2));
  const [expandedField, setExpandedField] = useState<number | null>(null);

  function updateField(index: number, patch: Partial<MockField>) {
    const next = fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
    onChange(next);
    if (mode === "json") setJsonText(JSON.stringify(next, null, 2));
  }

  function removeField(index: number) {
    const next = fields.filter((_, i) => i !== index);
    onChange(next);
  }

  function addField() {
    const newField: MockField = {
      key: `field${fields.length + 1}`,
      label: "",
      type: "string",
      mock: "@cname",
      desc: "",
      required: false,
    };
    onChange([...fields, newField]);
    setExpandedField(fields.length); // Auto-expand new field
  }

  function applyPreset(preset: typeof MOCK_PRESETS[number]) {
    onChange(preset.fields);
    setJsonText(JSON.stringify(preset.fields, null, 2));
    setShowPresets(false);
    setExpandedField(null);
  }

  function switchToJson() {
    setJsonText(JSON.stringify(fields, null, 2));
    setMode("json");
  }

  function switchToVisual() {
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) {
        onChange(parsed);
      }
    } catch {
      return;
    }
    setMode("visual");
  }

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode("visual")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              mode === "visual"
                ? "bg-orange-100 text-orange-700"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            📋 可视化编辑
          </button>
          <button
            type="button"
            onClick={mode === "visual" ? switchToJson : switchToVisual}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              mode === "json"
                ? "bg-orange-100 text-orange-700"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {"{ }"} JSON 编辑
          </button>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowPresets(!showPresets)}
              disabled={disabled}
            >
              <Wand2 className="h-3 w-3 mr-1" />
              模板填充
            </Button>
            {showPresets && (
              <div className="absolute right-0 top-full z-20 mt-1 w-56">
                <div className="rounded-lg border bg-white shadow-lg p-2 space-y-1">
                  <div className="text-[10px] font-semibold text-muted-foreground px-2 py-0.5">
                    选择模板
                  </div>
                  {MOCK_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="flex items-center justify-between w-full text-left rounded-md px-2 py-1.5 text-xs hover:bg-orange-50 transition-colors"
                    >
                      <span className="font-medium">{preset.name}</span>
                      <span className="text-muted-foreground text-[10px]">
                        {preset.fields.length} 字段
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={addField}
            disabled={disabled}
          >
            <Plus className="h-3 w-3 mr-1" />
            新增字段
          </Button>
        </div>
      </div>

      {/* Visual mode */}
      {mode === "visual" && (
        <div className="space-y-2">
          {fields.map((field, idx) => {
            const isExpanded = expandedField === idx;
            return (
              <div
                key={idx}
                className={cn(
                  "rounded-lg border bg-white transition-all",
                  isExpanded ? "border-orange-200 shadow-sm" : "border-gray-200 hover:border-gray-300"
                )}
              >
                {/* Collapsed header */}
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
                  onClick={() => setExpandedField(isExpanded ? null : idx)}
                >
                  <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="font-mono text-xs text-orange-600 min-w-[80px]">
                    {field.key || "未命名"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {field.label || field.key}
                  </span>
                  <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 shrink-0">
                    {field.type}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[120px]">
                    {field.mock}
                  </span>
                  {field.required && (
                    <span className="text-[10px] text-red-500 shrink-0">*必填</span>
                  )}
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeField(idx);
                    }}
                    className="p-1 rounded hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    disabled={disabled}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t px-3 py-3 space-y-3 bg-gray-50/50">
                    <div className="grid grid-cols-2 gap-3">
                      {/* Field Key */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          字段名 <span className="text-red-400">*</span>
                        </Label>
                        <Input
                          value={field.key}
                          onChange={(e) => updateField(idx, { key: e.target.value })}
                          placeholder="例如: userName"
                          className="h-8 text-xs font-mono"
                          disabled={disabled}
                        />
                      </div>

                      {/* Field Label */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          中文名
                        </Label>
                        <Input
                          value={field.label}
                          onChange={(e) => updateField(idx, { label: e.target.value })}
                          placeholder="例如: 用户名"
                          className="h-8 text-xs"
                          disabled={disabled}
                        />
                      </div>

                      {/* Field Type */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          类型
                        </Label>
                        <select
                          value={field.type}
                          onChange={(e) => {
                            const newType = e.target.value as MockFieldType;
                            const presets = MOCK_PLACEHOLDER_PRESETS[newType];
                            updateField(idx, {
                              type: newType,
                              mock: presets?.[0]?.value ?? "",
                            });
                          }}
                          className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                          disabled={disabled}
                        >
                          {MOCK_FIELD_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>

                      {/* Required */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-muted-foreground">
                          是否必填
                        </Label>
                        <label className="flex items-center gap-2 h-8 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateField(idx, { required: e.target.checked })}
                            className="rounded"
                            disabled={disabled}
                          />
                          <span className="text-xs">{field.required ? "必填" : "可选"}</span>
                        </label>
                      </div>
                    </div>

                    {/* Mock Rule */}
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-muted-foreground">
                        Mock 规则
                      </Label>
                      <Input
                        value={field.mock}
                        onChange={(e) => updateField(idx, { mock: e.target.value })}
                        placeholder="@cname"
                        className="h-8 text-xs font-mono"
                        disabled={disabled}
                      />
                      {/* Quick presets for this type */}
                      {MOCK_PLACEHOLDER_PRESETS[field.type]?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {MOCK_PLACEHOLDER_PRESETS[field.type].map((preset) => (
                            <button
                              key={preset.value}
                              type="button"
                              onClick={() => updateField(idx, { mock: preset.value })}
                              className={cn(
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                                field.mock === preset.value
                                  ? "border-orange-300 bg-orange-50 text-orange-700"
                                  : "border-gray-200 text-muted-foreground hover:border-orange-200 hover:bg-orange-50/50"
                              )}
                              disabled={disabled}
                            >
                              <span className="font-mono mr-1">{preset.value}</span>
                              <span>{preset.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-muted-foreground">
                        说明
                      </Label>
                      <Input
                        value={field.desc}
                        onChange={(e) => updateField(idx, { desc: e.target.value })}
                        placeholder="字段用途说明（可选）"
                        className="h-8 text-xs"
                        disabled={disabled}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {fields.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center">
              <div className="text-sm text-muted-foreground mb-2">
                暂无字段定义
              </div>
              <div className="text-xs text-muted-foreground mb-3">
                点击「新增字段」或使用「模板填充」快速开始
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={addField}
                disabled={disabled}
              >
                <Plus className="h-3 w-3 mr-1" />
                新增字段
              </Button>
            </div>
          )}
        </div>
      )}

      {/* JSON mode */}
      {mode === "json" && (
        <div className="space-y-2">
          <div className="text-[11px] text-muted-foreground">
            编辑 Mock 字段定义 JSON 数组，格式：
            <code className="ml-1 text-orange-600">
              {"[{ key, label, type, mock, desc, required }]"}
            </code>
          </div>
          <Textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={12}
            className="font-mono text-xs leading-relaxed"
            disabled={disabled}
            placeholder='[\n  {\n    "key": "name",\n    "label": "姓名",\n    "type": "string",\n    "mock": "@cname",\n    "desc": "用户姓名",\n    "required": true\n  }\n]'
          />
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 text-[10px]"
              onClick={switchToVisual}
            >
              应用并切换到可视化
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
