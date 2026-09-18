/**
 * dsh-source-control — host half.
 *
 * Git operations for the Source Control panel, exposed as one loopback-only
 * JSON route. The browser half (this package's `./client` export) never names a
 * path: it names the session it is drawn in, and this half resolves that
 * session's working directory before touching git. See `host/fence.ts`.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'
import { registerRoutes, type RouteOptions } from './host/routes.js'

/** Plugin identity, as the loader records it. */
export const name = 'dsh-source-control'

/**
 * Services this half needs. `sessions` resolves the asking session's working
 * directory — the fence every request passes through — so the plugin stays
 * unloaded rather than half-working when either service is missing.
 */
export const inject = ['webServer', 'sessions']

/** Operator-facing knobs, set on the bundle row in the profile. */
export interface Config {
  /** Commits listed in the panel's history strip. */
  recentCommits: number
  /** Panel refresh interval in milliseconds (0 disables automatic refresh). */
  pollMs: number
  /** Remote pre-selected for fetch/pull/push; empty means the branch's own upstream. */
  defaultRemote: string
  /** Managed home for created worktrees; empty means $DSH_HOME/source-control/worktrees. */
  worktreeHome: string
}

export const Config: z<Config> = z.object({
  recentCommits: z.number().default(20),
  pollMs: z.number().default(5000),
  defaultRemote: z.string().default(''),
  worktreeHome: z.string().default(''),
})

/**
 * Mount the git route.
 * @param ctx - host context carrying `webServer`.
 * @param config - resolved plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const options: RouteOptions = {
    recentCommits: Math.max(1, Math.min(200, Math.floor(config.recentCommits))),
    pollMs: Math.max(0, Math.min(60_000, Math.floor(config.pollMs))),
    defaultRemote: config.defaultRemote,
    worktreeHome: config.worktreeHome,
  }
  ctx.effect(
    () => registerRoutes(ctx, options),
    'dsh-source-control: git routes',
  )
}
