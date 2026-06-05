import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { generateMockData as generateMockResponse, wrapResponse, type MockFieldDef } from "@/lib/mock-engine";
import type { ResponseWrapper } from "@/types";

/**
 * Mock API 运行时路由
 * 根据 method + path 查找 api_interfaces 表中的配置，返回 mock 响应。
 * 优先使用 mockFields 动态生成，回退到静态 mockResponse。
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

  if (iface.status === "deprecated") {
    return NextResponse.json(
      { ok: false, error: "Mock 接口已废弃" },
      { status: 410 }
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

  // 生成 mock 响应数据
  let responseData: Record<string, unknown>;
  if (iface.mockFields) {
    try {
      const fields: MockFieldDef[] = JSON.parse(iface.mockFields);
      if (Array.isArray(fields) && fields.length > 0) {
        responseData = generateMockResponse(fields);
      } else {
        responseData = JSON.parse(iface.mockResponse ?? "{}");
      }
    } catch {
      responseData = {};
    }
  } else {
    try {
      responseData = JSON.parse(iface.mockResponse ?? "{}");
    } catch {
      responseData = {};
    }
  }

  // 应用响应信封包裹
  const responseMode = iface.responseMode ?? "inherit";
  let finalResponse: Record<string, unknown>;

  if (responseMode === "raw") {
    // 不包裹，直接返回数据
    finalResponse = responseData;
  } else if (responseMode === "custom" && iface.customWrapper) {
    // 自定义信封
    try {
      const custom = JSON.parse(iface.customWrapper);
      finalResponse = wrapResponse(responseData, {
        enabled: custom.enabled ?? true,
        codeField: custom.codeField ?? "code",
        messageField: custom.messageField ?? "message",
        dataField: custom.dataField ?? "data",
        successCode: custom.successCode ?? 200,
      });
    } catch {
      finalResponse = wrapResponse(responseData, {
        enabled: true,
        codeField: "code",
        messageField: "message",
        dataField: "data",
        successCode: 200,
      });
    }
  } else {
    // inherit: 使用模块级或默认信封
    let wrapper: ResponseWrapper = {
      enabled: true,
      codeField: "code",
      messageField: "message",
      dataField: "data",
      successCode: 200,
    };

    // 尝试从所属模块获取全局信封配置
    const mod = await db
      .select()
      .from(schema.apiModules)
      .where(eq(schema.apiModules.id, iface.moduleId))
      .limit(1);

    if (mod.length > 0 && mod[0].responseWrapper) {
      try {
        const modWrapper = JSON.parse(mod[0].responseWrapper);
        if (modWrapper.enabled === false) {
          wrapper = { ...wrapper, enabled: false };
        } else {
          wrapper = { ...wrapper, ...modWrapper, enabled: true };
        }
      } catch {
        // ignore
      }
    }

    finalResponse = wrapResponse(responseData, wrapper);
  }

  const body = JSON.stringify(finalResponse, null, 2);
  return new NextResponse(body, {
    status: iface.mockStatusCode,
    headers,
  });
}
