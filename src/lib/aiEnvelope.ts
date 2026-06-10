// AI API key envelope encryption — 浏览器/Node 双跑(都用 Web Crypto)
//
// 目的:把"前端明文 apiKey 走 body"改成"前端只发密文,后端解密使用"。
// 加密过程(envelope encryption):
//
//   1. FE 每次请求临时生成一个 32 字节 DEK (Data Encryption Key)
//   2. 用 DEK + 随机 12 字节 IV, AES-256-GCM 加密 apiKey
//   3. 用 BE 公钥 RSA-OAEP-2048 加密 DEK
//   4. 把 {iv, ct, dek, kid, v, aad_hash} 一起发给 BE
//
// 安全性:
// - AAD (Additional Auth Data) = {provider, model, mode, title, prompt}
//   绑定到这次请求,防中间人把 A provider 的 envelope 塞给 B provider
// - 每次请求 IV + DEK 都重新生成,不会重用
// - 私钥只存在 BE 内存,重启即丢,持久化的旧 envelope 自动作废
// - 公钥本身可以公开(在 JS bundle 里也行),但 BE 用 kid 校验防中间替换
//
// ⚠ 这只是传输加密(防 nginx/反代/链路日志拿到 apiKey 明文)
//   真正端到端(E2EE)需要用户的公钥,本场景没必要(用户自己存自己用)

/** 信封版本 — 未来升级格式用 */
export const ENVELOPE_VERSION = 1 as const;

/** 信封结构(浏览器→后端传输) */
export interface AIKeyEnvelope {
  v: typeof ENVELOPE_VERSION;
  /** Key ID,后端用来找对应的私钥(防中间人替换公钥) */
  kid: string;
  /** base64,12 字节 IV */
  iv: string;
  /** base64,AES-GCM 密文(末尾 16 字节是 GCM auth tag) */
  ct: string;
  /** base64,RSA-OAEP 加密后的 DEK(256 字节) */
  dek: string;
}

/** AAD 输入 — FE 算 hash 发给 BE,BE 用相同字段重算并对比 */
export interface AADInput {
  provider: string;
  model?: string;
  mode: string;
  title: string;
  prompt?: string;
}

// ─── Base64 helpers(both env) ────────────────────────────────────────

