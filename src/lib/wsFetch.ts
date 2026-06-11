// wsFetch — workspace-aware fetch helper
//
// 替代所有手写的 fetch,自动处理:
//   1. 从 store 拿 currentWorkspaceId(若没,直接 return null 让调用方早退)
//   2. GET: 自动给 URL 加 ?workspaceId=xxx(防止漏传被 400)
//   3. POST/PATCH/DELETE body: 若是 FormData/JSON,自动 merge workspaceId 字段
//   4. credentials: include(登录态 cookie)
//
// 用法:
//   const t = await wsFetch("/api/tasks?status=todo")           // 自动拼 ?workspaceId
//   await wsFetch("/api/tasks", { method: "POST", body: {...} }) // 自动 merge workspaceId
//
// 设计权衡:
//   - 不在 helper 里 throw,让调用方看返回的 ok/err 自己处理
//   - 不在 helper 里维护 store(单一职责原则),调用方自己读 store
//   - 跨 workspace 越权不在这里防 — 那是后端的责任

import { useBoardStore } from "@/store/board";

/** 内部:从 store 拿当前 ws id(快照,不在 hook 里跑) */
function getCurrentWsId(): string | null {
  return useBoardStore.getState().currentWorkspaceId;
}

type HttpInit = Omit<RequestInit, "body" | "credentials"> & {
  body?: unknown;
  /** 显式跳过 workspaceId(给 switch / 列表 ws 本身用) */
  skipWorkspace?: boolean;
  /** 显式指定一个 wsId(覆盖当前 — 高级用法,默认别用) */
  workspaceIdOverride?: string;
};

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x) && !(x instanceof FormData) && !(x instanceof Blob);
}

/**
 * workspace-aware fetch。返回标准 Response。
 * 调用方用 r.ok / r.json() 处理。
 */
export async function wsFetch(url: string, init: HttpInit = {}): Promise<Response> {
  const { body, skipWorkspace, workspaceIdOverride, headers, ...rest } = init;

  // 1) 决定 wsId
  const wsId = workspaceIdOverride ?? (skipWorkspace ? null : getCurrentWsId());

  // 2) 没 ws 且没 skip → 直接拒绝,不让请求到后端
  //    (这样调用方能区分"没切 ws"和"后端 400")
  if (!wsId && !skipWorkspace) {
    throw new Error("wsFetch: no current workspace — call switchWorkspace first");
  }

  // 3) GET: 拼 ?workspaceId
  let finalUrl = url;
  if (wsId && !skipWorkspace) {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://x");
    if (!u.searchParams.has("workspaceId")) {
      u.searchParams.set("workspaceId", wsId);
    }
    finalUrl = u.pathname + u.search;
  }

  // 4) POST/PATCH/DELETE body: merge workspaceId(如果还没)
  let finalBody: BodyInit | null | undefined = body as BodyInit | null | undefined;
  if (wsId && !skipWorkspace && body !== undefined && body !== null && isPlainObject(body)) {
    finalBody = JSON.stringify({
      ...(body as Record<string, unknown>),
      workspaceId: (body as Record<string, unknown>).workspaceId ?? wsId,
    });
  } else if (typeof body === "string") {
    finalBody = body as string;
  } else if (body == null) {
    finalBody = undefined;
  }

  return fetch(finalUrl, {
    ...rest,
    credentials: "include",
    headers: {
      ...(body !== undefined && body !== null && !(body instanceof FormData) && !skipWorkspace
        ? { "content-type": "application/json" }
        : {}),
      ...(headers as Record<string, string> | undefined),
    },
    body: finalBody as BodyInit | null,
  });
}

/** 便利:拿当前 ws id(组件用) */
export function useCurrentWorkspaceId(): string | null {
  return useBoardStore((s) => s.currentWorkspaceId);
}

/** 便利:拿 workspaces 列表 + hydrate 状态 */
export function useWorkspaces() {
  return useBoardStore((s) => ({
    workspaces: s.workspaces,
    currentId: s.currentWorkspaceId,
    hydrated: s.workspacesHydrated,
  }));
}
