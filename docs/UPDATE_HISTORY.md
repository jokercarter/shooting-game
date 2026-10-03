# SWE+AI Morrow Fields 更新历史

维护时间：2026-10-02

这个文件汇总已合并到当前代码和最新验收记录中的旧版本进程。`output/arena-validation/verification.md` 记录当前有效验证；本文件保存被清理的中间证据类别，避免旧版本文件继续占用工作区并造成版本混淆。

## 2026-09-30：原型和基础联机

最初版本完成了双人房间、决斗模式、基础容量、浏览器冒烟和 LAN 接入。对应的临时证据包括 `two-player-sync.json`、`duel-mode.json`、`lan-capacity.json`、`browser-smoke.json`、`live-combat-loop.json` 以及早期验证脚本。后来这些能力被更完整的 15 武器、六模式和当前长驻服务验证覆盖。

## 2026-10-01：15 武器和多人扩容

这一阶段把武器从早期少量原型扩展到 15 个槽位，加入 H/J/Y 副模式、固定补给点、20/24 人容量、感染/队伍/夺旗模式、皮肤同步和大厅聊天。`public-two-player-sync*.json`、`public-capacity*.json`、`lan-capacity*.json`、`public-30-second-load*.json`、`mode-starts-2026-10-01.json` 和相关旧隧道探针记录了多次重启前后的过程；最终以 `live-weapon-sync-2026-10-01.json`、`public-capacity-after-weapon-config.json`、`lan-capacity-after-weapon-config.json`、`public-capacity-after-mode-fix.json` 和 `public-runtime.json` 作为当前参考。

Quick Tunnel 早期曾出现拥挤房间掉人，之后通过 10Hz 高人数广播和服务端节奏调整复测通过。旧隧道的成功与失败样本只保留在本历史摘要，不再作为当前运行结论。

## 2026-10-02：当前优化链

当前代码和最新证据新增了：3000×2000 世界、河流/桥梁、碎片化障碍物和切角像素墙体、固定武器补给和地面标识、补给重生环形倒计时与像素爆发、枪械/导弹速度调整、导弹自伤/击飞/爆炸衰减、伤害数字、装填进度、短回放暂停与时间轴、拥挤房间本地预测、并发广播、单调状态调度、状态包字段白名单、装备隐私、大厅观战入口、小地图静态层缓存和 compact player fields。

历史（早期 50Hz 阶段）：本轮 10 人低延迟优化把 8–15 名真人房间切换为 50Hz（约 20ms）服务端模拟和状态广播，客户端输入间隔降为 25ms；公共状态 JSON 只编码一次，每个玩家的装备/弹药私有补丁按 200ms 节流，稳定帧使用 compact player fields，16 人以上保持 20Hz 服务端模拟并使用 10Hz 状态广播。当时 LAN 10 秒移动/射击采样的状态间隔 P95 为 `37.24ms`、最大 `43.69ms`，服务端状态到客户端 P95 为 `2.90ms`、RTT P95 为 `4.45ms`；完整回归中的浏览器 10 人高负载测得 `60.1 FPS`。这次主要使用状态快照、单次编码、减少重复序列化和自适应 tick；Canvas 继续使用浏览器现有 GPU 合成路径，没有为了 10 人规模引入会增加部署复杂度的服务器 GPU 依赖。

本轮画面性能微优化把小地图的静态地面、河流、桥梁、树木和障碍物绘制缓存到离屏画布，每帧只更新玩家、补给、旗帜和视野框；隐藏小地图时完全跳过小地图绘制。高人数状态帧再改为 compact player fields，客户端保留静态名单并合并动态字段。地图内容和像素画质不变，生产资源版本更新为 `game.js v52`；10 人专项浏览器测量约 `60.2 FPS`，完整套件测量约 `60.1 FPS`。

历史（早期 50Hz 阶段）：随后对服务端 `in_cover` 热点做了直接循环和提前返回优化，并将投射物可取整字段改为预先声明的集合，避免高频状态快照重复做类型判断；10 人状态快照 profile 从 `0.576s` 降到 `0.357s`。compact player fields 将 10 人状态包平均大小从约 `13.3KB` 降到 `10.4KB`。当时 LAN 10 秒采样的状态间隔 P95 为 `37.24ms`、最大 `43.69ms`，服务器状态到客户端 P95 为 `2.90ms`，RTT P95 为 `4.45ms`。

