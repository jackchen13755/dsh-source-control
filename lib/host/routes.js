import * as gitApi from './git.js';
import { isLoopback, resolveWithin, sessionRoot } from './fence.js';
import { webServerOf } from './services.js';
import { addWorktree, ensureParent, listWorktrees, pruneWorktrees, registerWorkspace, registeredWorkspaces, removeWorktree, sanitizeName, unregisterWorkspace, worktreeHome, worktreeTarget, } from './worktree.js';
/** Route prefix owned by this plugin. */
export const ROUTE_PREFIX = '/dsh-source-control';
/** Body ceiling: a commit message and a few hundred paths, nothing more. */
const MAX_BODY_BYTES = 512 * 1024;
function fail(code, message, detail) {
    return { ok: false, error: detail === undefined ? { code, message } : { code, message, detail } };
}
/** Read and parse a bounded JSON body. */
async function readBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = chunk;
        size += buffer.length;
        if (size > MAX_BODY_BYTES)
            return null;
        chunks.push(buffer);
    }
    if (size === 0)
        return {};
    try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return typeof parsed === 'object' && parsed !== null ? parsed : null;
    }
    catch {
        return null;
    }
}
function send(response, status, payload) {
    const text = JSON.stringify(payload);
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
    });
    response.end(text);
}
/**
 * Resolve the session → workspace → repository chain for one request.
 * @returns the scoped request, or the refusal to send back.
 */
