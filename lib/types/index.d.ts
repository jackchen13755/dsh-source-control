/**
 * dsh-source-control — host half.
 *
 * Git operations for the Source Control panel, exposed as one loopback-only
 * JSON route. The browser half (this package's `./client` export) never names a
 * path: it names the session it is drawn in, and this half resolves that
 * session's working directory before touching git. See `host/fence.ts`.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from 'schemastery';
/** Plugin identity, as the loader records it. */
export declare const name = "dsh-source-control";
/**
 * Services this half needs. `sessions` resolves the asking session's working
 * directory — the fence every request passes through — so the plugin stays
 * unloaded rather than half-working when either service is missing.
 */
export declare const inject: string[];
/** Operator-facing knobs, set on the bundle row in the profile. */
export interface Config {
    /** Commits listed in the panel's history strip. */
    recentCommits: number;
    /** Panel refresh interval in milliseconds (0 disables automatic refresh). */
    pollMs: number;
    /** Remote pre-selected for fetch/pull/push; empty means the branch's own upstream. */
    defaultRemote: string;
    /** Managed home for created worktrees; empty means $DSH_HOME/source-control/worktrees. */
    worktreeHome: string;
}
export declare const Config: z<Config>;
/**
 * Mount the git route.
 * @param ctx - host context carrying `webServer`.
 * @param config - resolved plugin configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
