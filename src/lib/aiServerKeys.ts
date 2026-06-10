// BE: 进程级 AI keypair 单例 - 抗 Next.js dev 模式 HMR
//
// 痛点:
// - Next.js dev 模式下,文件改动会触发 HMR(热模块替换)
// - HMR 会让 route 模块重新求值,模块级 `let current` 这种变量会重置
// - 单例被重置 → 生成新 keypair → kid 变了 → 客户端缓存的旧 kid 失效
// - 表现:FE 拿 kid K1,BE 已经是 K2,401 "公钥已过期"
//
// 修法:把单例挂到 globalThis 上(Next.js 圈抗 HMR 标准做法)。
// globalThis 是真正的进程级全局,HMR 不会清掉它。
// 进程重启(全新 Node 进程)globalThis 是新的,行为符合"重启 = 换 keypair"。
//
// 设计决策:
// - 用 Symbol.for() 做 key,避免和别的库冲突
// - 启动时(或首次调用时)惰性生成,内存里只 1 把 keypair
// - 失败兜底:生成失败时下一次调用会重试
// - 私钥不持久化,重启即丢,主动作废旧 envelope(降泄露窗口)

import { generateAIKeyPair, type AIKeyPair } from "./aiEnvelope";

const GLOBAL_KEY = Symbol.for("kanban.ai.keypair.v1");

interface GlobalWithKey {
  [GLOBAL_KEY]?: AIKeyPair;
}

function getGlobal(): GlobalWithKey {
  return globalThis as unknown as GlobalWithKey;
}

let inflight: Promise<AIKeyPair> | null = null;

/** 拿到当前的 keypair(惰性初始化,挂到 globalThis 抗 HMR) */
export async function getAIKeyPair(): Promise<AIKeyPair> {
  const g = getGlobal();
  if (g[GLOBAL_KEY]) return g[GLOBAL_KEY];
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const kp = await generateAIKeyPair();
      g[GLOBAL_KEY] = kp;
      // eslint-disable-next-line no-console
      console.log(
        `[ai-keys] generated RSA-OAEP-2048 keypair, kid=${kp.kid} ` +
        `(stored on globalThis, HMR-resistant)`
      );
      return kp;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** 拿到公钥(供 /api/ai/pubkey 路由返回) */
export async function getAIPublicKey(): Promise<{ kid: string; publicKeyB64: string }> {
  const kp = await getAIKeyPair();
  return { kid: kp.kid, publicKeyB64: kp.publicKeyB64 };
}

/** 拿到私钥(供 /api/ai/* 路由解密用) */
export async function getAIPrivateKey(kid: string): Promise<CryptoKey> {
  const kp = await getAIKeyPair();
  if (kid !== kp.kid) {
    throw new Error(
      `kid mismatch: got ${kid}, expected ${kp.kid} (server restarted, FE needs to refetch pubkey)`
    );
  }
  return kp.privateKey;
}

/** 测试用 - 强制重新生成(将来加 unit test 的时候用) */
export function _resetForTest() {
  const g = getGlobal();
  delete g[GLOBAL_KEY];
  inflight = null;
}