function scope(ctx, body, options) {
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    if (sessionId === '')
        return fail('no-session', 'sessionId is required');
    const workspace = sessionRoot(ctx, sessionId);
    if (workspace === undefined)
        return fail('unknown-session', 'the session has no working directory');
    // A worktree lives outside the checkout it branched from, so the roots this
    // request may reach are widened — but only to paths DSH already knows: the
    // user's registered workspaces and this plugin's own worktree home.
    const extraRoots = [...registeredWorkspaces(ctx), worktreeHome(options.worktreeHome)];
    const repo = resolveWithin(workspace, typeof body.repo === 'string' ? body.repo : undefined, extraRoots);
    if (repo === null)
        return fail('outside-workspace', 'the requested repository is outside the session workspace');
    return { root: workspace, repo, body };
}
function isFailure(value) {
    return value.ok === false;
}
/** String-list field, rejecting anything that is not a plain relative path. */
function relativePaths(value) {
    if (!Array.isArray(value))
        return null;
    const out = [];
    for (const item of value) {
        if (typeof item !== 'string' || item === '' || item.startsWith('/') || item.split('/').includes('..'))
            return null;
        out.push(item);
    }
    return out;
}
function str(value) {
    return typeof value === 'string' ? value.trim() : '';
}
/** Whether `name` is a branch name git itself would accept. */
async function validBranchName(repo, name) {
    if (name === '' || name.startsWith('-'))
        return false;
    const check = await gitApi.git(['check-ref-format', '--branch', name], repo);
    return check.code === 0;
}
/** Run one named operation against a scoped repository. */
async function operate(ctx, name, scoped, options) {
    const { repo, body } = scoped;
    const remote = str(body.remote);
    switch (name) {
        case 'context': {
            const repos = await gitApi.discoverRepos(scoped.root);
            const isRepo = await gitApi.isRepository(repo);
            return {
                ok: true,
                value: {
                    workspace: scoped.root,
                    repo,
                    isRepo,
                    repos,
                    remotes: isRepo ? await gitApi.remotes(repo) : [],
                    worktrees: isRepo ? await listWorktrees(repo) : [],
                    worktreeHome: worktreeHome(options.worktreeHome),
                    options,
                },
            };
        }
        case 'status': {
            if (!(await gitApi.isRepository(repo)))
                return fail('not-a-repository', 'this directory is not a git repository');
            const status = await gitApi.status(repo);
            return { ok: true, value: { status, remotes: await gitApi.remotes(repo) } };
        }
        case 'diff': {
            const file = str(body.file);
            const diff = await gitApi.diff(repo, file === '' ? undefined : file, body.staged === true);
            return { ok: true, value: { diff } };
        }
        case 'log': {
            const limit = typeof body.limit === 'number' && body.limit > 0 && body.limit <= 200 ? body.limit : options.recentCommits;
            return { ok: true, value: { commits: await gitApi.log(repo, limit) } };
        }
        case 'branches':
            return { ok: true, value: { branches: await gitApi.branches(repo) } };
        case 'stage':
        case 'unstage': {
            const files = relativePaths(body.files);
            if (files === null || files.length === 0)
                return fail('bad-files', 'files must be a non-empty list of relative paths');
            const args = name === 'stage'
                ? ['add', '--', ...files]
                : ['restore', '--staged', '--', ...files];
            const result = await gitApi.git(args, repo);
            return result.code === 0 ? { ok: true, value: { files } } : fail('git-failed', `${name} failed`, result.stderr);
        }
        case 'discard': {
            if (body.confirm !== true)
                return fail('needs-confirm', 'discarding changes requires confirm: true');
            const files = relativePaths(body.files);
            if (files === null || files.length === 0)
                return fail('bad-files', 'files must be a non-empty list of relative paths');
            // Untracked files have no committed content to restore: remove them instead.
            const untracked = [];
            const tracked = [];
            for (const file of files) {
                const trackedCheck = await gitApi.git(['ls-files', '--error-unmatch', '--', file], repo);
                (trackedCheck.code === 0 ? tracked : untracked).push(file);
            }
            const messages = [];
            if (tracked.length > 0) {
                // Unstage first so a staged edit is discarded from both sides.
                await gitApi.git(['restore', '--staged', '--', ...tracked], repo);
                const restore = await gitApi.git(['restore', '--', ...tracked], repo);
                if (restore.code !== 0)
                    return fail('git-failed', 'discard failed', restore.stderr);
                messages.push(...tracked);
            }
            if (untracked.length > 0) {
                const clean = await gitApi.git(['clean', '-f', '--', ...untracked], repo);
                if (clean.code !== 0)
                    return fail('git-failed', 'removing untracked files failed', clean.stderr);
                messages.push(...untracked);
            }
            return { ok: true, value: { discarded: messages } };
        }
        case 'commit': {
            const message = str(body.message);
            if (message === '')
                return fail('no-message', 'a commit message is required');
            const result = await gitApi.git(['commit', '-m', message], repo);
            if (result.code !== 0)
                return fail('git-failed', 'commit failed', `${result.stdout}\n${result.stderr}`);
            return { ok: true, value: { output: `${result.stdout}${result.stderr}`.trim() } };
        }
        case 'switch': {
            const branch = str(body.branch);
            if (!(await validBranchName(repo, branch)))
                return fail('bad-branch', 'invalid branch name');
            const result = await gitApi.git(['switch', '--no-guess', '--', branch], repo);
            return result.code === 0
                ? { ok: true, value: { branch } }
                : fail('git-failed', `switching to ${branch} failed`, `${result.stdout}${result.stderr}`);
        }
        case 'branch-create': {
            const branch = str(body.name);
            if (!(await validBranchName(repo, branch)))
                return fail('bad-branch', 'invalid branch name');
            // The base is a caller-chosen revision: it must resolve to a commit, so a
            // typo (or an option-shaped string) is refused instead of reaching git.
            const base = str(body.base);
            if (base !== '') {
                if (base.startsWith('-'))
                    return fail('bad-base', 'invalid base revision');
                const verified = await gitApi.git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`], repo);
                if (verified.code !== 0)
                    return fail('bad-base', `来源无法解析：${base}`);
            }
            const args = base === '' ? ['switch', '-c', branch] : ['switch', '-c', branch, base];
            const result = await gitApi.git(args, repo);
            if (result.code !== 0) {
                return fail('git-failed', `creating ${branch} failed`, `${result.stdout}${result.stderr}`);
            }
            // `git switch -c` sets the upstream when the base is a remote-tracking
            // branch; report it so the panel can say so.
            const upstream = await gitApi.git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], repo);
            return { ok: true, value: { branch, base: base === '' ? null : base, upstream: upstream.code === 0 ? upstream.stdout.trim() : null } };
        }
        case 'branch-delete': {
            if (body.confirm !== true)
                return fail('needs-confirm', 'deleting a branch requires confirm: true');
            const branch = str(body.name);
            if (!(await validBranchName(repo, branch)))
                return fail('bad-branch', 'invalid branch name');
            const result = await gitApi.git(['branch', body.force === true ? '-D' : '-d', '--', branch], repo);
            return result.code === 0 ? { ok: true, value: { branch } } : fail('git-failed', `deleting ${branch} failed`, result.stderr);
        }
        case 'merge': {
            const branch = str(body.branch);
            if (!(await validBranchName(repo, branch)))
                return fail('bad-branch', 'invalid branch name');
            const result = await gitApi.git(['merge', '--no-edit', '--', branch], repo);
            if (result.code !== 0) {
                // A failed merge is usually a conflict: name the paths so the panel can
                // list them instead of showing only git's prose.
                const after = await gitApi.status(repo);
                const paths = after.conflicts.map(entry => entry.path).join(', ');
                const detail = [
                    paths === '' ? undefined : `conflicted paths: ${paths}`,
                    `${result.stdout}${result.stderr}`.trim(),
                ].filter((line) => line !== undefined && line !== '').join('\n');
                return fail('merge-failed', `merging ${branch} failed`, detail);
            }
            return { ok: true, value: { output: `${result.stdout}${result.stderr}`.trim() } };
        }
        case 'fetch': {
            const args = remote === '' ? ['fetch', '--prune'] : ['fetch', '--prune', '--', remote];
            const result = await gitApi.git(args, repo);
            return result.code === 0 ? { ok: true, value: { output: result.stderr.trim() } } : fail('git-failed', 'fetch failed', result.stderr);
        }
        case 'pull': {
            // `mode` picks the integration: fast-forward only by default, an explicit
            // merge when the caller asks for one.
            const args = ['pull', body.mode === 'merge' ? '--no-rebase' : '--ff-only'];
            if (remote !== '') {
                args.push('--', remote);
                const branch = str(body.branch);
                if (branch !== '')
                    args.push(branch);
            }
            const result = await gitApi.git(args, repo);
            if (result.code !== 0) {
                const hint = /not possible to fast-forward|divergent/i.test(`${result.stdout}${result.stderr}`)
                    ? '分支已分叉：改用「拉取（合并）」或先手动处理'
                    : undefined;
                return fail('pull-failed', 'pull failed', [hint, `${result.stdout}${result.stderr}`.trim()].filter(Boolean).join('\n'));
            }
            return { ok: true, value: { output: `${result.stdout}${result.stderr}`.trim() } };
        }
        case 'push': {
            if (body.confirm !== true)
                return fail('needs-confirm', 'pushing requires confirm: true');
            const branch = str(body.branch);
            const setUpstream = body.setUpstream === true;
            const args = ['push'];
            if (setUpstream) {
                // Publishing: a branch that exists only locally has no remote-tracking
                // ref to push to, so the push must name it and record the relationship
                // in one step (this is git's own \`--set-upstream\`).
                if (!(await validBranchName(repo, branch))) {
                    return fail('bad-branch', 'publishing a branch needs its local branch name');
                }
                const available = await gitApi.remotes(repo);
                const target = remote === '' ? (available[0] ?? 'origin') : remote;
                args.push('--set-upstream', '--', target, branch);
            }
            else {
                if (remote !== '')
                    args.push('--', remote);
                if (remote !== '' && branch !== '')
                    args.push(branch);
            }
            const result = await gitApi.git(args, repo);
            if (result.code === 0)
                return { ok: true, value: { output: result.stderr.trim(), published: setUpstream } };
            const detail = `${result.stdout}${result.stderr}`.trim();
            // The one failure every new branch hits: no upstream. Say what to do
            // instead of relaying git's suggestion verbatim.
            if (/has no upstream branch|--set-upstream/i.test(detail)) {
                return fail('no-upstream', '当前分支在远端还没有上游分支', `${detail}\n\n点「发布分支」会以 --set-upstream 推送并在同一步建立跟踪关系。`);
            }
            return fail('git-failed', 'push failed', detail);
        }
        case 'worktree-list': {
            if (!(await gitApi.isRepository(repo)))
                return fail('not-a-repository', 'this directory is not a git repository');
            return { ok: true, value: { worktrees: await listWorktrees(repo), home: worktreeHome(options.worktreeHome) } };
        }
        case 'worktree-add': {
            if (!(await gitApi.isRepository(repo)))
                return fail('not-a-repository', 'this directory is not a git repository');
            const name = sanitizeName(str(body.name));
            if (name === null)
                return fail('bad-name', 'a worktree name containing letters or digits is required');
            const suggested = str(body.branch);
            const branch = suggested === '' ? `wt/${name}` : suggested;
            if (!(await validBranchName(repo, branch)))
                return fail('bad-branch', 'invalid branch name');
            const home = worktreeHome(options.worktreeHome);
            const target = worktreeTarget(home, repo, name);
            // An existing branch is checked out; a fresh name is created from the base.
            const existing = await gitApi.git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], repo);
            ensureParent(target);
            const created = await addWorktree(repo, target, branch, str(body.base), existing.code !== 0);
            if (created.code !== 0) {
                return fail('git-failed', `creating worktree ${name} failed`, `${created.stdout}${created.stderr}`);
            }
            // Registering it with DSH is what makes the checkout reachable: a new
            // session can then be started directly on the worktree.
            const registered = await registerWorkspace(ctx, target, `wt: ${name}`);
            return { ok: true, value: { path: target, branch, name, registered } };
        }
        case 'worktree-remove': {
            if (body.confirm !== true)
                return fail('needs-confirm', 'removing a worktree requires confirm: true');
            const extraRoots = [...registeredWorkspaces(ctx), worktreeHome(options.worktreeHome)];
            const target = resolveWithin(scoped.root, str(body.worktree), extraRoots);
            if (target === null)
                return fail('outside-workspace', 'the worktree is outside every root this session may reach');
            const listed = await listWorktrees(repo);
            const entry = listed.find(item => item.path === target);
            if (entry === undefined)
                return fail('unknown-worktree', 'no such worktree of this repository');
            if (entry.main)
                return fail('worktree-is-main', 'the main worktree cannot be removed');
            if (entry.dirty && body.force !== true) {
                return fail('worktree-dirty', 'the worktree has uncommitted changes; force removal was not requested');
            }
            const removed = await removeWorktree(repo, target, body.force === true);
            if (removed.code !== 0)
                return fail('git-failed', 'removing the worktree failed', `${removed.stdout}${removed.stderr}`);
            // The registration would otherwise dangle and offer a checkout that is gone.
            const unregistered = await unregisterWorkspace(ctx, target);
            return { ok: true, value: { removed: target, branch: entry.branch, unregistered } };
        }
        case 'worktree-prune': {
            const pruned = await pruneWorktrees(repo);
            return pruned.code === 0
                ? { ok: true, value: { output: `${pruned.stdout}${pruned.stderr}`.trim() } }
                : fail('git-failed', 'pruning worktrees failed', pruned.stderr);
        }
        case 'init': {
            const result = await gitApi.git(['init'], repo);
            return result.code === 0 ? { ok: true, value: { output: result.stdout.trim() } } : fail('git-failed', 'git init failed', result.stderr);
        }
        default:
            return fail('unknown-op', `unknown operation: ${name}`);
    }
}
/**
 * Mount the plugin's HTTP surface.
 * @param ctx - host context (needs `webServer`).
 * @param options - resolved plugin configuration, echoed to the browser half.
 * @returns disposer removing the route.
 */
export function registerRoutes(ctx, options) {
    const handler = async (request, response) => {
        // The web server turns any escaping exception into a bare 400, which tells
        // the caller nothing; keeping failures inside the envelope makes them
        // diagnosable from the panel.
        try {
            if (!isLoopback(request)) {
                send(response, 403, fail('forbidden', 'dsh-source-control is loopback-only'));
                return;
            }
            if (request.method !== 'POST') {
                send(response, 405, fail('method', 'POST required'));
                return;
            }
            const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
            const operation = pathname.startsWith(`${ROUTE_PREFIX}/`) ? pathname.slice(ROUTE_PREFIX.length + 1) : '';
            if (operation === '' || operation.includes('/')) {
                send(response, 404, fail('not-found', 'unknown route'));
                return;
            }
            const body = await readBody(request);
            if (body === null) {
                send(response, 400, fail('bad-body', 'a JSON body is required'));
                return;
            }
            const scoped = scope(ctx, body, options);
            if (isFailure(scoped)) {
                send(response, scoped.error.code === 'outside-workspace' || scoped.error.code === 'unknown-session' ? 403 : 400, scoped);
                return;
            }
            const outcome = await operate(ctx, operation, scoped, options);
            send(response, outcome.ok ? 200 : 409, outcome);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.logger?.warn?.(error instanceof Error ? error : new Error(message));
            if (!response.headersSent)
                send(response, 500, fail('internal', message));
            else
                response.end();
        }
    };
    return webServerOf(ctx).register({ kind: 'prefix', path: ROUTE_PREFIX, handler });
}
//# sourceMappingURL=routes.js.map