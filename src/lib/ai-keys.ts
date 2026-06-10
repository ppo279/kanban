// AI API key 管理 — 加密存在浏览器 localStorage,网络传输走 envelope
//
// 存储:
// - 每个 provider 一条 key,AES-GCM 加密后存 localStorage
// - 派生 key 来自浏览器常量(防"随手打开 devtools 看一眼"场景)
//
// 传输(2026-06 新增):
// - FE→BE 发送 AI 请求时,**不再传明文 apiKey**
// - 改成传 envelope(DEK 用 BE 公钥 RSA-OAEP 包裹,apiKey 用 DEK + AES-GCM 加密)
// - 每次请求 IV+DEK 都新生成,AAD 绑定到请求上下文
// - 配合 src/lib/aiServerKeys.ts 的服务端 keypair singleton
//
// 流程:
// 1. 浏览器首次 AI 操作 → fetch /api/ai/pubkey → 缓存 {kid, publicKey}
// 2. 调 /api/ai/{generate,test} → wrapApiKey(plain) → 发起请求
// 3. 收到 401/403 (kid 不匹配) → 重新拉 pubkey → 重试一次

import { encrypt, decrypt, isCryptoAvailable } from "./crypto";
import {
  wrapApiKey as cryptoWrapApiKey,
  importPublicKeyB64,
  type AIKeyEnvelope,
  type AADInput,
} from "./aiEnvelope";

export type AIProvider = "minimax" | "deepseek";

export const AI_PROVIDERS: Array<{
  id: AIProvider;
  label: string;
  placeholder: string;
  helpUrl: string;
}> = [
  {
    id: "minimax",
    label: "MiniMax cn",
    placeholder: "eyJhbGciOi...",
    helpUrl: "https://platform.minimaxi.com/user-center/basic-information/Interface-key",
  },
  {
    id: "deepseek",
    label: "DeepSeek cn",
    placeholder: "sk-...",
    helpUrl: "https://platform.deepseek.com/api_keys",
  },
];

const STORAGE_PREFIX = "kanban.ai.key.";

/** 存 key(明文 → 加密 → localStorage) */
export async function setAPIKey(
  provider: AIProvider,
  plainKey: string
): Promise<void> {
  if (!isCryptoAvailable()) {
    throw new Error("当前环境不支持加密(可能不是浏览器)");
  }
  if (!plainKey.trim()) {
    localStorage.removeItem(STORAGE_PREFIX + provider);
    return;
  }
  const enc = await encrypt(plainKey.trim());
  localStorage.setItem(STORAGE_PREFIX + provider, enc);
}

/** 取 key(解密) */
export async function getAPIKey(
  provider: AIProvider
): Promise<string | null> {
  if (!isCryptoAvailable()) return null;
  const enc = localStorage.getItem(STORAGE_PREFIX + provider);
  if (!enc) return null;
  try {
    return await decrypt(enc);
  } catch (e) {
    // 派生 key 失败(可能用户清了浏览器数据/换浏览器),让用户重新配
    console.warn(`[ai-keys] decrypt ${provider} failed`, e);
    localStorage.removeItem(STORAGE_PREFIX + provider);
    return null;
  }
}

/** 仅检查 key 是否存在(不解密,用于 UI 显示状态) */
export function hasAPIKey(provider: AIProvider): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_PREFIX + provider) !== null;
}

/** 删除 key */
export function clearAPIKey(provider: AIProvider): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_PREFIX + provider);
}

/** 后端转发 API 地址(同源) */
export const AI_GENERATE_ENDPOINT = "/api/ai/generate";

// ──────────────────────────────────────────────────────────────────────
// 网络传输 envelope 相关(2026-06 新增)
// ──────────────────────────────────────────────────────────────────────

const PUBKEY_ENDPOINT = "/api/ai/pubkey";

interface CachedPubKey {
  kid: string;
  /** 已导入的 CryptoKey(直接拿来用,不用每次重新 import) */
  key: CryptoKey;
}
let pubkeyCache: CachedPubKey | null = null;
let pubkeyInflight: Promise<CachedPubKey> | null = null;

/** 从后端拉公钥,缓存到 session(只拉一次,失败/失效重试) */
export async function loadAIPubkey(force = false): Promise<CachedPubKey> {
  if (!force && pubkeyCache) return pubkeyCache;
  if (!force && pubkeyInflight) return pubkeyInflight;

  pubkeyInflight = (async () => {
    const r = await fetch(PUBKEY_ENDPOINT, {
      method: "GET",
      credentials: "include",
    });
    if (!r.ok) {
      throw new Error(`拉公钥失败:${r.status} ${r.statusText}`);
    }
    const data = await r.json();
    if (!data.ok) throw new Error(data.error ?? "拉公钥失败");
    const key = await importPublicKeyB64(data.publicKey);
    const cached = { kid: data.kid, key };
    pubkeyCache = cached;
    return cached;
  })().finally(() => {
    pubkeyInflight = null;
  });

  return pubkeyInflight;
}

/** 清空公钥缓存(遇到 kid 不匹配时调用) */
export function resetAIPubkeyCache() {
  pubkeyCache = null;
  pubkeyInflight = null;
}

/**
 * 把明文 apiKey 包成 envelope,自动处理公钥缓存
 * @param onRetryKidMismatch 当 kid 失效时(后端重启)被调用,内部会重试一次
 */
export async function wrapApiKey(
  plainKey: string,
  aad: AADInput
): Promise<AIKeyEnvelope> {
  let cached = await loadAIPubkey();
  let env = await cryptoWrapApiKey(plainKey, cached.key, aad);
  env.kid = cached.kid;
  return env;
}

/**
 * 同 wrapApiKey,但 kid 不匹配时(后端进程重启)会自动重试一次
 * 用于直接调 fetch 的场景
 */
export async function wrapApiKeyWithRetry(
  plainKey: string,
  aad: AADInput
): Promise<AIKeyEnvelope> {
  try {
    return await wrapApiKey(plainKey, aad);
  } catch (e: any) {
    // 可能是 kid 失效导致 RSA 解不出来 — 清缓存重试
    if (String(e?.message ?? "").includes("kid") || String(e?.message ?? "").includes("decrypt")) {
      resetAIPubkeyCache();
      return await wrapApiKey(plainKey, aad);
    }
    throw e;
  }
}
