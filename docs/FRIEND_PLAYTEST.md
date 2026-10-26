# 朋友联机试玩

目标：4–8 位朋友使用电脑浏览器，连续玩 30 分钟并完成至少两局。本轮不包含手机操作重做、排位或跨设备账号。

## 已确定的游戏规则

- 默认自由混战，每局 8 分钟，时间到按分数结算；最高分相同则平局。结算后投票选下一张地图，15 秒后也会自动开局。
- 每局从 1 级开始。死亡保留当局等级、经验、属性点和已购买的属性；武器仍按原规则重新拾取。
- 下一局清空等级、经验、属性点和加点，同时清理尸体、技能效果与旧弹道。
- 浏览器身份对应的累计击杀、死亡、已完成场次和历史记录存入 SQLite。大厅的等级指“历史最高单局等级”，不是下局的战斗等级。
- 沿用数据库的 `profiles.level/xp` 作为已有纪录基线，新纪录只升不降，不需要重建数据库。不要删除 `data/arena.sqlite3`。
- 临时断线可在 30 秒内用本次连接的随机恢复凭证继续当局角色，前提是房间还有空位；凭证不存入公开战绩或广播。主动返回大厅正常退出，再次入场重新成长。服务重启后在内存中的房间和恢复凭证会清空。
- 首次部署前显示可跳过的三步操作指南；设置中可重看。对局中重看时角色停止接收操作，对局本身继续进行。
- 死亡回执显示服务端确认的击杀者和武器。受击方向只显示上下左右，最多持续 0.6 秒；不新增隐藏敌人的坐标。

## 开始试玩

在项目目录执行：

```powershell
.\start-arena-local.ps1 -Build
```

本机入口是 `http://127.0.0.1:8082/arena/`。异地朋友试玩使用已有临时公网入口：

```powershell
.\start-arena-public.ps1 -Build
```

脚本使用已安装或缓存的 cloudflared，检查 HTTPS 健康接口和游戏页面后打印临时地址。主持人先进入战场，点击顶部房间按钮复制邀请链接；朋友打开该链接、填写昵称即可加入相同房间。失效、已满、已结束的房间会显示明确原因，也可选择创建新房间。

停止公网服务：

```powershell
.\stop-arena-public.ps1
```

检查脚本时可使用单独端口和记录目录，避免覆盖已有运行记录：

```powershell
.\start-arena-public.ps1 -Port 8084 -RuntimeDirectory output/playtest/public
.\stop-arena-public.ps1 -StatePath output/playtest/public/public-runtime.json
```

临时地址在服务停止后失效。正式长期托管留到真人试玩反馈之后。

## 自动检查

```powershell
npm run test:syntax
npm run test:backend
npm run build
npm run test:functional
npm run test:performance
```

后端命令会运行整个 `backend/` 测试集，包括规则、存储、真实 WebSocket 重连与连续两局的结算检查。浏览器功能回归覆盖首次指南、邀请、失效房间、重连、小地图、战斗反馈、多局 HUD、桌面布局和原有美术场景。浏览器测试使用独立的 `tmp/browser-tests.sqlite3`。

GitHub Actions 在 push 到 main 和 PR 时执行语法检查、后端测试、构建和浏览器功能回归，并保留测试证据。工作流按 [Playwright 的 CI 安装步骤](https://playwright.dev/docs/ci-intro) 配置；性能门槛单独运行，避免把不同 CI 机器的速度混为同一基准。

性能测试固定 1440×1000 视口、单个渲染客户端、9 个 Node 模拟玩家和 5 秒采样，要求真实游戏绘制达到平均 55 FPS。报告包含浏览器版本、DPR、绘制耗时和帧间隔 P50/P95/最大值。Windows 下还可复现原来把 10 条连接都放进同一个渲染进程的压力场景：

```powershell
$env:ARENA_CROWD_TOPOLOGY = 'browser'
npm run test:performance
Remove-Item Env:\ARENA_CROWD_TOPOLOGY
```

协议连续性检查可对运行中的本地或 HTTPS 服务执行；它只能证明模拟客户端的通信行为，不能替代真人验收：

```powershell
.\.venv\Scripts\python.exe -B tools/verify_friend_session.py --players 8 --duration 60 --output output/playtest/eight-player-session.json
```

本轮证据位于 `output/playtest-2026-10-25/`，汇总见 [自动验收记录](../output/playtest-2026-10-25/REPORT.md)。`functional.json`、性能报告、`eight-player-session.json` 和 `public-wss.json` 分开保存。较早失败的性能报告保留用于对照，以最终报告和测试环境为准。

## 协议兼容性

现有 HTTP 路径与档案字段继续使用，本轮不增加数据库表或要求迁移。新增的协议字段均为兼容性扩展：

| 消息 | 新增内容 |
| --- | --- |
| `welcome` / `join` | `resume_token`：只给该连接的随机恢复凭证，客户端仅在自动重连时回传 |
| `state` | `round_number`、`round_elapsed`、`round_remaining`；剩余时间只用于自由混战，其他模式为 null |
| 本人玩家视图 | `hit_feedback`（编号、上下左右、事件年龄）与 `death_feedback`（原因、击杀者、武器）；其他玩家及公共流只收到 null，不包含攻击来源坐标 |
| 客户端 `leave` | 主动离开并放弃该连接的临时恢复机会 |
| 服务端 `error` | 新增稳定的 `code`，同时保留原有 `message`；界面显示中文原因与重试入口 |

## 真人验收记录

以下验收需要真实参与者，不能由同机自动测试代填：

- [ ] 4–8 位朋友从邀请链接入场，至少一人首次接触游戏。
- [ ] 至少一个异地网络或另一台实体设备，确认 HTTPS 页面和实时通信正常。
- [ ] 连续游玩 30 分钟，完成至少两局，换局后的成长一致重置。
- [ ] 没有阻断游玩的错误、重复结算、持续不同步或无法恢复的断线。
- [ ] 每人记录“哪里不懂”“哪把武器明显失衡”“什么时候感觉卡顿”，附时间、模式、地图与设备信息。

通过以上步骤之后，再根据反馈安排武器平衡、独立训练场、排行榜界面和长期公网服务。
