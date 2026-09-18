# dsh-source-control

**DSH 原生右侧栏里的源代码管理面板** —— 改动、暂存、提交、diff、分支切换与合并、抓取/拉取/推送、冲突清单、**Git worktree**，全部长在 DeepSeek Harness 自己的右侧栏标签系统里。

一句话：把 VS Code 那栏「源代码管理」搬进 DSH，并且**只用官方扩展点实现**，不跟外壳抢布局。

```
会话 → 右侧栏 → 「+ 新标签页」 → 源代码管理
```

## 为什么不是照抄 dsh-solution-explorer

[dsh-solution-explorer](https://github.com/xiaoksio/dsh-solution-explorer) 1.0.0 的做法是**自建一列**：把自己 append 进宿主 frame，然后直接改写宿主的 `grid-template-columns`。这套写法在 DSH **0.1.6-alpha.2** 上失效了——0.1.6 的 frame 是 `div.<hash>_frame` 这种 CSS Modules 哈希类 + 四列显式网格，列宽由外壳 React 持续重写，插件写进去的值 2 秒内被改回，于是它的列恒为 1px 且 `visibility:hidden`（实测细节见 [docs/why-native-tabs.md](docs/why-native-tabs.md)）。

本插件只走官方扩展点：

| 面 | 用的接口 |
|---|---|
| 标签类型 | `ctx.sidebarRightTabs.register({ id, kind, title, guide })` |
| 标签体 | `ctx.slots.register` 挂 `sidebar.right.pane.tab`（按类型 id 做 key） |
| 宿主能力 | `ctx.webServer.register({ kind: 'prefix', … })` 一条 JSON 路由 |
| 会话工作区 | `ctx.sessions.get(id).header.cwd` |
| 工作区注册 | `ctx.workspaceRegistry.create/delete`（可选服务，缺失即降级） |

外壳怎么改布局，都只会**挪动**这个标签，不会让它消失。

## 功能

**改动**：已暂存 / 更改 / 未跟踪 / 冲突四组（`M A D R U` 徽标、重命名显示 `旧 → 新`、目录名旁注）；单文件＋暂存、−取消暂存、↩放弃改动（二次确认），组头批量；点行展开该文件统一 diff（未跟踪文件按全新增展示）；提交框支持 `Cmd/Ctrl+Enter` 提交并实时显示已暂存数。

**同步**：抓取（`fetch --prune`）、拉取（`pull --ff-only`）、拉取(合并)（`pull --no-rebase`）、推送（必须二次确认）；显示上游与 `↑ahead ↓behind`，多远程可选目标。

**分支**：本地＋远程跟踪分支列表（当前分支置顶，带 short hash 与首行提交信息）；切换 / 合并到当前分支 / 删除 / 新建并切换。
新建分支可选**来源**：默认当前 HEAD，也可任选某个本地或远程分支（从远程分支建时 git 会自动建立跟踪关系），回车即可创建。

**工作树**：
- 列出仓库全部 worktree（主树、分支、HEAD、脏标记）
- 新建默认落在托管目录 `$DSH_HOME/source-control/worktrees/<仓库名>/<名字>`，分支默认 `wt/<名字>`，可指定基点
- **建好即注册为 DSH 工作区**，可直接在「新建会话」里选中它，把任务隔离在独立签出里并行跑
- 删除（脏树要求强制）、清理失效记录（`worktree prune`）；删除时同步注销工作区注册，不留悬空项

**历史**：最近提交（hash / 标题 / 作者 / 日期）。

## 安装

```sh
# 从 GitHub 装
dsh plugin --profile web add github:jackchen13755/dsh-source-control

# 从本地源码装（开发用，热改即生效）
dsh plugin --profile web add link:/path/to/dsh-source-control
```

装完硬刷新浏览器（Cmd/Ctrl+Shift+R）。

## 配置

都写在 profile 的 `cordis.patch.yml` 行内（均有默认值）：

```yaml
- insert:
    - id: source-control
      name: 'dsh-source-control'
      config:
        recentCommits: 20        # 历史条数
        pollMs: 5000             # 面板轮询间隔，0 = 关闭自动刷新
        defaultRemote: origin    # 同步默认远程，空 = 用分支自己的 upstream
        worktreeHome: ''         # 工作树托管目录，空 = $DSH_HOME/source-control/worktrees
```

## 安全模型

这个插件跑真实 git 写操作，边界是设计出来的：

1. **只监听本机**：非 loopback 请求一律 `403`。
2. **调用方不能指定路径**：请求只带 `sessionId`，宿主从会话存储解析工作目录；之后**任何**仓库路径必须落在该工作目录、已注册工作区或工作树托管目录之内（符号链接先 `realpath` 再比较）。伪造 `sessionId`、`/etc`、`../../..` 全部 `403`，集成测试逐条断言。
3. **不拼 shell**：所有 git 调用走 `execFile('git', argv)`，分支名/文件名/远程名永远只是 argv。
4. **只收 JSON POST**：GET、表单、`<img>` 触发不到任何操作；请求体上限 512 KB。
5. **破坏性操作必须显式确认**：`discard` / `push` / `branch-delete` / `worktree-remove` 要求 `confirm: true`，面板对应 `window.confirm`。
6. **凭据不外泄**：`GIT_TERMINAL_PROMPT=0`，凭据交给本机既有 credential helper / SSH agent；插件不存 token，也不给模型注册任何自动推送工具。

## 开发

零依赖离线构建：**不需要 `npm install`**（本机 npm 缓存坏掉也能编）。

```sh
bash scripts/build.sh                                     # host 半 tsc → lib/；client 半 tsc + 自写 CJS 内联 → lib/client.js
node scripts/smoke-client.mjs                             # 浏览器半冒烟：按 ModuleLoader 契约加载并断言注册
bash scripts/smoke-host.sh <session-id> [scratch-dir]     # 宿主半集成测试（27 项，含围栏拒绝用例）
```

- 类型来自真实 DSH 安装：脚本自动探测 `$DSH_HOME/profiles/*`、`$DSH_CHECKOUT`、npx 缓存，可用 `DSH_CHECKOUT=` 指定。
- 浏览器半不引入打包器：`scripts/bundle-client.mjs` 把 tsc 产出的 CJS 模块图按**惰性工厂**内联成 `window.__ModuleLoader__.load({...})` 单文件；React 等产品自带包保持 external，由 loader 解析。

## 架构

```
src/index.ts          host 插件体：配置 + 挂路由
src/host/git.ts       git plumbing（argv 构造、porcelain 解析、status/branches/diff/log）
src/host/worktree.ts  worktree 增删查清 + 工作区注册/注销
src/host/fence.ts     信任围栏：loopback + sessionId → 工作目录 → 路径解析
src/host/services.ts  用到的宿主服务（结构化声明，避免与上游 d.ts 版本耦合）
src/host/routes.ts    POST /dsh-source-control/<op>，统一 {ok, value|error} 信封
src/client/index.ts   注册标签类型 + 标签体插槽 + 指南入口
src/client/panel.ts   面板 UI（React createElement，无 JSX、无状态库）
src/client/api.ts     路由的类型化客户端
```

操作面：`context` `status` `diff` `log` `branches` `stage` `unstage` `discard` `commit` `switch` `branch-create` `branch-delete` `merge` `fetch` `pull` `push` `init` `worktree-list` `worktree-add` `worktree-remove` `worktree-prune`

## 兼容性

- 实测：**DSH 0.1.6-alpha.2**（macOS，web profile）——真机验证覆盖：指南入口出现、面板渲染、真实仓库下暂存→提交（git log 核对）、diff 展开、UI 新建工作树并注册为工作区、删除工作树并注销。
- 声明下限：`dsh >= 0.1.5-rc.1`（原生标签接口引入版本）。

## 已知边界

- 冲突**只列文件**，不提供三方合并编辑器：改完文件后 `＋` 暂存即可。
- 不做 `rebase` / `cherry-pick` / `stash` / `tag` / `submodule` / 强制推送 —— 有意留白，避免一键毁历史。
- 主操作按钮（新建分支 / 新建工作树 / 提交）**始终可点**：条件不满足时点它会直接说明缺什么（例如「请先填写提交信息」），不做成看起来一样、点了没反应的禁用态。
- `pull` 默认 `--ff-only`；分叉时明确提示改走「拉取(合并)」，不做隐式 merge。
- 只服务会话工作目录可达的仓库（这是围栏的代价，也是它的意义）。

## License

MIT
