// AI API key 管理 — 加密存在浏览器 localStorage
//
// 设计:
// - 每个 provider 一条 key,key 派生自浏览器常量做 AES-GCM 加密
// - 用户在 AI 设置 dialog 里输入明文 → 加密后存
// - 生成文档时解密 → 通过 Authorization header 发给后端
// - 后端不存任何 key,只做转发(避免后端泄露扩大化)

import { encrypt, decrypt, isCryptoAvailable } from "./crypto";

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
