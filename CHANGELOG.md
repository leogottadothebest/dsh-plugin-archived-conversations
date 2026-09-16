# Changelog

本项目的所有显著变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
