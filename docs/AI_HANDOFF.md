# Morrow Fields 详细开发交接

**面向接手工作的 AI。** 本文件记录截至 **2026-10-02（America/New_York）** 的仓库、运行服务、实测结果和未完成事项，供后续会话直接接着做。它是当前状态索引，不替代源码和原始测量报告；遇到冲突时，以当前源码、正在运行的服务和最新 JSON/浏览器证据为准。

## 1. 当前状态速览

| 项目 | 当前状态 |
|---|---|
| 项目根目录 | `C:\Users\90631\Desktop\courses\SWE+AI` |
| Git 分支 | `main`；有大量未提交的 Arena 和作品集修改，必须保留，不能 `git reset`、清理式 checkout 或覆盖用户文件 |
| Arena 前端资源 | `game.js v62`，页面入口在 `public/arena/index.html` |
| 本机服务 | `http://127.0.0.1:8082/arena/`，健康检查 200，资源 v62 |
| 局域网服务 | `http://10.0.0.100:8080/arena/`，健康检查 200，资源 v62 |
| 运行房间 | 最后复核时 8080 和 8082 的 `/api/arena/rooms` 都是 `[]`；临时压测端口 8083 已关停 |
| 工作区文件数 | 547，低于 10,000；项目内没有 `.venv` 或 `node_modules` |
| 拾取修复 | v62 低人数和 8 人共享状态分支都已用本机真实浏览器流程验证 |
| 10 人服务器节奏 | v62 同机 10 分钟移动/射击采样：539,960 个状态间隔，P95 12.96ms、最大 21.84ms、0 个超过 25ms |
| 实体设备局域网 | **未验证**。Windows 防火墙规则虽启用，但应用路径仍指向已搬走的旧 `.venv` Python；修复脚本要求管理员 PowerShell |
| 稳定公网 | **未部署**。静态部署预检通过，但本机没有 Docker CLI，也没有 Render 发布会话 |
| 总体目标 | 仍在进行。不要把同机模拟写成实体设备通过，也不要把临时 Quick Tunnel 写成稳定公网部署 |

## 2. 用户目标与工作边界

用户希望持续优化并调试人物、武器、界面和多人对战；10 人场景状态/延迟目标低于 25ms，同时保留画质和流畅度；及时清理无用文件，把旧版本过程汇总到更新历史；游戏各环节均能实际游玩。此前还要求完成 `完成.md` 和多人计划中的事项。

项目叫 **Morrow Fields**，以俯视像素竞技场和 Slay.one 的多人玩法为参考，角色、地图、名称和素材保持原创。另一位 AI 应继续按玩法和用户体验对照，不复制原游戏商标、贴图、地图文件或代码。

重要真实性约束：

- “10 个本机 WebSocket 客户端都低于 25ms”证明同机服务器负载下的状态节奏稳定；它不证明 Wi‑Fi、路由、远端浏览器的端到端 RTT。
- v62 的单机/8 人实战读数达到 100 FPS；10 人浏览器自动化回归的旧报告来自 v60，约 60.3 FPS。尚未用 v62 重新测高负载浏览器渲染。
- 10 分钟服务器采样只使用同一台主机上的 10 个网络客户端。实体设备输入到远端画面仍是未通过项。
- Render/Quick Tunnel 的静态配置预检不等于真实云构建、发布或 WSS 双端验收。
- 对 GPU 优化先看实际 profile。当前把 GPU 用在浏览器 Canvas 合成；服务端目标是事件调度、状态快照和网络广播。不要在没有基准的情况下增加 CUDA、张量搬运或 GPU 服务器依赖。

## 3. 主要代码和资料位置

