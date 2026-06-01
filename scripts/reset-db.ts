// pnpm db:reset
// 作用：删掉 SQLite 文件 + 重新建表 + 重新 seed（3 账号 + 8 演示任务）
// 用法：先停 pnpm dev，再跑这个

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const DB_PATH = process.env.DATABASE_URL ?? "./data/kanban.db";
const ABS = path.resolve(DB_PATH);

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y|yes$/i.test(answer.trim()));
    });
  });
}

/** 真正尝试打开 + 写一行测试，能成功说明文件可写不可锁 */
function tryProbe(): { ok: true } | { ok: false; reason: string } {
  if (!fs.existsSync(ABS)) return { ok: true };
  try {
    const fd = fs.openSync(ABS, "r+");
    try {
      fs.ftruncateSync(fd, 0); // 截断到 0（最严格的"能不能动这个文件"测试）
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // 恢复文件大小（不要把内容删了，只是探测）
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

async function main() {
  console.log(`[reset] target: ${ABS}`);

  if (!fs.existsSync(ABS)) {
    console.log("[reset] DB 文件不存在，无需清理。直接启动会重新建表。");
    return;
  }

  // 1. 探测锁
  const probe = tryProbe();
  if (!probe.ok) {
    console.error("[reset] ✗ DB 文件被占用（dev server 还在跑？）");
    console.error(`       ${probe.reason}`);
    console.error("       请先 Ctrl+C 停掉 pnpm dev 再重试。");
    process.exit(1);
  }

  // 2. 二次确认
  const ok = await confirm(
    "⚠️  将删除所有任务、用户、会话数据，确认？(y/N) "
  );
  if (!ok) {
    console.log("[reset] 已取消");
    return;
  }

  // 3. 删文件。任何一步失败立即退出。
  for (const ext of ["", "-shm", "-wal", "-journal"]) {
    const f = ABS + ext;
    if (!fs.existsSync(f)) continue;
    try {
      fs.unlinkSync(f);
      console.log(`[reset] 删 ${path.basename(f)} ✓`);
    } catch (e) {
      console.error(`[reset] ✗ 删 ${path.basename(f)} 失败:`, (e as Error).message);
      console.error("[reset] 放弃，未重建。中途状态可能不一致。");
      process.exit(1);
    }
  }

  // 4. 全部删干净后才重建：只重建表 + 3 预置账号，**不** seed 演示任务
  //    （演示任务容易让人误以为"reset 没生效"，默认跳过）
  const { runMigrations } = await import("../src/lib/db/setup");
  const { seedUsers } = await import("../src/lib/db/seed");
  await runMigrations();
  const { password, created } = await seedUsers();
  console.log(`[reset] ✓ 完成`);
  console.log(`       - 3 预置账号已重建（密码: ${password}）`);
  if (created > 0) console.log(`       - 新增 ${created} 个用户`);
  console.log(`       - 演示任务已清空（干净开始）`);
  console.log(`[reset] 想要演示任务？跑 pnpm db:seed:demos`);
  console.log(`[reset] 现在可以重新 pnpm dev 登录了`);
}

main().catch((err) => {
  console.error("[reset] fatal:", err);
  process.exit(1);
});
