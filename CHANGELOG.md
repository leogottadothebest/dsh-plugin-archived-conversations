# Changelog

本项目的所有显著变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.1] - 2026-11-06

### 修复

- **旧格式会话漏出「只看真实对话」筛选**（实测症状：筛选已开启并显示
  「已隐藏 3 个空会话」，但页面上仍有 2 行「未命名对话」）。根因是投影
  缓存按 `formatVersion` 绑定记录（`currentLifecycleMatches`），而旧格式
  记录的 `sessionListMetadata` 不会被任何兜底面暴露
  （`cachedPredecessorTitle` 只服务 title 一行）。于是物理日志还停在 v3、
  迁移后从未被打开过的会话必然 `cachedSnapshot` 未命中——这类行
  **title = null 且 blank = false**：既显示「未命名对话」，又逃过筛选。
  实测归档集合 13 条中 6 条空会话，v4 的 3 条识别正确，**v3 的 3 条全部
  漏网**。
  - 新增 `_logFacts()`：只对「live 为空 + 非 seeded + 投影里没有
    `sessionListMetadata`」的行，读一次存档日志，用与 core 投影完全相同的
    判据（`applySessionListMetadata`：`blank` 初值 true，只有 `turn/start`
    会翻转）得出 `blank`；同时用最后一条 `session/title` 事件的标题做标题
    兜底（与 title 投影折叠同源），避免真实旧会话因为缓存过期而永远显示
    「未命名」。
  - 按 session id 记忆化，旧日志每个插件生命周期只读一次；读失败不记忆化
    （可能瞬时），且返回 `blank: false`——宁可显示成未命名，也不能因为
    读不到日志就藏起真实对话。删除会话时同步丢弃缓存项。
- 这是纯宿主改动，客户端产物不变。

## [0.2.0] - 2026-11-06

### 新增

- **空会话识别 + 「只看真实对话」筛选（默认开启）**。已归档页此前会把
  创建后从未发送消息的「空会话」显示成「未命名对话」，看起来像一批坏掉的
  记录。实测（96 条会话缓存）：`blank = true` 的 10 条**全部**没有标题、
  也没有 `lastPromptAt`，反向同样成立——没有「有内容却丢标题」的会话，
  所以未命名 ≡ 空会话。
  - 宿主 `describe()` 新增 `blank` 字段，取值与 core 会话列表同源
    （`sessionListMetadata.blank`，live 回退 `seq === 0`；seeded/fork 视为
    非空）。用 `blank` 而不是「标题为空」判别，因为真实对话也可能暂时没有
    标题。wire schema（宿主 + 客户端）与 `ArchivedSessionItem` 声明同步。
  - 客户端新增筛选开关（primitives `Switch`，0.1.5 起即有），**默认只看
    真实对话**；关掉即可查看/删除空会话。筛选是视图状态，由控制器持有，
    切换设置分区再回来仍保持。
  - 空行单独标注为「空会话 · 创建后从未发送消息」（虚线边框 + 斜体）；
    筛选把内容全部隐藏时，空态文案会说明是筛选所致，而不是「没有已归档
    对话」。
  - 批量「全部取消归档 / 全部删除」仍是**全局**范围（宿主按 `cwd` 扫描），
    因此确认框会如实写明其中包含多少个空会话——不会悄悄删掉看不见的行。

### 变更

- 构建冒烟测试扩到 **7 个渲染场景 × 4 代 primitives**，并把筛选结果钉在
  页面根节点的 `data-dshacv-shown` / `data-dshacv-hidden-blank` 上：默认
  筛选下混排数据只能看到真实对话，显式开启后才渲染空行。
- README 的 `ArchivedSessionItem` 增补 `blank`；DESIGN 新增 §4.5 记录这批
  空会话的完整来源链路（`session.create` 复用谓词、归档踢出复用池、
  侧边栏只在当前会话时显示空行、归档动作不校验 blank）。
- 版本 0.2.0。

## [0.1.9] - 2026-11-06

### 修复

- **设置导航里「已归档对话」的文字比其它设置项向右错位**（截图症状：同一列
  设置项里只有这一行标签被推右 ~20px）。根因是导航图标换了实现方式：
  旧代码为第三方的 section 把齿轮换成归档字形时，是往导航按钮里
  `insertBefore` 一个**新的 flex 子元素**，于是多出一份 16px 宽图标 **和**
  一个 8px 的 flex gap，标签左边界从 36px 变成 44px 甚至更多。现在图标
  改由外壳自己的图标单元承载（见下），行的 flex 几何与第一方各行完全一致。
