/**
 * dsh-source-control — browser half.
 *
 * Registers a native right-sidebar tab type ("源代码管理") plus the keyed slot
 * body that draws it. Nothing here appends columns or writes the shell's grid:
 * the tab rides the sidebar's own tab system, so a product layout change can
 * only move the panel, never hide it — which is exactly how the plugin this one
 * was modelled on (dsh-solution-explorer 1.0.0) broke on DSH 0.1.6.
 */
import type { ReactNode } from 'react'
import { ScmPanel } from './panel.js'

/** Registration identity shared by the tab registry and the body slot. */
const TYPE_ID = 'dsh-source-control:scm'
/** Tab kind that `openTab` names. */
const KIND = 'source-control'

/** The slot service's two calls this plugin makes (declared structurally: the
g * package's own service type is not part of its public export surface). */
interface SlotsService {
  inject(name: string, callback: () => void | (() => void)): void
  register(options: unknown, component: unknown): () => void
}

/** The slice of the client context this plugin touches. */
interface ClientContext {
  readonly slots: SlotsService
  effect(callback: () => void | (() => void), label?: string): void
  inject(
    names: readonly string[],
    callback: (injected: { get(name: string): unknown }) => void | (() => void),
  ): void
}

/** One guide entry, as the tab registry wants it. */
interface GuideEntry {
  readonly id: string
  readonly order: number
  readonly title: () => string
  readonly description: () => string
}

/** The tab-type registry face (`ctx.sidebarRightTabs`). */
interface TabRegistry {
  register(definition: {
    readonly id: string
    readonly kind: string
    readonly multiple?: boolean
    readonly title: (address: string) => string
    readonly guide?: readonly GuideEntry[]
  }): () => void
}

/** The slot registrar, with the framework's generic inference erased. */
/** `slots` is the only service needed before the first render. */
export const inject = ['slots']

/**
 * Register the tab type, its body, and the guide entry that opens it.
 * @param ctx - client context.
 */
export function apply(ctx: ClientContext): void {
  // The tab-type registry is provided by the right sidebar's client half, which
  // may arrive after this plugin: `inject` re-runs when it does.
  ctx.inject(['sidebarRightTabs'], injected => {
    const tabs = injected.get('sidebarRightTabs') as TabRegistry | undefined
    if (tabs === undefined) return undefined
    return tabs.register({
      id: TYPE_ID,
      kind: KIND,
      title: () => '源代码管理',
      guide: [
        {
          id: 'source-control',
          order: 30,
          title: () => '源代码管理',
          description: () => 'Git 改动、暂存、提交、分支与远程同步',
        },
      ],
    })
  })

  // Stage two: the body. The seat dispatches by the type id above and hands the
  // body its session id through this registration's inject factory.
  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register(
          {
            name: 'sidebar.right.pane.tab',
            key: TYPE_ID,
            inject: (sessionId: string) => ({ sessionId }),
          },
          (props: { sessionId: string }): ReactNode => ScmPanel(props),
        ),
      ),
    'dsh-source-control: panel body',
  )
}
