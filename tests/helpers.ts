// 直接调用 route handler 的辅助函数
import { NextRequest } from "next/server";

export function makeReq(
  method: string,
  url: string,
  body?: unknown,
  cookie?: string
): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (cookie) headers["cookie"] = cookie;
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest(url, init);
}

/** 登录并把 sid 写进全局 cookie store */
export async function loginAs(userId: string, password = "test1234") {
  const { POST: login } = await import("@/app/api/auth/login/route");
  const r = await login(makeReq("POST", "http://x/api/auth/login", { userId, password }));
  if (!r.ok) throw new Error(`login ${userId} failed: ${r.status}`);
  const setCookie = r.headers.get("set-cookie")!;
  const sid = setCookie.match(/sid=([^;]+)/)![1];
  globalThis.__cookieStore__.set("sid", { name: "sid", value: sid });
  return sid;
}

export function clearAuth() {
  globalThis.__cookieStore__.delete("sid");
}
