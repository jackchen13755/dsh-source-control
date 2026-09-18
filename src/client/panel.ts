/**
 * The Source Control panel: a VS Code-shaped changes view rendered inside a
 * native right-sidebar tab.
 *
 * The panel is deliberately self-contained — one component, React's built-in
 * hooks, no state library — because it is drawn inside the product's own pane
 * and must not fight the shell for layout. It owns no DOM outside the tab body
 * the seat hands it.
 */
import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  call,
  ScmError,
  type BranchInfo,
  type CommitInfo,
  type ContextValue,
  type RepoStatus,
  type StatusEntry,
} from './api.js'

/** Props the tab body receives from this plugin's `inject` factory. */
export interface ScmPanelProps {
  readonly sessionId: string
}

type View = 'changes' | 'branches' | 'worktrees' | 'history'

const TOKEN = {
  text: 'var(--dsw-alias-text-1, #e6e6e6)',
  dim: 'var(--dsw-alias-text-3, #9a9a9a)',
  border: 'var(--dsw-alias-border-l2, #333)',
  hover: 'var(--dsw-alias-bg-2, rgba(255,255,255,.06))',
  accent: 'var(--dsw-alias-brand-1, #4d6bfe)',
  ok: 'var(--dsw-alias-success-1, #3fb950)',
  warn: 'var(--dsw-alias-warning-1, #d29922)',
  danger: 'var(--dsw-alias-danger-1, #f85149)',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const

const S = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    fontSize: 12,
    lineHeight: 1.5,
    color: TOKEN.text,
    background: 'transparent',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 10px',
    borderBottom: `1px solid ${TOKEN.border}`,
    flexWrap: 'wrap',
  },
  branch: { fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 },
  dim: { color: TOKEN.dim },
  spacer: { flex: 1 },
  button: {
    border: `1px solid ${TOKEN.border}`,
    background: 'transparent',
    color: TOKEN.text,
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 12,
    cursor: 'pointer',
  },
  iconButton: {
    border: 'none',
    background: 'transparent',
    color: TOKEN.dim,
    cursor: 'pointer',
    fontSize: 12,
    padding: '0 4px',
  },
  tabs: { display: 'flex', gap: 2, padding: '4px 8px', borderBottom: `1px solid ${TOKEN.border}` },
  tab: {
    border: 'none',
    background: 'transparent',
    color: TOKEN.dim,
    cursor: 'pointer',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
  },
  tabActive: { background: TOKEN.hover, color: TOKEN.text, fontWeight: 600 },
  body: { flex: 1, minHeight: 0, overflow: 'auto' },
  sectionHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    color: TOKEN.dim,
    textTransform: 'uppercase' as const,
    letterSpacing: '.04em',
    fontSize: 11,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 8px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  badge: { fontFamily: TOKEN.mono, width: 14, textAlign: 'center' as const, color: TOKEN.warn },
  path: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' },
  diff: {
    margin: 0,
    padding: 8,
    borderTop: `1px solid ${TOKEN.border}`,
    fontFamily: TOKEN.mono,
    fontSize: 11,
    whiteSpace: 'pre' as const,
    overflow: 'auto',
    maxHeight: '45%',
    background: 'rgba(0,0,0,.18)',
  },
  commit: { borderTop: `1px solid ${TOKEN.border}`, padding: 8, display: 'flex', flexDirection: 'column' as const, gap: 6 },
  textarea: {
    width: '100%',
    boxSizing: 'border-box' as const,
    resize: 'vertical' as const,
    minHeight: 54,
    background: 'rgba(0,0,0,.2)',
    color: TOKEN.text,
    border: `1px solid ${TOKEN.border}`,
    borderRadius: 4,
    padding: 6,
    fontFamily: 'inherit',
    fontSize: 12,
  },
  notice: { padding: '6px 10px', borderTop: `1px solid ${TOKEN.border}`, whiteSpace: 'pre-wrap' as const },
  empty: { padding: 16, color: TOKEN.dim, textAlign: 'center' as const },
} as const

function badgeOf(entry: StatusEntry): string {
  if (entry.code === '??') return 'U'
  const letter = (entry.code[0] !== ' ' && entry.code[0] !== '?' ? entry.code[0] : entry.code[1]) ?? 'M'
  return letter === ' ' ? 'M' : letter
}

