/**
 * Git plumbing for dsh-source-control.
 *
 * Every command runs through `execFile('git', argv)` — never a shell — so a
 * branch name, file path or remote name can never turn into shell syntax. The
 * runner returns the exit code instead of throwing: callers decide whether a
 * non-zero exit is an error (a missing upstream is normal) or a failure.
 */
import { execFile } from 'node:child_process'

/** One finished git invocation. */
export interface GitResult {
  /** Process exit code; `-1` when the process could not be spawned at all. */
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

/** Bound on a single git invocation: long enough for a slow fetch, short enough to not wedge the request. */
const GIT_TIMEOUT_MS = 120_000
/** Diff output ceiling; a huge binary-adjacent diff is truncated rather than streamed into the browser. */
const MAX_BUFFER = 32 * 1024 * 1024

/**
 * Run one git command in a repository.
 * @param args - argv after the program name, e.g. `['status', '--porcelain']`.
 * @param cwd - absolute directory to run in.
 * @param options - `allowFailure` keeps a non-zero exit as data; `timeoutMs` overrides the default.
 * @returns exit code plus captured stdout/stderr.
 */
export function git(
  args: readonly string[],
  cwd: string,
  options: { readonly timeoutMs?: number } = {},
): Promise<GitResult> {
  return new Promise<GitResult>((resolve) => {
    execFile(
      'git',
      [...args],
      {
        cwd,
        timeout: options.timeoutMs ?? GIT_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        env: {
          ...process.env,
          // A credential prompt would hang the HTTP request forever; fail fast instead.
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: '',
          SSH_ASKPASS: '',
          // Never take the index lock for read-only plumbing.
          GIT_OPTIONAL_LOCKS: '0',
          // Keep messages parseable regardless of the user's locale.
          LC_ALL: 'C',
        },
      },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof (error as { code?: unknown }).code === 'number'
          ? (error as { code: number }).code
          : -1
        resolve({ code, stdout: String(stdout), stderr: String(stderr) })
      },
    )
  })
}

/** Whether a directory is inside a git work tree. */
export async function isRepository(dir: string): Promise<boolean> {
  const result = await git(['rev-parse', '--is-inside-work-tree'], dir)
  return result.code === 0 && result.stdout.trim() === 'true'
}

/** Absolute work-tree root of the repository containing `dir`, if any. */
export async function repositoryRoot(dir: string): Promise<string | null> {
  const result = await git(['rev-parse', '--show-toplevel'], dir)
  if (result.code !== 0) return null
  const root = result.stdout.trim()
  return root === '' ? null : root
}

/** One parsed `git status --porcelain=v1` entry. */
export interface StatusEntry {
  /** The file's path relative to the repository root. */
  readonly path: string
  /** Previous path for a rename or copy. */
  readonly from?: string
  /** Two-letter porcelain code, e.g. `M `, ` M`, `??`, `UU`. */
  readonly code: string
}

/** Everything the changes view needs about one repository. */
export interface RepoStatus {
  readonly branch: string
  /** Detached HEAD reports its short hash as the branch and sets this. */
  readonly detached: boolean
  readonly upstream: string | null
  readonly ahead: number
  readonly behind: number
  /** Index column non-`?`/space: staged changes. */
  readonly staged: readonly StatusEntry[]
  /** Work-tree column: unstaged modifications and deletions. */
  readonly unstaged: readonly StatusEntry[]
  readonly untracked: readonly StatusEntry[]
  /** Unmerged paths (`UU`, `AA`, `DU`, …). */
  readonly conflicts: readonly StatusEntry[]
}

/** Parse NUL-delimited porcelain v1 output into entries. */
function parsePorcelain(raw: string): StatusEntry[] {
  const parts = raw.split('\0')
  const entries: StatusEntry[] = []
  for (let index = 0; index < parts.length; index += 1) {
    const record = parts[index] ?? ''
    if (record.length < 4) continue
    const code = record.slice(0, 2)
    const path = record.slice(3)
    // A rename/copy record carries the original path as the NEXT NUL field.
    if (code.startsWith('R') || code.startsWith('C')) {
      const from = parts[index + 1] ?? ''
      index += 1
      entries.push({ path, from, code })
      continue
    }
    entries.push({ path, code })
  }
  return entries
}

/** Upstream of HEAD plus its ahead/behind counts; null when the branch has no upstream. */
async function upstreamState(
  root: string,
): Promise<{ upstream: string | null; ahead: number; behind: number }> {
  const upstream = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], root)
  if (upstream.code !== 0) return { upstream: null, ahead: 0, behind: 0 }
  const name = upstream.stdout.trim()
  const counts = await git(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], root)
  if (counts.code !== 0) return { upstream: name === '' ? null : name, ahead: 0, behind: 0 }
  const [ahead, behind] = counts.stdout.trim().split(/\s+/)
  return {
    upstream: name === '' ? null : name,
    ahead: Number.parseInt(ahead ?? '0', 10) || 0,
    behind: Number.parseInt(behind ?? '0', 10) || 0,
  }
}

