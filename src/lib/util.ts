import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 把 DB row 序列化为前端 Task（统一时间戳为 number） */
export function toApiTask<T extends { createdAt: Date | number; updatedAt: Date | number }>(
  row: T
) {
  return {
    ...row,
    createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Number(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : Number(row.updatedAt),
  };
}
