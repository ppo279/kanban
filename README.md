# 团队看板

3 人小队（前端 / 后端 / 测试）实时协作的轻量看板工具。

> 不是参赛成果物，是辅助团队干活的工具。

## 特性

- ✅ 4 列看板：Todo / Doing / Review / Done
- ✅ 任务卡：标题、描述、三档优先级（低/中/高）、负责人
- ✅ 拖拽排序（@dnd-kit）
- ✅ 实时同步（Socket.IO，< 1s）
- ✅ 登录 + Cookie session（3 预置账号）
- ✅ 服务端权威，无冲突
- ✅ 一键 LAN 部署，3 人同操

## 技术栈

- **Next.js 15** (App Router) + TypeScript
- **Drizzle ORM** + **SQLite** (better-sqlite3)
- **Socket.IO** 实时广播
- **Tailwind CSS** + **shadcn 风格** UI
- **@dnd-kit/core** 拖拽
- **Zustand** 客户端 store

## 快速开始

```bash
pnpm install
pnpm dev
```

打开 http://localhost:3000

## 默认账号

| 用户 ID | 姓名 | 角色 |
|---|---|---|
| `u_frontend` | 前端工程师 | frontend |
| `u_backend` | 后端工程师 | backend |
| `u_testing` | 测试工程师 | testing |

密码：`kanban123`（在 `.env.local` 的 `DEFAULT_PASSWORD` 改）

## 局域网部署

3 人同 WiFi 协作的步骤见 [docs/LAN_DEPLOY.md](docs/LAN_DEPLOY.md)。

## 目录结构

```
server.ts                # 自定义 Next.js + Socket.IO 服务
src/
  app/                   # Next.js App Router（页面 + API 路由）
  components/            # UI 组件
  hooks/                 # React hooks（Socket）
  lib/                   # 业务库（DB、auth、socket、分数索引）
  store/                 # Zustand store
  types/                 # 共享类型
data/                    # SQLite 数据库文件（gitignored）
docs/                    # 文档 + 截图
```

## API

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/users` | 全部用户 |
| GET | `/api/tasks` | 任务列表 |
| POST | `/api/tasks` | 新建任务 |
| PATCH | `/api/tasks/:id` | 编辑任务 |
| PATCH | `/api/tasks/:id/move` | 移动到另一列/位置 |
| DELETE | `/api/tasks/:id` | 删除任务 |

## Socket.IO 事件

服务端广播到 `board` 房间：

- `task:created` — 新建
- `task:updated` — 编辑
- `task:moved` — 移动
- `task:deleted` — 删除