function baseName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

function dirName(path: string): string {
  const parts = path.split('/')
  parts.pop()
  return parts.length === 0 ? '' : `${parts.join('/')}/`
}

/** Render one change row. */
function row(
  entry: StatusEntry,
  options: { selected: boolean; onOpen: () => void; actions: Array<{ label: string; title: string; run: () => void }> },
): ReactNode {
  const label = entry.from === undefined ? baseName(entry.path) : `${baseName(entry.from)} → ${baseName(entry.path)}`
  const dir = dirName(entry.path)
  return createElement(
    'div',
    {
      key: entry.path,
      style: options.selected ? { ...S.row, background: TOKEN.hover } : S.row,
      onClick: options.onOpen,
      title: entry.path,
    },
    createElement('span', { style: S.badge }, badgeOf(entry)),
    createElement('span', { style: S.path }, label),
    dir === '' ? null : createElement('span', { style: { ...S.dim, fontSize: 11 } }, dir),
    ...options.actions.map(action =>
      createElement(
        'button',
        {
          key: action.label,
          style: S.iconButton,
          title: action.title,
          onClick: (event: { stopPropagation: () => void }) => {
            event.stopPropagation()
            action.run()
          },
        },
        action.label,
      ),
    ),
  )
}

/**
 * The Source Control tab body.
 * @param props - the injected session id.
 */
