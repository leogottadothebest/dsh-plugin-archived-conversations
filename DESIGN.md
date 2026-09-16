# dsh-plugin-archived-conversations 设计文档

为 DeepSeek Harness 设计的插件：在**设置界面**管理**已归档对话**，提供
**取消归档**与**永久删除**两个操作。

## 1. 背景与现状

深入研读了 DSH core 0.1.5-rc.2（Desktop 2.0.10 集成环境）的核心实现后确认
（初稿基线为 alpha.1 / Desktop 2.0.4，0.1.4 适配 0.1.2-rc.1 / 2.0.5）：

- **归档能力已内建于工作区域（`dsh-workspace`）**：`WorkspaceRegistry`
  持有 registry 级持久状态 `archivedSessionIds`（`workspace.json` 的全局
  状态），`archiveSession(id)` 将其加入集合。侧边栏会话行菜单（
  `dsh-client-ui-workspace`）已有「归档会话」入口，通过
  `remote.workspace.archiveSession` 调用；会话列表的所有分组投影都会
  过滤掉已归档 id（`sessionVisible` 检查 `archived.has(id)`）。
- **缺口一：没有取消归档。** 核心代码里只有 `archiveSession`，没有
  `unarchiveSession`；归档后侧边栏里无法再找到该对话。
- **缺口二：没有删除。** `dsh-session` 的 `SessionStore` 只有
  `enter()` 返回的 detach disposer（归属创建者 fiber），没有按 id 的
  公开移除 API；`session-persistence-jsonl` 后端也没有删除接口；会话
  控制器远程 API（`session/*`）不含 delete。
- **因此归档成了单向操作**——用户只能把对话藏起来，既不能恢复，也不能
  清除。本插件补上这两个缺失的半程，并把入口放在设置界面。

## 2. 架构总览

```
┌────────────────────────────────────────────────────────────────┐
│ 宿主 (host)                                                      │
│  lib/index.js   ctx.plugin(ArchivedSessionsRemote)               │
│  lib/typert.js  ./typert 导出 → dsh-typert-loader 自动注册        │
│  lib/remote.js  ArchivedSessionsRemote (TypertRemoteService)     │
│      注入: workspaceRegistry / sessionPersistence / sessions /   │
│            sessionProjections / sessionProjectionCache           │
│      方法: list · archive · unarchive · deleteSession            │
│                                                                  │
│  关键交互:                                                        │
│   · 取消归档 → registry.enqueueOperation + setState              │
│     (workspace.json 全局态) → storage-domain 发 domain/changed    │
│     → workspace feed 广播 {type:"archived"} 增量 → 客户端          │
│     workspaces 存储更新 → 侧边栏恢复该对话                        │
│   · 删除 → flush(公开) → detachLiveSession(受守卫的逃生通道)      │
│     → rm 会话目录 → registry 清理(归档集合 + 工作区 sessionIds)    │
└────────────────────────────────────────────────────────────────┘
                         ▲ Typert 网关 (strict + SRC 双保险)
┌────────────────────────────────────────────────────────────────┐
│ 客户端 (client)                                                   │
│  client/index.js   $mount(TYPERT_REMOTE) → remote.archivedSessions│
│                    + settings.section 槽位注册                    │
│  client/typert.js  严格 zod wire codec（与宿主清单同构）           │
│  client/controller.js  页面快照存储 + 动作 + 归档集合实时订阅      │
│  client/page.js    React 页面（行操作 + RiskConfirmation 确认）   │
│  注入: remote / slots / locale / workspaces                      │
│   · 订阅客户端 workspaces 服务 → 侧边栏归档动作实时反映到本页      │
└────────────────────────────────────────────────────────────────┘
```

## 3. 宿主端设计

### 3.1 远程命名空间 `archivedSessions`

采用 Typert 协议（与全部官方 `dsh-api-*` 一致）：

- `ArchivedSessionsRemote extends TypertRemoteService`，服务键
  `archivedSessionsRemote`，wire 命名空间 `archivedSessions`。
- **宿主清单**通过 `package.json` 的 `exports["./typert"]` 提供，由
  `@deepseek-ai/dsh-typert-loader` 在本插件 loader entry 挂载时自动
  注册进 `ctx.typert`（卸载时自动撤回）——这是官方为第三方插件预留的
  路径（见 `dsh-typert-loader` 文档：`./typert` 导出的 `TYPERT` 清单）。
- 清单含 zod v4 严格 codec + 完整 FaceModel（services/members/types），
  全部通过 `dsh-typert-loader` 的校验规则。
