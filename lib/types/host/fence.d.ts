import type { IncomingMessage } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
/**
 * Whether a request originates on this machine.
 * @param request - the incoming HTTP request.
 */
export declare function isLoopback(request: IncomingMessage): boolean;
/**
 * The absolute working directory a session was created in.
 * @param ctx - host context carrying the session store.
 * @param sessionId - the asking session's id.
 * @returns the directory, or undefined when the session is unknown or has none.
 */
export declare function sessionRoot(ctx: Context, sessionId: string): string | undefined;
/**
 * Resolve a caller-named repository against the roots this session may reach.
 *
 * The session's own workspace is always allowed. Extra roots — workspaces the
 * user registered with DSH, plus the managed worktree home — are passed in by
 * the caller, because a worktree deliberately lives outside the checkout it was
 * branched from and would otherwise be unreachable.
 *
 * @param workspaceRoot - the session's working directory (the primary fence).
 * @param candidate - an absolute path the caller asked for, or undefined for the workspace itself.
 * @param extraRoots - further roots this request may reach.
 * @returns the canonical repository path, or null when it escapes every root.
 */
export declare function resolveWithin(workspaceRoot: string, candidate: string | undefined, extraRoots?: readonly string[]): string | null;
