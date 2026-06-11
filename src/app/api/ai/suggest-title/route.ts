// AI 起标题 — 阶段 3 用
//
// 用途:用户没填标题 / 标题太长时,让 LLM 根据 prompt 顺便起个 4-8 字标题
// 实现:独立的 chat completion,prompt 极简,max_tokens=20,只取首行
//
// 跟 /api/ai/generate 的区别:
// - generate 拿全文(spec/tdd 模板),这路由只拿标题
// - max_tokens 极小,响应快
// - 不抽 AAD(不需要绑定完整请求上下文,只要 provider/model/prompt)
//
// 安全性:沿用 envelope(不让 apiKey 走明文 body)

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
  model: z.string().min(1).max(100),
  /** 用户的 prompt / 需求 / 背景,作为起标题的语义依据 */
  context: z.string().min(1).max(2000),
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

  const { provider, enc, model, context } = parsed.data;
  const useModel = resolveModel(provider as AIProvider, model);
  const cfg = AI_PROVIDER_CONFIG[provider as AIProvider];

  let apiKey: string;
  try {
    const privKey = await getAIPrivateKey(enc.kid);
    apiKey = await unwrapApiKey(
      enc,
      privKey,
      { provider, model, mode: "title", title: "title-suggest", prompt: context }
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

  // 起标题的 system prompt — 极简,只要 4-8 字标题
  const systemPrompt =
    "你是文档命名助手。用户给你一段需求描述,你回一个 4-8 字的中文标题,不要任何标点/前缀/解释,直接输出标题文字本身。";
  const userPrompt = `需求:\n${context}\n\n请输出 4-8 字中文标题:`;

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
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 20,
        temperature: 0.5,
        stream: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: `网络错误:${e?.message ?? "unknown"}` },
      { status: 502 }
    );
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    return NextResponse.json(
      {
        ok: false,
        error: `${provider} 返回 ${resp.status}:${errText.slice(0, 200) || resp.statusText}`,
      },
      { status: 502 }
    );
  }

  const data = await resp.json();
  const raw2: string | undefined = data?.choices?.[0]?.message?.content;
  if (!raw2) {
    return NextResponse.json(
      { ok: false, error: "模型未返回内容" },
      { status: 502 }
    );
  }
  // 清理:去掉前后空白、引号、句号、Markdown 加粗符号,只保留核心文字
  const title = raw2
    .trim()
    .replace(/^["'`「『]+/, "")
    .replace(/["'`」』,。.!?]+$/, "")
    .replace(/\*\*/g, "")
    .slice(0, 16)
    .trim();
  if (!title) {
    return NextResponse.json(
      { ok: false, error: "模型返回的标题为空" },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, title });
}
