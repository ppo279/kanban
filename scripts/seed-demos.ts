// pnpm db:seed:demos
// 单独插入 8 个演示任务（在已 seed 过 3 账号的前提下）
// 注意：会自动先清空现有 tasks，再插入演示数据
import { ensureDemoTasks, seedUsers } from "../src/lib/db/seed";
import { db, schema } from "../src/lib/db";

async function main() {
  // 确保 3 账号存在
  await seedUsers();
  // 先清空旧 tasks
  await db.delete(schema.tasks);
  // 再插 8 个演示
  await ensureDemoTasks();
  // ensureDemoTasks 内部有"已有就不插"的判断，所以删了再调一次
  // 但它的判断是 `existing.length > 0`，删完后 existing 是 0，会再插
  // 实际跑 2 次也只插 1 次（第二次 existing 是 8 就不再插）。所以这里 OK。
  console.log("[seed:demos] ✓ 演示任务已就绪");
}

main().catch((err) => {
  console.error("[seed:demos] fatal:", err);
  process.exit(1);
});
