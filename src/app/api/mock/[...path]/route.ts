import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";

/**
 * Mock API 运行时路由
 * 根据 method + path 查找 api_interfaces 表中的配置，返回 mock 响应。
 * 前端直接调用 /api/mock/xxx 即可。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleMock(req, params);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleMock(req, params);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleMock(req, params);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleMock(req, params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleMock(req, params);
}

async function handleMock(
  req: NextRequest,
  paramsPromise: Promise<{ path: string[] }>
) {
  const { path } = await paramsPromise;
  const mockPath = "/" + path.join("/");
  const method = req.method;

  // 查找匹配的接口配置
  const rows = await db
    .select()
    .from(schema.apiInterfaces)
    .where(
      and(
        eq(schema.apiInterfaces.path, mockPath),
        eq(schema.apiInterfaces.method, method as any)
      )
    )
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: `Mock 接口未找到: ${method} ${mockPath}` },
      { status: 404 }
    );
  }

  const iface = rows[0];

  if (iface.status !== "active") {
    return NextResponse.json(
      { ok: false, error: "Mock 接口未激活" },
      { status: 503 }
    );
  }

  // 解析自定义 headers
  let headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (iface.mockHeaders) {
    try {
      const custom = JSON.parse(iface.mockHeaders);
      headers = { ...headers, ...custom };
    } catch {
      // ignore invalid headers
    }
  }

  // 返回 mock 响应
  const body = iface.mockResponse ?? "{}";
  return new NextResponse(body, {
    status: iface.mockStatusCode,
    headers,
  });
}