| 路径 | 用途 |
|---|---|
| `backend/arena.py` | 房间、模式、地图、武器、服务端权威移动/碰撞/弹药/拾取/伤害、机器人、节奏调度和 WebSocket 协议 |
| `backend/arena_public.py` | 独立 Arena ASGI 应用，提供 `/arena/`、`/health` 和 `/ws/arena`，部署镜像只暴露该游戏服务 |
| `backend/arena_timing.py` | Windows 高分辨率计时器的启用/释放 |
| `public/arena/index.html` | 游戏大厅和战斗 HUD；当前引用 `game.js?v=62` |
| `public/arena/game.js` | Canvas 渲染、输入、WebSocket 客户端状态合并、HUD、音效、回放和设置 |
| `public/arena/game.css` | 大厅、全屏战场、HUD、武器槽和响应式样式 |
| `backend/test_arena_rules.py` | 后端规则测试，最近完整记录为 121 项通过 |
| `tests/arena.spec.ts` | Playwright 浏览器用例；最近完整 7 项报告早于 v62，不能当作 v62 的完整回归结果 |
| `tools/verify_arena_latency.py` | 多客户端移动/射击、状态间隔和 ping/pong RTT 测量 |
| `tools/verify_arena_load.py` | 普通/感染模式容量、机器人数量、超员拒绝和断线清理核验 |
| `tools/verify_arena_deploy_config.py` | Dockerfile、Render 配置、独立入口、健康检查的静态预检 |
| `tools/cleanup_arena_workspace.py` | 清理已知缓存和旧中间延迟报告；当前 v62 报告已加入保留清单，执行前仍须先看 `--dry-run` |
| `tools/Find-Python.ps1` | 优先返回工作区外的 Python 环境 |
| `tools/Test-Backend.ps1` | 使用外部 Python 执行后端 pytest |
| `tools/with_node_dependencies.mjs` | Node 构建/类型检查/浏览器命令临时联接外部 `node_modules`，结束时移除 |
| `start-arena-local.ps1` / `stop-arena-local.ps1` | 本机 127.0.0.1:8082 的后台服务生命周期 |
| `start-arena.ps1` | 默认前台启动 LAN 服务；当前实际地址是 10.0.0.100:8080 |
| `open-arena-lan-firewall.ps1` | 管理员脚本；检查并修复局域网规则的地址、端口、子网和 Python 程序路径 |
| `start-arena-public.ps1` / `stop-arena-public.ps1` | Cloudflare Quick Tunnel 临时演示生命周期 |
| `Dockerfile.arena` / `render.yaml` | 正式容器部署配置，尚未实际云端构建/发布 |
| `完成.md` | 用户阅读的最新完成状态、证据索引和外部验收项 |
| `docs/MORROW_FIELDS_MULTIPLAYER_PLAN.md` | 原始多阶段计划、验收标准和下一轮方向 |
| `docs/UPDATE_HISTORY.md` | 旧版本、旧报告与清理过程的汇总历史 |
| `docs/SLAY_ONE_GAP_AUDIT.md` | 与参考游戏的玩法差距和优先方向 |
| `docs/ARENA_DEPLOYMENT.md` | LAN、防火墙、Quick Tunnel 和稳定部署流程 |
| `output/arena-validation/verification.md` | 验收证据说明和限制 |

当前分支是 `main`，项目本身有多项已存在的未提交修改。下一位 AI 应先检查 `git status --short`，将这些改动视作共享工作，不要只为本次 handoff 做重置、rebase、stash 或大范围清理。当前没有发现 `AGENTS.md`。

## 4. 已实现的游戏内容

### 4.1 地图、角色与模式

- 三张原创地图：`tidal`（Mosswood Crossing）、`glass`（Sunvale Orchard）、`ember`（Redleaf Ruins）。游戏世界为 `3000×2000`，浏览器可用视口铺满战场，摄像机跟随角色。
- 四套原创角色外观；人物身体保持直立，瞄准方向只影响手持武器。
- 障碍物拆成短墙、错落石堆和切角像素墙；草丛分散成群；地图有河流与可通行桥梁。水面阻挡步行，导弹击飞落水会死亡。
- 六种模式：`normal`、`zombie_dm`、`team_dm`、`ctf`、`duel`、`zombie_coop`。普通/队伍/夺旗 20 名人类容量，感染 24 人，决斗 2 人；机器人不计入真人名额。
- 新房间按模式生成机器人，允许单人开始游戏；房间状态存在内存，最后真人离开会清理，服务重启会丢失所有房间。

