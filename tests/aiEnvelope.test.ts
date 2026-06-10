// AI 信封加密 round-trip 测试
//
// 关键不变量:
// 1. wrap → unwrap 能拿回原 apiKey
// 2. AAD 不匹配时,unwrap 必须失败(GCM auth tag 会兜底)
// 3. iv/dek 每次都新生成(不能复用)
// 4. envelope 篡改后,unwrap 必须失败

import { describe, it, expect } from "vitest";
import {
  generateAIKeyPair,
  wrapApiKey,
  unwrapApiKey,
  serializeAAD,
  ENVELOPE_VERSION,
  type AADInput,
} from "@/lib/aiEnvelope";

const sampleAAD: AADInput = {
  provider: "minimax",
  model: "MiniMax-Text-01",
  mode: "spec",
  title: "用户列表接口",
  prompt: "支持分页",
};

describe("aiEnvelope round-trip", () => {
  it("wrap → unwrap 拿回原 apiKey", async () => {
    const kp = await generateAIKeyPair();
    const apiKey = "sk-cp-test-" + "x".repeat(80);
    const env = await wrapApiKey(apiKey, kp.publicKey, sampleAAD);
    env.kid = kp.kid;
    const back = await unwrapApiKey(env, kp.privateKey, sampleAAD);
    expect(back).toBe(apiKey);
  });

  it("AAD 不匹配 → 解密失败", async () => {
    const kp = await generateAIKeyPair();
    const env = await wrapApiKey("sk-secret", kp.publicKey, sampleAAD);
    env.kid = kp.kid;
    // 改 prompt 后 AAD 不再一致 → GCM auth tag 校验会失败
    const tampered: AADInput = { ...sampleAAD, prompt: "不一样的 prompt" };
    await expect(unwrapApiKey(env, kp.privateKey, tampered)).rejects.toThrow();
  });

  it("ciphertext 篡改 → 解密失败", async () => {
    const kp = await generateAIKeyPair();
    const env = await wrapApiKey("sk-secret", kp.publicKey, sampleAAD);
    env.kid = kp.kid;
    // 改一个 ct 字符
    const buf = Buffer.from(env.ct, "base64");
    buf[0] = buf[0] ^ 0xff;
    env.ct = buf.toString("base64");
    await expect(unwrapApiKey(env, kp.privateKey, sampleAAD)).rejects.toThrow();
  });

  it("每次 wrap 的 iv/dek 都不同(防复用)", async () => {
    const kp = await generateAIKeyPair();
    const e1 = await wrapApiKey("sk-same", kp.publicKey, sampleAAD);
    const e2 = await wrapApiKey("sk-same", kp.publicKey, sampleAAD);
    expect(e1.iv).not.toBe(e2.iv);
    expect(e1.dek).not.toBe(e2.dek);
    expect(e1.ct).not.toBe(e2.ct);
  });

  it("envelope v 必须匹配", async () => {
    const kp = await generateAIKeyPair();
    const env = await wrapApiKey("sk", kp.publicKey, sampleAAD);
    env.kid = kp.kid;
    env.v = (ENVELOPE_VERSION + 1) as any;
    await expect(unwrapApiKey(env, kp.privateKey, sampleAAD)).rejects.toThrow(/版本/);
  });

  it("serializeAAD 字段顺序不影响 AAD 值", () => {
    // 同样字段,不同顺序的 key,JSON 序列化后必须完全一致
    const a = serializeAAD({ provider: "p", model: "m", mode: "x", title: "t", prompt: "" });
    const b = serializeAAD({ prompt: "", title: "t", mode: "x", model: "m", provider: "p" });
    expect(a).toBe(b);
  });
});
