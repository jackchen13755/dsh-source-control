# 为什么用原生标签，而不是自建一列

这份笔记记录了本插件选型的实测依据（DSH **0.1.6-alpha.2**，macOS，web profile）。结论先说：**在 0.1.6 上，「把自己 append 进宿主 frame 再改写网格」这条路线已经走不通**，凡是这样做的插件都会静默失效。

## 现象

把一个按 0.1.5-rc.x 写的侧栏插件（自建列式实现）装进 0.1.6-alpha.2 后：

- 宿主路由正常、client bundle 正常加载（HTTP 200）、它的「编辑器」这类走原生插槽的功能能用；
- 但**自己那一列渲染不出来**：`[data-solution-explorer]` 宽度恒为 1px，且内联样式带 `visibility: hidden`；
- 点它自己的 rail 图标（文件浏览器 / 源代码管理 / 收起面板）无效；
- 展开原生右侧栏（`[data-rightbar-col]` 变成 864px）也一样无效。

## 根因链

1. 这类插件靠 `findFrame()` 找宿主 frame：首选 `[data-dsh-frame]`，回退 `[class*="sidebarCol"]` 的父元素。
   **0.1.6 运行时已不存在 `[data-dsh-frame]`**（在该版本的 shell 包里也 grep 不到这个字符串）。
2. 找到 frame 后，插件用 `applyGrid()` 直接写 `frame.style.gridTemplateColumns`，前提是能解析出 ≥3 条 track。
3. 0.1.6 的 frame 实际长这样：

   ```
   div.pI_x6G_frame            ← CSS Modules 哈希类，无 data-dsh-frame
     display: grid; grid-template-columns: 280px minmax(0,1fr) 0px 0px
     子元素: [class] [data-dsh-center-col] [data-rightbar-col]
             [data-shell-overlay] [data-side] [data-solution-explorer] [data-overlapped]
   ```

   四列是显式声明且有主的（左栏 / 会话 / 右栏 / 预留），插件追加的那一列落进**隐式轨道** → 尺寸塌成 0/1px。
4. 决定性实验：手动把插件本该写入的值灌进去

   ```js
   frame.style.gridTemplateColumns = '280px minmax(0, 1fr) 0px 300px'
   panelCol.style.visibility = 'visible'
   ```

   **2 秒内被外壳 React 原样改回** `280px minmax(0px, 1fr) 0px 0px`，`visibility` 也回到 hidden。
   即：这一版的 frame 样式由外壳持有并持续重写，插件**没有**合法的写入窗口——不是配置问题、不是版本号问题，是路线问题。

## 0.1.6 提供的正路

DSH 0.1.6 的右侧栏把「新标签类型」做成了公开扩展点，两段式注册：

```ts
// ① 类型（静态）：谁、什么 kind、指南入口长什么样
ctx.inject(['sidebarRightTabs'], injected => {
  const tabs = injected.get('sidebarRightTabs')
  return tabs.register({
    id: 'my-plugin:scm',
    kind: 'source-control',
    title: () => '源代码管理',
    guide: [{ id: 'scm', order: 30, title: () => '源代码管理', description: () => '…' }],
  })
})

// ② 标签体（运行时）：挂进 keyed 插槽，key = 上面的 id
ctx.slots.inject('sidebar.right.pane.tab', () =>
  ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: 'my-plugin:scm', inject: (sessionId) => ({ sessionId }) },
    MyPanel,
  ),
)
```

要点与坑：

- 插槽 `sidebar.right.pane.tab` 是 **keyed** 槽，`key` 必须等于类型定义里的 `id`；组件是 React 组件（`(props) => ReactNode`）。
- `inject` 工厂的参数是**当前标签所在会话的 sessionId**，这是面板拿到上下文的正规入口。
- 服务 `sidebarRightTabs` 可能比插件晚出现（原生座位先声明插槽、后提供服务），所以要 `ctx.inject([...], cb)` 等它，**不能**在 `apply` 里直接读一次就完事。
- 宿主侧服务要访问必须写进插件自己的 `inject` 声明，否则运行时抛 `cannot get property "x" without inject`；可选服务（如 `workspaceRegistry`）用 `ctx.get(name)` 探测，别写进 `inject`，否则该组合下整个插件不加载。
- 宿主 `ctx.webServer` 对路由里逃逸的异常统一回 **400 空响应**，面板侧只会看到「什么都没发生」；路由必须自己 try/catch 成 JSON 错误信封，否则排查成本极高。

## 对本插件的意义

`dsh-source-control` 因此完全不碰 frame / 网格 / 别的插件的 DOM：它只是一个标签类型 + 一个标签体 + 一条宿主路由。外壳调整布局时，它最多被挪位置，不会被压成 1px。
