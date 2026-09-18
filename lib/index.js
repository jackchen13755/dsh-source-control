import z from 'schemastery';
import { registerRoutes } from './host/routes.js';
/** Plugin identity, as the loader records it. */
export const name = 'dsh-source-control';
/**
 * Services this half needs. `sessions` resolves the asking session's working
 * directory — the fence every request passes through — so the plugin stays
 * unloaded rather than half-working when either service is missing.
 */
export const inject = ['webServer', 'sessions'];
export const Config = z.object({
    recentCommits: z.number().default(20),
    pollMs: z.number().default(5000),
    defaultRemote: z.string().default(''),
    worktreeHome: z.string().default(''),
});
/**
 * Mount the git route.
 * @param ctx - host context carrying `webServer`.
 * @param config - resolved plugin configuration.
 */
export function apply(ctx, config) {
    const options = {
        recentCommits: Math.max(1, Math.min(200, Math.floor(config.recentCommits))),
        pollMs: Math.max(0, Math.min(60_000, Math.floor(config.pollMs))),
        defaultRemote: config.defaultRemote,
        worktreeHome: config.worktreeHome,
    };
    ctx.effect(() => registerRoutes(ctx, options), 'dsh-source-control: git routes');
}
//# sourceMappingURL=index.js.map