- 旧线（≤ 0.2.0）的 DOM 回退同步修正：字形插进外壳**已有的图标单元内部**
  （隐藏齿轮后该单元仍是 16px），不再新增 flex 子元素；定位图标单元改为
  「含 `svg` 的那个 span」，外壳结构不认识时宁可保留原生齿轮也不乱猜。

### 变更

- **改用原生导航图标槽位**：DSH core ≥ 0.2.2-rc.1 的设置外壳声明了
  `settings.section.icon` list 槽，按 **section id** 寻址（外壳渲染
  `renderSlot(..., { only: row.id })`）。新增 `client/src/section-icon.js`
  注册该条目，`id` 与 `settings.section` 共用 `SECTION_ID` 常量；构建冒烟
  测试断言两者相等，并断言图标带 `data-dshacv-icon-slot` 标记。槽位存在时
  `nav-icon.js` 检测到标记后**整套 DOM 交换直接让位**，新线上完全不碰 DOM。
- 适配 DSH core 0.2.2-rc.1：peer 范围 `^0.2.0-rc.2` 已覆盖 0.2.2-rc.1，
  无需放宽；支持矩阵 `scripts/check-peers.mjs` 加入 `0.2.2-rc.1`，构建冒烟
  测试加第 4 代 primitives 种子，devDependency
  `@deepseek-ai/dsh-client-ui-primitives` 升到 `^0.2.2-rc.1`。
- 0.2.2-rc.1 的核心契约逐项核对无破坏性变化：`dsh-session` /
  `dsh-typert-protocol` / `dsh-storage-domain` / `dsh-workspace` /
  `dsh-session-projection-cache` 的相关面不变；`dsh-client-ui-primitives`
  由 282 增至 310 个导出，本插件用到的 `Button` / `Menu` / `RiskConfirmation`
  / `relativeTime` / 四个图标全部仍在（`Menu` 只是新增 `current` /
  `disabledReason` 等可选属性）；`dsh-client-modules` 的
  `window.__ModuleLoader__` 契约不变。宿主 `./typert` 清单与客户端
  contribution 均被 0.2.2-rc.1 自己的 `TypertRegistry` 接受，profile loader
  的 `skippedBundles` 为空。
- 注：0.2.2-rc.1 把 `@deepseek-ai/dsh-client-ui-primitives` 从宿主
  `node_modules` 移除了（它本来就只是浏览器侧平台种子模块，由
  `dsh.client.inject` 在客户端组合时解析），因此该包只作为**构建期**
  devDependency 存在，运行不依赖宿主安装。
