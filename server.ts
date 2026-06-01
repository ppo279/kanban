// Custom Next.js server: 同时启动 Next.js + Socket.IO
import { createServer } from "node:http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { setIO } from "./src/lib/socket";
import { runMigrations } from "./src/lib/db/setup";
import { seedUsers, ensureDemoTasks } from "./src/lib/db/seed";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

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

  io.on("connection", (socket) => {
    socket.join("board");
    console.log(`[socket] client connected: ${socket.id}, joined 'board'`);

    socket.on("disconnect", (reason) => {
      console.log(`[socket] client disconnected: ${socket.id} (${reason})`);
    });
  });

  setIO(io);

  httpServer.listen(port, hostname, () => {
    const display = hostname === "0.0.0.0" ? "localhost" : hostname;
    console.log(`\n  ▲ Kanban ready`);
    console.log(`  - Local:   http://${display}:${port}`);
    console.log(`  - Network: http://<your-LAN-IP>:${port}\n`);
  });
}

bootstrap().catch((err) => {
  console.error("[server] fatal:", err);
  process.exit(1);
});
