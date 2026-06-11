"use client";

// VisuallyHidden — 给屏读器/无障碍 API 看的,但视觉上隐藏
// 用法:包 DialogTitle 之类的必备 a11y 元素,避免 Radix 警告
//      <DialogTitle><VisuallyHidden>文档编辑器</VisuallyHidden></DialogTitle>
//
// 直接用 Tailwind 内置 sr-only(项目 dialog.tsx 已经在用) — 不要再加 absolute/w-px
// 那些写法会和父级 position:static 冲突
import * as React from "react";
import { cn } from "@/lib/util";

export function VisuallyHidden({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("sr-only", className)}
      {...props}
    />
  );
}
