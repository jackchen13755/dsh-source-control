/** One finished git invocation. */
export interface GitResult {
    /** Process exit code; `-1` when the process could not be spawned at all. */
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
}
/**
 * Run one git command in a repository.
 * @param args - argv after the program name, e.g. `['status', '--porcelain']`.
 * @param cwd - absolute directory to run in.
 * @param options - `allowFailure` keeps a non-zero exit as data; `timeoutMs` overrides the default.
 * @returns exit code plus captured stdout/stderr.
 */
export declare function git(args: readonly string[], cwd: string, options?: {
    readonly timeoutMs?: number;
}): Promise<GitResult>;
/** Whether a directory is inside a git work tree. */
export declare function isRepository(dir: string): Promise<boolean>;
/** Absolute work-tree root of the repository containing `dir`, if any. */
export declare function repositoryRoot(dir: string): Promise<string | null>;
/** One parsed `git status --porcelain=v1` entry. */
export interface StatusEntry {
    /** The file's path relative to the repository root. */
    readonly path: string;
    /** Previous path for a rename or copy. */
    readonly from?: string;
    /** Two-letter porcelain code, e.g. `M `, ` M`, `??`, `UU`. */
    readonly code: string;
}
/** Everything the changes view needs about one repository. */
export interface RepoStatus {
    readonly branch: string;
    /** Detached HEAD reports its short hash as the branch and sets this. */
    readonly detached: boolean;
    readonly upstream: string | null;
    readonly ahead: number;
    readonly behind: number;
    /** Index column non-`?`/space: staged changes. */
    readonly staged: readonly StatusEntry[];
    /** Work-tree column: unstaged modifications and deletions. */
    readonly unstaged: readonly StatusEntry[];
    readonly untracked: readonly StatusEntry[];
    /** Unmerged paths (`UU`, `AA`, `DU`, …). */
    readonly conflicts: readonly StatusEntry[];
}
/** Read the full change state of one repository. */
export declare function status(root: string): Promise<RepoStatus>;
/** One branch as the picker shows it. */
export interface BranchInfo {
    readonly name: string;
    readonly current: boolean;
    readonly remote: boolean;
    readonly upstream: string | null;
    readonly shortHash: string;
    readonly subject: string;
}
/**
 * List local and remote-tracking branches, current branch first.
 * @param root - repository root.
 */
export declare function branches(root: string): Promise<BranchInfo[]>;
/** Unified diff text for one file (or the whole tree when `file` is omitted). */
export declare function diff(root: string, file: string | undefined, staged: boolean): Promise<string>;
/** Recent commits, for the panel's history strip. */
export declare function log(root: string, limit: number): Promise<Array<{
    hash: string;
    subject: string;
    author: string;
    date: string;
}>>;
/** Repositories the panel may act on inside one workspace: the workspace itself plus direct subdirectories. */
export declare function discoverRepos(workspaceRoot: string): Promise<Array<{
    path: string;
    name: string;
    branch: string;
}>>;
/** Remotes configured on a repository, for the fetch/pull/push target picker. */
export declare function remotes(root: string): Promise<string[]>;
