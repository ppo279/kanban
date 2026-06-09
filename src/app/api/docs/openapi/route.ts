import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

/**
 * Generate OpenAPI 3.0 spec from api_interfaces table.
 * GET /api/docs/openapi → returns openapi.json
 */
export async function GET() {
  const modules = await db.select().from(schema.apiModules).orderBy(schema.apiModules.sortOrder);
  const interfaces = await db.select().from(schema.apiInterfaces);

  // Group interfaces by module
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

      // Parse request schema if available
      if (iface.requestSchema) {
        try {
          const reqSchema = JSON.parse(iface.requestSchema);
          operation.requestBody = {
            required: true,
            content: {
              "application/json": {
                schema: reqSchema,
              },
            },
          };
        } catch {
          // ignore invalid JSON
        }
      }

      // Parse response schema
      const responseSchema: any = {};
      if (iface.mockResponse) {
        try {
          const mockData = JSON.parse(iface.mockResponse);
          // Infer type from mock data
          responseSchema.schema = inferSchema(mockData);
        } catch {
          responseSchema.schema = { type: "object" };
        }
      } else if (iface.responseSchema) {
        try {
          responseSchema.schema = JSON.parse(iface.responseSchema);
        } catch {
          responseSchema.schema = { type: "object" };
        }
      } else {
        responseSchema.schema = { type: "object" };
      }

      operation.responses = {
        [String(iface.mockStatusCode || 200)]: {
          description: "Success",
          content: {
            "application/json": responseSchema,
          },
        },
      };

      // Determine security (mock endpoints are open)
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

      const responseSchema: any = {};
      if (iface.mockResponse) {
        try {
          responseSchema.schema = inferSchema(JSON.parse(iface.mockResponse));
        } catch {
          responseSchema.schema = { type: "object" };
        }
      } else {
        responseSchema.schema = { type: "object" };
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
