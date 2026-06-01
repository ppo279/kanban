import { describe, it, expect, beforeEach } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { makeReq, loginAs, clearAuth } from "./helpers";

describe("auth", () => {
  beforeEach(() => clearAuth());

  it("login: 错密码返回 401", async () => {
    const r = await login(makeReq("POST", "http://x/api/auth/login", { userId: "u_frontend", password: "wrong" }));
    expect(r.status).toBe(401);
    const d = await r.json();
    expect(d.ok).toBe(false);
  });

  it("login: 正确密码返回 200 + cookie", async () => {
    const r = await login(makeReq("POST", "http://x/api/auth/login", { userId: "u_frontend", password: "test1234" }));
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.ok).toBe(true);
    expect(d.user.id).toBe("u_frontend");
    expect(d.user.role).toBe("frontend");
    expect(r.headers.get("set-cookie")).toMatch(/sid=/);
  });

  it("login: 缺 password 400", async () => {
    const r = await login(makeReq("POST", "http://x/api/auth/login", { userId: "u_frontend" }));
    expect(r.status).toBe(400);
  });

  it("login: 账号不存在 401", async () => {
    const r = await login(makeReq("POST", "http://x/api/auth/login", { userId: "u_nobody", password: "x" }));
    expect(r.status).toBe(401);
  });

  it("me: 未登录 401", async () => {
    const r = await me();
    expect(r.status).toBe(401);
  });

  it("me: 登录后 200 返回 user", async () => {
    await loginAs("u_backend");
    const r = await me();
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.user.id).toBe("u_backend");
    expect(d.user.role).toBe("backend");
  });

  it("logout: 清 cookie + 返回 ok", async () => {
    await loginAs("u_testing");
    const r = await logout();
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.ok).toBe(true);
    expect(r.headers.get("set-cookie")).toMatch(/sid=;|Max-Age=0|Expires=/);
  });
});
