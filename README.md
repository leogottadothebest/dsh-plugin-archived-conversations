# dsh-plugin-archived-conversations

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![ci](https://github.com/leogottadothebest/dsh-plugin-archived-conversations/actions/workflows/ci.yml/badge.svg)](https://github.com/leogottadothebest/dsh-plugin-archived-conversations/actions/workflows/ci.yml)

> English: A DeepSeek Harness plugin for managing **archived conversations** in
> the Settings UI — unarchive them back to the sidebar, or permanently delete
> them (with confirmation). Ships a full `archivedSessions` remote API and
> batch unarchive. Bilingual (zh/en), light/dark theme aware.

DeepSeek Harness 插件：在**设置界面**管理**已归档对话**。

- **取消归档** —— 对话恢复到侧边栏原位置（工作区记账保持不变）；
- **删除** —— 永久删除对话（内存会话、磁盘日志 `session.jsonl.zstd`、
  工作区记账与归档记录一并清理），带二次确认；
- 附带完整归档 API（`archive`，与核心归档路径一致），并支持「全部取消
  归档」批量操作。

对话被归档后不再出现在侧边栏；本插件是找回并清理它们的唯一入口。

## 功能

- 设置 →「已归档对话」页面，按归档顺序倒序列出全部已归档对话：标题、
  工作区路径、最近活动时间；
- 行操作：**取消归档**、**删除**（`RiskConfirmation` 确认，需勾选
  「我明白此操作不可恢复」）；
- 实时双向同步：在侧边栏归档的对话立即出现在本页；在本页取消归档的
  对话立即回到侧边栏；
- 读取失败的坏行仍可删除（自愈）；
- 中英双语，跟随浅色/深色主题。

## 安装

DSH 插件需要两步：作为依赖安装 + 挂载为 bundle 层（本包自带
`dsh.bundle.patch`，即 `cordis.patch.yml` 中的插入条目）。

```bash
# 桌面端（以默认 profile 为例）：从 npm registry 安装
cd ~/.dsh/profiles/desktop
pnpm add dsh-plugin-archived-conversations

# 本地开发时也可从源码路径安装（替换为你的克隆路径）
# pnpm add /path/to/dsh-plugin-archived-conversations

# 把插件追加到 bundle 层：编辑 package.json，在 dsh.profile.bundles 中
# 加入 "dsh-plugin-archived-conversations"（dshmarket / 插件市场安装
# 插件时执行的正是这两步）。
```

然后重启 DeepSeek Harness，打开 设置 → **已归档对话** 即可使用。也可在
插件市场（dsh-community-market）中安装本包（需发布到 npm registry）。

## 远程 API（宿主）

命名空间 `archivedSessions`（Typert 协议，严格 zod wire codec）：

| 方法 | 参数 | 返回 |
| --- | --- | --- |
| `list(signal)` | — | `{ items: ArchivedSessionItem[], archivedSessionIds: string[] }` |
| `archive(request, signal)` | `{ sessionId }` | `{ sessionId, archivedSessionIds }` |
| `unarchive(request, signal)` | `{ sessionId }` | `{ sessionId, archivedSessionIds }` |
| `deleteSession(request, signal)` | `{ sessionId }` | `{ sessionId, deleted: true }` |

`ArchivedSessionItem`：

```ts
interface ArchivedSessionItem {
  sessionId: string
  title: string | null          // 投影缓存中的标题
  cwd: string | null            // 工作区路径
  createdAt: number | null      // epoch ms
  updatedAt: number | null      // 最近活动（lastPromptAt ?? createdAt）
  running: boolean              // 会话当前是否仍在内存中
  readError: string | null      // 行读取失败原因（仍可删除）
}
```

业务错误（`{ok:false, error:{code, message, details}}`）：
`not-archived`、`live-detach-unsupported`、`unsupported-backend`。

## 兼容性

| DSH core | 状态 |
| --- | --- |
| `0.1.7-rc.2`（当前 Desktop） | ✅ 已验证（清单 `create()` 工厂 + 头部绑定的投影缓存 + 笔画名图标） |
| `0.1.5-rc.2`（Desktop 2.0.10） | ✅ 兼容（`schema` codec + 带 cut 的投影缓存 + 尺寸名图标） |
| `0.1.2-rc.1` 及更早 | 兼容（同上，旧线） |

同一份产物在两条线上都能渲染与调用：wire codec 同时携带两个时代的字段，
投影缓存按声明元数判别签名，图标按 `??` 在两代命名间解析。

## 开发

宿主半程是纯 ESM（`lib/index.js`，`lib/typert.js` 经
`dsh-typert-loader` 自动注册，无需构建）。**客户端半程必须构建**：DSH
浏览器运行时把每个插件的 `./client` 导出当作经典脚本加载，要求它通过
`window.__ModuleLoader__.load({ id, factory })` 注册 CJS 工厂——裸 ESM
会导致页面启动失败。源码在 `client/src/`，发布产物是
`client/client.js`（zod 内联打包；react / jsx-runtime / primitives 走
平台种子模块外部化）。

```bash
pnpm run build:client            # 生成 client/client.js（含冒烟测试）
pnpm run check                   # 构建 + 宿主语法检查（CI 跑的就是它）
```

构建脚本自带三段式冒烟测试，任何一段失败都会让构建（以及 CI、`prepack`）
失败：

1. **物化**：产物必须注册 `window.__ModuleLoader__.load({id, factory})`
   工厂并导出 `apply`/`inject`；
2. **激活**：在 mock 的客户端 Context 上真正跑一遍 `apply`——校验
   `settings.section` 注册、每个远程 codec 都带 `create()` 工厂、
   样式表标签满足 `data-plugin`/`data-plugin-css` 契约；
3. **渲染**：对 4 个页面状态 × 2 代 primitives 种子（尺寸名 / 笔画名）
   各渲染一遍并遍历结果树，任何元素类型为 `undefined` 立即失败——这正是
   primitives 导出改名在浏览器里的症状（整页空白）。种子导出表还会与已
   安装的 `@deepseek-ai/dsh-client-ui-primitives` 真实导出表交叉比对。

改完客户端源码后需重新构建并重装（`file:` 安装时 pnpm 会重新复制包）。

客户端组合所需的官方包在 `package.json` 的 `dsh.client.inject` 中声明。

## 架构与设计决策

见 [DESIGN.md](./DESIGN.md)：核心归档机制的现状分析、删除顺序
（flush → detach → 删文件 → registry 清理）、实时同步链路、风险与取舍。

## 社区与发布

- 问题与功能建议：在
  [Issues](https://github.com/leogottadothebest/dsh-plugin-archived-conversations/issues)
  提交（[Bug 模板](./.github/ISSUE_TEMPLATE/bug_report.yml) /
  [功能模板](./.github/ISSUE_TEMPLATE/feature_request.yml)）。
- 参与开发：[CONTRIBUTING.md](./CONTRIBUTING.md)；行为准则：
  [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)；安全漏洞请走
  [SECURITY.md](./SECURITY.md) 的私有报告渠道。
- 发布 npm：`pnpm publish`。`prepack` 钩子会自动重新构建客户端产物并做
  宿主语法检查，保证发布的 tarball 永远包含最新 `client/client.js`。
  CI 同时校验产物与源码一致。
- 上架插件市场：向
  [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
  提 PR 添加一条条目（dshmarket 等市场自动收录）。目录会校验 npm 包的
  `repository` 字段与条目仓库一致（防冒名）。

## License

MIT
