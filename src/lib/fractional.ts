/**
 * 分数索引 (Fractional Indexing)
 *
 * 用于列内排序：每张任务卡有一个浮点 position。
 * 插入到两卡之间时，新 position = (a + b) / 2。
 * 不需要重排整列，O(1) 更新。
 *
 * 极端情况下（同位置反复插入）position 可能耗尽精度，
 * MVP 范围内不会触发；触发时再加 rebalance 任务。
 */

export function between(a: number | null, b: number | null): number {
  if (a == null && b == null) return Date.now() * 1000;
  if (a == null) return b! - 1024;
  if (b == null) return a + 1024;
  return (a + b) / 2;
}

export function newPosition(): number {
  return Date.now() * 1000;
}