- `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 版本并集补上
  `0.2.2-rc.1`（仍是单条规则 + `||` 形式）。

## [0.1.8] - 2026-09-30

### 修复

- **删除对话后它却「回到未分组」**（实测症状：在设置页点删除，插件页里该行
  消失，但侧边栏把它重新显示在「未分组」桶里）。根因是删除路径漏了**通知
  客户端**这一步：

  - 客户端的会话列表是一份**快照**，只由 `api-session/added` /
    `api-session/removed` 增量维护；侧边栏在渲染时用 `sessionVisible`
    过滤掉已归档的行，并把**没有任何工作区记账**的行归入「未分组」。
  - 而 `api-session/removed` 只由 core 在 `session/disposed` 时发出，
    也就是**只对 live 会话**发出。归档对话绝大多数是 cold 会话。
  - 于是删除一个 cold 归档对话时：删文件（无事件）→ 移出归档集合（该行
    重新「可见」）→ 从工作区 `sessionIds` 摘除（该行变成「无归属」）——
    客户端列表里那行还在，正好落进「未分组」。删除反而让对话回来了。

  现在 `deleteSession` 在**移除产物之后、改动归档集合/工作区记账之前**
  显式发出 `this.ctx.emit("api-session/removed", sessionId)`。该事件在 core
  的 forwarded-Host-event 白名单里（`dsh-api-remotes`），客户端由
  `ctx.remote.$on("api-session/removed", …)` → `sessions.handleSessionRemoved`
  消费（按 id 删行）。已实测：从一个**子插件上下文**发出的同一事件会被真实
  的 `dsh-api-remotes` 转发源接住并交给客户端传输
  （`{event:"api-session/removed",args:["session-…"]}`）。live 会话本来就由
  `session/disposed` 发出过一次，重复的一次在客户端是幂等的（删一个已经
  不存在的行）。
- **删除失败不再静默半途生效**：产物删除失败时，原实现只记一条 warn 就继续
  把该会话移出归档集合并摘除工作区记账——结果是「删除失败」却把对话从归档里
  放了出来，同样表现为回到「未分组」。现在只有**存档条目本身已损坏**
  （`readSessionHeader` 读不到，说明产物早就不在了）才继续自愈清理；真正的
  删除失败（权限等）会作为业务错误上抛，归档条目保持不变（仍被归档隐藏，
  可重试）。`unsupported-backend` 语义不变。

### 变更

- `scripts/check-host.mjs` 增加第二条构建期守卫：`lib/remote.js` 必须保留
  `api-session/removed` 通告（去掉即失败，并直接给出恢复文本），把上面这条
  契约钉在 `pnpm run check` / CI 里。
- 客户端产物 `client/client.js` 未变（本次只动宿主半程）。

## [0.1.7] - 2026-09-30

### 修复

- 适配 DSH core 0.2.0-rc.2（实测症状：**插件整个不加载**——设置页没有
  「已归档对话」入口，但没有任何报错、弹窗或宿主日志告警）。根因是
  0.2.0-rc.2 起 profile loader 会在装配前做 peer 兼容性判定
  （`dsh-app-boot` 的 `evaluatePluginCompatibility`：对运行时版本跑
  `semver.satisfies(runtime, peerRange, { includePrerelease: true })`），
  任一 `@deepseek-ai/dsh*` peer 不匹配就把整个 bundle 丢进 `skippedBundles`
  ——静默跳过。而 `^0.1.7-rc.2` 展开为 `>=0.1.7-rc.2 <0.2.0-0`，**不含
  0.2.x 行**，`includePrerelease` 也不放宽上界。现把
  `@deepseek-ai/dsh-session` / `@deepseek-ai/dsh-typert-protocol` /
  `@deepseek-ai/dsh-storage-domain` 三个 peer 范围补上 `|| ^0.2.0-rc.2`。
  实测：对同一个 profile 调用 core 自身的 `loadProfileDirectory`，
  `layers` 由 `[dsh-base, dsh-web-app]` + `skipped: [本插件]` 变为
  `[dsh-base, dsh-web-app, dsh-plugin-archived-conversations]` +
  `skipped: []`。
- 修复 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 写法：同一包
  写两条 `- 'pkg@version'` 时**只有第一条生效**——pnpm 的
  `evaluateVersionPolicy` 匹配到第一个同名规则就 `return`，第二条是死代码，
  结果是改动 primitives devDependency 后本地 `pnpm install` 与 CI 的
  lockfile 供应链策略校验直接失败。现改为单条规则 + `||` 版本并集
  （`'@deepseek-ai/dsh-client-ui-primitives@0.1.7-rc.2 || 0.2.0-rc.2'`），
  并在文件里写明原因；`pnpm install` 与 `pnpm install --frozen-lockfile`
  两条路径均已验证通过。

### 变更

- **新增构建期守卫 `scripts/check-peers.mjs`**：用与 core 完全相同的判据
  （`semver.satisfies(..., { includePrerelease: true })`，不自造近似实现）
  把 `SUPPORTED_CORE_VERSIONS`（`0.1.2-rc.1` / `0.1.5-rc.2` / `0.1.7-rc.2`
  / `0.2.0-rc.2`）逐条对着 package.json 里每个 dsh peer 范围校验，失败时
  直接给出「把范围改成什么」的具体文本。支持矩阵与 peer 范围从此不可能
  各自漂移；`pnpm run check` 与 CI 都会跑。
- 客户端冒烟测试的 primitives 种子加入第三代
  `0.2.0-rc.2（笔画名）`（构建输出改为
  `4 render phases × 3 primitives eras`）；种子导出表交叉比对的目标升级为
  已安装的 `@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2`，并在构建日志
  里打印实际校验到的版本。devDependency 同步升到 `^0.2.0-rc.2`。
- 新增 devDependency `semver@^7.7.0`（仅供 `check-peers.mjs` 使用）。
- 0.2.0-rc.2 的宿主/客户端契约逐项核对**无变化**，因此本次不需要改动
  `lib/` 与 `client/src/` 的任何代码：`dsh-session` /
  `dsh-typert-protocol` / `dsh-storage-domain` / `dsh-workspace` 的
  `lib/` 产物与 0.1.7-rc.2 逐字节相同；primitives 的两处差异是纯增量
  （新增 `MenuGroup` / `observeStickyMenuGroups` / `pointerModality`）；
  `dsh-client-modules`（`window.__ModuleLoader__` 契约）与
  `dsh-client-ui-slots` 逐字节相同；设置外壳的 `settings.section` 槽位、
  `id === "archived-sessions"` 的导航图标预留、`role="dialog" nav` 结构
  均未变。已实测：本插件的宿主 `./typert` 清单与客户端 contribution 都被
  0.2.0-rc.2 自己的 `TypertRegistry` 接受（严格 codec / schema / 调用描述
  全部通过）。发布产物 `client/client.js` 因此逐字节不变。

## [0.1.6] - 2026-09-25

### 修复

- 适配 DSH core 0.1.7-rc.2（实测症状：宿主日志
  `web boot: 1 entry did not activate / dsh-plugin-archived-conversations: failed`，
  设置页整页不出现）。三处核心契约变更逐一适配：
  - **Typert 清单改要 `create()` 工厂**：0.1.7-rc.2 的 loader 与 registry
    校验 `codec.create` / `schema.create` 必须是函数，网关按
    `codec.create().parse(value)` 解码，`schema` 字段不再被读取——客户端
    `$mount` 与宿主 `./typert` 注册都会因此整体被拒。现在两半程的每个
    wire codec 与 schema 记录同时携带 `schema`（≤0.1.5 读它）与
    `create`（≥0.1.7-rc.2 读它），同一份清单在两个运行时都通过校验。
  - **投影缓存冷读改按头部生命周期定位**：0.1.7-rc.2 把列表面从
    `cachedSnapshot(meta, inheritedEventCount, keys?)` /
    `cachedPredecessorTitle(meta, inheritedEventCount)` 改为
    `cachedSnapshot(meta, keys?)` / `cachedPredecessorTitle(meta)`；旧的
    cut 会被当作 `keys`（不可迭代的 brand 数字）抛错，整页每一行都退化成
    「无法读取」。现按声明元数判别，只对仍要求 cut 的运行时传入。
  - **primitives 图标整套改名**：0.1.7-rc.2 统一按笔画命名
    （`IconArchiveOutline20` → `IconArchiveOutlineRegular`、
    `IconTrashOutline16` → `IconTrashOutlineRegular` 等），带尺寸的旧名
    全部移除。新增 `client/src/icons.js`，用 `??` 在两代命名间解析，同一份
    产物在 0.1.5 线与 0.1.7-rc.2 线都能渲染。
- 修复设置页每一行都显示「无法读取：Receiver must be an instance of class
  ArchivedSessionsRemote」（批量操作同样会失败）：宿主服务类使用了 `#`
  私有成员，而 Cordis 的 `Context.get()` 会把服务包成 traceable `Proxy`
  （`getTraceable` → `createTraceable`），Typert 网关又用
  `Reflect.apply(method, ctx.get(serviceKey), args)` 派发——`this` 因此是
  那个 Proxy，V8 的私有品牌检查在 Proxy 上必然抛错。官方宿主服务里
  `this.#x` 出现次数为 0，这也是它一直没被发现的原因。现把
  `_coldProjections` / `_matchProject` / `_lastArchived` 换成普通
  下划线成员，并在 `scripts/check-host.mjs` 加了构建期守卫（`pnpm check`
  与 CI 都会跑），`#` 一旦回归即失败。

