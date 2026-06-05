"use client";

import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { getSocketInstance } from "@/hooks/useSocket";
import type { Socket } from "socket.io-client";

const docs = new Map<string, Y.Doc>();
const awarenessMap = new Map<string, Awareness>();

const pendingUpdates = new Map<string, Uint8Array[]>();
const PENDING_FLUSH_MS = 50;

/** 获取或创建文档的 Y.Doc */
export function getYDoc(docId: string): Y.Doc {
  let doc = docs.get(docId);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(docId, doc);
  }
  return doc;
}

export function getAwareness(docId: string, userId: string, userName: string, color: string): Awareness {
  const key = `${docId}::${userId}`;
  let aw = awarenessMap.get(key);
  if (!aw) {
    const doc = getYDoc(docId);
    aw = new Awareness(doc);
    aw.setLocalStateField("user", { name: userName, color, id: userId });
    awarenessMap.set(key, aw);
  }
  return aw;
}

/** 连接 Y.Doc ↔ Socket.IO，返回 cleanup 函数。
 *  onSynced 回调：当收到全量同步后调用，用于告知编辑器跳过 DB 加载 */
export function connectCollaboration(
  docId: string,
  userId: string,
  userName: string,
  aw: Awareness,
  socket: Socket,
  onSynced?: () => void,
): () => void {
  const doc = getYDoc(docId);

  // ── 收到"有人请求全量状态"事件 → 发送当前 Y.Doc 状态给请求者 ──
  const onRequestFullState = (data: { docId: string; requestSocketId: string }) => {
    if (data.docId !== docId) return;
    const state = Y.encodeStateAsUpdate(doc);
    socket.emit("doc:sync-full-state", { targetSocketId: data.requestSocketId, state: state.buffer });
  };

  // ── 收到完整的 Y.Doc 状态 (全量同步) ──
  const onFullState = (data: ArrayBuffer) => {
    const update = new Uint8Array(data);
    Y.applyUpdate(doc, update);
    onSynced?.();
  };

  // ── 处理收到的 Y.js 增量 ──
  const onSyncUpdate = (data: ArrayBuffer) => {
    const update = new Uint8Array(data);
    Y.applyUpdate(doc, update);
  };

  // ── 处理收到的 Awareness ──
  const onAwareness = (data: ArrayBuffer) => {
    const update = new Uint8Array(data);
    // @ts-ignore - types missing from y-protocols
    Awareness.applyAwarenessUpdate(aw, update, null);
  };

  socket.on("doc:request-full-state", onRequestFullState);
  socket.on("doc:sync-full-state", onFullState);
  socket.on("doc:sync-update", onSyncUpdate);
  socket.on("doc:awareness", onAwareness);

  // ── 本地 Y.Doc 变更 → 广播 ──
  const onDocUpdate = (update: Uint8Array, origin: any) => {
    if (origin === "remote") return;
    let buf = pendingUpdates.get(docId);
    if (!buf) {
      buf = [];
      pendingUpdates.set(docId, buf);
      setTimeout(() => {
        const b = pendingUpdates.get(docId);
        if (b) {
          pendingUpdates.delete(docId);
          const merged = Y.encodeStateAsUpdate(doc);
          socket.emit("doc:sync-update", merged.buffer);
        }
      }, PENDING_FLUSH_MS);
    }
    buf.push(update);
  };

  // ── 本地 Awareness 变更 (光标移动、用户状态变化) → 广播 ──
  const onAwarenessChange = ({ added, removed, updated }: { added: number[]; removed: number[]; updated: number[] }) => {
    const changedClients = [...added, ...updated, ...removed];
    if (changedClients.length > 0) {
      // @ts-ignore
      const awarenessUpdate = Awareness.encodeAwarenessUpdate(aw, changedClients);
      socket.emit("doc:awareness", awarenessUpdate.buffer);
    }
  };

  doc.on("update", onDocUpdate);
  aw.on("change", onAwarenessChange);

  // 加入房间后请求全量状态
  socket.emit("doc:join", { docId, userId, userName });

  return () => {
    doc.off("update", onDocUpdate);
    aw.off("change", onAwarenessChange);
    socket.off("doc:request-full-state", onRequestFullState);
    socket.off("doc:sync-full-state", onFullState);
    socket.off("doc:sync-update", onSyncUpdate);
    socket.off("doc:awareness", onAwareness);

    awarenessMap.delete(`${docId}::${userId}`);
    aw.destroy();

    socket.emit("doc:leave", { docId, userId });

    // 延迟检查 doc 是否还被其他 awareness 引用
    setTimeout(() => {
      let stillUsed = false;
      for (const key of awarenessMap.keys()) {
        if (key.startsWith(`${docId}::`)) { stillUsed = true; break; }
      }
      if (!stillUsed) {
        docs.delete(docId);
        doc.destroy();
      }
    }, 1000);
  };
}