当前有效证据包括：

- `reload-e2e-2026-10-02.json`：真实拾取、打空弹匣和自动装填。
- `damage-number-e2e-2026-10-02.json` 与 `local-damage-number-e2e.png`：双客户端真实命中和浮动伤害数字。
- `crowded-frame-time-2026-10-02.json`：17 人房间的帧时间和状态广播前后对照。
- `state-payload-2026-10-02.json`：装备隐私、投射物白名单和状态包体积。
- `local-spectator-mode.png`：正式观战入口。
- `latency-10p-lan-90hz-final-2026-10-02.json`：10 名真人 LAN 连续 10 秒移动/射击 90Hz 当前采样。
- `latency-10p-lan-v62-2026-10-02.json`：v62 服务器 10 个并行 WebSocket 客户端经 LAN 接口移动/射击 10 秒，状态间隔 P95 `12.82ms`、最大 `20.87ms`、`0/9071` 超过 25ms；客户端在同一主机，不代表远端设备端到端延迟。
- `latency-10p-host-10min-v62-2026-10-02.json`：v62 同机 10 个移动/射击客户端持续 10 分钟，539,960 个状态间隔 P95 `12.96ms`、最大 `21.84ms`、`0/539960` 超过 25ms；RTT P95 `3.44ms`，最大 `7.56ms`。
- `weapon-pickup-shared-state-v62-2026-10-02.json`：v62 8 人共享状态房间里实走固定补给点，`flare` 同步进入持有列表和 `1/7` 弹药槽；状态约 91Hz，结束后房间清理。
- `deployment-preflight.json`：本机静态预检确认 Dockerfile/Render 配置、专用后端入口、健康检查和容器命令一致，health 200；Docker CLI 不存在，未做真实镜像构建或部署。
- `latency-10p-browser-final-2026-10-02.json`：10 人浏览器高负载下私有 HUD 补丁、v60 的 11ms 输入/状态节奏、移动/射击和 60.3 FPS 完整回归。
- `lan-two-device-simulation-2026-10-02.json` 与 `local-two-device-one.png` / `local-two-device-two.png`：两个独立浏览器模拟第二设备，验证同房 `2 / 20`、移动、射击、断开后 `1 / 20`、健康检查和控制台无错误；实体第二台设备仍待实测。
- `workspace-cleanup-2026-10-02.json`：当前端口、房间、缓存、临时目录和日志清理状态。
- `local-replay-controls.png`：短回放暂停、拖动和结束清理。

## 清理规则

临时 CLI 脚本、空日志、重复截图、旧隧道中间日志、旧 8081/4175/4176 服务、Playwright/Pytest 缓存、10 人延迟优化的中间测量文件和同一能力的早期探针在本次清理中删除；本地启动脚本的运行日志移到系统临时目录，工作区只保留健康检查记录。源码、测试、当前验证记录、最新截图、武器 parity 配置和稳定部署前置检查保留；`.workbench` 按项目 README 保留。

本次引用审计确认 `output/arena-validation` 剩余文件都被当前验证记录、启动/校验工具或计划文档引用，没有孤立证据可安全删除；后续清理继续以引用审计和本历史文件为准。

新增 `tools/cleanup_arena_workspace.py` 作为可复查的清理入口。它只处理工作区内明确列出的缓存、临时目录、Arena 日志和旧 `latency-10p-*.json` 中间报告，保留当前 LAN/浏览器最终报告；执行前可用 `--dry-run` 查看清单。

新增 `docs/ARENA_DEPLOYMENT.md`，把稳定公网部署、WSS、健康检查、重启清房和实体设备验收步骤集中到一个当前指南。

容器启动命令改为 `exec uvicorn`，让平台停止/重启信号直接交给竞技场进程，减少 shell 进程导致的优雅关闭延迟；部署预检新增该入口检查。