### 变更

- 客户端构建冒烟测试升级为「物化 → 激活 → 渲染」三段式：在 mock 的客户端
  Context 上真正执行一遍 `apply`，对 4 个页面状态 × 2 代 primitives 种子
  渲染并遍历结果树，任何元素类型为 `undefined`（primitives 导出改名或移除
  的直接症状）都会让构建失败；同时校验每个远程 codec 都带 `create()` 工厂、
  样式表标签满足 `data-plugin`/`data-plugin-css` 契约，并在已安装
  primitives 时把种子导出表与真实包的导出表交叉比对。
- peer 依赖范围补充 `^0.1.7-rc.2`；devDependency
  `@deepseek-ai/dsh-client-ui-primitives` 升到 `^0.1.7-rc.2`（构建期校验的
  目标面）。
- `pnpm run check` 新增宿主守卫 `scripts/check-host.mjs`（服务类禁用 `#`
  私有成员，附失败原因的完整说明）；CI 无需改动，跑的就是这条命令。

## [0.1.5] - 2026-09-16

### 修复

- 修复「已归档对话」中部分历史会话显示为**未命名**的问题：DSH core
  0.1.5 的投影缓存身份校验新增 `formatVersion`，格式迁移（如 v0/v2 日志
  规范化到 v3）前写入的检查点没有该字段，严格读取必然未命中，标题被丢弃。
  现按核心 `projectionsFor` 的两级阶梯，在严格读取未命中时退回
  `cachedPredecessorTitle`（仅标题、行版本与 schema 仍由注册表复核），
  历史会话的标题得以恢复；该调用带特性守卫，旧运行时自动跳过。
