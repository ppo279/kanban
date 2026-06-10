// 任务父子关系 + 状态 rollup
//
// 规则(最活跃优先):
// - 所有子任务 done → 父任务 done
// - 任一子任务 review → 父任务 review(review 比 doing 更接近完成)
// - 任一子任务 doing → 父任务 doing
// - 否则(全部 todo) → 父任务 todo
//
// 调用入口:recomputeAncestors(taskId) — 子任务状态变了,递归往上重算
// 软限 2 层(UI 限制),但 DB 不强约束;递归用 visited 集合防死循环

import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "./db";
import type { Status } from "@/types";

/** 给定一个父任务的所有子任务,算出 rollup 状态
 * 规则(最活跃优先):
 *   - 全 done → done
 *   - 全 todo → todo(没动过)
 *   - 任一 review → review(review 比 doing 更接近完成)
 *   - 其他混合(任一非 todo/非 done)→ doing
 */
export function rollupStatus(children: Array<{ status: Status }>): Status {
  if (children.length === 0) return "todo";
  if (children.every((c) => c.status === "done")) return "done";
  if (children.every((c) => c.status === "todo")) return "todo";
  if (children.some((c) => c.status === "review")) return "review";
  return "doing";
}

/**
 * 拿到子任务列表(按 position 排序)
 * 注意:有 parentId 字段但 parent 自己是 null 的也归为顶级任务(防脏数据)
 */
export async function getChildrenOf(parentId: string) {
  return db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.parentId, parentId))
    .orderBy(schema.tasks.position);
}

/**
 * 子任务状态变化时,递归往上重算父任务状态
 * - 只在新状态 ≠ 旧状态时写库
 * - visited 集合防环(数据脏的话也死不了)
 * - 一直爬到顶级(没 parentId)为止
 */
export async function recomputeAncestors(taskId: string): Promise<void> {
  const visited = new Set<string>();
  let currentId: string | null = taskId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const [task] = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, currentId))
      .limit(1);
    if (!task) return;
    const parentId: string | null = task.parentId ?? null;
    if (!parentId) return; // 已经是顶级
    const siblings = await getChildrenOf(parentId);
    const newStatus = rollupStatus(siblings);
    const [parent] = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, parentId))
      .limit(1);
    if (parent && parent.status !== newStatus) {
      await db
        .update(schema.tasks)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(schema.tasks.id, parentId));
    }
    currentId = parentId; // 继续往上
  }
}

/** 取一个任务的根任务 id(顶级) — 给 spec import 之类的批量操作去重用 */
export async function getRootId(taskId: string): Promise<string> {
  let currentId: string = taskId;
  const visited = new Set<string>();
  while (!visited.has(currentId)) {
    visited.add(currentId);
    const [task] = await db
      .select({ parentId: schema.tasks.parentId })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, currentId))
      .limit(1);
    if (!task || !task.parentId) return currentId;
    currentId = task.parentId;
  }
  return currentId;
}
