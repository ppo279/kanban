import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getUserFromCookie } from "@/lib/auth";
import { nanoid } from "nanoid";

const Body = z.object({
  spec: z.any(),
  /** 必传,导入的 module/interface 归属 ws */
  workspaceId: z.string().min(1).max(64),
});

/**
 * Import a Swagger/OpenAPI spec into the kanban board.
 * POST /api/docs/import-swagger
 * Body: { spec: <OpenAPI/Swagger JSON object>, workspaceId: string }
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromCookie();
  if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "参数错误", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // 校验 ws 存在
  const [ws] = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, parsed.data.workspaceId))
    .limit(1);
  if (!ws) {
    return NextResponse.json(
      { ok: false, error: "工作区不存在" },
      { status: 404 }
    );
  }
  const workspaceId = parsed.data.workspaceId;

  const spec = parsed.data.spec;

  if (!spec || typeof spec !== "object") {
    return NextResponse.json({ ok: false, error: "无效的 Swagger/OpenAPI spec" }, { status: 400 });
  }

  // Normalize: support both OpenAPI 3.x and Swagger 2.0
  const isOpenAPI3 = spec.openapi?.startsWith("3");
  const isSwagger2 = spec.swagger?.startsWith("2");

  if (!isOpenAPI3 && !isSwagger2) {
    return NextResponse.json(
      { ok: false, error: "不支持的格式，请提供 OpenAPI 3.x 或 Swagger 2.0" },
      { status: 400 }
    );
  }

  const now = Date.now();
  let moduleCount = 0;
  let interfaceCount = 0;

  try {
    // Extract tags for module grouping
    const tags: { name: string; description?: string }[] = spec.tags ?? [];

    // Create modules from tags
    const tagToModuleId = new Map<string, string>();

    for (const tag of tags) {
      // 只在同一 workspace 下查重
      const existing = await db
        .select()
        .from(schema.apiModules)
        .where(eq(schema.apiModules.workspaceId, workspaceId));

      // Check if module with this name already exists in this ws
      const found = existing.find((m) => m.name === tag.name);
      if (found) {
        tagToModuleId.set(tag.name, found.id);
      } else {
        const moduleId = nanoid(12);
        await db.insert(schema.apiModules).values({
          id: moduleId,
          workspaceId,
          name: tag.name,
          description: tag.description ?? null,
          sortOrder: moduleCount,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        });
        tagToModuleId.set(tag.name, moduleId);
        moduleCount++;
      }
    }

    // If no tags, create a default module
    if (tags.length === 0) {
      const title = spec.info?.title ?? "导入的 API";
      const moduleId = nanoid(12);
      await db.insert(schema.apiModules).values({
        id: moduleId,
        workspaceId,
        name: title,
        description: spec.info?.description ?? null,
        sortOrder: 0,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      });
      tagToModuleId.set("_default", moduleId);
      moduleCount++;
    }

    // Parse paths
    const paths = spec.paths ?? {};
    for (const [pathStr, pathObj] of Object.entries(paths) as [string, any][]) {
      const methods = ["get", "post", "put", "delete", "patch"];

      for (const method of methods) {
        const operation = pathObj[method];
        if (!operation) continue;

        const httpMethod = method.toUpperCase();
        const name = operation.summary || operation.operationId || `${httpMethod} ${pathStr}`;

        // Determine which module to use
        const opTags = operation.tags ?? [];
        const tagName = opTags[0] ?? (tags.length > 0 ? tags[0].name : "_default");
        const moduleId = tagToModuleId.get(tagName) ?? tagToModuleId.get("_default") ?? "";

        // Extract response schema for mock response
        let mockResponse = '{"code": 200, "data": {}}';
        let mockStatusCode = 200;

        if (operation.responses) {
          const firstResponse = operation.responses["200"] ?? operation.responses["201"] ?? Object.values(operation.responses)[0] as any;
          if (firstResponse) {
            mockStatusCode = parseInt(String(firstResponse.status || 200));
            // Try to extract example from response schema
            const content = firstResponse.content?.["application/json"];
            if (content?.example) {
              mockResponse = JSON.stringify(content.example, null, 2);
            } else if (content?.schema) {
              mockResponse = JSON.stringify(generateExample(content.schema), null, 2);
            }
          }
        }

        // Extract request schema
        let requestSchema: string | null = null;
        if (operation.requestBody?.content?.["application/json"]?.schema) {
          requestSchema = JSON.stringify(operation.requestBody.content["application/json"].schema, null, 2);
        }

        // Extract response schema
        let responseSchemaStr: string | null = null;
        const respContent = operation.responses?.["200"]?.content?.["application/json"];
        if (respContent?.schema) {
          responseSchemaStr = JSON.stringify(respContent.schema, null, 2);
        }

        await db.insert(schema.apiInterfaces).values({
          id: nanoid(12),
          moduleId,
          taskId: null,
          name,
          method: httpMethod as any,
          path: pathStr,
          description: operation.description ?? null,
          requestSchema,
          responseSchema: responseSchemaStr,
          mockResponse,
          mockStatusCode,
          mockHeaders: null,
          swaggerUrl: null,
          status: "active",
          createdAt: new Date(now),
          updatedAt: new Date(now),
        });
        interfaceCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      moduleCount,
      interfaceCount,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: `导入失败: ${e.message}` },
      { status: 500 }
    );
  }
}

/** Generate a sample value from a JSON Schema */
function generateExample(schema: any): unknown {
  if (!schema) return {};
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  switch (schema.type) {
    case "string":
      if (schema.enum?.length > 0) return schema.enum[0];
      if (schema.format === "email") return "user@example.com";
      if (schema.format === "date") return "2024-01-01";
      if (schema.format === "date-time") return "2024-01-01T00:00:00Z";
      return "string";
    case "number":
    case "integer":
      if (schema.enum?.length > 0) return schema.enum[0];
      return 0;
    case "boolean":
      return true;
    case "array":
      if (schema.items) return [generateExample(schema.items)];
      return [];
    case "object": {
      const obj: Record<string, unknown> = {};
      if (schema.properties) {
        for (const [k, v] of Object.entries(schema.properties)) {
          obj[k] = generateExample(v);
        }
      }
      return obj;
    }
    default:
      if (schema.oneOf?.[0] || schema.anyOf?.[0]) {
        return generateExample(schema.oneOf?.[0] ?? schema.anyOf?.[0]);
      }
      return {};
  }
}
