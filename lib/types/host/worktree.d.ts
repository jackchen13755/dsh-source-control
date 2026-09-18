import type { Context } from '@deepseek-ai/cordis';
/** One linked worktree, as the panel lists it. */
export interface WorktreeInfo {
    /** Absolute worktree path. */
    readonly path: string;
    /** Checked-out branch, or null when detached. */
    readonly branch: string | null;
    /** Short HEAD hash. */
    readonly head: string;
    /** The repository's main worktree — never removable. */
    readonly main: boolean;
    /** Whether the worktree has uncommitted changes (removal guard). */
    readonly dirty: boolean;
}
/**
 * Default managed home for created worktrees.
 * @returns `$DSH_HOME/source-control/worktrees`, falling back to `~/.dsh/...`.
 */
export declare function defaultWorktreeHome(): string;
/**
 * Resolve the configured home, expanding `~`.
 * @param configured - the config value; empty means the default home.
 */
export declare function worktreeHome(configured: string): string;
/**
 * Where a new worktree of `repoRoot` named `name` should live.
 * @param home - managed home directory.
 * @param repoRoot - the repository the worktree branches off.
 * @param name - sanitized worktree name.
 */
export declare function worktreeTarget(home: string, repoRoot: string, name: string): string;
/**
 * Restrict a user-typed worktree name to something safe as a path segment and
 * a branch component.
 * @param raw - the typed name.
 * @returns the sanitized name, or null when nothing usable remains.
 */
export declare function sanitizeName(raw: string): string | null;
/** Create the managed home (and the repository subdirectory) for a worktree. */
export declare function ensureParent(path: string): void;
/**
 * List a repository's worktrees, flagging the main one and any dirty tree.
 * @param root - repository root.
 */
export declare function listWorktrees(root: string): Promise<WorktreeInfo[]>;
/**
 * Add a linked worktree, creating its branch.
 * @param root - repository root.
 * @param target - absolute path for the new worktree.
 * @param branch - branch to create or check out.
 * @param base - base revision for a new branch; empty means HEAD.
 * @param createBranch - false to check out an existing branch instead of creating one.
 */
export declare function addWorktree(root: string, target: string, branch: string, base: string, createBranch: boolean): Promise<{
    code: number;
    stderr: string;
    stdout: string;
}>;
/**
 * Remove a linked worktree.
 * @param root - repository root.
 * @param target - absolute path of the worktree.
 * @param force - remove even with local changes (a double `--force` also drops a locked tree).
 */
export declare function removeWorktree(root: string, target: string, force: boolean): Promise<{
    code: number;
    stderr: string;
    stdout: string;
}>;
/** Drop administrative records of worktrees whose directories are gone. */
export declare function pruneWorktrees(root: string): Promise<{
    code: number;
    stderr: string;
    stdout: string;
}>;
/**
 * Paths of workspaces the user has registered with DSH.
 * @param ctx - host context; a missing registry yields an empty list.
 */
export declare function registeredWorkspaces(ctx: Context): string[];
/**
 * Drop a worktree's DSH workspace registration once the directory is gone, so
 * the workspace picker cannot offer a checkout that no longer exists.
 * @param ctx - host context.
 * @param path - the removed worktree's path.
 * @returns whether a registration was removed.
 */
export declare function unregisterWorkspace(ctx: Context, path: string): Promise<boolean>;
/**
 * Make a worktree reachable to DSH by registering it as a workspace, so a new
 * session can be started directly on it.
 * @param ctx - host context.
 * @param path - worktree path.
 * @param title - display name in the workspace picker.
 * @returns whether registration succeeded (a missing registry is not an error).
 */
export declare function registerWorkspace(ctx: Context, path: string, title: string): Promise<boolean>;