### 4.2 武器、弹药与战斗

15 个武器 key：`pulse`、`lobber`、`flame`、`rotary`、`flare`、`prism`、`seeker`、`cursor`、`rail`、`scatter`、`rapid_flare`、`rapid_lobber`、`healing_wave`、`energy_sniper`、`bug`。开局只有 `pulse`，其他武器来自地图上的固定补给点；每个点绑定固定武器，拾取后倒计时并在原处重生，地面和小地图都标注。

已实现并有相应旧测试/实战记录的内容包括：弹匣与备弹、装填进度、反弹、榴弹/导弹爆炸衰减、追踪、蓄力、治疗光束、能量武器的 Y 副射击与连锁爆炸、护盾/修复/冲刺、升级点和房间计分。枪械和导弹有后坐力；导弹能伤害自身、击飞角色并按爆炸中心距离衰减伤害，落水死亡。

### 4.3 UI 与辅助功能

大厅有房间码、开放房间列表、角色皮肤、模式/地图选择和大厅聊天。战斗 HUD 有生命、能量、分数、排行榜、小地图、拾取武器栏、装填动画、伤害数字、受击反馈、FPS/RTT/状态频率。设置支持低特效、隐藏部分 HUD、小地图尺寸和音量。战后有结果面板、地图投票；死亡时可观战和切换目标；最近约 12 秒的浏览器数据可导出/加载短回放。

## 5. 架构与关键状态规则

### 5.1 服务端权威

客户端通过 `/ws/arena` 发送移动、瞄准、射击、切枪、装填、技能、升级、聊天等输入。服务端决定位置、碰撞、拾取、弹药、发射、伤害、击杀、复活、得分和房间清理；客户端不提交最终位置、生命、弹药或拾取结果。大厅另有 `/ws/arena/lobby`。

关键 API：`/health`、`/api/arena/maps`、`/api/arena/modes`、`/api/arena/rooms`。当前公开服务为 `backend.arena_public:app`，不依赖工作台 SQLite。

### 5.2 多人节奏与共享状态

规则集中在 `backend/arena.py`：

| 房间真人数 | 服务端模拟 | 状态发送目标 | 输入目标 |
|---:|---:|---:|---:|
| 少于 8 | 20Hz | 20Hz（约 50ms） | 普通低人数节奏 |
| 8–15 | 90Hz | 90Hz（约 11.1ms） | 11ms |
| 16 或以上 | 20Hz | 10Hz（100ms） | 拥挤房间按状态更新 |

Windows 服务运行期间请求 1ms 高分辨率计时器，并使用绝对截止时间避免 tick 累积漂移；错过 tick 时跳过补发，不突发追赶。8–15 人间隔将共有房间状态 JSON 编码一次，再并发写给玩家；稳定名单后使用 compact player fields。16 人以上优先降低广播频率以保持服务器和浏览器负载可控。上述策略是按**真人人数**选择速率。

另外，是否进入共用公共状态路径看 `len(room.sockets) >= 8`。公共帧会隐藏本人的能量/装备/升级/弹药；服务端约每 200ms 向每名真人补一个 `private` 状态。旁观者 socket 不计入 `room.sockets`。

### 5.3 v62 拾取缓存修复

症状：低人数下，服务端的 `state` 已含本人的新 `owned_weapons`，客户端仍把加入房间时保留的旧 `privatePlayer` 覆盖回去，所以玩家没看到武器。

