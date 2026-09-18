import type { Context } from '@deepseek-ai/cordis';
/** Route prefix owned by this plugin. */
export declare const ROUTE_PREFIX = "/dsh-source-control";
/** Settings the browser half reads back from the host so both halves agree. */
export interface RouteOptions {
    /** Default number of commits in the history strip. */
    readonly recentCommits: number;
    /** Refresh interval the panel should use, in milliseconds. */
    readonly pollMs: number;
    /** Remote pre-selected for fetch/pull/push. */
    readonly defaultRemote: string;
    /** Managed home for created worktrees; empty means the default under DSH_HOME. */
    readonly worktreeHome: string;
}
/**
 * Mount the plugin's HTTP surface.
 * @param ctx - host context (needs `webServer`).
 * @param options - resolved plugin configuration, echoed to the browser half.
 * @returns disposer removing the route.
 */
export declare function registerRoutes(ctx: Context, options: RouteOptions): () => void;
