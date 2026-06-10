// AI 文档生成 — 后端转发
//
// 职责:
// 1. 鉴权(必须登录)
// 2. 接收前端传来的 apiKey(明文,只在这一跳里使用,不持久化)
// 3. 根据 provider 拼对应 LLM 的 chat completions 请求(都兼容 OpenAI 格式)
// 4. 返回模型生成的 markdown 内容
//
// 不存任何 key,不写日志。

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromCookie } from "@/lib/auth";

const Body = z.object({
  provider: z.enum(["minimax", "deepseek"]),
  apiKey: z.string().min(1).max(500),
  title: z.string().min(1).max(200),
  // 用户写的需求/背景(可空,空就用标题生成)
  prompt: z.string().max(2000).optional().default(""),
  mode: z.enum(["spec", "tdd"]),
  // 模型 ID(可选,默认按 provider 选一个)
  model: z.string().max(100).optional(),
});

// MiniMax cn: https://api.minimaxi.com/v1/text/chatcompletion_v2
// DeepSeek cn: https://api.deepseek.com/v1/chat/completions
// 两个都兼容 OpenAI chat completions 协议
const PROVIDER_CONFIG: Record<
  string,
  { endpoint: string; defaultModel: string; modelOptions: string[] }
> = {
  minimax: {
    endpoint: "https://api.minimaxi.com/v1/text/chatcompletion_v2",
    defaultModel: "MiniMax-Text-01",
    modelOptions: ["MiniMax-Text-01", "abab6.5s-chat", "abab6.5g-chat"],
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    defaultModel: "deepseek-chat",
    modelOptions: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
  },
};

function buildSystemPrompt(mode: "spec" | "tdd"): string {
  if (mode === "tdd") {
    return `你是一个帮助团队写 TDD 文档的助手。
用户会给你一个标题和需求描述,请输出严格的 markdown 文档,按以下结构组织:

# 标题

## 🔴 红:失败的测试
- [ ] (写一段要写的测试用例,先描述期望行为,再描述失败原因)

## 🟢 绿:实现
- [ ] (写最小实现让上面的测试通过)

## 🔵 重构:决策记录
- [ ] (在保持测试通过的前提下,记录设计决策和重构方向)

## 📊 当前进度
- [ ] 当前在哪个阶段 / 哪些条目已 done

要求:
1. 全文用 markdown,不要写 JSON 或 XML
2. 每个 section 至少 2-4 行实质内容,不要空
3. checklist 用 "- [ ] " 开头(半角空格,半角中括号,半角 x)
4. 文字简洁,直接说要点
5. 不要任何开场白/客套话,直接进入主题
6. 用中文输出`;
  }
  // spec
  return `你是一个帮助团队写需求规格说明书的助手。
用户会给你一个标题和需求描述,请输出严格的 markdown 文档,按以下结构组织:

# 标题

## 背景
- [ ] (这个需求要解决的业务/技术问题)

## 目标
- [ ] (成功的标准是什么,可衡量的)

## 范围
- [ ] (包含什么 / 不包含什么)

## 接口设计
- [ ] (API/数据流/关键交互,可以用代码块)

## 数据模型
- [ ] (关键字段、关系)

## 验收标准
- [ ] (可勾选的验收 checklist,3-6 条)

要求:
1. 全文用 markdown,不要写 JSON 或 XML
2. 每个 section 至少 2-4 行实质内容,不要空
3. checklist 用 "- [ ] " 开头(半角空格,半角中括号)
4. 文字简洁,直接说要点
5. 不要任何开场白/客套话,直接进入主题
6. 用中文输出`;
}

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

  const { provider, apiKey, title, prompt, mode, model } = parsed.data;
  const cfg = PROVIDER_CONFIG[provider];
  const useModel = model && cfg.modelOptions.includes(model)
    ? model
    : cfg.defaultModel;

  // 拼请求
  const systemPrompt = buildSystemPrompt(mode);
  const userPrompt = prompt.trim()
    ? `标题:${title}\n\n额外需求/背景:\n${prompt.trim()}\n\n请按上述结构输出完整 ${mode.toUpperCase()} 文档:`
    : `标题:${title}\n\n请按上述结构输出完整 ${mode.toUpperCase()} 文档:`

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
        temperature: 0.7,
        max_tokens: 2048,
        // 关闭流式 — 我们一次性拿完整内容,避免前端处理流
        stream: false,
      }),
      // 加超时保护(Next.js 本身不直接支持,这里用 AbortController 兜底)
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: `调用 ${provider} 失败:${e?.message ?? "network error"}` },
      { status: 502 }
    );
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    return NextResponse.json(
      {
        ok: false,
        error: `${provider} 返回 ${resp.status}:${errText.slice(0, 300) || resp.statusText}`,
      },
      { status: 502 }
    );
  }

  const data = await resp.json();
  // 兼容 OpenAI 格式的 choices[0].message.content
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    return NextResponse.json(
      { ok: false, error: "模型未返回内容" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    content: content.trim(),
    model: useModel,
    provider,
  });
}
