/**
 * Trust fence for dsh-source-control.
 *
 * Two independent gates stand in front of every route, and both must pass:
 *
 * 1. **Transport** — the request must arrive over loopback. The panel is a
 *    local desktop feature; a LAN client has no business reading a repository
 *    index or pushing branches, so nothing but 127.0.0.1/::1 is accepted.
 * 2. **Reach** — the caller never names a path. It names a SESSION, the host
 *    resolves that session's working directory from the session store, and any
 *    repository the caller then asks for must resolve to that directory or
 *    somewhere below it (symlinks resolved before comparison). There is no
 *    parameter that can widen this: unlike a naive `?path=` design, a forged
 *    request can only reach repositories the asking session already sits in.
 */
import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { sessionsOf } from './services.js';
/** Loopback addresses in the forms Node reports them. */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
/**
 * Whether a request originates on this machine.
 * @param request - the incoming HTTP request.
 */
export function isLoopback(request) {
    const address = request.socket.remoteAddress;
    if (address === undefined || address === null)
        return false;
    // A unix-domain socket (no address) is local by construction.
    if (address === '')
        return true;
    return LOOPBACK.has(address) || address.startsWith('127.');
}
/**
 * The absolute working directory a session was created in.
 * @param ctx - host context carrying the session store.
 * @param sessionId - the asking session's id.
 * @returns the directory, or undefined when the session is unknown or has none.
 */
export function sessionRoot(ctx, sessionId) {
    const session = sessionsOf(ctx).get(sessionId);
    const cwd = session?.header?.cwd;
    return typeof cwd === 'string' && cwd !== '' ? cwd : undefined;
}
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
export function resolveWithin(workspaceRoot, candidate, extraRoots = []) {
    const base = canonical(workspaceRoot);
    if (base === null)
        return null;
    if (candidate === undefined || candidate === '')
        return base;
    if (!isAbsolute(candidate))
        return null;
    const target = canonical(candidate);
    if (target === null)
        return null;
    for (const root of [workspaceRoot, ...extraRoots]) {
        const canonicalRoot = canonical(root);
        if (canonicalRoot === null)
            continue;
        if (target === canonicalRoot)
            return target;
        const rel = relative(canonicalRoot, target);
        if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)) {
            return resolve(canonicalRoot, rel.split(sep).join(sep));
        }
    }
    return null;
}
/** `realpathSync` that reports failure as null instead of throwing. */
function canonical(path) {
    try {
        return realpathSync(path);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=fence.js.map