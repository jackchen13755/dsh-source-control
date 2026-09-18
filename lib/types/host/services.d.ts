/**
 * The two host services this plugin consumes, declared structurally.
 *
 * The product ships its service faces by declaration-merging into
 * `@deepseek-ai/cordis`; reaching them through a local structural type keeps
 * this package buildable against any DSH version that still offers the same
 * two methods, and cannot collide with a future upstream declaration.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
/** One registered HTTP route, as `ctx.webServer.register` takes it. */
export interface WebRoute {
    readonly kind: 'prefix' | 'exact';
    readonly path: string;
    readonly handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
}
/** The web server's registration face. */
export interface WebServerLike {
    register(route: WebRoute): () => void;
}
/** The session store's lookup face. */
/** One registered workspace, as the picker lists it. */
export interface WorkspaceLike {
    readonly id: unknown;
    readonly path: string;
    readonly title?: string;
}
/** The workspace registry's list/create face. */
export interface WorkspaceRegistryLike {
    list(): readonly WorkspaceLike[];
    create(path: string, title?: string): Promise<WorkspaceLike>;
    delete(id: unknown): Promise<void>;
}
export interface SessionStoreLike {
    get(id: string): {
        readonly header?: {
            readonly cwd?: string;
        };
    } | undefined;
}
/**
 * Read the web server service.
 * @param ctx - host context.
 */
export declare function webServerOf(ctx: Context): WebServerLike;
/**
 * Read the session store service.
 * @param ctx - host context.
 */
export declare function sessionsOf(ctx: Context): SessionStoreLike;
/**
 * Read the workspace registry service.
 * @param ctx - host context.
 * @returns the registry, or undefined when this DSH build does not expose one.
 */
export declare function workspaceRegistryOf(ctx: Context): WorkspaceRegistryLike | undefined;
