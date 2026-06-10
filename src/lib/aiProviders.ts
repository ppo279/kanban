// AI provider 配置 - FE/BE 共享
//
// 为什么抽出来:
// - 之前 default model 在 3 个地方写:BE 路由 × 2,AIGenerateDialog,DocPanel
// - FE 不传 model 时 BE 自己用 default,但 AAD 里 model 字段是空字符串,导致两边不一致
//   → AES-GCM auth tag 校验失败 → "operation failed" 假象
// - 抽到一处后,FE 永远传具体 model,BE 用同一个 default,AAD 永远一致

import type { AIProvider } from "./ai-keys";

export interface AIProviderConfig {
  /** 缺省模型 — FE 拼 AAD / 选 provider 时都引用这个 */
  defaultModel: string;
  /** 可选模型列表 — 高级 dialog 下拉用 */
  modelOptions: Array<{ id: string; label: string }>;
  /** LLM chat completions 端点(只 BE 用) */
  endpoint: string;
}

export const AI_PROVIDER_CONFIG: Record<AIProvider, AIProviderConfig> = {
  minimax: {
    defaultModel: "MiniMax-Text-01",
    modelOptions: [
      { id: "MiniMax-Text-01", label: "MiniMax-Text-01(推荐)" },
      { id: "abab6.5s-chat", label: "abab6.5s-chat" },
      { id: "abab6.5g-chat", label: "abab6.5g-chat" },
    ],
    endpoint: "https://api.minimaxi.com/v1/text/chatcompletion_v2",
  },
  deepseek: {
    defaultModel: "deepseek-chat",
    modelOptions: [
      { id: "deepseek-chat", label: "deepseek-chat(推荐,便宜)" },
      { id: "deepseek-coder", label: "deepseek-coder(代码更强)" },
      { id: "deepseek-reasoner", label: "deepseek-reasoner(推理强)" },
    ],
    endpoint: "https://api.deepseek.com/v1/chat/completions",
  },
};

/** 拿到一个具体的 model — user 传了且在列表里就用,否则用 default */
export function resolveModel(provider: AIProvider, model?: string): string {
  const cfg = AI_PROVIDER_CONFIG[provider];
  if (model && cfg.modelOptions.some((m) => m.id === model)) {
    return model;
  }
  return cfg.defaultModel;
}
