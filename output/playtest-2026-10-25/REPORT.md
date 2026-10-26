# 2026-10-25 自动验收记录

本轮代码目标是电脑浏览器中的朋友联机试玩。以下自动检查已完成；**4–8 位真人、异地设备、连续 30 分钟的验收仍待进行**。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 后端规则、存储与 WebSocket 集成 | 148 通过，0 失败；含连续两局重置与结算去重 | `backend.xml` |
| 浏览器功能与场景回归 | 16 通过，0 失败、0 flaky | `functional.json` |
| 平局、死亡回执及下一局 HUD 的最终定向检查 | 1 通过 | `feedback-final.json` |
| 十人画面，单渲染客户端 + 9 个 Node 协议客户端 | 60.00 FPS，绘制指令耗时 P95 2.00ms，帧间隔 P95 16.70ms | `performance-cached-lighting.json` |
| 原来的同页 10 连接压力场景 | 60.00 FPS，绘制指令耗时 P95 2.70ms，帧间隔 P95 16.70ms | `performance-original-topology.json` |
| 8 个模拟玩家，连续 60 秒移动、开火与 ping | 无异常掉线或丢失成员；状态间隔 P95 32.63ms，往返 P95 47.65ms | `eight-player-session.json` |
| 临时公网 HTTPS 健康接口和游戏页面 | 均为 HTTP 200 | `public-retry/public-runtime.json` |
| 经过公网隧道的 2 个 WSS 客户端，连续 5 秒 | 通过；往返 P95 111.61ms | `public-wss.json` |
| 语法、构建、部署预检 | 通过 | `npm run test:syntax`、`npm run build`、`tools/verify_arena_deploy_config.py` |

## 测试环境与解释

- Windows 11，Python 3.13.9，Node.js 22.14.0，Chromium 153.0.8010.12。
- 性能采样固定 1440×1000 视口、DPR 1、10 位人类角色连接及现有机器人，持续 5 秒；FPS 来自实际游戏绘制循环，门槛保持 55 FPS。
- `performance.json`、`performance-profile.json` 与 `performance-isolated.json` 是修复前的失败记录。静态全屏光照缓存、不透明画布与低延迟提交调整后，两种连接拓扑都达到约 60 FPS。失败记录没有被删除或当作通过。
- 绘制指令耗时是 JavaScript 提交画布指令的耗时，不能当作完整 GPU 渲染耗时；帧率和帧间隔另行采样。
- 协议连续性检查使用本机模拟客户端。公网测试确实经过 HTTPS/WSS 隧道，但客户端仍来自本机，不能证明另一台实体设备或异地网络已经验收。
- 第一次临时隧道建立后外部健康检查未通过。延长就绪检查窗口后，第二次健康接口、游戏页面与 WSS 通信通过。
- 验证结束后已停止本轮临时服务器与隧道，记录中包含 `stopped_at`；历史临时地址不再作为可用入口。重新试玩请按 `docs/FRIEND_PLAYTEST.md` 启动。
- GitHub Actions 工作流已加入仓库并完成 YAML/本地命令验证；未将本地结果称为远端 CI 已运行通过。

## 已做视觉检查

已实际查看以下截图：

- `output/playwright/friends-guide.png`：部署前指南、下一步与跳过按钮。
- `output/playwright/friends-death-receipt.png`：死亡原因、复活倒计时、保留当局成长和边缘受击方向。
- `output/playwright/friends-lobby-1280.png`：1280×720 大厅入口与聊天表单没有挤出面板。
- `output/playwright/flat-ingame.png`：光照缓存后的正常战斗画面。

真人验收与反馈模板见 [朋友联机试玩](../../docs/FRIEND_PLAYTEST.md)。
