# Morrow Fields 稳定部署指南

竞技场使用独立的 `arena_public` ASGI 服务，入口为 `/arena/`，健康检查为 `/health`。`Dockerfile.arena` 会先构建前端，再只复制竞技场后端和生产静态资源；容器端口读取平台提供的 `PORT`，同时包含 Docker `HEALTHCHECK`。

在 Render 中创建 Docker Web Service，仓库选择当前项目，Dockerfile 使用 `Dockerfile.arena`，健康检查路径填写 `/health`。不需要额外数据库或环境变量。部署成功后，用分配的 HTTPS 地址打开 `/arena/`，并在两个浏览器或设备中使用同一房间码验证移动、射击、断线重连和房间清理。

平台重启会清空进程内房间，这是当前实现的边界。稳定部署验收需要确认：

- `/health` 返回 `{"status":"ok","service":"morrow-fields"}`。
- HTTPS 页面能加载 `game.js` 当前版本，WebSocket 自动使用 WSS。
- 两个以上客户端能同步移动、武器、伤害和断线清理。
- v62 同机 10 客户端移动/射击 10 分钟样本共 539,960 个状态间隔，P95 为 `12.96ms`、最大 `21.84ms`、0/539,960 超过 25ms；RTT P95 `3.44ms`、最大 `7.56ms`。另有经 LAN 接口的 10 秒样本。两个结果都来自服务器同一主机，不能代替远端端到端延迟。
- 重启后旧房间失效，新房间可以重新创建。

Windows 局域网验收还需检查防火墙应用路径。当前 8080 入站规则已启用并限制 `LocalSubnet`，但应用仍指向已移走的项目 `.venv\Scripts\python.exe`；当前服务使用用户目录中的外部 Python。用管理员 PowerShell 运行 `./open-arena-lan-firewall.ps1 -Port 8080 -BindAddress 10.0.0.100`，脚本会比对并重建过期规则。另一台设备实际连入仍待验收。

2026-10-02 `tools/verify_arena_deploy_config.py` 静态预检全部通过，健康状态为 200；当前主机没有 Docker CLI，因此尚无真实容器构建、Render 发布或 HTTPS/WSS 双端验收。临时 Quick Tunnel 仍适合演示，不能替代稳定部署。
