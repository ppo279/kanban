import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import type { MockFieldDef } from "@/lib/mock-engine";

/**
 * Generate OpenAPI 3.0 spec from api_interfaces table.
 * GET /api/docs/openapi → returns openapi.json
 *
 * 增强：解析 requestFields / mockFields（MockField[] JSON）输出完整 JSON Schema，
 * 支持递归 children（array/object 嵌套定义）。LLM 可直接消费此 spec 生成后端代码。
 */
export async function GET() {
  const modules = await db.select().from(schema.apiModules).orderBy(schema.apiModules.sortOrder);
  const interfaces = await db.select().from(schema.apiInterfaces);

  // Build module map for responseWrapper lookup (inherit mode)
  const moduleMap = new Map(modules.map((m) => [m.id, m]));

  const paths: Record<string, any> = {};
  const tags: { name: string; description?: string | null }[] = [];

  for (const mod of modules) {
    const modIfaces = interfaces.filter((i) => i.moduleId === mod.id);
    if (modIfaces.length === 0) continue;

    tags.push({ name: mod.name, description: mod.description ?? undefined });

    for (const iface of modIfaces) {
      const path = iface.path.startsWith("/") ? iface.path : `/${iface.path}`;
      const method = iface.method.toLowerCase();

      if (!paths[path]) paths[path] = {};

      const operation: any = {
        tags: [mod.name],
        summary: iface.name,
        operationId: iface.id,
      };

      if (iface.description) {
        operation.description = iface.description;
      }

      // ── Request Body ──
      let requestSchema: any = null;

      // 1. 优先用 requestSchema (直接 JSON Schema)
      if (iface.requestSchema) {
        try {
          requestSchema = JSON.parse(iface.requestSchema);
        } catch {
          requestSchema = null;
        }
      }

      // 2. 否则从 requestFields 构建
      if (!requestSchema && iface.requestFields) {
        try {
          const fields: MockFieldDef[] = typeof iface.requestFields === "string"
            ? JSON.parse(iface.requestFields)
            : iface.requestFields;
          if (Array.isArray(fields) && fields.length > 0) {
            requestSchema = fieldsToSchema(fields);
          }
        } catch {
          // ignore
        }
      }

      if (requestSchema) {
        operation.requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: requestSchema,
            },
          },
        };
      } else if (["POST", "PUT", "PATCH"].includes(iface.method)) {
        // POST/PUT/PATCH 无显式定义时给一个 object 占位
        operation.requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object" },
            },
          },
        };
      }

      // ── Response ──
      let responseSchema: any = null;

      // 1. responseSchema（直接 JSON Schema）
      if (iface.responseSchema) {
        try {
          responseSchema = JSON.parse(iface.responseSchema);
        } catch {
          responseSchema = null;
        }
      }

      // 2. mockFields → JSON Schema
      if (!responseSchema && iface.mockFields) {
        try {
          const fields: MockFieldDef[] = typeof iface.mockFields === "string"
            ? JSON.parse(iface.mockFields)
            : iface.mockFields;
          if (Array.isArray(fields) && fields.length > 0) {
            responseSchema = fieldsToSchema(fields);

            // 处理 responseMode: inherit → 包信封
            if (iface.responseMode === "inherit") {
              const parent = moduleMap.get(iface.moduleId);
              let wrapper = {
                enabled: true,
                codeField: "code",
                messageField: "message",
                dataField: "data",
                successCode: 200,
              };
              if (parent?.responseWrapper) {
                try {
                  wrapper = { ...wrapper, ...JSON.parse(parent.responseWrapper) };
                } catch {
                  // use defaults
                }
              }
              if (wrapper.enabled) {
                responseSchema = {
                  type: "object",
                  properties: {
                    [wrapper.codeField]: {
                      type: "integer",
                      example: wrapper.successCode,
                      description: "状态码",
                    },
                    [wrapper.messageField]: {
                      type: "string",
                      example: "success",
                      description: "响应消息",
                    },
                    [wrapper.dataField]: responseSchema,
                  },
                  required: [wrapper.codeField, wrapper.messageField, wrapper.dataField],
                };
              }
            }
          }
        } catch {
          // ignore
        }
      }

      // 3. mockResponse 推断（兜底）
      if (!responseSchema && iface.mockResponse) {
        try {
          responseSchema = inferSchema(JSON.parse(iface.mockResponse));
        } catch {
          responseSchema = { type: "object" };
        }
      }

      // 4. 最终兜底
      if (!responseSchema) {
        responseSchema = { type: "object" };
      }

      operation.responses = {
        [String(iface.mockStatusCode || 200)]: {
          description: "Success",
          content: {
            "application/json": {
              schema: responseSchema,
            },
          },
        },
      };

      // 标记废弃
      if (iface.status === "deprecated") {
        operation.deprecated = true;
      }

      // Metadata for mock
      operation["x-mock"] = true;

      paths[path][method] = operation;
    }
  }

  // Also include ungrouped interfaces
  const groupedIds = new Set(interfaces.filter((i) => i.moduleId).map((i) => i.id));
  const ungrouped = interfaces.filter((i) => !groupedIds.has(i.id));
  if (ungrouped.length > 0) {
    tags.push({ name: "未分类" });
    for (const iface of ungrouped) {
      const path = iface.path.startsWith("/") ? iface.path : `/${iface.path}`;
      const method = iface.method.toLowerCase();

      if (!paths[path]) paths[path] = {};

      let responseSchema: any = null;

      // Try mockFields first
      if (iface.mockFields) {
        try {
          const fields: MockFieldDef[] = typeof iface.mockFields === "string"
            ? JSON.parse(iface.mockFields)
            : iface.mockFields;
          if (Array.isArray(fields) && fields.length > 0) {
            responseSchema = fieldsToSchema(fields);
          }
        } catch {
          // ignore
        }
      }

      if (!responseSchema && iface.mockResponse) {
        try {
          responseSchema = inferSchema(JSON.parse(iface.mockResponse));
        } catch {
          responseSchema = { type: "object" };
        }
      }

      if (!responseSchema) {
        responseSchema = { type: "object" };
      }

      paths[path][method] = {
        tags: ["未分类"],
        summary: iface.name,
        description: iface.description ?? undefined,
        responses: {
          [String(iface.mockStatusCode || 200)]: {
            description: "Success",
            content: { "application/json": responseSchema },
          },
        },
        "x-mock": true,
        ...(iface.status === "deprecated" ? { deprecated: true } : {}),
      };
    }
  }

  const spec = {
    openapi: "3.0.3",
    info: {
      title: "Mock API",
      description: "Auto-generated from Kanban board API interfaces",
      version: "1.0.0",
    },
    servers: [
      {
        url: "/api/mock",
        description: "Mock Server",
      },
    ],
    tags,
    paths,
  };

  return NextResponse.json(spec, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="openapi.json"',
    },
  });
}

