# Morrow Fields 部署指南

Morrow Fields 使用独立的 FastAPI WebSocket 服务，游戏入口为 `/arena/`，健康检查为 `/health`。房间和战斗状态保存在服务进程内存中，服务重启后房间会清空。

## 本地运行

```powershell
.\start-arena-local.ps1 -Build
```

打开 `http://127.0.0.1:8082/arena/`。停止服务：

```powershell
.\stop-arena-local.ps1
```

## 局域网运行

管理员 PowerShell 中先创建防火墙规则：

```powershell
.\open-arena-lan-firewall.ps1 -Port 8080
```

然后启动服务：

```powershell
.\start-arena.ps1 -Port 8080
```

把脚本显示的局域网地址和房间码发给其他玩家即可。

## 临时公网联机

安装 `cloudflared` 后运行：

```powershell
.\start-arena-public.ps1 -Build
```

脚本会启动游戏服务和 Cloudflare Quick Tunnel，并输出 HTTPS 游戏地址。停止时运行：

```powershell
.\stop-arena-public.ps1
```

临时地址在进程停止后失效，拿到地址的玩家都可以访问。

## Docker / Render

项目提供 `Dockerfile.arena` 和 `render.yaml`。容器直接复制 `public/arena` 静态资源，使用 `backend.arena_public:app` 启动 WebSocket 服务，并通过 `/health` 提供健康检查。

本地构建检查：

```powershell
npm run build
python tools/verify_arena_deploy_config.py
```

正式部署时，需要在目标平台配置支持 WebSocket 的服务，并使用平台提供的 `PORT` 环境变量。
