"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBoardStore } from "@/store/board";
import type { User } from "@/types";
import { ROLE_COLOR, ROLE_LABEL } from "@/types";

const PRESET_USERS: Array<{ id: string; name: string; role: User["role"] }> = [
  { id: "u_frontend", name: "前端工程师", role: "frontend" },
  { id: "u_backend", name: "后端工程师", role: "backend" },
  { id: "u_testing", name: "测试工程师", role: "testing" },
];

export function LoginForm() {
  const router = useRouter();
  const setMe = useBoardStore((s) => s.setMe);
  const [selectedRole, setSelectedRole] = useState<typeof PRESET_USERS[number]>(PRESET_USERS[0]);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedRole.id, password }),
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        toast.error(data.error ?? "登录失败");
        return;
      }
      setMe(data.user);
      toast.success(`欢迎，${data.user.name}`);
      router.push("/");
    } catch (err) {
      toast.error("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">团队看板</CardTitle>
          <CardDescription>选择你的角色，输入密码登录</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label>我是</Label>
              <div className="grid grid-cols-3 gap-2">
                {PRESET_USERS.map((u) => {
                  const active = selectedRole.id === u.id;
                  return (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() => setSelectedRole(u)}
                      className={`flex flex-col items-center gap-1 rounded-md border p-3 transition-all ${
                        active
                          ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div
                        className={`h-9 w-9 rounded-full ${ROLE_COLOR[u.role]} text-white flex items-center justify-center text-sm font-semibold`}
                      >
                        {u.name[0]}
                      </div>
                      <span className="text-xs font-medium">{ROLE_LABEL[u.role]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="默认 kanban123"
                autoComplete="current-password"
                required
              />
              <p className="text-xs text-muted-foreground">
                首次登录默认密码 <code className="px-1 py-0.5 rounded bg-muted">kanban123</code>
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={loading || !password}>
              {loading ? "登录中…" : `以${ROLE_LABEL[selectedRole.role]}身份登录`}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
