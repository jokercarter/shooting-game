# Morrow Fields 验证记录

验证时间：2026-10-02（America/New_York）

## 正式游戏界面对照

- 2026-10-01 03:35 UTC（2026-09-30 23:35 EDT）再次从公开大厅进入 Free 模式：观察到地图投票、公开玩家列表、右上角小地图/比分、生命条、右下角武器槽和死亡/重生流程；地图投票项包括 De Facto RY、Forest、Ole Forgotten。本轮没有向全局聊天发送内容。
- 浏览器查看了 [Slay.one](https://slay.one/) 实际大厅：大厅提供 1v1 Ranked、Free、Infection、Team 四类入口、角色外观入口、全局聊天和地图投票；此前还观察到 Courtyard、Ole Forgotten、Forest3、De Facto RY 和 Courtyard2 等地图名称。
- 官方公开大厅显示普通死亡房间 `4/20`、感染模式房间 `18/24`；自定义赛事地图列表显示房间容量从 2 到 24 人不等。Morrow Fields 采用按模式设置的 20/24 名人类名额和 2 人决斗，地图与资产继续保持原创。
- 官方设置界面可见音量、小地图尺寸、画面简化、聊天/武器栏/小地图显示开关、服务器选择和键盘设置入口；键位表还列出 `R` 装弹、`F` 狙击瞄准、`Q/E` 技能、右键跳跃、`Space` 选择升级、`Y` 第二射击。设置页不显示数值，但公开客户端 `https://slay.one/dist/client-bundle.js` 的武器表包含伤害、冷却、速度、射程、爆炸半径和弹药字段；提取结果见 `slay-public-weapon-config.json`。
- 官方键位面板列出 15 个武器槽位：激光枪、榴弹发射器、喷火器、急射小机枪、火箭发射器、反弹激光、自动制导导弹、遥控导弹、狙击步枪、猎枪、快速火箭、快速榴弹、治疗波、能量狙击和 Bug Launcher；另有 `Y` 第二射击模式。公开客户端把武器 16 `Energy Rifle` 的 `mode2Weapon` 指向武器 17 `Energy Rifle 2nd Mode`，因此 Morrow Fields 的 J/Y 映射已确认。
- Morrow Fields 现在用自己的标题、地图、枪械和四套角色外观；大厅采用相似的像素卡片模式选择，同时保留六种原创模式、公开房间列表和邀请码。

## 竞技场

- `npm run typecheck`：通过。
- `npm run build`：通过。
- Python 编译检查：通过（使用工作区外部隔离运行时）。
- `npm run test`：121 passed；只有 Starlette/AnyIO 的弃用警告。
- `git diff --check`：通过；Git 仅提示工作区 LF/CRLF 转换提醒。
- SWE+AI 文件数复核：清理记录为 529，重新构建后为 540，加入低人数/8 人共享状态拾取证据、10 分钟延迟报告、相关截图和 AI 交接文档后为 547（目标少于 10,000）；旧 50/60/75Hz 延迟报告、Playwright/Pytest 缓存及临时目录已清理，Python 与 Node 依赖保存在工作区外；`npm run build`、`npm run test` 和 `npm run test:browser` 均能通过临时依赖联接运行。
- 主机 Wi-Fi 地址 `10.0.0.100:8080`：`/health`、`/arena/`、地图、模式、房间 API 均可访问。
- WebSocket 双人探针：两名真人进入同一房间，位置变化同步，聊天和隐藏状态同步；一人断开后玩家数收缩，最后一人离开后空房间清理。早期探针已合并到 [`UPDATE_HISTORY.md`](../../docs/UPDATE_HISTORY.md)；当前容量证据见下方最新结果。
- 历史容量和五命决斗探针已合并到 [`UPDATE_HISTORY.md`](../../docs/UPDATE_HISTORY.md)，当前证据使用 15 武器版和最新模式回归记录。
- 实时战斗闭环：两个独立 WSS 客户端在决斗房间实射；护盾下首发造成 14 点伤害，后续击杀、死亡数、100 分和击杀播报同步。早期探针过程已合并到 [`UPDATE_HISTORY.md`](../../docs/UPDATE_HISTORY.md)。
- 技能点：两个击杀增加 200 未消费战绩，服务器状态显示 1 个技能点；购买 Vitality 后扣除 200 分、生命提升至 125，状态重新广播为 0 点。前端升级栏实时显示可用点数。
- 浏览器冒烟：大厅六种模式卡、角色外观轮换、地图选择、武器栏、小地图、排行榜、技能点显示和返回大厅正常；大厅聊天 WSS 在进入与退出比赛后都会重新连接；390px 视口没有横向溢出；浏览器控制台 0 错误。公网浏览器数据见 `browser-smoke-public.json`，截图在 `../playwright/morrow-fields-live-*.png`。
- 新增后端规则断言：逐件武器实际命中可见目标、Prism 墙面反弹、爆炸伤害衰减和边界、Stillpoint 完整蓄力后发射。
- 导弹爆炸规则复核：导弹爆炸可伤害自身，爆炸中心角色受到更高伤害，边缘角色伤害衰减；普通队伍伤害保护仍由模式规则控制。
- 河流规则复核：三张地图返回分段河流和桥梁区域；水面会阻挡步行，桥梁可通行，击飞进入水面会触发落水死亡。
- 大厅公共聊天：双 TestClient WebSocket 验证接入历史、跨客户端广播、昵称清洗、每连接 1 秒限速和 180 字符截断。公网浏览器只连接和读取空历史，没有向其他玩家发送测试内容。
- 皮肤协议：公共浏览器选取 `orchard` 后，第二个 WSS 客户端读取到 `MorrowRanger.skin=orchard`；观察客户端提交 `gear` 后也同步为 `gear`。地图和 Team Deathmatch 配置保持锁定。早期观察探针已合并到 [`UPDATE_HISTORY.md`](../../docs/UPDATE_HISTORY.md)。
- 房间容量按模式：普通/队伍/夺旗 20 名人类、感染模式 24 名人类、决斗 2 名人类；该上限由模式 API、房间列表、WebSocket 状态和大厅卡片共同广播。
- 官方武器槽位覆盖：Morrow Fields 现有 15 种武器；H 已实现为自动瞄准附近队友并可自疗的直线治疗光束；J 已实现能量光束，按住 Y 发射能量球，光束命中能量球会触发更强的连锁爆炸。后端逐件武器发射断言覆盖 15 种、伤害/治疗武器实际命中断言覆盖 14 种；所有 14 种地图补给武器均通过拾取、补弹和装填断言，Y 输入和高人口 10Hz 广播频率也有断言。
- 新增逐项 parity 检查：15 个本地武器逐项通过公开客户端的冷却、伤害、弹速、寿命、弹匣/备弹、射程、爆炸半径、追踪转向、散射、蓄力、反弹和 J/Y 副模式字段；基础激光的官方表没有 clip 字段，按无限弹药语义单独核对。结果见 `weapon-parity-check.json`。
- 前端武器键位冒烟：推荐公网大厅显示 H/J/L 武器切换键和 Y 第二射击提示；页面控制台 0 错误。截图见 `../playwright/morrow-fields-15-weapons-lobby.png`。
- 控制映射复核：右键跳跃、Q/E 技能、点击选择升级后用 Space 确认，V/X/C 可直接购买；右键跳跃期间服务端短暂免伤，护盾把单次伤害限制到 10。15 武器版桌面与 390px 移动端截图已保存，移动视口 `scrollWidth=innerWidth=390`，Playwright 控制台错误数为 0。截图见 `../playwright/morrow-fields-15-weapons-controls.png` 和 `morrow-fields-15-weapons-mobile.png`。
- 本机 HUD 能量回归：`http://127.0.0.1:8082/arena/` 加入房间后能量初始值为 10，能量条可见；能量值只在本人的状态视图中返回，技能消耗和自动回复由服务端测试覆盖。
- 固定补给点复核：三张地图各有 14 个不与墙体/障碍重叠的固定坐标，每个坐标绑定唯一武器；拾取后 `pickup_spawns` 仍广播地面标记和 `respawn_in`，可用物体在同一原点重生。公网/本地欢迎包均返回 14 个补给点。
- 补给动画复核：不可用补给点根据 `respawn_in` 绘制环形进度，状态从不可用变为可用时创建对应武器颜色的像素爆发和附近提示；最新 `v49` 浏览器冒烟控制台错误数为 0。
- 场景扩大复核：服务端世界尺寸为 `3000×2000`，客户端镜头缩放保持 `1.8`；本地截图 `../playwright/local-expanded-scene-latest.png` 显示更大的战场范围、增加的障碍/草丛和高对比材质，地图固定补给点仍通过碰撞检查。人物身体保持直立，武器在独立图层按瞄准方向旋转。
- 障碍物布局复核：三张地图的碰撞障碍拆分为 29/26/33 个短块和错落碎片，切角像素绘制与碰撞数据来自同一列表；截图见 `../playwright/local-fragmented-obstacles.png`，规则测试覆盖碎片数量和地图可碰撞性。
- 帧率复核：本地 `http://127.0.0.1:8082/arena/` 进入房间后连续测量 3 秒，平均 `60.2 FPS`，页面错误为空；优化包含地面纹理缓存、视野裁剪、HUD 100ms 节流和粒子/爆炸/枪口特效数量上限。原始测量记录见 `local-fps-2026-10-01.json`。
- 性能可见性：战斗顶栏现在显示实时 FPS 和状态广播频率，用于定位浏览器渲染或联机广播瓶颈。
- 多人手感优化：客户端在 `state_interval_ms=100` 的拥挤状态包下，仅对本地存活角色做最多约 65ms 的短视觉预测；远端角色仍按服务端状态插值，回放模式明确关闭预测。最新 `v43` 浏览器冒烟控制台错误数为 0。
- 拥挤房间调度复核：17 个真人连接、4.2 秒采样中，状态包中位数由约 `120.7ms` 降至 `115.5ms`，P95 由约 `131.2ms` 降至 `128.4ms`；浏览器帧平均约 `4.17ms`、P95 约 `4.3ms`、超过 25ms 的帧为 0。证据见 `crowded-frame-time-2026-10-02.json`。
- 10 人低延迟复核：8–15 人房间切换到 `90Hz / 11.1ms` 模拟和状态广播，客户端输入间隔为 11ms；公共状态只编码一次，私有装备/弹药补丁按 200ms 节流。v62 同机10人连续10分钟状态间隔 P95 `12.96ms`、最大 `21.84ms`、超过25ms为`0/539960`，RTT P95 `3.44ms`、最大 `7.56ms`；另一个经 LAN 接口的 10 秒样本 P95 `12.82ms`、最大 `20.87ms`、`0/9071` 超过 25ms。两个样本客户端均在服务器主机，物理远端网络仍待验收；记录见 `latency-10p-host-10min-v62-2026-10-02.json` 和 `latency-10p-lan-v62-2026-10-02.json`。
- LAN 防火墙状态：端口 `8080`、本机地址 `10.0.0.100` 和 `LocalSubnet` 范围正确，规则启用；规则 Program 仍为已搬走的 `.venv\Scripts\python.exe`，实际服务改用外部 Python。`open-arena-lan-firewall.ps1` 会自动识别并更新，但要求管理员 PowerShell；实体设备连接因此尚未验收。
- 稳定部署静态预检：`tools/verify_arena_deploy_config.py` 所有配置检查通过，健康检查返回 200，结果见 `deployment-preflight.json`；本机没有 Docker CLI，真实容器构建和 Render HTTPS/WSS 发布仍待验证。
- 10 人浏览器流畅度与输入回归：10/20 真人房间共享状态和私有 HUD 补丁，最新完整回归中的 3 秒浏览器测量为 `60.3 FPS`；WASD 移动改变本地位置，另 9 个 WebSocket 客户端能观察到本地射击投射物，能量/弹药显示正常，控制台错误数为 0；证据见 `latency-10p-browser-final-2026-10-02.json`。
- 小地图/状态包/断线复核：静态地图层改为离屏缓存，每帧只重绘玩家/补给/旗帜/视野框；高人数状态帧使用 compact player fields，客户端合并静态名单；私有 HUD 补丁仅更新身份、能量、装备、升级和弹药，避免旧坐标或武器覆盖新状态；异常断线最多按退避策略重连 6 次，小地图隐藏时跳过绘制。既有 v60 完整 10 人回归 FPS `60.3`，控制台错误数为 0。v62 低人数和 8 人共享状态拾取均在本机真实对局中确认，装备列表和弹药 HUD 同步正常；低人数还确认拾取提示和切换武器，记录见 `weapon-pickup-client-state-2026-10-02.json` 和 `weapon-pickup-shared-state-v62-2026-10-02.json`。
- 状态包字段复核：17 个真人连接、33 个状态样本中，探针包平均约 `13.8KB`、P95 `14.3KB`；远端玩家的 `owned_weapons` 为空、`upgrades` 为 `null`，仍广播 `max_hp` 保持血条正确。证据见 `state-payload-2026-10-02.json`。
- 投射物白名单复核：状态包只保留位置、速度、类型、颜色、伤害、爆炸半径和绘制寿命字段；`target_id`、`hit_targets`、`turn`、`self_damage`、`knockback`、距离累计等模拟字段被隐藏，119 项测试覆盖字段完整性。
- 正式观战复核：大厅输入已有房间码后点击“观战”，浏览器进入 `SPECTATING`，显示 `1 / 20` 真人计数；旁观者不出现在 `players`，按 `]` 后 HUD 目标从 `Owner` 切换为 `MITE-01`，退出后 `spectator_sockets` 清空。截图见 `../playwright/local-spectator-mode.png`、`../playwright/local-spectator-cycle.png`，控制台错误数为 0。
- 结果/网络状态复核：本地浏览器实际显示 `FPS 60 · RTT 1ms · STATE 20Hz`，战后结果面板资源已加载，页面错误为空。截图见 `../playwright/local-ping-fps-result-ui.png`。
- 画面设置复核：设置面板的低特效、小地图和武器栏开关成功保存；本地浏览器状态为 `low-effects hide-minimap hide-loadout in-match`，`localStorage` 写入 `morrow-fields-lowEffects=true`，页面错误为空。截图见 `../playwright/local-display-settings.png`。
- 小地图尺寸设置已加入 75%–140% 滑块，并和其他画面设置一样保存到本机浏览器。
- 小地图尺寸运行态复核：设置为 `135%` 后 CSS 变量为 `1.35`、`localStorage` 为 `1.35`，页面错误为空。截图见 `../playwright/local-minimap-size.png`。
- 音效设置已加入：射击/导弹爆炸使用浏览器 Web Audio 合成，音量支持 0–100% 并持久化；音频仅在用户点击进入战场后初始化，避免自动播放阻塞。
- 装填反馈复核：服务端只向本人状态广播 `reload_remaining`，前端 HUD 显示装填进度/倒计时，武器槽在装填时脉冲，备弹为零时显示“无备弹”；新增回归断言验证装填时间不会泄露给旁观者。
- 真实装填流程复核：本地 WebSocket 客户端从随机出生点走到固定 `lobber` 补给点 `[438,250]`，拾取并发射第一发后收到 `mag=0`、`reserve=7`、`reload_remaining=2.75s`；浏览器控制台错误为 0，断开后房间数为 0。证据见 `reload-e2e-2026-10-02.json`。
- 客户端拾取缓存回归：本机浏览器从随机出生点移动到固定 `rotary` 补给点 `[2562.5,250]`，位置约 `[2552.5,249.9]` 时客户端显示 `owned_weapons=[pulse,rotary]` 和 `拾取了 Thorn Wheel`，装备槽可点选并将 HUD 切换至 `THORN WHEEL`；FPS 读数为 `100`，RTT `1ms`，控制台错误数为 0。截图和状态记录分别见 `../playwright/weapon-pickup-fixed-2026-10-02.png` 与 `weapon-pickup-client-state-2026-10-02.json`。
- 受击反馈已加入：生命值变化会显示角色附近的像素命中特效、轻微镜头震动和红色边缘闪屏；本地得分/击杀增加会显示准星确认标记。
- 浮动伤害反馈已加入：可见角色受伤时在其上方显示短暂伤害数字，导弹/火焰/能量/散射等武器使用不同色调和重击字号；低特效模式关闭数字并保留闪屏/粒子，最多保留 80 个数字对象。
- 双客户端真实命中复核：本地第一个浏览器进入房间，第二个 WebSocket 客户端持续瞄准并命中，前端实战画面出现 `-36` 浮动伤害数字；截图见 `../playwright/local-damage-number-e2e.png`，结构化记录见 `damage-number-e2e-2026-10-02.json`，控制台错误数为 0，断开后房间数为 0。
- 人物表现复核：移动时腿部交替步伐，停下时恢复静止姿态，身体不随瞄准方向旋转。
- 死亡观战复核：本地玩家死亡等待期间镜头选择最近存活玩家，HUD 倒计时显示“观战”对象，复活后恢复自身镜头。
- 观战切换键已加入：死亡等待期间使用 `[` / `]` 选择上一位/下一位存活玩家。
- 观战镜头已平滑化：切换目标时插值跟随，远距离出生点变化才直接重定位。
- 短回放复核：战后结果面板新增“保存短回放”，浏览器缓存最近约 12 秒玩家/投射物帧并导出 JSON；设置面板的“加载短回放”已现场加载 `sample-replay.json`，页面进入 `LOCAL REPLAY`，能显示回放帧中的 `100 / 100`、`0000` 等 HUD，播放结束回到大厅并恢复默认 HUD。截图见 `../playwright/local-replay-player.png`，控制台错误数为 0。
- 回放控制复核：加载同一 JSON 后，暂停按钮切换为“继续”，时间轴拖动到 `0:10 / 0:20` 后再继续播放，状态仍为 `LOCAL REPLAY`；再拖到末尾继续播放后自动回到大厅，HUD 恢复 `100 / 100`、`0000`，`in-match=false`。截图见 `../playwright/local-replay-controls.png`，控制台错误数为 0。
- 地图投票进度条和低特效反馈已复核：投票倒计时显示进度，低特效会降低枪口闪光和镜头震动；6 项 Playwright 回归通过。
- 地图投票复核：后端验证两名真人投票后选择票数最高地图，并在原房间清空胜负状态、比分、武器、生命和出生点；另验证 15 秒超时和平票保留当前地图，以及两个 WebSocket 真人客户端完成投票后收到新回合；规则测试共 121 项通过。
- 武器反馈复核：新武器事件会产生后坐力位移；导弹消失/命中时创建更强爆炸环和短暂背景抖动，浏览器控制台错误为空。截图见 `../playwright/local-missile-effects.png`。
- 场景布局复核：全屏本地画布尺寸为视口 `1440×1000`，河流/桥梁、分散草丛和全屏竞技场截图见 `../playwright/local-river-fullscreen.png`。
- 速度节奏复核：服务端运行时系数将人物移动降为 0.88，普通弹体降为 0.85，导弹额外乘 0.82，追踪转向乘 0.70；公开源表仍按原始字段 parity 校验，运行时系数记录在 `weapon-parity-check.json`。
- 本机运行态速度测量：`local-speed-runtime-2026-10-01.json` 记录人物移动状态变化和 Pulse Needle 实际 `vx=382.5`，与 `450×0.85` 一致。
- 本地真实画面已保存为 `../playwright/local-fixed-pickup-markers.png`，可见固定点的虚线框、槽位标识和补给/倒计时标记。
- 真实本机长驻服务浏览器回归：两个浏览器窗口通过 `http://127.0.0.1:8082/arena/` 使用同一房间码加入，双方显示 `2 / 20`，能量条宽度为 `12.8281px`，控制台页面错误为空；窗口关闭后 `/api/arena/rooms` 为空。数据见 `local-browser-two-window-2026-10-01.json`。
- 第二设备模拟复核：两个独立浏览器页面在同一房间显示 `2 / 20`，第一端位置从 `x=1011` 移动到 `x=1146.8`（907ms），第二端射击被检测到；关闭第二端后房间显示 `1 / 20`，健康检查为 `ok`、控制台错误数为 0。结构化记录见 `lan-two-device-simulation-2026-10-02.json`，截图见 `../playwright/local-two-device-one.png` 和 `../playwright/local-two-device-two.png`。
- 字体可读性回归：本地大厅桌面截图 `../playwright/local-fonts-lobby.png` 已保存；大厅、HUD、武器栏、技能按钮和底部提示统一放大，390px 移动测试仍无横向溢出。
- 15 武器版容量探针：公网普通房 20 名人类+4 个机器人、感染生存房 24 名人类+18 个感染机器人均接满；第 21/25 名人类分别被拒绝，断开后探针房间清理。人数从 1 连续增长至上限，16 名人类以上的状态包间隔为 100ms。数据见 `public-capacity-15-weapons.json` 和 `lan-capacity-15-weapons.json`。
- 新武器配置重启后的容量复核：局域网与推荐公网均再次接满普通 20 名人类+4 个机器人及感染生存 24 名人类+18 个机器人，超员拒绝、100ms 拥挤状态包和房间清理均通过。数据见 `lan-capacity-after-weapon-config.json` 和 `public-capacity-after-weapon-config.json`。
- 队伍机器人修正后的推荐公网复测仍接满普通 20 名人类和感染生存 24 名人类，超员拒绝、100ms 状态间隔和房间清理通过；数据见 `public-capacity-after-mode-fix.json`。
- 六种模式启动复核：普通混战、感染者乱斗、队伍积分、夺旗、五命决斗和感染生存均能通过 WebSocket 创建并广播对应模式；夺旗包含两面旗帜，决斗不注入机器人且保留生命数，队伍机器人分到两队，感染生存生成 18 个感染者。数据见 `mode-starts-2026-10-01.json`。
- 旧 Quick Tunnel 的历史容量复测和节流前掉人结果已合并到 [`UPDATE_HISTORY.md`](../../docs/UPDATE_HISTORY.md)；当前公网容量使用最新入口证据。
- 15 武器版双人 WSS：同房、移动、聊天、皮肤同步、地图/模式锁定、离房清理通过；欢迎消息包含 15 个武器槽位、H/J/L 控制和能量狙击副模式。数据见 `public-two-player-sync-15-weapons.json`。
- 新代码重启后的双端复核：局域网和推荐公网各两名真人同房，移动同步、聊天同步、`orchard/gear` 皮肤同步、地图/模式锁定、15 槽位 H/J/Y 机制字段和离房清理均通过；数据见 `live-weapon-sync-2026-10-01.json`。
- 推荐公网队伍积分复核：1 名人类+4 个机器人同房，机器人为两队普通角色而非感染者，15 槽位及 H/J/Y 机制字段正常；数据见 `public-team-mode-after-fix.json`。
- 持续战斗流量复核：推荐公网隧道中两名客户端连续 30 秒随机移动与射击，共发送 446 条输入；客户端分别收到 528 和 524 个状态包，机器人移动、观察到最多 14 个投射物，探针房间断开后清理。数据见 `public-30-second-load-15-weapons.json`。
- 公网浏览器选取感染生存后加入房间 `E98421`，HUD 显示 `1 / 24`，大厅卡片显示各模式上限；截图见 `../playwright/morrow-fields-capacity-preview.png`，本次浏览器错误日志为空。

## 公网与实体设备验证

- 原临时公网 URL 和旧隧道压力探针已停止作为当前入口，成功/失败过程已合并到 [`UPDATE_HISTORY.md`](../../docs/UPDATE_HISTORY.md)。
- 推荐使用更新版临时公网 URL `https://nearby-protect-proved-ratios.trycloudflare.com/arena/`；健康检查、HTTPS 页面、15 武器 API、普通 20 人/感染 24 人容量探针、30 秒战斗输入和浏览器 HUD 均通过。浏览器测试房间 `E98421` 曾显示 `1 / 24` 并保存截图；测试浏览器关闭后房间已清理，当前没有保留测试房间。
- 公网房间链接：浏览器用房间码加入现有 Team Deathmatch，验证邀请链接流程。
- 大厅模式卡和外观：先前公网 Playwright 冒烟轮换到 Orchard 皮肤，通过开放房间卡片选择 `team_dm` 和 `glass`。`browser-smoke-public.json` 记录 `selectedSkin: orchard`、`roomPickedFromList: true`、`skillPointsText`、`lobbyChat: true`、390px 无横向溢出和 0 控制台错误；房间 `2D5411` 已随服务重启清空。
- 皮肤和技能点状态的服务器同步：扩容前，第二个公网 WSS 客户端曾在房间 `2D5411` 读取到 `MorrowRanger.skin=orchard`，并确认 `gear` 外观和技能点由服务端广播；该房间是历史验收结果。
- 历史容量探针曾验证 12 名人类+4 个机器人及第 13 人超员拒绝；过程已合并到 [`UPDATE_HISTORY.md`](../../docs/UPDATE_HISTORY.md)，当前容量证据改由上述 20/24 人记录提供。
- 早期公网持续输入探针已合并到 [`UPDATE_HISTORY.md`](../../docs/UPDATE_HISTORY.md)；当前 30 秒负载证据使用 15 武器版记录。
- 以上客户端都由本机发起，经 Cloudflare 公网入口往返；第二台实体设备/异地网络尚未实际加入。LAN 防火墙规则已安装并读取回核：TCP 8080 只绑定 `10.0.0.100`，远端范围 `LocalSubnet`，详情见 `firewall-rule.json`。
- 两条 Quick Tunnel 都是临时测试入口：Cloudflare 文档说明不保证可用性，停止对应隧道进程后 URL 失效，任何持有 URL 的人都可访问。[官方说明](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)。24 人压力下原 URL 有连接丢失，更新版随机地址通过了探针；稳定公网部署仍需在 Render 或其他托管账户中创建服务。
- `npm run test:browser`：7 项通过，0 项失败。`arena.spec.ts` 覆盖 15 武器键位、右键跳跃、Space 升级确认、20 人 HUD、能量条、两个本地浏览器共享房间、10 人高负载移动/射击/私有 HUD 补丁和 `60.3 FPS`、返回大厅、390px 移动布局和画面设置持久化；公开作品集也验证已发布但进行中的项目可见。完整结果保存在 `full-playwright-results.json`。

## 全仓库回归

- `advanced.spec.ts`、`arena.spec.ts` 和 `workbench.spec.ts` 均通过。工作台发布流程会把 `status=published` 的项目列入公开作品集；`completion` 独立决定“已交付/进行中”标签和精选排序。

## 15 武器版联机复核

- 15 槽位服务端配置包含 H 治疗光束、J 能量光束和 L Bug Launcher；Y 输入能发射 J 的能量球副模式。WSS 欢迎包返回 15 个槽位和副模式配置，证据见 `public-two-player-sync-15-weapons.json`。
- 每种武器发射均有断言，14 种地图补给武器均通过拾取、再次补给、装填并成功发射。治疗光束只恢复队友/自己且不伤害敌队；能量光束命中能量球时会触发组合爆炸，Y 副模式和组合伤害使用独立服务端字段。
- 16 名人类以上服务器每 100ms 广播一次状态；客户端据此插值。最新 15 武器版公网和 LAN 容量均达到普通 20 人、感染 24 人；公网还通过了 30 秒移动/射击探针。证据见 `public-capacity-15-weapons.json`、`lan-capacity-15-weapons.json` 和 `public-30-second-load-15-weapons.json`。

## 稳定部署准备

- `Dockerfile.arena` 和 `render.yaml` 已检查，启动命令只暴露独立竞技场服务；本机未安装 Docker CLI，未能本地构建容器，也没有 Render 部署会话/账号，因此只验证了 Quick Tunnel，未验证稳定托管。
- 稳定部署前置预检已通过：Dockerfile 的前端构建阶段、独立公网 ASGI 入口、平台端口、Render Docker runtime 和 `/health` 检查均有效；结果见 `deployment-preflight.json`。实际云端镜像构建和部署仍需要 Render 或其他平台会话。
- `start-arena-public.ps1` / `stop-arena-public.ps1` 已在备用端口实际运行：自动启动独立服务和 Quick Tunnel，等待公网健康检查返回 200，写入 `public-runtime.json`，随后按命令行核对安全清理测试进程；当前入口仍由 8082 隧道提供。

## 当前行为边界

人物、地图、名称和素材是原创设计。15 种武器的公开客户端字段已逐项记录并换算到本项目单位，完整来源见 `slay-public-weapon-config.json`；视觉尺度和服务端网络实现仍是本项目自己的代码。房间状态保存在单个服务进程内，服务重启会清空房间。