const b64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToB64(bytes: Uint8Array): string {
  // 用原生 btoa(浏览器) / Buffer.toString(在 Node 也行,但统一用 btoa 走 globalThis)
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // 浏览器有 btoa;Node 16+ 也有 globalThis.btoa
  return globalThis.btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = globalThis.atob(b64);
  // 显式 new ArrayBuffer() 让 TS 知道底层是 ArrayBuffer(不是 SharedArrayBuffer)
  // 满足 TS 5.6+ 收紧后的 BufferSource 类型约束
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 同 b64ToBytes,但用于随机生成的 IV,保证类型是 ArrayBuffer-backed */
function newRandomBytes(n: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(n);
  const out = new Uint8Array(buf);
  globalThis.crypto.getRandomValues(out);
  return out;
}

// ─── Subtle crypto accessor(Node 19+ 才有 globalThis.crypto.subtle) ──

function getSubtle(): SubtleCrypto {
  // 在浏览器和现代 Node(>=19)里都有
  const c = (globalThis as any).crypto;
  if (!c?.subtle) {
    throw new Error("Web Crypto 不可用(需要 Node 19+ 或现代浏览器)");
  }
  return c.subtle as SubtleCrypto;
}

// ─── Public key handling ─────────────────────────────────────────────

/** 把 CryptoKey 导出成 base64 SPKI (SubjectPublicKeyInfo) */
export async function exportPublicKeyB64(pubKey: CryptoKey): Promise<string> {
  const spki = await getSubtle().exportKey("spki", pubKey);
  return bytesToB64(new Uint8Array(spki));
}

/** 从 base64 SPKI 导入公钥(浏览器用) */
export async function importPublicKeyB64(b64: string): Promise<CryptoKey> {
  return getSubtle().importKey(
    "spki",
    b64ToBytes(b64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
}

// ─── Keypair generation(server side) ────────────────────────────────

export interface AIKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  /** 短 id,用来在多 key 时切换(目前只 1 把 key) */
  kid: string;
  /** 公钥 SPKI base64,可以直接发回 FE */
  publicKeyB64: string;
}

/** 生成一对 RSA-OAEP-2048 密钥,导出公钥为 base64 */
export async function generateAIKeyPair(): Promise<AIKeyPair> {
  const subtle = getSubtle();
  const pair = await subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
  // 生成 8 字节 kid(短 hash,够用,主要是将来支持多 key 时切换)
  const kidBytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(kidBytes);
  const kid = bytesToB64(kidBytes).replace(/[+/=]/g, "").slice(0, 12);
  const publicKeyB64 = await exportPublicKeyB64(pair.publicKey);
  return {
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
    kid,
    publicKeyB64,
  };
}

// ─── AAD 序列化(FE/BE 都要走它,保证一致) ──────────────────────────

/** 把 AAD 字段序列化成一个稳定字符串(字段顺序固定) */
export function serializeAAD(aad: AADInput): string {
  // 用 JSON 序列化并做字段排序,避免 key 顺序不一致导致 AAD 不匹配
  const sorted: Record<string, string> = {
    provider: aad.provider,
    model: aad.model ?? "",
    mode: aad.mode,
    title: aad.title,
    prompt: aad.prompt ?? "",
  };
  return JSON.stringify(sorted);
}

// ─── Client side: wrap apiKey into envelope ─────────────────────────

/** 把明文 apiKey 包装成 envelope(浏览器用) */
export async function wrapApiKey(
  plainKey: string,
  publicKey: CryptoKey,
  aad: AADInput
): Promise<AIKeyEnvelope> {
  const subtle = getSubtle();
  // 1) 随机 DEK
  const dek = await subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  // 2) 随机 IV(用 ArrayBuffer-backed 视图,满足 TS 5.6+ 的 BufferSource 约束)
  const iv = newRandomBytes(12);
  // 3) AES-GCM 加密 apiKey,AAD = serializeAAD(...)
  const aadBytes = new TextEncoder().encode(serializeAAD(aad));
  const ctBuf = await subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aadBytes },
    dek,
    new TextEncoder().encode(plainKey)
  );
  // 4) RSA-OAEP 加密 DEK 的 raw bytes
  const dekRaw = await subtle.exportKey("raw", dek);
  const dekWrapped = await subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    dekRaw
  );
  // 5) 组装 envelope
  return {
    v: ENVELOPE_VERSION,
    kid: "", // 由调用方在拿到 kid 后填(走 pubkey 缓存时一并带回来)
    iv: bytesToB64(iv),
    ct: bytesToB64(new Uint8Array(ctBuf)),
    dek: bytesToB64(new Uint8Array(dekWrapped)),
  };
}

// ─── Server side: unwrap envelope to apiKey ────────────────────────

/** 把 envelope 解开成明文 apiKey(后端用,失败抛错) */
export async function unwrapApiKey(
  env: AIKeyEnvelope,
  privateKey: CryptoKey,
  aad: AADInput
): Promise<string> {
  if (env.v !== ENVELOPE_VERSION) {
    throw new Error(`envelope 版本不匹配:got ${env.v}, expected ${ENVELOPE_VERSION}`);
  }
  const subtle = getSubtle();
  // 1) RSA-OAEP 解出 DEK
  const dekRaw = await subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    b64ToBytes(env.dek)
  );
  // 2) 把 raw DEK 导入成 AES-GCM key
  const dek = await subtle.importKey(
    "raw",
    dekRaw,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  // 3) AES-GCM 解出 apiKey(用相同 AAD)
  const aadBytes = new TextEncoder().encode(serializeAAD(aad));
  const plainBuf = await subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(env.iv), additionalData: aadBytes },
    dek,
    b64ToBytes(env.ct)
  );
  return new TextDecoder().decode(plainBuf);
}