export function ScmPanel(props: ScmPanelProps): ReactNode {
  const { sessionId } = props
  const [context, setContext] = useState<ContextValue | null>(null)
  const [repo, setRepo] = useState<string>('')
  const [status, setStatus] = useState<RepoStatus | null>(null)
  const [branches, setBranches] = useState<readonly BranchInfo[]>([])
  const [commits, setCommits] = useState<readonly CommitInfo[]>([])
  const [view, setView] = useState<View>('changes')
  const [selected, setSelected] = useState<{ file: string; staged: boolean } | null>(null)
  const [diffText, setDiffText] = useState('')
  const [message, setMessage] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [newBranchBase, setNewBranchBase] = useState('')
  const branchInput = useRef<unknown>(null)
  const worktreeInput = useRef<unknown>(null)
  const [worktreeName, setWorktreeName] = useState('')
  const [worktreeBase, setWorktreeBase] = useState('')
  const [remote, setRemote] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const busyRef = useRef(false)
  const repoRef = useRef('')

  const report = useCallback((error: unknown): void => {
    if (error instanceof ScmError) {
      setNotice({ kind: 'error', text: error.detail === '' ? error.message : `${error.message}\n${error.detail}` })
      return
    }
    setNotice({ kind: 'error', text: String((error as Error)?.message ?? error) })
  }, [])

  const load = useCallback(async (): Promise<void> => {
    const info = await call<ContextValue>('context', sessionId, repoRef.current === '' ? {} : { repo: repoRef.current })
    setContext(info)
    repoRef.current = info.repo
    setRepo(info.repo)
    if (remote === '' && info.options.defaultRemote !== '') setRemote(info.options.defaultRemote)
    if (!info.isRepo) {
      setStatus(null)
      setBranches([])
      setCommits([])
      return
    }
    const [statusValue, branchValue, logValue] = await Promise.all([
      call<{ status: RepoStatus }>('status', sessionId, { repo: info.repo }),
      call<{ branches: BranchInfo[] }>('branches', sessionId, { repo: info.repo }),
      call<{ commits: CommitInfo[] }>('log', sessionId, { repo: info.repo }),
    ])
    setStatus(statusValue.status)
    setBranches(branchValue.branches)
    setCommits(logValue.commits)
  }, [sessionId, remote])

  const refresh = useCallback(async (): Promise<void> => {
    try {
      await load()
    } catch (error) {
      report(error)
    }
  }, [load, report])

  /** Run a mutating operation, then reload everything it could have changed. */
  const run = useCallback(
    async (label: string, operation: () => Promise<unknown>): Promise<void> => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(label)
      setNotice(null)
      try {
        const result = await operation()
        const text = typeof result === 'string' ? result.trim() : ''
        if (text !== '') setNotice({ kind: 'info', text })
        await load()
      } catch (error) {
        report(error)
      } finally {
        busyRef.current = false
        setBusy('')
      }
    },
    [load, report],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  const pollMs = context?.options.pollMs ?? 5000
  useEffect(() => {
    if (pollMs <= 0) return undefined
    const timer = setInterval(() => {
      if (!busyRef.current) void refresh()
    }, pollMs)
    return () => clearInterval(timer)
  }, [pollMs, refresh])

  const openDiff = useCallback(
    async (file: string, staged: boolean): Promise<void> => {
      setSelected({ file, staged })
      try {
        const value = await call<{ diff: string }>('diff', sessionId, { repo: repoRef.current, file, staged })
        setDiffText(value.diff.trim() === '' ? '(没有可显示的差异)' : value.diff)
      } catch (error) {
        report(error)
      }
    },
    [report, sessionId],
  )

  /**
   * Primary actions stay clickable. A button that is merely \`disabled\` looks
   * identical to a live one and answers a click with nothing — reported as
   * "点不动". Instead the button explains what is missing, and focuses the
   * field that would unblock it.
   */
  const primaryButton = (
    label: string,
    blocked: string | null,
    onRun: () => void,
    options: { style?: Record<string, unknown>; focus?: { current: unknown } } = {},
  ): ReactNode => {
    const style: Record<string, unknown> = { ...S.button, ...(options.style ?? {}) }
    if (blocked !== null) style.color = TOKEN.dim
    return createElement(
      'button',
      {
        style,
        title: blocked ?? label,
        'aria-disabled': blocked === null ? undefined : 'true',
        onClick: () => {
          if (blocked !== null) {
            setNotice({ kind: 'error', text: blocked })
            const target = options.focus?.current as { focus?: () => void } | null | undefined
            target?.focus?.()
            return
          }
          onRun()
        },
      },
      label,
    )
  }

  const files = useMemo(() => {
    if (status === null) return [] as string[]
    return [...status.staged, ...status.unstaged, ...status.untracked].map(entry => entry.path)
  }, [status])

  const createBranch = (): void => {
    const name = newBranch.trim()
    if (name === '') {
      setNotice({ kind: 'error', text: '请先输入新分支名' })
      return
    }
    const base = newBranchBase
    void run(`新建分支 ${name}`, async () => {
      const created = await call<{ branch: string; base: string | null; upstream: string | null }>('branch-create', sessionId, {
        repo: repoRef.current,
        name,
        base,
      })
      setNewBranch('')
      setNewBranchBase('')
      const from = created.base === null ? '当前 HEAD' : created.base
      return `已从 ${from} 创建并切换到 ${created.branch}${created.upstream === null ? '' : `（跟踪 ${created.upstream}）`}`
    })
  }

  const doStage = (paths: string[], stage: boolean): Promise<unknown> =>
    call(stage ? 'stage' : 'unstage', sessionId, { repo: repoRef.current, files: paths })

  const doDiscard = (paths: string[]): Promise<unknown> => {
    const ok = window.confirm(`放弃 ${paths.length} 个文件的改动？此操作不可撤销。`)
    if (!ok) return Promise.resolve('')
    return call('discard', sessionId, { repo: repoRef.current, files: paths, confirm: true })
  }

  if (context === null) {
    return createElement('div', { style: S.root }, createElement('div', { style: S.empty }, '正在读取仓库…'))
  }

  const head = createElement(
    'div',
    { style: S.header },
    createElement('span', { style: S.branch, title: context.repo }, '🌿', status?.branch ?? '—'),
    status !== null && (status.ahead > 0 || status.behind > 0)
      ? createElement('span', { style: S.dim }, `↑${status.ahead} ↓${status.behind}`)
      : null,
    status?.upstream == null ? null : createElement('span', { style: { ...S.dim, fontSize: 11 } }, status.upstream),
    createElement('span', { style: S.spacer }),
    busy === '' ? null : createElement('span', { style: S.dim }, busy),
    context.repos.length > 1
      ? createElement(
        'select',
        {
          value: repo,
          style: { ...S.button, maxWidth: 140 },
          onChange: (event: { target: { value: string } }) => {
            repoRef.current = event.target.value
            setRepo(event.target.value)
            setSelected(null)
            void refresh()
          },
        },
        ...[
          ...context.repos.map(item => ({ path: item.path, name: item.name })),
          ...context.worktrees
            .filter(worktree => !context.repos.some(item => item.path === worktree.path))
            .map(worktree => ({ path: worktree.path, name: `wt: ${worktree.branch ?? worktree.head}` })),
        ].map(item => createElement('option', { key: item.path, value: item.path }, item.name)),
      )
      : null,
    createElement('button', { style: S.iconButton, title: '刷新', onClick: () => void refresh() }, '↻'),
  )

  if (!context.isRepo) {
    return createElement(
      'div',
      { style: S.root },
      head,
      createElement('div', { style: S.empty }, '当前工作区不是 Git 仓库。'),
      createElement(
        'div',
        { style: { padding: '0 16px 16px', textAlign: 'center' } },
        createElement(
          'button',
          {
            style: S.button,
            onClick: () => void run('初始化仓库', () => call<{ output: string }>('init', sessionId, { repo: repoRef.current })),
          },
          '初始化仓库',
        ),
      ),
      notice === null ? null : createElement('div', { style: { ...S.notice, color: notice.kind === 'error' ? TOKEN.danger : TOKEN.ok } }, notice.text),
    )
  }

  const sections: Array<{ key: string; title: string; entries: readonly StatusEntry[]; action?: { label: string; run: () => void } }> = [
    {
      key: 'conflicts',
      title: `冲突 (${status?.conflicts.length ?? 0})`,
      entries: status?.conflicts ?? [],
      action: { label: '全部暂存', run: () => void run('暂存冲突', () => doStage((status?.conflicts ?? []).map(e => e.path), true)) },
    },
    {
      key: 'staged',
      title: `已暂存 (${status?.staged.length ?? 0})`,
      entries: status?.staged ?? [],
      action: { label: '全部取消', run: () => void run('取消暂存', () => doStage((status?.staged ?? []).map(e => e.path), false)) },
    },
    {
      key: 'changes',
      title: `更改 (${status?.unstaged.length ?? 0})`,
      entries: status?.unstaged ?? [],
      action: {
        label: '全部暂存',
        run: () => void run('暂存全部更改', () => doStage([...files], true)),
      },
    },
    { key: 'untracked', title: `未跟踪 (${status?.untracked.length ?? 0})`, entries: status?.untracked ?? [] },
  ]

  const changesView = createElement(
    'div',
    { style: S.body },
    ...sections
      .filter(section => section.entries.length > 0)
      .map(section =>
        createElement(
          'div',
          { key: section.key },
          createElement(
            'div',
            { style: S.sectionHead },
            createElement('span', null, section.title),
            createElement('span', { style: S.spacer }),
            section.action === undefined
              ? null
              : createElement('button', { style: S.iconButton, onClick: section.action.run }, section.action.label),
          ),
          ...section.entries.map(entry =>
            row(entry, {
              selected: selected?.file === entry.path,
              onOpen: () => void openDiff(entry.path, section.key === 'staged' || section.key === 'conflicts'),
              actions: section.key === 'staged'
                ? [
                  { label: '−', title: '取消暂存', run: () => void run('取消暂存', () => doStage([entry.path], false)) },
                  { label: '↩', title: '放弃改动', run: () => void run('放弃改动', () => doDiscard([entry.path])) },
                ]
                : [
                  { label: '＋', title: '暂存', run: () => void run('暂存', () => doStage([entry.path], true)) },
                  { label: '↩', title: '放弃改动', run: () => void run('放弃改动', () => doDiscard([entry.path])) },
                ],
            }),
          ),
        ),
      ),
    (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0) + (status?.conflicts.length ?? 0) === 0
      ? createElement('div', { style: S.empty }, '工作区干净，没有未提交的改动。')
      : null,
  )

  const branchesView = createElement(
    'div',
    { style: S.body },
    createElement(
      'div',
      { style: { ...S.sectionHead, textTransform: 'none', flexWrap: 'wrap' } },
      createElement('input', {
        ref: (element: unknown) => { branchInput.current = element },
        value: newBranch,
        placeholder: '新分支名…（回车即可创建）',
        style: { ...S.textarea, minHeight: 0, flex: 1, padding: '2px 6px' },
        onChange: (event: { target: { value: string } }) => setNewBranch(event.target.value),
        onKeyDown: (event: { key: string; preventDefault: () => void }) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            createBranch()
          }
        },
      }),
      primaryButton('新建', newBranch.trim() === '' ? '请先在左侧输入新分支名' : null, createBranch, { focus: branchInput }),
      createElement(
        'select',
        {
          value: newBranchBase,
          title: '新分支的来源：默认当前 HEAD，可选任一本地/远程分支',
          style: { ...S.button, maxWidth: 180 },
          onChange: (event: { target: { value: string } }) => setNewBranchBase(event.target.value),
        },
        createElement('option', { value: '' }, `来源：HEAD（${status?.branch ?? '当前'}${status?.detached === true ? '' : ''}）`),
        ...branches.filter(branch => !branch.remote && !branch.current).map(branch =>
          createElement('option', { key: `lb:${branch.name}`, value: branch.name }, branch.name),
        ),
        ...branches.filter(branch => branch.remote).map(branch =>
          createElement('option', { key: `rb:${branch.name}`, value: branch.name }, branch.name),
        ),
      ),
    ),
    ...branches.map(branch =>
      createElement(
        'div',
        { key: `${branch.remote ? 'r' : 'l'}:${branch.name}`, style: S.row, title: branch.subject },
        createElement('span', { style: { ...S.badge, color: branch.current ? TOKEN.ok : TOKEN.dim } }, branch.current ? '●' : branch.remote ? '☁' : '○'),
        createElement('span', { style: S.path }, branch.name),
        createElement('span', { style: { ...S.dim, fontSize: 11 } }, branch.shortHash),
        branch.current || branch.remote
          ? null
          : createElement(
            'button',
            {
              style: S.iconButton,
              title: `切换到 ${branch.name}`,
              onClick: () => void run(`切换 ${branch.name}`, async () => {
                await call('switch', sessionId, { repo: repoRef.current, branch: branch.name })
                return `已切换到 ${branch.name}`
              }),
            },
            '切换',
          ),
        branch.current || branch.remote
          ? null
          : createElement(
            'button',
            {
              style: S.iconButton,
              title: `把 ${branch.name} 合并到当前分支`,
              onClick: () => void run(`合并 ${branch.name}`, async () => {
                const result = await call<{ output: string }>('merge', sessionId, { repo: repoRef.current, branch: branch.name })
                return result.output === '' ? `已合并 ${branch.name}` : result.output
              }),
            },
            '合并',
          ),
        branch.current || branch.remote
          ? null
          : createElement(
            'button',
            {
              style: S.iconButton,
              title: `删除 ${branch.name}`,
              onClick: () => {
                if (!window.confirm(`删除分支 ${branch.name}？未合并的分支需要强制删除。`)) return
                void run(`删除 ${branch.name}`, async () => {
                  await call('branch-delete', sessionId, { repo: repoRef.current, name: branch.name, confirm: true, force: true })
                  return `已删除 ${branch.name}`
                })
              },
            },
            '删除',
          ),
      ),
    ),
  )

  const smallInput = { ...S.textarea, minHeight: 0, flex: 1, padding: '2px 6px' } as const
  const createWorktree = (): void => {
    const name = worktreeName.trim()
    if (name === '') {
      setNotice({ kind: 'error', text: '请先输入工作树名' })
      return
    }
    void run(`新建工作树 ${name}`, async () => {
      const created = await call<{ path: string; branch: string; registered: boolean }>('worktree-add', sessionId, {
        repo: repoRef.current,
        name,
        base: worktreeBase.trim(),
      })
      setWorktreeName('')
      setWorktreeBase('')
      return `工作树已建：${created.path}（分支 ${created.branch}${created.registered ? '，已注册为工作区，可新开会话直接使用' : ''}）`
    })
  }
  const worktreesView = createElement(
    'div',
    { style: S.body },
    createElement(
      'div',
      { style: { ...S.sectionHead, textTransform: 'none', gap: 4 } },
      createElement('input', {
        ref: (element: unknown) => { worktreeInput.current = element },
        value: worktreeName,
        placeholder: '工作树名…（回车即可创建）',
        style: smallInput,
        onChange: (event: { target: { value: string } }) => setWorktreeName(event.target.value),
        onKeyDown: (event: { key: string; preventDefault: () => void }) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            createWorktree()
          }
        },
      }),
      createElement('input', {
        value: worktreeBase,
        placeholder: '基点（默认 HEAD）',
        style: smallInput,
        onChange: (event: { target: { value: string } }) => setWorktreeBase(event.target.value),
      }),
      primaryButton('新建', worktreeName.trim() === '' ? '请先输入工作树名' : null, createWorktree, { focus: worktreeInput }),
      false ? createElement(
        'button',
        {
          style: S.button,
          onClick: () => {
            const name = worktreeName.trim()
            if (name === '') return
            void run(`新建工作树 ${name}`, async () => {
              const created = await call<{ path: string; branch: string; registered: boolean }>('worktree-add', sessionId, {
                repo: repoRef.current,
                name,
                base: worktreeBase.trim(),
              })
              setWorktreeName('')
              setWorktreeBase('')
              return `工作树已建：${created.path}（分支 ${created.branch}${created.registered ? '，已注册为工作区，可新开会话直接使用' : ''}）`
            })
          },
        },
        '新建',
      ) : null,
      createElement(
        'button',
        {
          style: S.iconButton,
          title: '清理已失效的工作树记录',
          onClick: () => void run('清理工作树', async () => {
            const pruned = await call<{ output: string }>('worktree-prune', sessionId, { repo: repoRef.current })
            return pruned.output === '' ? '没有需要清理的记录' : pruned.output
          }),
        },
        '清理',
      ),
    ),
    createElement('div', { style: { ...S.sectionHead, textTransform: 'none' } }, `目录 ${context.worktreeHome}`),
    ...context.worktrees.map(worktree =>
      createElement(
        'div',
        { key: worktree.path, style: S.row, title: worktree.path },
        createElement('span', { style: { ...S.badge, color: worktree.main ? TOKEN.ok : TOKEN.dim } }, worktree.main ? '◆' : '◇'),
        createElement('span', { style: S.path }, worktree.branch ?? `(detached ${worktree.head})`),
        worktree.dirty ? createElement('span', { style: { ...S.dim, color: TOKEN.warn } }, '● 有改动') : null,
        createElement('span', { style: { ...S.dim, fontSize: 11 } }, worktree.path.replace(`${context.worktreeHome}/`, '~/')),
        createElement(
          'button',
          {
            style: S.iconButton,
            title: '复制路径',
            onClick: () => {
              void navigator.clipboard?.writeText(worktree.path)
              setNotice({ kind: 'info', text: `已复制 ${worktree.path}` })
            },
          },
          '复制',
        ),
        worktree.main
          ? null
          : createElement(
            'button',
            {
              style: S.iconButton,
              title: '删除该工作树',
              onClick: () => {
                const force = worktree.dirty
                if (!window.confirm(`删除工作树 ${worktree.path}？${force ? '\n（含未提交改动，将强制删除）' : ''}`)) return
                void run('删除工作树', async () => {
                  await call('worktree-remove', sessionId, { repo: repoRef.current, worktree: worktree.path, confirm: true, force })
                  return `已删除 ${worktree.path}`
                })
              },
            },
            '删除',
          ),
      ),
    ),
    context.worktrees.length === 0
      ? createElement('div', { style: S.empty }, '还没有工作树。新建一个可以把任务隔离在独立目录里并行推进。')
      : null,
  )

  const historyView = createElement(
    'div',
    { style: S.body },
    ...commits.map(commit =>
      createElement(
        'div',
        { key: commit.hash, style: S.row, title: `${commit.author} · ${commit.date}` },
        createElement('span', { style: { ...S.badge, color: TOKEN.dim } }, '•'),
        createElement('span', { style: S.path }, commit.subject),
        createElement('span', { style: { ...S.dim, fontFamily: TOKEN.mono, fontSize: 11 } }, commit.hash),
      ),
    ),
  )

  const syncBar = createElement(
    'div',
    { style: { display: 'flex', gap: 4, padding: '4px 8px', borderBottom: `1px solid ${TOKEN.border}`, flexWrap: 'wrap' } },
    context.remotes.length > 1
      ? createElement(
        'select',
        {
          value: remote,
          style: { ...S.button, maxWidth: 120 },
          onChange: (event: { target: { value: string } }) => setRemote(event.target.value),
        },
        createElement('option', { value: '' }, '默认远程'),
        ...context.remotes.map(name => createElement('option', { key: name, value: name }, name)),
      )
      : null,
    createElement('button', { style: S.button, onClick: () => void run('抓取', async () => {
      const result = await call<{ output: string }>('fetch', sessionId, { repo: repoRef.current, remote })
      return result.output === '' ? '抓取完成' : result.output
    }) }, '抓取'),
    createElement('button', { style: S.button, onClick: () => void run('拉取', async () => {
      const result = await call<{ output: string }>('pull', sessionId, { repo: repoRef.current, remote, mode: 'ff' })
      return result.output === '' ? '已是最新' : result.output
    }) }, '拉取'),
    createElement('button', { style: S.button, onClick: () => void run('拉取（合并）', async () => {
      const result = await call<{ output: string }>('pull', sessionId, { repo: repoRef.current, remote, mode: 'merge' })
      return result.output === '' ? '已是最新' : result.output
    }) }, '拉取(合并)'),
    primaryButton(
      // A branch that exists only locally cannot be pushed by name; the honest
      // label is "publish" (git's --set-upstream), which is what the click does.
      status !== null && status.upstream === null ? '发布分支' : '推送',
      null,
      () => {
        const target = remote === '' ? (context.remotes[0] ?? 'origin') : remote
        const publishing = status !== null && status.upstream === null
        const question = publishing
          ? `当前分支「${status?.branch ?? ''}」在远端还不存在。\n将推送到 ${target} 并建立跟踪关系（git push --set-upstream）？`
          : '推送当前分支到远程？'
        if (!window.confirm(question)) return
        void run(publishing ? '发布分支' : '推送', async () => {
          const result = await call<{ output: string; published?: boolean }>('push', sessionId, {
            repo: repoRef.current,
            remote,
            branch: status?.branch ?? '',
            setUpstream: publishing,
            confirm: true,
          })
          // Publishing prints only progress on stderr; lead with what happened
          // and keep git's own lines after it (a GitLab remote appends the MR link).
          if (publishing) {
            return [`已发布 ${status?.branch ?? ''} 并建立跟踪关系`, result.output.trim()].filter(part => part !== '').join('\n')
          }
          return result.output.trim() === '' ? '推送完成' : result.output.trim()
        })
      },
    ),
  )

  const tabList: Array<[View, string]> = [
    ['changes', `改动 ${files.length}`],
    ['branches', `分支 ${branches.length}`],
    ['worktrees', `工作树 ${context.worktrees.length}`],
    ['history', '历史'],
  ]

  return createElement(
    'div',
    { style: S.root },
    head,
    createElement(
      'div',
      { style: S.tabs },
      ...tabList.map(([key, label]) =>
        createElement(
          'button',
          { key, style: view === key ? { ...S.tab, ...S.tabActive } : S.tab, onClick: () => setView(key) },
          label,
        ),
      ),
    ),
    view === 'changes' ? syncBar : null,
    view === 'changes' ? changesView : view === 'branches' ? branchesView : view === 'worktrees' ? worktreesView : historyView,
    view === 'changes' && selected !== null
      ? createElement('pre', { style: S.diff }, diffText)
      : null,
    notice === null
      ? null
      : createElement('div', { style: { ...S.notice, color: notice.kind === 'error' ? TOKEN.danger : TOKEN.ok } }, notice.text),
    view === 'changes'
      ? createElement(
        'div',
        { style: S.commit },
        createElement('textarea', {
          style: S.textarea,
          placeholder: (status?.staged.length ?? 0) === 0 ? '先暂存改动，再填写提交信息…' : '提交信息（Cmd/Ctrl+Enter 提交）',
          value: message,
          onChange: (event: { target: { value: string } }) => setMessage(event.target.value),
          onKeyDown: (event: { key: string; metaKey: boolean; ctrlKey: boolean; preventDefault: () => void }) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              if (message.trim() !== '' && (status?.staged.length ?? 0) > 0) {
                void run('提交', async () => {
                  await call('commit', sessionId, { repo: repoRef.current, message })
                  setMessage('')
                  return '提交完成'
                })
              }
            }
          },
        }),
        primaryButton(
          `提交（${status?.staged.length ?? 0} 已暂存）`,
          message.trim() === '' ? '请先填写提交信息' : (status?.staged.length ?? 0) === 0 ? '请先暂存要提交的改动' : null,
          () =>
            void run('提交', async () => {
              await call('commit', sessionId, { repo: repoRef.current, message })
              setMessage('')
              return '提交完成'
            }),
          { style: { alignSelf: 'flex-end' } },
        ),
      )
      : null,
  )
}
