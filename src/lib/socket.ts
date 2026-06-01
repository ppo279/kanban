// 全局 Socket.IO 实例（custom server 启动时赋值，API 路由可调用）
import type { Server as SocketIOServer } from "socket.io";

const g = globalThis as unknown as { __io__?: SocketIOServer };

export function setIO(io: SocketIOServer) {
  g.__io__ = io;
}

export function getIO(): SocketIOServer | undefined {
  return g.__io__;
}

/** 服务端权威广播：所有写操作完成后调用 */
export function emitToBoard(event: string, payload: unknown) {
  const io = getIO();
  if (io) io.to("board").emit(event, payload);
}