// ── Helpers ──

/** Convert MockFieldDef[] to JSON Schema object */
function fieldsToSchema(fields: MockFieldDef[]): any {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const field of fields) {
    properties[field.key] = fieldToSchema(field);
    if (field.required) required.push(field.key);
  }

  return required.length > 0
    ? { type: "object", properties, required }
    : { type: "object", properties };
}

/** Convert a single MockFieldDef to JSON Schema */
function fieldToSchema(f: MockFieldDef): any {
  const schema: any = {
    description: [f.label, f.desc].filter(Boolean).join(" — ") || undefined,
  };

  // 示例值（mock 规则 → example）
  const example = mockRuleToExample(f);
  if (example !== undefined) schema.example = example;

  switch (f.type) {
    case "string":
      schema.type = "string";
      break;
    case "number":
      schema.type = "number";
      break;
    case "boolean":
      schema.type = "boolean";
      break;
    case "array":
      schema.type = "array";
      if (f.children && f.children.length > 0) {
        schema.items = fieldsToSchema(f.children);
      } else {
        schema.items = { type: "string" };
      }
      break;
    case "object":
      schema.type = "object";
      if (f.children && f.children.length > 0) {
        Object.assign(schema, fieldsToSchema(f.children));
        delete schema.type; // fieldsToSchema already sets type
      }
      break;
  }

  return schema;
}

/** Try to derive a static example value from a mock rule */
function mockRuleToExample(f: MockFieldDef): unknown {
  const rule = f.mock.trim();
  if (!rule) return undefined;

  // Raw values (no @)
  if (!rule.startsWith("@")) {
    switch (f.type) {
      case "number":
        return parseFloat(rule) || 0;
      case "boolean":
        return rule === "true";
      default:
        return rule;
    }
  }

  // Replace common @placeholders with static examples
  const examples: Record<string, string | number | boolean> = {
    "@cname": "张三",
    "@name": "John",
    "@email": "user@example.com",
    "@phone": "13800138000",
    "@city": "杭州",
    "@province": "浙江省",
    "@image": "https://example.com/avatar.png",
    "@url": "https://example.com",
    "@id": "a1b2c3d4e5f6",
    "@uuid": "550e8400-e29b-41d4-a716-446655440000",
    "@date": "2024-01-15",
    "@datetime": "2024-01-15T10:30:00Z",
    "@time": "10:30:00",
    "@word": "example",
    "@status": "active",
    "@color": "#3b82f6",
    "@ip": "192.168.1.1",
    "@boolean": true,
    "@integer": 1,
    "@float": 99.99,
  };

  // Extract base placeholder name (strip numeric args)
  const base = rule.match(/^@(\w+)/)?.[1];
  if (base && base in examples) return examples[base];

  // Number with visible range: @integer(1,100) → 42
  if (f.type === "number" || base === "integer" || base === "natural") return 42;
  if (base === "float") return 99.99;

  return undefined;
}

/** Infer JSON Schema from a sample value */
function inferSchema(value: unknown): any {
  if (value === null) return { type: "string", nullable: true };
  if (Array.isArray(value)) {
    return {
      type: "array",
      items: value.length > 0 ? inferSchema(value[0]) : { type: "object" },
    };
  }
  if (typeof value === "object") {
    const properties: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      properties[k] = inferSchema(v);
    }
    return { type: "object", properties };
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? { type: "integer" } : { type: "number" };
  }
  if (typeof value === "boolean") return { type: "boolean" };
  return { type: "string" };
}
