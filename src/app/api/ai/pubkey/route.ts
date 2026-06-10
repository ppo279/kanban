// GET /api/ai/pubkey — 把当前 AI keypair 的公钥 + kid 发回 FE
//
// 调用方:浏览器在首次 AI 操作前拉一次,然后缓存到内存
// 安全:这是个公开端点(因为公钥本来就是公开的),
//       加了登录鉴权避免被滥用来探测服务在不在

import { NextResponse } from "next/server";
import { getUserFromCookie } from "@/lib/auth";
import { getAIPublicKey } from "@/lib/aiServerKeys";

export async function GET() {
  const user = await getUserFromCookie();
  if (!user) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }

  try {
    const { kid, publicKeyB64 } = await getAIPublicKey();
    return NextResponse.json({
      ok: true,
      kid,
      /** SPKI base64 — 浏览器 importKey("spki", ..., ["encrypt"]) */
      publicKey: publicKeyB64,
      algorithm: "RSA-OAEP-2048 + SHA-256 + AES-256-GCM",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: `密钥初始化失败:${e?.message ?? e}` },
      { status: 500 }
    );
  }
}