- 网关解析顺序：先查严格描述符（本插件注册了），缺失时回落到 SRC 模式
  （`typertRemote` 绑定 + 方法签名推导）——双保险，即使某次升级收紧了
  清单校验，服务仍可被调用。

### 3.2 方法

| 方法 | 参数 | 行为 |
| --- | --- | --- |
| `list(signal)` | — | 按归档顺序倒序（最近归档在前）列出全部已归档对话。每行：标题、cwd、创建/最近活动时间、是否仍在内存中、读取错误（如有）。 |
| `archive(request, signal)` | `{sessionId}` | 委托 `workspaceRegistry.archiveSession`（保持与核心归档路径完全一致）。 |
| `unarchive(request, signal)` | `{sessionId}` | 在 `enqueueOperation` 串行链中从 `archivedSessionIds` 移除该 id（幂等）。 |
| `deleteSession(request, signal)` | `{sessionId}` | 见 3.3。 |

### 3.3 行投影（零 I/O 阶梯）

与 `api-session-controller` 的 `projectionsFor` 同构（core 0.1.5 起为两级）：

- **live 会话**：`sessionProjections.cachedSnapshot(session)`；
- **冷会话**：`sessionPersistence` 头（`registry.readSessionHeader`）+
  `sessionProjectionCache.cachedSnapshot(header, SessionLogOffset(0))`
  （`session_projcache` 持久投影缓存，按
  `{formatVersion, createdAt, cwd, isSeeded, inheritedEventCount}` 身份
  校验，绝不读错生命周期）；严格读取未命中时再退一级
  `cachedPredecessorTitle(header, SessionLogOffset(0))`——**格式迁移前写入的
  检查点没有 `formatVersion`**，严格身份必然不匹配，但同一生命周期的标题行
  仍然有效（行版本 + schema 由注册表复核），这一级专门把这类历史会话的标题
  捞回来，避免误显示为「未命名」；
- seeded（继承日志）会话不读缓存：需要尾部读取，缓存无法提供。

读不到的坏行**不失败整页**：返回 `readError` 字段，页面仍可对该行执行
删除（自愈：删除时归档集合清理照常进行）。

### 3.4 删除顺序（关键）

删除一个已归档会话，顺序严格为：

1. **校验**：id 必须在 `archivedSessionIds` 中，否则 `not-archived`。
2. **flush**：若会话 live，先 `SessionStore.flush(session)`（公开 API），
   把缓冲事件全部落盘——这一步保证随后删文件不会丢失数据、也不会被
   滞留的写后批次重新物化。
3. **detach**：`SessionStore` 没有按 id 的公开移除面，因此使用受守卫的
   逃生通道——`sessions.store`（公开 Map）+ `detachEntered(entry)`
   （公开方法）。detach 触发 `session/disposed`，驱动持久化层退休排空
   （此时已无待写内容，为空操作）。若未来版本收窄该面（特性检测
   `typeof detachEntered === "function" && store instanceof Map`），
   抛 `live-detach-unsupported` 业务错误，绝不下坏手。
4. **删文件**：`sessionPersistence.locate(header)`（jsonl 后端公开的
   路径解析）得到 `session.jsonl.zstd` 路径，递归删除其目录。
   后端无 `locate` 时抛 `unsupported-backend`。
5. **registry 清理**（一次 `enqueueOperation` 内，与其它工作区写串行）：
   - `setState` 从 `archivedSessionIds` 移除；
   - 遍历 `registry.list()`，命中 `entity.sessionIds` 的实体调用
     `entity.detachSession(id)`（工作区记账清理）。
   - `session_projcache` 无需清理：投影缓存行带身份校验，孤儿行天然
     失效（"possibly stale but never wrong"）。

域写经由 `domain.global.set` → 广播 `domain/changed` → 工作区 feed
重投影 → 客户端列表/侧边栏自动消失，无需插件再通知任何一方。

### 3.5 错误语义

业务失败统一 `new RemoteError(code, message, details)`（dsh-typert-protocol
rc 线起取代旧名 `TypertRemoteFailure`；判别一律走结构标记
`remoteErrorOf`，不做 `instanceof`），客户端收到
`{ok:false, error:{code, message, details}}`：

- `not-archived` —— 目标不在归档集合；
- `live-detach-unsupported` —— 构建版本收紧了内部面，建议稍后重试；
- `unsupported-backend` —— 持久化后端不暴露会话产物路径。

## 4. 客户端设计

### 4.1 命名空间挂载

