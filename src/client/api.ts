/**
 * Typed client for the host's `/dsh-source-control/*` route.
 *
 * Every call carries the session id and nothing else that could name a path:
 * the host resolves the workspace from the session, so the panel cannot reach
 * outside the directory it is drawn in even if it wanted to.
 */

/** One `git status --porcelain` entry. */
export interface StatusEntry {
  readonly path: string
  readonly from?: string
  readonly code: string
}

/** Full change state of one repository. */
export interface RepoStatus {
  readonly branch: string
  readonly detached: boolean
  readonly upstream: string | null
  readonly ahead: number
  readonly behind: number
  readonly staged: readonly StatusEntry[]
  readonly unstaged: readonly StatusEntry[]
  readonly untracked: readonly StatusEntry[]
  readonly conflicts: readonly StatusEntry[]
}

/** One branch row. */
export interface BranchInfo {
  readonly name: string
  readonly current: boolean
  readonly remote: boolean
  readonly upstream: string | null
  readonly shortHash: string
  readonly subject: string
}

/** One linked worktree. */
export interface WorktreeInfo {
  readonly path: string
  readonly branch: string | null
  readonly head: string
  /** The repository's main worktree — not removable. */
  readonly main: boolean
  readonly dirty: boolean
}

/** One commit row. */
export interface CommitInfo {
  readonly hash: string
  readonly subject: string
  readonly author: string
  readonly date: string
}

/** Host-side settings echoed back to the panel. */
export interface PanelOptions {
  readonly recentCommits: number
  readonly pollMs: number
  readonly defaultRemote: string
}

/** Resolution of the session's workspace: which repositories exist and which one is in focus. */
export interface ContextValue {
  readonly workspace: string
  readonly repo: string
  readonly isRepo: boolean
  readonly repos: readonly { path: string; name: string; branch: string }[]
  readonly remotes: readonly string[]
  /** Linked worktrees of the focused repository. */
  readonly worktrees: readonly WorktreeInfo[]
  /** Managed home new worktrees are created under. */
  readonly worktreeHome: string
  readonly options: PanelOptions
}

/** An operation failure, carrying git's own words when there are any. */
export class ScmError extends Error {
  readonly code: string
  readonly detail: string

  constructor(code: string, message: string, detail = '') {
    super(message)
    this.name = 'ScmError'
    this.code = code
    this.detail = detail
  }
}

/** Extra fields an operation may carry. */
export interface CallFields {
  repo?: string
  file?: string
  files?: string[]
  branch?: string
  name?: string
  base?: string
  message?: string
  remote?: string
  mode?: string
  staged?: boolean
  confirm?: boolean
  force?: boolean
  limit?: number
  worktree?: string
}

interface Envelope<T> {
  ok: boolean
  value?: T
  error?: { code: string; message: string; detail?: string }
}

/**
 * Call one operation.
 * @param operation - route suffix, e.g. `status`.
 * @param sessionId - the session the panel is drawn in.
 * @param fields - operation parameters.
 * @returns the operation's value.
 * @throws ScmError when the host refuses or git fails.
 */
export async function call<T>(operation: string, sessionId: string, fields: CallFields = {}): Promise<T> {
  const response = await fetch(`/dsh-source-control/${operation}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, ...fields }),
  })
  let envelope: Envelope<T>
  try {
    envelope = (await response.json()) as Envelope<T>
  } catch {
    throw new ScmError('bad-response', `the host answered ${response.status} without JSON`)
  }
  if (envelope.ok !== true || envelope.value === undefined) {
    const error = envelope.error ?? { code: 'unknown', message: 'the operation failed' }
    throw new ScmError(error.code, error.message, error.detail ?? '')
  }
  return envelope.value
}