修复位于 `public/arena/game.js`：`hasOwnerPrivateFields()` 只在本人完整状态包含有效能量、装备列表、升级对象和弹药对象时，才从当前状态更新私有缓存。共用公共帧中的私有字段是 `null`/空值，不会清空缓存；仍由服务端的 `private` 帧刷新。不要简化成“每个 state 都覆盖 privatePlayer”，否则多人共享分支会把缓存清空或把过期信息盖回来。

v62 真实浏览器检查覆盖：

1. 低人数决斗房 `PICKUP62`：走到 `rotary` 补给 `[2562.5,250]` 附近后，`owned_weapons` 有 `pulse,rotary`，显示 `拾取了 Thorn Wheel`、`THORN WHEEL` 和 `15/50`，可点选切换；console errors 0。报告：`output/arena-validation/weapon-pickup-client-state-2026-10-02.json`，截图：`output/playwright/weapon-pickup-fixed-2026-10-02.png`。
2. 8 人共享状态房 `SHAREV62`：1 个浏览器 + 7 个同机 WebSocket 客户端；UI 显示 8/20、状态约 91Hz。走到 `flare` 补给 `[250,1000]` 附近后，私有补丁使持有列表有 `flare,pulse`、弹药 `1/7`，右侧槽显示 `Comet Driver 1/7`；断开后房间被清理。报告：`output/arena-validation/weapon-pickup-shared-state-v62-2026-10-02.json`，截图：`output/playwright/weapon-pickup-shared-state-v62-2026-10-02.png`。

## 6. 性能、延迟与 FPS 的证据边界

### 6.1 当前 v62 10 人长测

`output/arena-validation/latency-10p-host-10min-v62-2026-10-02.json`：专用 loopback 服务 `127.0.0.1:8083`，10 个同机 WebSocket 客户端持续 600 秒移动并开火，间隔发送 11ms 输入。完成 539,960 个每连接状态间隔样本，P50 11.11ms、P95 12.96ms、最大 21.84ms，超过 25ms 为 0；ping/pong RTT P95 3.44ms、最大 7.56ms。采样后 8083 已通过 Ctrl+C 关闭，三处服务房间列表皆为空。

`output/arena-validation/latency-10p-lan-v62-2026-10-02.json`：用同一主机连接本机 LAN 地址 `10.0.0.100:8080`，10 秒、10 个客户端移动/开火，9,071 个状态间隔样本，P95 12.82ms、最大 20.87ms、超过 25ms 为 0；RTT P95 3.52ms、最大 4.67ms。

两份数据都只有一台机器，不能代表从另一台电脑到服务器的真实 Wi‑Fi/以太网 RTT。10 分钟结果证明长时**本机负载下**没有状态间隔超过25ms，但还不能结案物理设备的端到端目标。

### 6.2 帧率和 GPU

前端常量 `MAX_RENDER_FPS=100`，`requestAnimationFrame` 按上限节流；显示器刷新率仍是物理上限。v62 本机实际浏览器对局显示过 FPS 100（包含低人数和 8 人共享状态情景）。v60 的旧 10 人浏览器自动化 FPS 约 60.3；应重新测 v62 的**10 人浏览器渲染**，并写清自动化显示器刷新率和 `FPS` 读数来自哪台客户端。

本机设备：Intel Core i9‑14900HX（24 核/32 逻辑处理器）、Intel UHD Graphics、NVIDIA GeForce RTX 4060 Laptop GPU。浏览器 Canvas 走现有 GPU 合成；服务器没有 CUDA 路径。要加服务器 GPU 计算，先单独 profile tick wake、模拟、快照、JSON 编码和广播耗时，确认存在足够大的数值并行热点且拷贝成本不会高过收益。

## 7. 当前环境、依赖和运行服务

