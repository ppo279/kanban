"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Board } from "@/components/board/Board";
import { useBoardStore } from "@/store/board";
import { useSocket } from "@/hooks/useSocket";

export default function HomePage() {
  const router = useRouter();
  const setMe = useBoardStore((s) => s.setMe);
  const setUsers = useBoardStore((s) => s.setUsers);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      if (!r.ok) {
        router.replace("/login");
        return;
      }
      const meData = await r.json();
      setMe(meData.user);

      const u = await fetch("/api/users", { credentials: "include" });
      if (u.ok) {
        const ud = await u.json();
        setUsers(ud.users);
      }
    })();
  }, [router, setMe, setUsers]);

  return <Board />;
}
