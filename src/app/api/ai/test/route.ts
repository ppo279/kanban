// AI API key 健康检查 — 后端转发
//
// 用途:AISettingsDialog 里点"测试"按钮,验证 key 是否有效
// 实现:对两个 provider 都发一个最小化的 chat completion 请求
//       (max_tokens=1),确认能 200 OK 并返回 choices
//
// 为什么不用 GET /v1/models?
// - DeepSeek 标准支持,但 MiniMax 的 models 端点不公开稳定
// - 复用 chat completion 端点最稳妥
//
// 入参:envelope(替代旧 apiKey 明文),见 src/lib/aiEnvelope.ts

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromCookie } from "@/lib/auth";
import { getAIPrivateKey } from "@/lib/aiServerKeys";
import { unwrapApiKey, ENVELOPE_VERSION } from "@/lib/aiEnvelope";
import { AI_PROVIDER_CONFIG, resolveModel } from "@/lib/aiProviders";
import type { AIProvider } from "@/lib/ai-keys";

const Envelope = z.object({
  v: z.literal(ENVELOPE_VERSION),
  kid: z.string().min(1).max(64),
  iv: z.string().min(16).max(64),
  ct: z.string().min(1).max(4096),
  dek: z.string().min(1).max(1024),
});

const Body = z.object({
  provider: z.enum(["minimax", "deepseek"]),
  enc: Envelope,
  // test 路由不传 title/mode,AAD 用 provider 单一字段绑死
  model: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  const user = await getUserFromCookie();
  if (!user) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "参数错误", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { provider, enc, model } = parsed.data;
  // 实际发给 LLM 的 model 走 resolveModel,跟 FE AAD 字段保持一致
  const useModel = resolveModel(provider as AIProvider, model);
  const cfg = AI_PROVIDER_CONFIG[provider as AIProvider];

  // 解开 envelope — test 路由只关心 apiKey,prompt 字段拼一个空字符串
  let apiKey: string;
  try {
    const privKey = await getAIPrivateKey(enc.kid);
    apiKey = await unwrapApiKey(
      enc,
      privKey,
      { provider, model, mode: "test", title: "ping", prompt: "" }
    );
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes("kid")) {
      return NextResponse.json(
        { ok: false, error: "公钥已过期,请重新发起请求" },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { ok: false, error: `信封解密失败:${msg}` },
      { status: 400 }
    );
  }

  let resp: Response;
  try {
    resp = await fetch(cfg.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: useModel,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        temperature: 0,
        stream: false,
      }),
      // 30s 超时 — 比 generate 短,因为测试不应该等很久
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: `网络错误:${e?.message ?? "unknown"}` },
      { status: 502 }
    );
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    // 401/403 = 鉴权失败(基本就是 key 错)
    if (resp.status === 401 || resp.status === 403) {
      return NextResponse.json(
        {
          ok: false,
          error: "鉴权失败 — key 无效或已过期",
          detail: errText.slice(0, 300),
        },
        { status: 200 } // 用 200 包,因为业务上是"测试结果"而不是"系统错误"
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: `${provider} 返回 ${resp.status}:${errText.slice(0, 300) || resp.statusText}`,
      },
      { status: 502 }
    );
  }

  // 成功
  return NextResponse.json({
    ok: true,
    provider,
    model: useModel,
    message: `连接成功 — ${provider === "minimax" ? "MiniMax cn" : "DeepSeek cn"} API 可用`,
  });
}