- Python：`C:\Users\90631\.codex\workspace-deps\SWE-AI\venv\Scripts\python.exe`。
- Node modules：`C:\Users\90631\.codex\workspace-deps\SWE-AI\node_modules`。
- 项目根当前无本地 `.venv` 和 `node_modules`。`npm run build`、`npm run typecheck`、`npm run test:browser` 通过 `tools/with_node_dependencies.mjs` 临时创建 junction，并在命令结束清理；后端命令使用 `tools/Find-Python.ps1` 找外部 Python。
- 本机入口：`http://127.0.0.1:8082/arena/`。启动：`./start-arena-local.ps1 -Build`；停止：`./stop-arena-local.ps1`。
- LAN 入口：`http://10.0.0.100:8080/arena/`。`./start-arena.ps1 -Port 8080 -BindAddress 10.0.0.100` 前台运行；先查已有服务和房间，不要重复占端口或杀掉别的 PID。
- 当前 `8080` 与 `8082` 在本次快照中 health 200、页面引用 v62、`/api/arena/rooms` 返回 `[]`。8083 测试服务已关闭。未来会话开始先重新核实，这些不是永久保证。
- 本机没有 Docker CLI。不要把静态检查说成 Docker 镜像构建。`tools/verify_arena_deploy_config.py` 已运行通过，`output/arena-validation/deployment-preflight.json` 中 `preflight_passed=true`、健康状态 200。

常用命令（PowerShell，仓库根目录）：

```powershell
npm run build
npm run typecheck
npm run test
npm run test:browser

./start-arena-local.ps1 -Build
./stop-arena-local.ps1
./start-arena.ps1 -Port 8080 -BindAddress 10.0.0.100

$python = & ./tools/Find-Python.ps1
& $python -B tools/verify_arena_latency.py --base-url http://10.0.0.100:8080 --players 10 --duration 10 --input-interval-ms 11 --output output/arena-validation/my-run.json
& $python -B tools/cleanup_arena_workspace.py --dry-run
```

`npm run test` 的历史后端结果为 121 项通过，`npm run test:browser` 历史完整回归为 7/7；完整浏览器报告是 v60，拾取修复后目前主要依据 v62 的两项实际浏览器流程与 10 分钟网络压测。若下一位 AI 改代码，应针对改动范围验证，不能把历史测试标成 v62 全量测试。

## 8. 防火墙和真实 LAN 设备：当前最直接的外部门槛

Windows 规则 `Morrow Fields LAN Arena` 已启用，TCP 8080、LocalAddress `10.0.0.100`、RemoteAddress `LocalSubnet` 的范围正确。但其应用过滤器仍是：

```text
C:\Users\90631\Desktop\courses\SWE+AI\.venv\Scripts\python.exe
```

实际服务使用：

```text
C:\Users\90631\.codex\workspace-deps\SWE-AI\venv\Scripts\python.exe
```

因此防火墙的 Program 不匹配。`open-arena-lan-firewall.ps1` 会比较 Python 路径并删除重建过期规则，但文件开头有管理员权限守卫：当前执行环境不是管理员，运行会直接失败。不要绕过 UAC、不要尝试请求用户密码。需要用户在提升权限的 PowerShell 中运行：

```powershell
./open-arena-lan-firewall.ps1 -Port 8080 -BindAddress 10.0.0.100
```

规则更新后，下一位 AI 才能继续从第二台实体设备加入、验证移动/射击/拾取/断线清理，并做 10 分钟输入到远端画面的测量。测量要区分服务端状态周期、客户端 RTT 和输入到远端画面的真实网络时延，并记录丢包/重连。

## 9. 云端和其他未完成范围

