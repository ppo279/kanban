// Custom Next.js server: 同时启动 Next.js + Socket.IO
import { createServer } from "node:http";
import os from "node:os";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { setIO } from "./src/lib/socket";
import { runMigrations } from "./src/lib/db/setup";
import { seedUsers, ensureDemoTasks } from "./src/lib/db/seed";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

/** 探测本机第一个非 internal 的 IPv4 地址 */
function getLanIp(): string | null {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const i of list) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}

async function bootstrap() {
  // 1) 跑建表（启动时自动 migration）
  await runMigrations();

  // 2) seed 3 个预置账号 + 演示任务
  await seedUsers();
  await ensureDemoTasks();

  // 3) 启动 Next.js
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  // 4) HTTP server
  const httpServer = createServer((req, res) => handle(req, res));

  // 5) Socket.IO
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*", credentials: true },
    serveClient: false,
  });

  // Track users per document room
  const docRooms = new Map<string, Map<string, { userId: string; userName: string }>>();

  /** 找到 socket 所在的第一个文档房间名 */
  function findDocRoom(socket: any): string | null {
    for (const [room, users] of docRooms) {
      if (users.has(socket.id)) return room;
    }
    return null;
  }

  io.on("connection", (socket) => {
    socket.join("board");
    console.log(`[socket] client connected: ${socket.id}, joined 'board'`);

    // ── Document collaboration events ──
    socket.on("doc:join", (data: { docId: string; userId: string; userName: string }) => {
      const room = `doc:${data.docId}`;
      socket.join(room);
      if (!docRooms.has(room)) docRooms.set(room, new Map());
      docRooms.get(room)!.set(socket.id, { userId: data.userId, userName: data.userName });
      // Broadcast user list to all in the room (including sender)
      const users = Array.from(docRooms.get(room)!.values());
      io.to(room).emit("doc:users", users);
      console.log(`[socket] ${data.userName} joined doc:${data.docId}`);

      // 通知已有用户向新用户发送全量状态
      socket.to(room).emit("doc:request-full-state", { docId: data.docId, requestSocketId: socket.id });
    });

    socket.on("doc:leave", (data: { docId: string; userId: string }) => {
      const room = `doc:${data.docId}`;
      const roomUsers = docRooms.get(room);
      if (roomUsers) {
        roomUsers.delete(socket.id);
        if (roomUsers.size === 0) {
          docRooms.delete(room);
        } else {
          const users = Array.from(roomUsers.values());
          io.to(room).emit("doc:users", users);
        }
      }
      socket.leave(room);
      console.log(`[socket] ${data.userId} left doc:${data.docId}`);
    });

    // 收到全量状态请求，向请求者发送当前 Y.Doc 全量
    socket.on("doc:request-full-state", (data: { docId: string }) => {
      // 当前用户的 Y.Doc 状态已通过同步更新，这里由 socket.io relay 给请求者
      // 实际处理在客户端: 收到 doc:request-full-state 后发送 doc:sync-full-state
      console.log(`[socket] full state requested for doc:${data.docId} by peer`);
    });

    // Y.js 全量同步（二进制）- 只发给目标 socket
    socket.on("doc:sync-full-state", (data: { targetSocketId: string; state: ArrayBuffer }) => {
      io.to(data.targetSocketId).emit("doc:sync-full-state", data.state);
      console.log(`[socket] sending full state to ${data.targetSocketId}`);
    });

    // Y.js 增量同步（二进制）- 广播给其他人
    socket.on("doc:sync-update", (data: ArrayBuffer) => {
      const room = findDocRoom(socket);
      if (room) socket.to(room).emit("doc:sync-update", data);
    });

    // Y.js Awareness 同步（二进制）
    socket.on("doc:awareness", (data: ArrayBuffer) => {
      const room = findDocRoom(socket);
      if (room) socket.to(room).emit("doc:awareness", data);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[socket] client disconnected: ${socket.id} (${reason})`);
      // Clean up all doc rooms this socket was in
      for (const [room, users] of docRooms.entries()) {
        if (users.has(socket.id)) {
          users.delete(socket.id);
          if (users.size === 0) {
            docRooms.delete(room);
          } else {
            io.to(room).emit("doc:users", Array.from(users.values()));
          }
        }
      }
    });
  });

  setIO(io);

  httpServer.listen(port, hostname, () => {
    const lanIp = hostname === "0.0.0.0" ? getLanIp() : null;
    const localLabel = hostname === "0.0.0.0" ? "localhost" : hostname;
    console.log(`\n  ▲ Kanban ready`);
    console.log(`  - Local:   http://${localLabel}:${port}`);
    if (lanIp) {
      console.log(`  - Network: http://${lanIp}:${port}  (队友用这个 IP 连进来)`);
    } else {
      console.log(`  - Network: <未检测到 LAN IP，配 HOST 环境变量手动指定>`);
    }
    console.log("");
  });
}

bootstrap().catch((err) => {
  console.error("[server] fatal:", err);
  process.exit(1);
});
