/**
 * Read the web server service.
 * @param ctx - host context.
 */
export function webServerOf(ctx) {
    return ctx.webServer;
}
/**
 * Read the session store service.
 * @param ctx - host context.
 */
export function sessionsOf(ctx) {
    return ctx.sessions;
}
/**
 * Read the workspace registry service.
 * @param ctx - host context.
 * @returns the registry, or undefined when this DSH build does not expose one.
 */
export function workspaceRegistryOf(ctx) {
    // Optional service: reading it through `get` keeps the plugin loadable on
    // compositions that have no workspace registry (nothing to register into),
    // instead of gating the whole plugin on a `inject` declaration.
    try {
        const registry = ctx.get?.('workspaceRegistry');
        return registry;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=services.js.map