1. **真实设备 LAN 体验**：规则更新后仍需另一台设备；当前所有 10 人负载客户端都由服务器主机自己创建。
2. **v62 高负载浏览器帧率**：已有 v60 的 10 人浏览器 WASD/射击回归 60.3 FPS，以及 v62 单人/8 人页面 100 FPS；需测 v62 10 人浏览器在目标屏幕上的 FPS、帧时间和画面效果。
3. **16 人以上分支**：系统有 20Hz 模拟/10Hz 广播、客户端预测/插值；现有拥挤测试为旧版本约 17 人 4.2 秒，应复测 v62 的移动、武器命中、掉包/状态间隔和帧时间。
4. **稳定公网**：Dockerfile/Render YAML 静态检查通过；本机没有 Docker CLI，没有 Render 会话。Quick Tunnel 是临时地址，会在进程停止后失效。真实 HTTPS/WSS、重新启动/房间行为必须在授权的云服务中验证。
5. **游戏边界**：账号、持久化战绩、好友/战队、排位、反作弊和房间进程恢复尚无实现；当前进程重启会丢房间。这些是可选的更长期产品方向，不应混写成已有功能。

## 10. 文件清理与历史维护

当前工作区 547 个文件，小于用户要求的 10,000；巨大的 Python venv 和 Node 模块已搬到用户目录。不要移动回项目根。

`tools/cleanup_arena_workspace.py` 只针对已知缓存目录、Arena 日志和 `latency-10p-*.json` 中间记录。其保留名单已扩展到 v62 的 10 秒 LAN 和 10 分钟同机报告，并保留旧的 90Hz LAN 与浏览器基线。运行过 `--dry-run` 应先逐项检查，再决定是否真的清理；不要因为文件名字像旧报告就删掉本 handoff 引用的证据。

把中间历史汇总到 `docs/UPDATE_HISTORY.md`；把当前状态同步到 `完成.md`、本计划和 `output/arena-validation/verification.md`。报告中保留版本、拓扑、持续时间和“同机/实体设备”范围，避免把旧 v60 或 loopback 数据说成 v62 实机结果。

## 11. 下一位 AI 的建议执行顺序

1. 先读本文件、`完成.md`、`docs/MORROW_FIELDS_MULTIPLAYER_PLAN.md`、`docs/UPDATE_HISTORY.md`，然后核验当前 `git status`、8080/8082 health、asset 版本、rooms 列表和 firewall Program；不要依赖本文件中的瞬时 PID。
2. 让用户在管理员 PowerShell 更新防火墙规则；这是操作系统权限门槛。用户完成后再做实体第二设备测试，不要把同机 WebSocket 测试重跑一遍当作替代。
3. 实测 10 人 LAN 端到端输入/画面 10 分钟，记录 P50/P95/max、包间隔、RTT、丢包、FPS/帧时间、断线和测试拓扑。若最大超过25ms，先打开 `ARENA_PROFILE_TICKS=1` 的逐房间 wake/simulation/broadcast profile，并只对测出的热点优化。
4. 对 v62 进行 10 人浏览器移动、射击、远端可见、共享私有 HUD、拾取/切枪回归；比较 FPS 和画面；再检查 16+ 拥挤分支。
5. 更新 Docker CLI/云端可用性；有用户的 Render 会话或其他部署授权后再做实际容器构建、HTTPS/WSS、重启和房间清理检查。配置预检通过不能代替部署。
6. 每次改动保持报告、计划和清理保留清单同步；完成一项才把状态改成“已验证”。整体任务在实体设备与稳定公网验收完成之前保持未完成。

## 12. 可复制给下一位 AI 的接续指令

> 请从 `docs/AI_HANDOFF.md` 接续 Morrow Fields 当前目标。先检查真实源文件、服务和证据，不要覆盖工作区已有未提交改动。当前 v62 的低人数/8 人共享状态武器拾取已实际通过；同机 10 人 10 分钟状态样本最大 21.84ms，但这不是实体设备端到端测试。重点是管理员更新防火墙后完成第二台设备实测、复测 v62 的 10 人浏览器 FPS，并按现有计划验证 16+ 分支和真实稳定公网部署。维持更新历史、文件数低于10,000、报告记录真实拓扑；不要提前宣称全目标完成，也不要在没有 profile 证据时给服务端加 GPU 依赖。
