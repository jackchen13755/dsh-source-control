window.__ModuleLoader__.load({
	id: "dsh-source-control",
	factory: (require) => {
		var __factories = [];
		var __cache = {};
		function __require(id) {
			if (__cache[id] === undefined) __cache[id] = __factories[id]();
			return __cache[id];
		}
__factories[0] = function () {
var module = { exports: {} }; var exports = module.exports;
"use strict";
/**
 * Typed client for the host's `/dsh-source-control/*` route.
 *
 * Every call carries the session id and nothing else that could name a path:
 * the host resolves the workspace from the session, so the panel cannot reach
 * outside the directory it is drawn in even if it wanted to.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScmError = void 0;
exports.call = call;
/** An operation failure, carrying git's own words when there are any. */
class ScmError extends Error {
    code;
    detail;
    constructor(code, message, detail = '') {
        super(message);
        this.name = 'ScmError';
        this.code = code;
        this.detail = detail;
    }
}
exports.ScmError = ScmError;
/**
 * Call one operation.
 * @param operation - route suffix, e.g. `status`.
 * @param sessionId - the session the panel is drawn in.
 * @param fields - operation parameters.
 * @returns the operation's value.
 * @throws ScmError when the host refuses or git fails.
 */
async function call(operation, sessionId, fields = {}) {
    const response = await fetch(`/dsh-source-control/${operation}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, ...fields }),
    });
    let envelope;
    try {
        envelope = (await response.json());
    }
    catch {
        throw new ScmError('bad-response', `the host answered ${response.status} without JSON`);
    }
    if (envelope.ok !== true || envelope.value === undefined) {
        const error = envelope.error ?? { code: 'unknown', message: 'the operation failed' };
        throw new ScmError(error.code, error.message, error.detail ?? '');
    }
    return envelope.value;
}

return module.exports;
};
__factories[1] = function () {
var module = { exports: {} }; var exports = module.exports;
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = void 0;
exports.apply = apply;
const panel_js_1 = __require(2);
/** Registration identity shared by the tab registry and the body slot. */
const TYPE_ID = 'dsh-source-control:scm';
/** Tab kind that `openTab` names. */
const KIND = 'source-control';
/** The slot registrar, with the framework's generic inference erased. */
/** `slots` is the only service needed before the first render. */
exports.inject = ['slots'];
/**
 * Register the tab type, its body, and the guide entry that opens it.
 * @param ctx - client context.
 */
function apply(ctx) {
    // The tab-type registry is provided by the right sidebar's client half, which
    // may arrive after this plugin: `inject` re-runs when it does.
    ctx.inject(['sidebarRightTabs'], injected => {
        const tabs = injected.get('sidebarRightTabs');
        if (tabs === undefined)
            return undefined;
        return tabs.register({
            id: TYPE_ID,
            kind: KIND,
            title: () => '源代码管理',
            guide: [
                {
                    id: 'source-control',
                    order: 30,
                    title: () => '源代码管理',
                    description: () => 'Git 改动、暂存、提交、分支与远程同步',
                },
            ],
        });
    });
    // Stage two: the body. The seat dispatches by the type id above and hands the
    // body its session id through this registration's inject factory.
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: TYPE_ID,
        inject: (sessionId) => ({ sessionId }),
    }, (props) => (0, panel_js_1.ScmPanel)(props))), 'dsh-source-control: panel body');
}

return module.exports;
};
__factories[2] = function () {
var module = { exports: {} }; var exports = module.exports;
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScmPanel = ScmPanel;
/**
 * The Source Control panel: a VS Code-shaped changes view rendered inside a
 * native right-sidebar tab.
 *
 * The panel is deliberately self-contained — one component, React's built-in
 * hooks, no state library — because it is drawn inside the product's own pane
 * and must not fight the shell for layout. It owns no DOM outside the tab body
 * the seat hands it.
 */
const react_1 = require("react");
const api_js_1 = __require(0);
const TOKEN = {
    text: 'var(--dsw-alias-text-1, #e6e6e6)',
    dim: 'var(--dsw-alias-text-3, #9a9a9a)',
    border: 'var(--dsw-alias-border-l2, #333)',
    hover: 'var(--dsw-alias-bg-2, rgba(255,255,255,.06))',
    accent: 'var(--dsw-alias-brand-1, #4d6bfe)',
    ok: 'var(--dsw-alias-success-1, #3fb950)',
    warn: 'var(--dsw-alias-warning-1, #d29922)',
    danger: 'var(--dsw-alias-danger-1, #f85149)',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};
const S = {
    root: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        fontSize: 12,
        lineHeight: 1.5,
        color: TOKEN.text,
        background: 'transparent',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 10px',
        borderBottom: `1px solid ${TOKEN.border}`,
        flexWrap: 'wrap',
    },
    branch: { fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 },
    dim: { color: TOKEN.dim },
    spacer: { flex: 1 },
    button: {
        border: `1px solid ${TOKEN.border}`,
        background: 'transparent',
        color: TOKEN.text,
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 12,
        cursor: 'pointer',
    },
    iconButton: {
        border: 'none',
        background: 'transparent',
        color: TOKEN.dim,
        cursor: 'pointer',
        fontSize: 12,
        padding: '0 4px',
    },
    tabs: { display: 'flex', gap: 2, padding: '4px 8px', borderBottom: `1px solid ${TOKEN.border}` },
    tab: {
        border: 'none',
        background: 'transparent',
        color: TOKEN.dim,
        cursor: 'pointer',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
    },
    tabActive: { background: TOKEN.hover, color: TOKEN.text, fontWeight: 600 },
    body: { flex: 1, minHeight: 0, overflow: 'auto' },
    sectionHead: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        color: TOKEN.dim,
        textTransform: 'uppercase',
        letterSpacing: '.04em',
        fontSize: 11,
    },
    row: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
    },
    badge: { fontFamily: TOKEN.mono, width: 14, textAlign: 'center', color: TOKEN.warn },
    path: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' },
    diff: {
        margin: 0,
        padding: 8,
        borderTop: `1px solid ${TOKEN.border}`,
        fontFamily: TOKEN.mono,
        fontSize: 11,
        whiteSpace: 'pre',
        overflow: 'auto',
        maxHeight: '45%',
        background: 'rgba(0,0,0,.18)',
    },
    commit: { borderTop: `1px solid ${TOKEN.border}`, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 },
    textarea: {
        width: '100%',
        boxSizing: 'border-box',
        resize: 'vertical',
        minHeight: 54,
        background: 'rgba(0,0,0,.2)',
        color: TOKEN.text,
        border: `1px solid ${TOKEN.border}`,
        borderRadius: 4,
        padding: 6,
        fontFamily: 'inherit',
        fontSize: 12,
    },
    notice: { padding: '6px 10px', borderTop: `1px solid ${TOKEN.border}`, whiteSpace: 'pre-wrap' },
    empty: { padding: 16, color: TOKEN.dim, textAlign: 'center' },
};
function badgeOf(entry) {
    if (entry.code === '??')
        return 'U';
    const letter = (entry.code[0] !== ' ' && entry.code[0] !== '?' ? entry.code[0] : entry.code[1]) ?? 'M';
    return letter === ' ' ? 'M' : letter;
}
function baseName(path) {
    const parts = path.split('/');
    return parts[parts.length - 1] ?? path;
}
function dirName(path) {
    const parts = path.split('/');
    parts.pop();
    return parts.length === 0 ? '' : `${parts.join('/')}/`;
}
/** Render one change row. */
function row(entry, options) {
    const label = entry.from === undefined ? baseName(entry.path) : `${baseName(entry.from)} → ${baseName(entry.path)}`;
    const dir = dirName(entry.path);
    return (0, react_1.createElement)('div', {
        key: entry.path,
        style: options.selected ? { ...S.row, background: TOKEN.hover } : S.row,
        onClick: options.onOpen,
        title: entry.path,
    }, (0, react_1.createElement)('span', { style: S.badge }, badgeOf(entry)), (0, react_1.createElement)('span', { style: S.path }, label), dir === '' ? null : (0, react_1.createElement)('span', { style: { ...S.dim, fontSize: 11 } }, dir), ...options.actions.map(action => (0, react_1.createElement)('button', {
        key: action.label,
        style: S.iconButton,
        title: action.title,
        onClick: (event) => {
            event.stopPropagation();
            action.run();
        },
    }, action.label)));
}
/**
 * The Source Control tab body.
 * @param props - the injected session id.
 */
function ScmPanel(props) {
    const { sessionId } = props;
    const [context, setContext] = (0, react_1.useState)(null);
    const [repo, setRepo] = (0, react_1.useState)('');
    const [status, setStatus] = (0, react_1.useState)(null);
    const [branches, setBranches] = (0, react_1.useState)([]);
    const [commits, setCommits] = (0, react_1.useState)([]);
    const [view, setView] = (0, react_1.useState)('changes');
    const [selected, setSelected] = (0, react_1.useState)(null);
    const [diffText, setDiffText] = (0, react_1.useState)('');
    const [message, setMessage] = (0, react_1.useState)('');
    const [newBranch, setNewBranch] = (0, react_1.useState)('');
    const [newBranchBase, setNewBranchBase] = (0, react_1.useState)('');
    const [branchFilter, setBranchFilter] = (0, react_1.useState)('');
    // Which branch row the pointer is on, so the row and its per-branch buttons read
    // as one target (keyed, not a boolean: the filter can reorder the list).
    const [hoveredBranch, setHoveredBranch] = (0, react_1.useState)('');
    const branchInput = (0, react_1.useRef)(null);
    const worktreeInput = (0, react_1.useRef)(null);
    const [worktreeName, setWorktreeName] = (0, react_1.useState)('');
    const [worktreeBase, setWorktreeBase] = (0, react_1.useState)('');
    const [remote, setRemote] = (0, react_1.useState)('');
    const [busy, setBusy] = (0, react_1.useState)('');
    const [notice, setNotice] = (0, react_1.useState)(null);
    const busyRef = (0, react_1.useRef)(false);
    const repoRef = (0, react_1.useRef)('');
    const report = (0, react_1.useCallback)((error) => {
        if (error instanceof api_js_1.ScmError) {
            setNotice({ kind: 'error', text: error.detail === '' ? error.message : `${error.message}\n${error.detail}` });
            return;
        }
        setNotice({ kind: 'error', text: String(error?.message ?? error) });
    }, []);
    const load = (0, react_1.useCallback)(async () => {
        const info = await (0, api_js_1.call)('context', sessionId, repoRef.current === '' ? {} : { repo: repoRef.current });
        setContext(info);
        repoRef.current = info.repo;
        setRepo(info.repo);
        if (remote === '' && info.options.defaultRemote !== '')
            setRemote(info.options.defaultRemote);
        if (!info.isRepo) {
            setStatus(null);
            setBranches([]);
            setCommits([]);
            return;
        }
        const [statusValue, branchValue, logValue] = await Promise.all([
            (0, api_js_1.call)('status', sessionId, { repo: info.repo }),
            (0, api_js_1.call)('branches', sessionId, { repo: info.repo }),
            (0, api_js_1.call)('log', sessionId, { repo: info.repo }),
        ]);
        setStatus(statusValue.status);
        setBranches(branchValue.branches);
        setCommits(logValue.commits);
    }, [sessionId, remote]);
    const refresh = (0, react_1.useCallback)(async () => {
        try {
            await load();
        }
        catch (error) {
            report(error);
        }
    }, [load, report]);
    /** Run a mutating operation, then reload everything it could have changed. */
    const run = (0, react_1.useCallback)(async (label, operation) => {
        if (busyRef.current)
            return;
        busyRef.current = true;
        setBusy(label);
        setNotice(null);
        try {
            const result = await operation();
            const text = typeof result === 'string' ? result.trim() : '';
            if (text !== '')
                setNotice({ kind: 'info', text });
            await load();
        }
        catch (error) {
            report(error);
        }
        finally {
            busyRef.current = false;
            setBusy('');
        }
    }, [load, report]);
    (0, react_1.useEffect)(() => {
        void refresh();
    }, [refresh]);
    const pollMs = context?.options.pollMs ?? 5000;
    (0, react_1.useEffect)(() => {
        if (pollMs <= 0)
            return undefined;
        const timer = setInterval(() => {
            if (!busyRef.current)
                void refresh();
        }, pollMs);
        return () => clearInterval(timer);
    }, [pollMs, refresh]);
    const openDiff = (0, react_1.useCallback)(async (file, staged) => {
        setSelected({ file, staged });
        try {
            const value = await (0, api_js_1.call)('diff', sessionId, { repo: repoRef.current, file, staged });
            setDiffText(value.diff.trim() === '' ? '(没有可显示的差异)' : value.diff);
        }
        catch (error) {
            report(error);
        }
    }, [report, sessionId]);
    /**
     * Primary actions stay clickable. A button that is merely \`disabled\` looks
     * identical to a live one and answers a click with nothing — reported as
     * "点不动". Instead the button explains what is missing, and focuses the
     * field that would unblock it.
     */
    const primaryButton = (label, blocked, onRun, options = {}) => {
        const style = { ...S.button, ...(options.style ?? {}) };
        if (blocked !== null)
            style.color = TOKEN.dim;
        return (0, react_1.createElement)('button', {
            style,
            title: blocked ?? label,
            'aria-disabled': blocked === null ? undefined : 'true',
            onClick: () => {
                if (blocked !== null) {
                    setNotice({ kind: 'error', text: blocked });
                    const target = options.focus?.current;
                    target?.focus?.();
                    return;
                }
                onRun();
            },
        }, label);
    };
    const files = (0, react_1.useMemo)(() => {
        if (status === null)
            return [];
        return [...status.staged, ...status.unstaged, ...status.untracked].map(entry => entry.path);
    }, [status]);
    const createBranch = () => {
        const name = newBranch.trim();
        if (name === '') {
            setNotice({ kind: 'error', text: '请先输入新分支名' });
            return;
        }
        const base = newBranchBase;
        void run(`新建分支 ${name}`, async () => {
            const created = await (0, api_js_1.call)('branch-create', sessionId, {
                repo: repoRef.current,
                name,
                base,
            });
            setNewBranch('');
            setNewBranchBase('');
            const from = created.base === null ? '当前 HEAD' : created.base;
            return `已从 ${from} 创建并切换到 ${created.branch}${created.upstream === null ? '' : `（跟踪 ${created.upstream}）`}`;
        });
    };
    /** One entry point for "make this branch current", local or remote-only. */
    const switchTo = (branch) => {
        const remote = branch.remote;
        void run(remote ? `检出 ${branch.name}` : `切换 ${branch.name}`, async () => {
            const result = await (0, api_js_1.call)('switch', sessionId, {
                repo: repoRef.current,
                branch: branch.name,
                track: remote,
            });
            return remote && result.tracking !== undefined
                ? `已检出 ${result.branch}（跟踪 ${result.tracking}）`
                : `已切换到 ${result.branch}`;
        });
    };
    const doStage = (paths, stage) => (0, api_js_1.call)(stage ? 'stage' : 'unstage', sessionId, { repo: repoRef.current, files: paths });
    const doDiscard = (paths) => {
        const ok = window.confirm(`放弃 ${paths.length} 个文件的改动？此操作不可撤销。`);
        if (!ok)
            return Promise.resolve('');
        return (0, api_js_1.call)('discard', sessionId, { repo: repoRef.current, files: paths, confirm: true });
    };
    if (context === null) {
        return (0, react_1.createElement)('div', { style: S.root }, (0, react_1.createElement)('div', { style: S.empty }, '正在读取仓库…'));
    }
    const head = (0, react_1.createElement)('div', { style: S.header }, (0, react_1.createElement)('span', { style: S.branch, title: context.repo }, '🌿', status?.branch ?? '—'), status !== null && (status.ahead > 0 || status.behind > 0)
        ? (0, react_1.createElement)('span', { style: S.dim }, `↑${status.ahead} ↓${status.behind}`)
        : null, status?.upstream == null ? null : (0, react_1.createElement)('span', { style: { ...S.dim, fontSize: 11 } }, status.upstream), (0, react_1.createElement)('span', { style: S.spacer }), busy === '' ? null : (0, react_1.createElement)('span', { style: S.dim }, busy), context.repos.length > 1
        ? (0, react_1.createElement)('select', {
            value: repo,
            style: { ...S.button, maxWidth: 140 },
            onChange: (event) => {
                repoRef.current = event.target.value;
                setRepo(event.target.value);
                setSelected(null);
                void refresh();
            },
        }, ...[
            ...context.repos.map(item => ({ path: item.path, name: item.name })),
            ...context.worktrees
                .filter(worktree => !context.repos.some(item => item.path === worktree.path))
                .map(worktree => ({ path: worktree.path, name: `wt: ${worktree.branch ?? worktree.head}` })),
        ].map(item => (0, react_1.createElement)('option', { key: item.path, value: item.path }, item.name)))
        : null, (0, react_1.createElement)('button', { style: S.iconButton, title: '刷新', onClick: () => void refresh() }, '↻'));
    if (!context.isRepo) {
        return (0, react_1.createElement)('div', { style: S.root }, head, (0, react_1.createElement)('div', { style: S.empty }, '当前工作区不是 Git 仓库。'), (0, react_1.createElement)('div', { style: { padding: '0 16px 16px', textAlign: 'center' } }, (0, react_1.createElement)('button', {
            style: S.button,
            onClick: () => void run('初始化仓库', () => (0, api_js_1.call)('init', sessionId, { repo: repoRef.current })),
        }, '初始化仓库')), notice === null ? null : (0, react_1.createElement)('div', { style: { ...S.notice, color: notice.kind === 'error' ? TOKEN.danger : TOKEN.ok } }, notice.text));
    }
    const sections = [
        {
            key: 'conflicts',
            title: `冲突 (${status?.conflicts.length ?? 0})`,
            entries: status?.conflicts ?? [],
            action: { label: '全部暂存', run: () => void run('暂存冲突', () => doStage((status?.conflicts ?? []).map(e => e.path), true)) },
        },
        {
            key: 'staged',
            title: `已暂存 (${status?.staged.length ?? 0})`,
            entries: status?.staged ?? [],
            action: { label: '全部取消', run: () => void run('取消暂存', () => doStage((status?.staged ?? []).map(e => e.path), false)) },
        },
        {
            key: 'changes',
            title: `更改 (${status?.unstaged.length ?? 0})`,
            entries: status?.unstaged ?? [],
            action: {
                label: '全部暂存',
                run: () => void run('暂存全部更改', () => doStage([...files], true)),
            },
        },
        { key: 'untracked', title: `未跟踪 (${status?.untracked.length ?? 0})`, entries: status?.untracked ?? [] },
    ];
    const changesView = (0, react_1.createElement)('div', { style: S.body }, ...sections
        .filter(section => section.entries.length > 0)
        .map(section => (0, react_1.createElement)('div', { key: section.key }, (0, react_1.createElement)('div', { style: S.sectionHead }, (0, react_1.createElement)('span', null, section.title), (0, react_1.createElement)('span', { style: S.spacer }), section.action === undefined
        ? null
        : (0, react_1.createElement)('button', { style: S.iconButton, onClick: section.action.run }, section.action.label)), ...section.entries.map(entry => row(entry, {
        selected: selected?.file === entry.path,
        onOpen: () => void openDiff(entry.path, section.key === 'staged' || section.key === 'conflicts'),
        actions: section.key === 'staged'
            ? [
                { label: '−', title: '取消暂存', run: () => void run('取消暂存', () => doStage([entry.path], false)) },
                { label: '↩', title: '放弃改动', run: () => void run('放弃改动', () => doDiscard([entry.path])) },
            ]
            : [
                { label: '＋', title: '暂存', run: () => void run('暂存', () => doStage([entry.path], true)) },
                { label: '↩', title: '放弃改动', run: () => void run('放弃改动', () => doDiscard([entry.path])) },
            ],
    })))), (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0) + (status?.conflicts.length ?? 0) === 0
        ? (0, react_1.createElement)('div', { style: S.empty }, '工作区干净，没有未提交的改动。')
        : null);
    // Keyword filter over branch name and the branch tip's subject (the same two
    // things a person remembers about a branch).
    const normalizedFilter = branchFilter.trim().toLowerCase();
    const visibleBranches = normalizedFilter === ''
        ? branches
        : branches.filter(branch => branch.name.toLowerCase().includes(normalizedFilter) || branch.subject.toLowerCase().includes(normalizedFilter));
    const branchesView = (0, react_1.createElement)('div', { style: S.body }, (0, react_1.createElement)('div', { style: { ...S.sectionHead, textTransform: 'none', flexWrap: 'wrap' } }, (0, react_1.createElement)('input', {
        ref: (element) => { branchInput.current = element; },
        value: newBranch,
        placeholder: '新分支名…（回车即可创建）',
        style: { ...S.textarea, minHeight: 0, flex: 1, padding: '2px 6px' },
        onChange: (event) => setNewBranch(event.target.value),
        onKeyDown: (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                createBranch();
            }
        },
    }), primaryButton('新建', newBranch.trim() === '' ? '请先在左侧输入新分支名' : null, createBranch, { focus: branchInput }), (0, react_1.createElement)('select', {
        value: newBranchBase,
        title: '新分支的来源：默认当前 HEAD，可选任一本地/远程分支',
        style: { ...S.button, maxWidth: 180 },
        onChange: (event) => setNewBranchBase(event.target.value),
    }, (0, react_1.createElement)('option', { value: '' }, `来源：HEAD（${status?.branch ?? '当前'}${status?.detached === true ? '' : ''}）`), ...branches.filter(branch => !branch.remote && !branch.current).map(branch => (0, react_1.createElement)('option', { key: `lb:${branch.name}`, value: branch.name }, branch.name)), ...branches.filter(branch => branch.remote).map(branch => (0, react_1.createElement)('option', { key: `rb:${branch.name}`, value: branch.name }, branch.name)))), (0, react_1.createElement)('div', { style: { ...S.sectionHead, textTransform: 'none', gap: 4 } }, (0, react_1.createElement)('input', {
        value: branchFilter,
        placeholder: '搜索分支…（名称或提交信息，回车切到第一条）',
        'aria-label': '搜索分支',
        style: { ...S.textarea, minHeight: 0, flex: 1, padding: '2px 6px' },
        onChange: (event) => setBranchFilter(event.target.value),
        onKeyDown: (event) => {
            if (event.key === 'Escape') {
                setBranchFilter('');
                return;
            }
            if (event.key === 'Enter' && visibleBranches.length > 0) {
                event.preventDefault();
                switchTo(visibleBranches[0]);
            }
        },
    }), branchFilter.trim() === ''
        ? (0, react_1.createElement)('span', { style: { ...S.dim, fontSize: 11, whiteSpace: 'nowrap' } }, `${branches.length} 个`)
        : (0, react_1.createElement)('span', { style: { ...S.dim, fontSize: 11, whiteSpace: 'nowrap' } }, `${visibleBranches.length}/${branches.length}`), branchFilter.trim() === ''
        ? null
        : (0, react_1.createElement)('button', { style: S.iconButton, title: '清除搜索', onClick: () => setBranchFilter('') }, '✕')), visibleBranches.length === 0
        ? (0, react_1.createElement)('div', { style: S.empty }, branches.length === 0 ? '这个仓库还没有任何分支。' : `没有匹配「${branchFilter.trim()}」的分支。`)
        : null, ...visibleBranches.map(branch => {
        const branchKey = `${branch.remote ? 'r' : 'l'}:${branch.name}`;
        return (0, react_1.createElement)('div', {
            key: branchKey,
            style: hoveredBranch === branchKey ? { ...S.row, background: TOKEN.hover } : S.row,
            title: branch.subject,
            onMouseEnter: () => setHoveredBranch(branchKey),
            onMouseLeave: () => setHoveredBranch(current => (current === branchKey ? '' : current)),
        }, (0, react_1.createElement)('span', { style: { ...S.badge, color: branch.current ? TOKEN.ok : TOKEN.dim } }, branch.current ? '●' : branch.remote ? '☁' : '○'), (0, react_1.createElement)('span', { style: S.path }, branch.name), (0, react_1.createElement)('span', { style: { ...S.dim, fontSize: 11 } }, branch.shortHash), branch.current || branch.remote
            ? null
            : (0, react_1.createElement)('button', { style: S.iconButton, title: `切换到 ${branch.name}`, onClick: () => switchTo(branch) }, '切换'), branch.remote
            ? (0, react_1.createElement)('button', {
                style: S.iconButton,
                title: `检出 ${branch.name} 为本地分支并跟踪它`,
                onClick: () => switchTo(branch),
            }, '检出')
            : null, branch.current || branch.remote
            ? null
            : (0, react_1.createElement)('button', {
                style: S.iconButton,
                title: `把 ${branch.name} 合并到当前分支`,
                onClick: () => void run(`合并 ${branch.name}`, async () => {
                    const result = await (0, api_js_1.call)('merge', sessionId, { repo: repoRef.current, branch: branch.name });
                    return result.output === '' ? `已合并 ${branch.name}` : result.output;
                }),
            }, '合并'), branch.current || branch.remote
            ? null
            : (0, react_1.createElement)('button', {
                style: S.iconButton,
                title: `删除 ${branch.name}`,
                onClick: () => {
                    if (!window.confirm(`删除分支 ${branch.name}？未合并的分支需要强制删除。`))
                        return;
                    void run(`删除 ${branch.name}`, async () => {
                        await (0, api_js_1.call)('branch-delete', sessionId, { repo: repoRef.current, name: branch.name, confirm: true, force: true });
                        return `已删除 ${branch.name}`;
                    });
                },
            }, '删除'));
    }));
    const smallInput = { ...S.textarea, minHeight: 0, flex: 1, padding: '2px 6px' };
    const createWorktree = () => {
        const name = worktreeName.trim();
        if (name === '') {
            setNotice({ kind: 'error', text: '请先输入工作树名' });
            return;
        }
        void run(`新建工作树 ${name}`, async () => {
            const created = await (0, api_js_1.call)('worktree-add', sessionId, {
                repo: repoRef.current,
                name,
                base: worktreeBase.trim(),
            });
            setWorktreeName('');
            setWorktreeBase('');
            return `工作树已建：${created.path}（分支 ${created.branch}${created.registered ? '，已注册为工作区，可新开会话直接使用' : ''}）`;
        });
    };
    const worktreesView = (0, react_1.createElement)('div', { style: S.body }, (0, react_1.createElement)('div', { style: { ...S.sectionHead, textTransform: 'none', gap: 4 } }, (0, react_1.createElement)('input', {
        ref: (element) => { worktreeInput.current = element; },
        value: worktreeName,
        placeholder: '工作树名…（回车即可创建）',
        style: smallInput,
        onChange: (event) => setWorktreeName(event.target.value),
        onKeyDown: (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                createWorktree();
            }
        },
    }), (0, react_1.createElement)('input', {
        value: worktreeBase,
        placeholder: '基点（默认 HEAD）',
        style: smallInput,
        onChange: (event) => setWorktreeBase(event.target.value),
    }), primaryButton('新建', worktreeName.trim() === '' ? '请先输入工作树名' : null, createWorktree, { focus: worktreeInput }), false ? (0, react_1.createElement)('button', {
        style: S.button,
        onClick: () => {
            const name = worktreeName.trim();
            if (name === '')
                return;
            void run(`新建工作树 ${name}`, async () => {
                const created = await (0, api_js_1.call)('worktree-add', sessionId, {
                    repo: repoRef.current,
                    name,
                    base: worktreeBase.trim(),
                });
                setWorktreeName('');
                setWorktreeBase('');
                return `工作树已建：${created.path}（分支 ${created.branch}${created.registered ? '，已注册为工作区，可新开会话直接使用' : ''}）`;
            });
        },
    }, '新建') : null, (0, react_1.createElement)('button', {
        style: S.iconButton,
        title: '清理已失效的工作树记录',
        onClick: () => void run('清理工作树', async () => {
            const pruned = await (0, api_js_1.call)('worktree-prune', sessionId, { repo: repoRef.current });
            return pruned.output === '' ? '没有需要清理的记录' : pruned.output;
        }),
    }, '清理')), (0, react_1.createElement)('div', { style: { ...S.sectionHead, textTransform: 'none' } }, `目录 ${context.worktreeHome}`), ...context.worktrees.map(worktree => (0, react_1.createElement)('div', { key: worktree.path, style: S.row, title: worktree.path }, (0, react_1.createElement)('span', { style: { ...S.badge, color: worktree.main ? TOKEN.ok : TOKEN.dim } }, worktree.main ? '◆' : '◇'), (0, react_1.createElement)('span', { style: S.path }, worktree.branch ?? `(detached ${worktree.head})`), worktree.dirty ? (0, react_1.createElement)('span', { style: { ...S.dim, color: TOKEN.warn } }, '● 有改动') : null, (0, react_1.createElement)('span', { style: { ...S.dim, fontSize: 11 } }, worktree.path.replace(`${context.worktreeHome}/`, '~/')), (0, react_1.createElement)('button', {
        style: S.iconButton,
        title: '复制路径',
        onClick: () => {
            void navigator.clipboard?.writeText(worktree.path);
            setNotice({ kind: 'info', text: `已复制 ${worktree.path}` });
        },
    }, '复制'), worktree.main
        ? null
        : (0, react_1.createElement)('button', {
            style: S.iconButton,
            title: '删除该工作树',
            onClick: () => {
                const force = worktree.dirty;
                if (!window.confirm(`删除工作树 ${worktree.path}？${force ? '\n（含未提交改动，将强制删除）' : ''}`))
                    return;
                void run('删除工作树', async () => {
                    await (0, api_js_1.call)('worktree-remove', sessionId, { repo: repoRef.current, worktree: worktree.path, confirm: true, force });
                    return `已删除 ${worktree.path}`;
                });
            },
        }, '删除'))), context.worktrees.length === 0
        ? (0, react_1.createElement)('div', { style: S.empty }, '还没有工作树。新建一个可以把任务隔离在独立目录里并行推进。')
        : null);
    const historyView = (0, react_1.createElement)('div', { style: S.body }, ...commits.map(commit => (0, react_1.createElement)('div', { key: commit.hash, style: S.row, title: `${commit.author} · ${commit.date}` }, (0, react_1.createElement)('span', { style: { ...S.badge, color: TOKEN.dim } }, '•'), (0, react_1.createElement)('span', { style: S.path }, commit.subject), (0, react_1.createElement)('span', { style: { ...S.dim, fontFamily: TOKEN.mono, fontSize: 11 } }, commit.hash))));
    const syncBar = (0, react_1.createElement)('div', { style: { display: 'flex', gap: 4, padding: '4px 8px', borderBottom: `1px solid ${TOKEN.border}`, flexWrap: 'wrap' } }, context.remotes.length > 1
        ? (0, react_1.createElement)('select', {
            value: remote,
            style: { ...S.button, maxWidth: 120 },
            onChange: (event) => setRemote(event.target.value),
        }, (0, react_1.createElement)('option', { value: '' }, '默认远程'), ...context.remotes.map(name => (0, react_1.createElement)('option', { key: name, value: name }, name)))
        : null, (0, react_1.createElement)('button', { style: S.button, onClick: () => void run('抓取', async () => {
            const result = await (0, api_js_1.call)('fetch', sessionId, { repo: repoRef.current, remote });
            return result.output === '' ? '抓取完成' : result.output;
        }) }, '抓取'), (0, react_1.createElement)('button', { style: S.button, onClick: () => void run('拉取', async () => {
            const result = await (0, api_js_1.call)('pull', sessionId, { repo: repoRef.current, remote, mode: 'ff' });
            return result.output === '' ? '已是最新' : result.output;
        }) }, '拉取'), (0, react_1.createElement)('button', { style: S.button, onClick: () => void run('拉取（合并）', async () => {
            const result = await (0, api_js_1.call)('pull', sessionId, { repo: repoRef.current, remote, mode: 'merge' });
            return result.output === '' ? '已是最新' : result.output;
        }) }, '拉取(合并)'), primaryButton(
    // A branch that exists only locally cannot be pushed by name; the honest
    // label is "publish" (git's --set-upstream), which is what the click does.
    status !== null && status.upstream === null ? '发布分支' : '推送', null, () => {
        const target = remote === '' ? (context.remotes[0] ?? 'origin') : remote;
        const publishing = status !== null && status.upstream === null;
        const question = publishing
            ? `当前分支「${status?.branch ?? ''}」在远端还不存在。\n将推送到 ${target} 并建立跟踪关系（git push --set-upstream）？`
            : '推送当前分支到远程？';
        if (!window.confirm(question))
            return;
        void run(publishing ? '发布分支' : '推送', async () => {
            const result = await (0, api_js_1.call)('push', sessionId, {
                repo: repoRef.current,
                remote,
                branch: status?.branch ?? '',
                setUpstream: publishing,
                confirm: true,
            });
            // Publishing prints only progress on stderr; lead with what happened
            // and keep git's own lines after it (a GitLab remote appends the MR link).
            if (publishing) {
                return [`已发布 ${status?.branch ?? ''} 并建立跟踪关系`, result.output.trim()].filter(part => part !== '').join('\n');
            }
            return result.output.trim() === '' ? '推送完成' : result.output.trim();
        });
    }));
    const tabList = [
        ['changes', `改动 ${files.length}`],
        ['branches', `分支 ${branches.length}`],
        ['worktrees', `工作树 ${context.worktrees.length}`],
        ['history', '历史'],
    ];
    return (0, react_1.createElement)('div', { style: S.root }, head, (0, react_1.createElement)('div', { style: S.tabs }, ...tabList.map(([key, label]) => (0, react_1.createElement)('button', { key, style: view === key ? { ...S.tab, ...S.tabActive } : S.tab, onClick: () => setView(key) }, label))), view === 'changes' ? syncBar : null, view === 'changes' ? changesView : view === 'branches' ? branchesView : view === 'worktrees' ? worktreesView : historyView, view === 'changes' && selected !== null
        ? (0, react_1.createElement)('pre', { style: S.diff }, diffText)
        : null, notice === null
        ? null
        : (0, react_1.createElement)('div', { style: { ...S.notice, color: notice.kind === 'error' ? TOKEN.danger : TOKEN.ok } }, notice.text), view === 'changes'
        ? (0, react_1.createElement)('div', { style: S.commit }, (0, react_1.createElement)('textarea', {
            style: S.textarea,
            placeholder: (status?.staged.length ?? 0) === 0 ? '先暂存改动，再填写提交信息…' : '提交信息（Cmd/Ctrl+Enter 提交）',
            value: message,
            onChange: (event) => setMessage(event.target.value),
            onKeyDown: (event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    if (message.trim() !== '' && (status?.staged.length ?? 0) > 0) {
                        void run('提交', async () => {
                            await (0, api_js_1.call)('commit', sessionId, { repo: repoRef.current, message });
                            setMessage('');
                            return '提交完成';
                        });
                    }
                }
            },
        }), primaryButton(`提交（${status?.staged.length ?? 0} 已暂存）`, message.trim() === '' ? '请先填写提交信息' : (status?.staged.length ?? 0) === 0 ? '请先暂存要提交的改动' : null, () => void run('提交', async () => {
            await (0, api_js_1.call)('commit', sessionId, { repo: repoRef.current, message });
            setMessage('');
            return '提交完成';
        }), { style: { alignSelf: 'flex-end' } }))
        : null);
}

return module.exports;
};
		return __require(1);
	},
});
