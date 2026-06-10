import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 把 DB row 序列化为前端 Task（统一时间戳为 number,JSON 列展开） */
export function toApiTask<
  T extends {
    createdAt: Date | number;
    updatedAt: Date | number;
    tags?: string[] | string | null;
  },
>(row: T) {
  // tags 在 SQLite 是 JSON 字符串,drizzle 取出后是 string | null,前端要 string[]
  let tags: string[] = [];
  if (Array.isArray(row.tags)) {
    tags = row.tags;
  } else if (typeof row.tags === "string") {
    try {
      const parsed = JSON.parse(row.tags);
      tags = Array.isArray(parsed) ? parsed : [];
    } catch {
      tags = [];
    }
  }
  return {
    ...row,
    tags,
    createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Number(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : Number(row.updatedAt),
  };
}
