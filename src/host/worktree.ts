/**
 * Worktree support: list, create, remove and prune linked worktrees, and
 * register a created one as a DSH workspace so a session can open on it.
 *
 * Created worktrees live in a managed home rather than inside the checkout —
 * nesting them under the repository would dirty it and confuse every tool that
 * walks it. That places them outside the session's own directory, which is why
 * the fence additionally accepts registered workspace paths and this home.
 */
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { git } from './git.js'
import { workspaceRegistryOf } from './services.js'

/** One linked worktree, as the panel lists it. */
export interface WorktreeInfo {
  /** Absolute worktree path. */
  readonly path: string
  /** Checked-out branch, or null when detached. */
  readonly branch: string | null
  /** Short HEAD hash. */
  readonly head: string
  /** The repository's main worktree — never removable. */
  readonly main: boolean
  /** Whether the worktree has uncommitted changes (removal guard). */
  readonly dirty: boolean
}

/**
 * Default managed home for created worktrees.
 * @returns `$DSH_HOME/source-control/worktrees`, falling back to `~/.dsh/...`.
 */
export function defaultWorktreeHome(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'source-control', 'worktrees')
}

/**
 * Resolve the configured home, expanding `~`.
 * @param configured - the config value; empty means the default home.
 */
export function worktreeHome(configured: string): string {
  if (configured.trim() === '') return defaultWorktreeHome()
  const raw = configured.trim()
  return raw.startsWith('~') ? join(homedir(), raw.slice(1)) : resolve(raw)
}

/**
 * Where a new worktree of `repoRoot` named `name` should live.
 * @param home - managed home directory.
 * @param repoRoot - the repository the worktree branches off.
 * @param name - sanitized worktree name.
 */
export function worktreeTarget(home: string, repoRoot: string, name: string): string {
  return join(home, basename(repoRoot), name)
}

/**
 * Restrict a user-typed worktree name to something safe as a path segment and
 * a branch component.
 * @param raw - the typed name.
 * @returns the sanitized name, or null when nothing usable remains.
 */
export function sanitizeName(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .replace(/-{2,}/g, '-')
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return null
  return cleaned.slice(0, 64)
}

/** Create the managed home (and the repository subdirectory) for a worktree. */
export function ensureParent(path: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
}

/**
 * List a repository's worktrees, flagging the main one and any dirty tree.
 * @param root - repository root.
 */
export async function listWorktrees(root: string): Promise<WorktreeInfo[]> {
  const result = await git(['worktree', 'list', '--porcelain'], root)
  if (result.code !== 0) return []
  const blocks = result.stdout.split('\n\n')
  const raw: Array<{ path: string; branch: string | null; head: string; bare: boolean; detached: boolean }> = []
  for (const block of blocks) {
    const lines = block.split('\n').map(line => line.trim()).filter(line => line !== '')
    if (lines.length === 0) continue
    let path = ''
    let branch: string | null = null
    let head = ''
    let bare = false
    let detached = false
    for (const line of lines) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length).slice(0, 7)
      else if (line.startsWith('branch ')) branch = line.slice('branch '.length).replace('refs/heads/', '')
      else if (line === 'bare') bare = true
      else if (line === 'detached') detached = true
    }
    if (path !== '' && !bare) raw.push({ path, branch, head, bare, detached })
  }
  const infos: WorktreeInfo[] = []
  for (let index = 0; index < raw.length; index += 1) {
    const entry = raw[index] as (typeof raw)[number]
    const porcelain = await git(['status', '--porcelain'], entry.path)
    infos.push({
      path: entry.path,
      branch: entry.branch,
      head: entry.head,
      main: index === 0,
      dirty: porcelain.code === 0 && porcelain.stdout.trim() !== '',
    })
  }
  return infos
}

/**
 * Add a linked worktree, creating its branch.
 * @param root - repository root.
 * @param target - absolute path for the new worktree.
 * @param branch - branch to create or check out.
 * @param base - base revision for a new branch; empty means HEAD.
 * @param createBranch - false to check out an existing branch instead of creating one.
 */
export async function addWorktree(
  root: string,
  target: string,
  branch: string,
  base: string,
  createBranch: boolean,
): Promise<{ code: number; stderr: string; stdout: string }> {
  const args = ['worktree', 'add']
  if (createBranch) args.push('-b', branch)
  args.push(target)
  if (createBranch) {
    if (base !== '') args.push(base)
  } else {
    args.push(branch)
  }
  return git(args, root)
}

/**
 * Remove a linked worktree.
 * @param root - repository root.
 * @param target - absolute path of the worktree.
 * @param force - remove even with local changes (a double `--force` also drops a locked tree).
 */
export async function removeWorktree(root: string, target: string, force: boolean): Promise<{ code: number; stderr: string; stdout: string }> {
  const args = ['worktree', 'remove']
  if (force) args.push('--force', '--force')
  args.push(target)
  return git(args, root)
}

/** Drop administrative records of worktrees whose directories are gone. */
export async function pruneWorktrees(root: string): Promise<{ code: number; stderr: string; stdout: string }> {
  return git(['worktree', 'prune', '--verbose'], root)
}

/**
 * Paths of workspaces the user has registered with DSH.
 * @param ctx - host context; a missing registry yields an empty list.
 */
export function registeredWorkspaces(ctx: Context): string[] {
  const registry = workspaceRegistryOf(ctx)
  if (registry === undefined) return []
  try {
    return registry.list().map(workspace => workspace.path).filter(path => typeof path === 'string' && path !== '')
  } catch {
    return []
  }
}

/**
 * Drop a worktree's DSH workspace registration once the directory is gone, so
 * the workspace picker cannot offer a checkout that no longer exists.
 * @param ctx - host context.
 * @param path - the removed worktree's path.
 * @returns whether a registration was removed.
 */
export async function unregisterWorkspace(ctx: Context, path: string): Promise<boolean> {
  const registry = workspaceRegistryOf(ctx)
  if (registry === undefined) return false
  try {
    const existing = registry.list().find(workspace => workspace.path === path)
    if (existing === undefined) return false
    await registry.delete(existing.id)
    return true
  } catch {
    return false
  }
}

/**
 * Make a worktree reachable to DSH by registering it as a workspace, so a new
 * session can be started directly on it.
 * @param ctx - host context.
 * @param path - worktree path.
 * @param title - display name in the workspace picker.
 * @returns whether registration succeeded (a missing registry is not an error).
 */
export async function registerWorkspace(ctx: Context, path: string, title: string): Promise<boolean> {
  const registry = workspaceRegistryOf(ctx)
  if (registry === undefined) return false
  try {
    const existing = registry.list().find(workspace => workspace.path === path)
    if (existing !== undefined) return true
    await registry.create(path, title)
    return true
  } catch {
    return false
  }
}