Playwright 竞技场回归新增资源版本检查，确认页面实际加载带版本号的 `game.js`，避免前端构建后继续使用旧缓存。v53 增加异常断线的有限次指数退避重连，主动返回大厅仍直接结束连接；完整 10 人回归测得约 `60.2 FPS`。

稳定部署预检新增 Docker `HEALTHCHECK`，容器会主动访问自身 `/health`，与 Render 的 `healthCheckPath` 同时覆盖进程存活和应用响应；部署仍需用户自己的云平台会话实际构建和发布。

修复 10 人房移动和射击偶发失灵：高人数紧凑状态帧与 200ms 私有 HUD 补丁合并时，旧私有快照曾覆盖本地玩家的新坐标/武器状态，造成移动和瞄准/射击表现回退。私有补丁现在只合并身份、能量、装备、升级和弹药。扩展 10 人浏览器用例，验证 WASD 坐标持续变化并由其他客户端看到本地投射物；全套 Playwright `7/7` 通过，FPS `60.3`，资源版本升至 `game.js v59`，本机 8082 页面已返回 v59。

60Hz 过渡阶段采用绝对截止调度和 Windows 1ms 计时器；10 人 LAN 状态间隔 P95 `21.61ms`、最大 `31.06ms`、RTT P95 `4.16ms`。75Hz 实验状态间隔 P95 `21.22ms`、最大 `27.61ms`，仍有状态超过 25ms。

当前 90Hz 版本使用 11ms 客户端输入和绝对截止调度，Windows 服务运行期间请求 1ms 计时器分辨率，关停时释放。LAN 10 人连续 10 秒移动/射击测得状态间隔 P95 `12.96ms`、最大 `23.17ms`，9,021 个状态间隔没有一个超过 25ms；服务器状态到客户端 P95 `2.80ms`、RTT P95 `2.65ms`。10 人浏览器回归约 `60.3 FPS`，画面效果保持不变。完整记录见 `latency-10p-lan-90hz-final-2026-10-02.json`，资源版本为 `game.js v60`。

为满足工作区少于 10,000 个文件的要求，将约 42,710 个 Python 环境文件和 13,410 个 Node 依赖文件移出项目目录，保存在 `%USERPROFILE%\.codex\workspace-deps\SWE-AI`；启动脚本从该处启动 Python，Node 构建/类型检查/浏览器测试使用自动清理的短时目录联接。清理后工作区共 529 个文件，`npm run build`、`npm run typecheck`、`npm run test`、`npm run test:browser` 均通过。旧 60Hz 最终报告并入本文件的阶段记录后移除，只保留 90Hz 当前 LAN 报告和 v60 浏览器报告。

2026-10-02 后续修复与稳定性复核：拾取后本人装备数据会被加入房间时的旧私有缓存盖回。客户端现在只在状态帧确实带有完整的本人私有字段时刷新缓存；人数较多时仍从私有补丁读取装备/弹药。同步将人物移动倍率从 `0.88` 调至 `0.84`，并把浏览器绘制目标上限设为 `100 FPS`（实际呈现受显示器刷新率限制）。游戏资源版本更新到 `v62`；本机浏览器决斗房间和 8 人共享状态房间均实测拾取成功、持有列表与弹药更新，低人数房间还确认拾取提示和切换武器，控制台错误为 0。截图和状态记录见 `output/playwright/weapon-pickup-fixed-2026-10-02.png`、`output/arena-validation/weapon-pickup-client-state-2026-10-02.json`、`output/playwright/weapon-pickup-shared-state-v62-2026-10-02.png` 与 `output/arena-validation/weapon-pickup-shared-state-v62-2026-10-02.json`。v62 同机 10 客户端持续 10 分钟得到 539,960 个状态间隔，P95 `12.96ms`、最大 `21.84ms`、0/539960 超过 25ms，RTT P95 `3.44ms`；真实设备仍需独立测量。当前 Windows 入站规则仍指向已搬走的项目 Python；管理员运行 `open-arena-lan-firewall.ps1` 后才能继续实体设备验收。静态部署预检通过，但 Docker CLI 缺失，实际云构建仍待完成。重构后文件数为 540，归档拾取和共享状态证据后 545，加入长测报告后 546，新增 AI 交接文档后 547；依赖仍保存在工作区外。
