// AES-GCM 加密/解密工具 — 浏览器端
// 用途:把 AI API key 加密后存 localStorage,key 派生自浏览器常量
//
// 安全模型:
// - key 派生源:navigator.userAgent + window.location.host + 固定 salt
//   这不是"真安全",但能挡住 90% 的"随手打开 devtools 看一眼"场景
// - 如果用户清浏览器缓存 / 换浏览器,要重新配 key(可接受)
// - 想更严:加 PIN(用户自己设),PBKDF2 派生 — 但 UX 会重
//
// 加密格式:[12 字节 IV][密文+16 字节 auth tag],Base64 编码

const FIXED_SALT = "kanban-doc-ai-v1";

/** 派生一个 256 位 AES key — 浏览器常量 + 域名 + 固定 salt */
async function deriveKey(): Promise<CryptoKey> {
  const raw = `${FIXED_SALT}::${navigator.userAgent}::${window.location.host}`;
  const enc = new TextEncoder().encode(raw);
  // 直接把字节流 SHA-256 哈希作为 key material(简化版 — 不走 PBKDF2)
  const hashBuf = await crypto.subtle.digest("SHA-256", enc);
  return crypto.subtle.importKey(
    "raw",
    hashBuf,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** 加密纯文本 → base64 字符串 */
export async function encrypt(plain: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plain);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc
  );
  const cipherArr = new Uint8Array(cipherBuf);
  // 拼接 IV + 密文
  const combined = new Uint8Array(iv.length + cipherArr.length);
  combined.set(iv, 0);
  combined.set(cipherArr, iv.length);
  return base64Encode(combined);
}

/** 解密 base64 字符串 → 纯文本(失败抛错) */
export async function decrypt(b64: string): Promise<string> {
  const key = await deriveKey();
  const combined = base64Decode(b64);
  if (combined.length < 13) throw new Error("密文过短");
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipher
  );
  return new TextDecoder().decode(plainBuf);
}

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 浏览器/Node 环境检测 — 防止 SSR 时崩溃 */
export function isCryptoAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined"
  );
}