/** Read the full change state of one repository. */
export async function status(root: string): Promise<RepoStatus> {
  const [porcelain, head, up] = await Promise.all([
    git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], root),
    git(['rev-parse', '--abbrev-ref', 'HEAD'], root),
    upstreamState(root),
  ])
  const entries = parsePorcelain(porcelain.stdout)
  const staged: StatusEntry[] = []
  const unstaged: StatusEntry[] = []
  const untracked: StatusEntry[] = []
  const conflicts: StatusEntry[] = []
  for (const entry of entries) {
    const [index, work] = [entry.code[0] ?? ' ', entry.code[1] ?? ' ']
    const unmerged = ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(entry.code)
    if (unmerged) {
      conflicts.push(entry)
      continue
    }
    if (entry.code === '??') {
      untracked.push(entry)
      continue
    }
    if (index !== ' ' && index !== '?') staged.push(entry)
    if (work !== ' ' && work !== '?') unstaged.push(entry)
  }
  const rawHead = head.stdout.trim()
  const detached = rawHead === 'HEAD' || /^[0-9a-f]{7,40}$/.test(rawHead)
  return {
    branch: detached ? (await git(['rev-parse', '--short', 'HEAD'], root)).stdout.trim() : rawHead,
    detached,
    upstream: up.upstream,
    ahead: up.ahead,
    behind: up.behind,
    staged,
    unstaged,
    untracked,
    conflicts,
  }
}

/** One branch as the picker shows it. */
export interface BranchInfo {
  readonly name: string
  readonly current: boolean
  readonly remote: boolean
  readonly upstream: string | null
  readonly shortHash: string
  readonly subject: string
}

/**
 * List local and remote-tracking branches, current branch first.
 * @param root - repository root.
 */
export async function branches(root: string): Promise<BranchInfo[]> {
  const format = '%(refname)%00%(objectname:short)%00%(upstream:short)%00%(contents:subject)'
  const result = await git(
    ['for-each-ref', `--format=${format}`, '--sort=-committerdate', 'refs/heads', 'refs/remotes'],
    root,
  )
  const head = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], root)).stdout.trim()
  const out: BranchInfo[] = []
  for (const line of result.stdout.split('\n')) {
    if (line.trim() === '') continue
    const [ref = '', hash = '', upstream = '', subject = ''] = line.split('\0')
    const remote = ref.startsWith('refs/remotes/')
    const name = remote ? ref.slice('refs/remotes/'.length) : ref.slice('refs/heads/'.length)
    // `origin/HEAD` is a symbolic alias, not a branch worth switching to.
    if (name.endsWith('/HEAD')) continue
    out.push({ name, current: !remote && name === head, remote, upstream: upstream === '' ? null : upstream, shortHash: hash, subject })
  }
  return out.sort((a, b) => Number(b.current) - Number(a.current))
}

/** Unified diff text for one file (or the whole tree when `file` is omitted). */
export async function diff(root: string, file: string | undefined, staged: boolean): Promise<string> {
  const args = ['diff', '--no-color', '--unified=3']
  if (staged) args.push('--cached')
  if (file !== undefined && file !== '') args.push('--', file)
  const result = await git(args, root)
  // An untracked file has no diff; show it as an all-added view instead.
  if (result.stdout.trim() === '' && file !== undefined && !staged) {
    const tracked = await git(['ls-files', '--error-unmatch', '--', file], root)
    if (tracked.code !== 0) {
      const content = await git(['diff', '--no-index', '--no-color', '--unified=3', '/dev/null', file], root)
      return content.stdout
    }
  }
  return result.stdout
}

/** Recent commits, for the panel's history strip. */
export async function log(root: string, limit: number): Promise<Array<{ hash: string; subject: string; author: string; date: string }>> {
  const format = '%h%x00%s%x00%an%x00%ad'
  const result = await git(['log', `--max-count=${limit}`, '--date=short', `--pretty=format:${format}`], root)
  return result.stdout
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      const [hash = '', subject = '', author = '', date = ''] = line.split('\0')
      return { hash, subject, author, date }
    })
}

/** Repositories the panel may act on inside one workspace: the workspace itself plus direct subdirectories. */
export async function discoverRepos(workspaceRoot: string): Promise<Array<{ path: string; name: string; branch: string }>> {
  const found: Array<{ path: string; name: string; branch: string }> = []
  const add = async (dir: string, name: string): Promise<void> => {
    const top = await repositoryRoot(dir)
    if (top === null) return
    if (found.some(item => item.path === top)) return
    const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], top)).stdout.trim()
    found.push({ path: top, name, branch })
  }
  await add(workspaceRoot, workspaceRoot.split('/').filter(Boolean).pop() ?? workspaceRoot)
  const { readdir } = await import('node:fs/promises')
  const dirents = await readdir(workspaceRoot, { withFileTypes: true }).catch(() => [])
  for (const dirent of dirents) {
    if (!dirent.isDirectory() || dirent.name.startsWith('.')) continue
    await add(`${workspaceRoot}/${dirent.name}`, dirent.name)
  }
  return found
}

/** Remotes configured on a repository, for the fetch/pull/push target picker. */
export async function remotes(root: string): Promise<string[]> {
  const result = await git(['remote'], root)
  return result.stdout.split('\n').map(line => line.trim()).filter(line => line !== '')
}
