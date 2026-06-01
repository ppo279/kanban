import * as React from "react";
import { cn } from "@/lib/util";

interface AvatarProps {
  name: string;
  color?: string;
  size?: "sm" | "md";
}

const SIZES = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
};

export function Avatar({ name, color = "bg-slate-500", size = "md" }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0",
        SIZES[size],
        color
      )}
      title={name}
    >
      {initial}
    </div>
  );
}