- peer 依赖范围补充 `^0.1.5-rc.2`（适配 DSH core 0.1.5-rc.2 / Desktop
  2.0.10；`formatVersion` 与 predecessor 标题阶梯均在该线引入）。
- 设计文档 3.3 节更新为两级阶梯说明。

## [0.1.4] - 2026-09-05

### 修复

- 适配 DSH core 0.1.2-rc.1（Desktop 2.0.5 集成环境）：宿主远程失败改用
  dsh-typert-protocol rc 线的 `RemoteError`（构造参数 `(code, message,
  details)`），业务失败判别改用结构标记 `remoteErrorOf`——此前导入的
  `TypertRemoteFailure` 在该版本已移除，会直接导致宿主半程加载失败。
- 冷会话行投影读取对齐 rc 线签名：`sessionProjectionCache.cachedSnapshot
  (header, SessionLogOffset(0))`，并跳过 seeded（继承日志）会话——与核心
  会话列表 `projectionsFor` 的零 I/O 阶梯一致；新增 peer 依赖
  `@deepseek-ai/dsh-session`。

## [0.1.3] - 2026-09-02

### 变更

- 品牌统一：GitHub 仓库更名为 `dsh-plugin-archived-conversations`（与插件名
  一致）；同步 `repository`/`homepage`/`bugs` 元数据与 README、贡献文档、
  issue 模板、AGENTS.md 中的仓库链接。旧地址自动跳转，目录条目随后更新。

## [0.1.2] - 2026-09-01

### 修复

- 彻底修复设置页样式「有时不生效」的问题：注入时机从 `apply()` 提前到模块
  物化阶段（遵循 DSH 客户端 CSS 约定：带 `data-plugin` + `data-plugin-css`
  标记，由模块系统的 `claimStyles` 登记为插件自有样式表）；
  样式表改为**永不随插件卸载删除**（此前 dispose 路径的 `tag.remove()`
  与重挂载交叠会留下「组件正常、样式全无」的页面）；
  并在设置页每次打开时（绘制前）幂等地重新断言样式表存在。
- 构建冒烟测试补齐缺失的原语种子（`Menu`、`IconEllipsisOutline16`、
  `useLayoutEffect`）。

## [0.1.1] - 2026-09-01

### 修复

- 设置面板打开瞬间导航图标闪现（图标替换改为 MutationObserver 驱动，回调
  在绘制前以微任务执行，首帧即显示归档图标；保留 1s 轮询兜底）。
- 修正 `lib/typert.js` 模型文档字符串（`unarchiveAll`/`deleteAll` 签名与
  `ArchivedSessionItem` 声明）。
- 重装依赖（primitives 0.1.2-alpha.3）并重建 pnpm-lock.yaml。

## [0.1.0] - 2026-08-31

### 新增

- 设置 →「已归档对话」页面：按归档顺序倒序列出全部已归档对话。
- 行操作：取消归档（恢复到侧边栏原位置）、永久删除（二次确认）。
- 「全部取消归档」批量操作。
- 远程 API `archivedSessions`（`list` / `archive` / `unarchive` /
  `deleteSession`），Typert 协议 + 严格 zod wire codec。
- 与侧边栏归档动作的实时双向同步；坏行自愈删除；中英双语；明暗主题。

### 变更

- 补齐发布所需的社区与市场规范：`repository`/`homepage`/`bugs`/
  `keywords`/`engines` 等 npm 元数据；发布前自动构建校验（`prepack`）。
- 新增 CONTRIBUTING.md、CODE_OF_CONDUCT.md、SECURITY.md、CHANGELOG.md、
  issue/PR 模板与 CI 工作流。