客户端 `apply` 中 `await ctx.remote.$mount(TYPERT_REMOTE)`，把
`remote.archivedSessions` 服务装到客户端根上下文。注意**本插件自身不
能在 `inject` 里声明 `remote.archivedSessions`**（那是它自己创建的，
声明会永久停驻等待自己）——官方 `dsh-api-remotes` 的挂载者同样是只注入
`remote`。挂载完成后用 `ctx.get("remote.archivedSessions")` 惰性取用。

方法名避开命名空间服务保留名（`ctx/empty/invokeRemote/methods/name/
namespace/has/install/installDirect/installScoped/remove`），故删除方法
命名 `deleteSession` 而非 `remove`。

### 4.2 设置界面入口

注册 `settings.section` 槽位（list 槽，选项 `id/order/label`，inject 面
传 `page` 控制器与 `t`）：

- `id: "archived-conversations"`、`order: 30`（位于「插件」与市场页之间）；
- 中英双语字典（`locale.register(NS, {zh, en})`，键集完全对齐）。

### 4.3 页面

- `useSyncExternalStore` 消费控制器快照：`{phase, items,
  archivedSessionIds, message, pending}`。
- 每行：标题（缺省「未命名对话」）、工作区路径、最近活动相对时间
  （复用 `relativeTime` + 本插件字典）、读取错误徽标；行操作：
  **取消归档**、**删除**。
- 删除走 `RiskConfirmation`（警告 + 勾选「我明白此操作不可恢复」才可
  确认），确认后调用 `deleteSession`。
- 头部提供「全部取消归档」批量操作（客户端顺序调用，结束统一刷新）。
- 空态 / 加载态 / 错误态（带重试）；操作结果用 5 秒自动消退的横幅反馈。

### 4.4 实时性

- **出方向**（取消归档 → 侧边栏）：宿主 registry 写 → `domain/changed`
  → 工作区 feed `{type:"archived"}` 增量 → 客户端 `workspaces` 存储
  更新 → 侧边栏会话树立即恢复该行。零额外代码。
- **入方向**（侧边栏归档 → 本页）：页面控制器订阅客户端 `workspaces`
  服务的 `list` 快照（`getSnapshot().archivedSessionIds`），集合变化即
  重新拉取明细。为此客户端 `inject` 声明 `workspaces` 并确保
  `@deepseek-ai/dsh-api-workspace-controller` 参与客户端组合。

## 5. 包结构与安装

```
package.json          # exports: "." / "./typert" / "./client"；dsh.bundle.patch + dsh.client.inject
cordis.patch.yml      # bundle 补丁：insert 条目 {id: archived-conversations, name: 本包}
lib/index.js          # 宿主入口 apply(ctx)
lib/typert.js         # 宿主 TYPERT 清单（zod codec + FaceModel）
lib/remote.js         # ArchivedSessionsRemote
client/index.js       # 客户端入口（$mount + 槽位注册）
client/typert.js      # 客户端 TYPERT_REMOTE
client/controller.js  # 页面控制器
client/page.js        # React 设置页面
client/locale.js      # zh/en 字典
client/styles.js      # 注入式样式（dshAcv- 前缀）
```

安装方式与官方第三方插件一致，**两步缺一不可**：

1. 把本包加入 profile 依赖（桌面端 `~/.dsh/profiles/desktop` 下
   `pnpm add <本包路径>`，或经插件市场安装到 npm 包）；
2. 把包名加入 profile 清单的 `dsh.profile.bundles`——DSH 的 loader 条目
   全部来自 bundle 补丁层（`dsh.bundle.patch` 的 insert 行）与 profile
   自身的 `cordis.patch.yml` 用户层，**依赖本身不会自动成为条目**（这是
   首次安装只做了第 1 步导致设置页没有入口的直接原因）。

重启后生效。`dsh.client.inject` 声明客户端组合所需的官方包；
`dsh-typert-loader` 在 entry 挂载时自动注册宿主清单。

## 6. 风险与取舍

- **受守卫的内部面**：`detachEntered`/`store` 是编译产物中可达但未进入
  契约的表面，已特性检测 + 明确业务错误兜底；这是插件能在无公开删除
  API 的核心上完成「删除已打开会话」的唯一路径。
- **删除运行中会话**：归档集合里的会话一般已结束；若 agent 仍在运行，
  删除后事件仅不再持久化/广播，循环在内存中继续（不会崩溃）。页面文案
  已强调不可恢复。
- **归档时间**：核心只保存 id 数组、无时间戳；页面如实展示「最近活动
  时间」而非杜撰「归档时间」。
- **客户端双刷新**：本页动作与 workspaces 订阅可能各触发一次刷新，
  幂等无害。
- 插件不重写核心包；升级 DSH 后若内部面变化，`detachLiveSession` 会
  优雅降级为明确错误而非损坏数据。
