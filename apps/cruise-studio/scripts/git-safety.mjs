/* Development tooling only. No Git mutations, networking, product runtime or credentials. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STUDIO = 'apps/cruise-studio/';
const NEWS = 'workers/sound-cruise-news/';
const TOOLING_INVENTORY = new Set(['.claude/', 'workers/sound-cruise-sync/node_modules/']);
export function owner(path) {
    if (typeof path === 'string' && path.endsWith('/')) path = path.slice(0, -1);
    if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') ||
        path.split('/').some(part => part === '..' || part === '.' || part === '')) return 'unknown';
    return path.startsWith(STUDIO) ? 'studio' : path.startsWith(NEWS) ? 'news' : 'protected';
}
function paths(change) { return change.previousPath ? [change.path, change.previousPath] : [change.path]; }

// Functional suites still detect other app/shared/Worker changes. NEWS is an independent owner,
// never an exception list of filenames. Exact Studio intent/index/history live in evaluateSafety.
export function releasedBoundaryViolations(changes) {
    return changes.flatMap(paths).filter(path => !['studio', 'news'].includes(owner(path)));
}

export function evaluateSafety(options) {
    return options.contract === undefined ? evaluateMainSafety(options) : evaluateWorktreeSafety(options);
}

// Compatibility path: the original main policy is intentionally unchanged.
function evaluateMainSafety({ baseline, current, allowedFiles = [], phase = 'development', remoteHead, commitBase }) {
    const failures = [];
    const fail = (code, detail) => failures.push({ code, detail });
    if (!['development', 'commit', 'postcommit', 'push', 'release'].includes(phase)) fail('invalid-phase', phase);
    if (!current || !Array.isArray(current.changes)) return { ok: false, failures: [{ code: 'invalid-snapshot' }] };
    if (phase === 'release') {
        if (current.changes.length) fail('repository-not-clean', current.changes.map(c => c.path));
        return { ok: failures.length === 0, failures };
    }
    if (!baseline || baseline.version !== 1 || baseline.root !== current.root || !Array.isArray(baseline.changes))
        return { ok: false, failures: [{ code: 'invalid-baseline' }] };
    if (baseline.branch !== 'main' || current.branch !== baseline.branch) fail('branch-mismatch', current.branch);
    const allowed = new Set(allowedFiles);
    if (!allowed.size || allowed.size !== allowedFiles.length || allowedFiles.some(p => owner(p) !== 'studio'))
        fail('invalid-intent', allowedFiles);
    for (const c of baseline.changes) {
        if (c.staged) fail('baseline-staged', c.path);
        if (paths(c).some(p => owner(p) === 'studio')) fail('preexisting-studio-change', c.path);
        // Only explicitly captured preexisting untracked directories may remain outside owners.
        if (paths(c).some(p => owner(p) !== 'news') && !(c.untracked && c.directory && TOOLING_INVENTORY.has(c.path)))
            fail('unknown-baseline-owner', c.path);
    }
    const protectedBefore = baseline.changes.filter(c => paths(c).every(p => owner(p) !== 'studio'));
    for (const c of protectedBefore) {
        const now = current.changes.find(x => x.path === c.path);
        if (!now || JSON.stringify(now) !== JSON.stringify(c)) fail('parallel-change-drift', c.path);
    }
    for (const c of current.changes) {
        if (paths(c).every(p => owner(p) === 'studio')) {
            if (paths(c).some(p => !allowed.has(p))) fail('unexpected-studio-change', paths(c));
        } else if (!protectedBefore.some(x => x.path === c.path)) fail('unexpected-owner-change', paths(c));
        if (c.staged && paths(c).some(p => !allowed.has(p))) fail('unrelated-staged', paths(c));
    }
    if (phase === 'commit') {
        const own = current.changes.filter(c => paths(c).every(p => owner(p) === 'studio'));
        if (!own.length || own.some(c => !c.staged || c.unstaged || c.untracked)) fail('index-not-exact', own.map(c => c.path));
    }
    if (['postcommit', 'push'].includes(phase)) {
        if (!commitBase || current.parent !== commitBase || current.head === commitBase) fail('not-direct-child', current.parent);
        if (!current.commitFiles?.length || current.commitFiles.some(p => !allowed.has(p))) fail('commit-scope', current.commitFiles);
        if (current.changes.some(c => c.staged || paths(c).some(p => owner(p) === 'studio'))) fail('postcommit-dirty', current.changes.map(c => c.path));
    } else if (current.head !== baseline.head) {
        const h = current.history;
        if (!h?.ancestor || !h.commits?.length || h.commits.some(c => c.parents.length !== 1 || !c.files.length || c.files.some(p => owner(p) !== 'news')))
            fail('unreviewed-head-change', current.head);
    }
    if (['commit', 'postcommit', 'push'].includes(phase)) {
        if (!/^[a-f0-9]{40,64}$/.test(remoteHead || '') || remoteHead !== current.originMain) fail('remote-mismatch', remoteHead);
        if (phase === 'commit' ? current.head !== remoteHead : commitBase !== remoteHead) fail('remote-divergence', current.head);
    }
    return { ok: failures.length === 0, failures };
}

const sha = value => typeof value === 'string' && /^[a-f0-9]{40,64}$/.test(value);
const topicBranch = value => typeof value === 'string' && /^codex\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(value);

export function evaluateWorktreeSafety({ baseline, current, contract: c, allowedFiles = [],
    phase = 'development', commitBase, observedRemote, pushRequest }) {
    const failures = [], notices = [];
    const fail = (code, detail) => failures.push({ code, detail });
    const result = () => ({ ok: failures.length === 0, failures, notices });
    if (!c || c.version !== 1 || !['main-development', 'topic-development', 'main-integration'].includes(c.mode) ||
        !['development', 'commit', 'postcommit', 'push', 'release'].includes(phase)) {
        fail('invalid-contract', c?.mode); return result();
    }
    if (!baseline || !current || !Array.isArray(baseline.changes) || !Array.isArray(current.changes) ||
        baseline.version !== 1 || current.version !== 1) { fail('invalid-snapshot'); return result(); }
    if (typeof c.root !== 'string' || !c.root.startsWith('/') || typeof c.commonDir !== 'string' || !c.commonDir.startsWith('/'))
        fail('invalid-registration');
    for (const s of [baseline, current]) {
        if (s.root !== c.root) fail('worktree-root-mismatch', s.root);
        if (s.commonDir !== c.commonDir) fail('common-directory-mismatch', s.commonDir);
        if (s.branch !== c.branch) fail('branch-mismatch', s.branch);
        const peers = s.worktrees?.filter(w => w.branch === 'refs/heads/' + c.branch);
        if (!peers || peers.length !== 1 || peers[0].root !== c.root || peers[0].prunable)
            fail('branch-ownership', c.branch);
        if (s.operationPending) fail('git-operation-pending');
        if (s.remote?.name !== 'origin' || s.remote.fetchUrl !== c.remoteFetchUrl ||
            s.remote.pushUrls?.length !== 1 || s.remote.pushUrls[0] !== c.remotePushUrl)
            fail('remote-identity-mismatch');
        if (s.base?.sha !== c.baseSha || !s.base.exists || !s.base.history?.ancestor) fail('base-mismatch');
    }
    if (c.remote !== 'origin' || !c.remoteFetchUrl || !c.remotePushUrl || !sha(c.baseSha)) fail('invalid-registration');
    const topic = c.mode === 'topic-development', integration = c.mode === 'main-integration';
    if (topic ? !topicBranch(c.branch) || c.targetRef !== 'refs/heads/' + c.branch :
        c.targetRef !== 'refs/heads/main' || (integration ? !topicBranch(c.branch) : c.branch !== 'main'))
        fail('remote-ref-mismatch', c.targetRef);
    const allowed = new Set(allowedFiles);
    if (!allowed.size || allowed.size !== allowedFiles.length || allowedFiles.some(p => owner(p) !== 'studio' || p.endsWith('/')))
        fail('invalid-intent', allowedFiles);

    // Approved readonly originals remain in the raw capture. They can never enter intent/index/history.
    const preserved = c.preservedUntracked ?? [];
    if (!Array.isArray(preserved)) { fail('invalid-preservation'); return result(); }
    const protectedPaths = new Set();
    for (const p of preserved) {
        if (!p || owner(p.path) !== 'studio' || p.path.endsWith('/') || !/^[a-f0-9]{64}$/.test(p.sha256 || '') ||
            protectedPaths.has(p.path) || allowed.has(p.path)) { fail('invalid-preservation', p?.path); continue; }
        protectedPaths.add(p.path);
        for (const s of [baseline, current]) {
            const entry = s.changes.find(x => x.path === p.path);
            if (!entry || !entry.untracked || entry.staged || entry.unstaged || entry.directory || entry.signature !== p.sha256)
                fail('preserved-original-changed', p.path);
        }
    }
    const view = s => ({ ...s, changes: s.changes.filter(x => !protectedPaths.has(x.path)) });
    const b = view(baseline), now = view(current);
    if (phase === 'release' && current.changes.length) fail('repository-not-clean', current.changes.map(x => x.path));

    if (c.mode === 'main-development') {
        // All old main checks apply after the separately verified, non-stagable preservation manifest.
        const legacy = evaluateMainSafety({ baseline: b, current: now, allowedFiles, phase,
            commitBase, remoteHead: observedRemote?.main?.sha });
        failures.push(...legacy.failures);
    } else {
        // Same-worktree NEWS is not a general exception in a dedicated Studio checkout.
        if (b.changes.length) fail('topic-baseline-dirty', b.changes.map(x => x.path));
        for (const entry of now.changes) {
            if (paths(entry).some(p => !allowed.has(p))) fail('unexpected-owner-change', paths(entry));
            if (entry.staged && paths(entry).some(p => !allowed.has(p))) fail('unrelated-staged', paths(entry));
        }
        if (phase === 'commit' && (!now.changes.length || now.changes.some(x => !x.staged || x.unstaged || x.untracked)))
            fail('index-not-exact');
        if (['postcommit', 'push'].includes(phase) && now.changes.length) fail('postcommit-dirty');
        if (phase === 'postcommit' && (!sha(commitBase) || current.parent !== commitBase || current.head === commitBase))
            fail('not-direct-child');
        if (phase === 'postcommit' && (!current.commitFiles?.length || current.commitFiles.some(p => !allowed.has(p))))
            fail('commit-scope');
    }
    if (topic) {
        for (const s of [baseline, current]) {
            const h = s.base?.history;
            if (!h?.ancestor || !Array.isArray(h.commits) || h.commits.some(x => x.parents.length !== 1 ||
                !x.files.length || x.files.some(p => !allowed.has(p)))) fail('topic-history-scope');
        }
        if (current.head !== baseline.head && (!current.history?.ancestor || !current.history.commits?.length ||
            current.history.commits.some(x => x.parents.length !== 1 || !x.files.length || x.files.some(p => !allowed.has(p)))))
            fail('topic-checkpoint-divergence');
        if (current.originMain !== c.baseSha || observedRemote?.main?.sha && observedRemote.main.sha !== c.baseSha)
            notices.push({ code: 'remote-main-advanced', detail: 'Local topic work may continue; integration requires a separate approval and baseline.' });
    }
    if (integration) {
        const a = c.integrationApproval, e = current.integration;
        if (!a || typeof a.approvalId !== 'string' || !a.approvalId.trim() || !sha(a.headSha) || !sha(a.topicSha) ||
            !sha(a.topicBaseSha) || a.baseSha !== c.baseSha || a.headSha !== current.head ||
            !e || e.topicSha !== a.topicSha || e.topicBaseSha !== a.topicBaseSha ||
            baseline.head !== c.baseSha || JSON.stringify(e.parents) !== JSON.stringify([c.baseSha, a.topicSha]) ||
            !e.baseContainsTopicBase || !e.topicHistory?.ancestor || !e.topicHistory.commits?.length ||
            e.topicHistory.commits.some(x => x.parents.length !== 1 || !x.files.length || x.files.some(p => !allowed.has(p))) ||
            !e.files?.length || e.files.some(p => !allowed.has(p))) fail('integration-not-approved');
        if (!['push', 'release'].includes(phase)) fail('integration-review-only');
        if (current.changes.length) fail('integration-not-clean');
    }
    if (['commit', 'postcommit', 'push', 'release'].includes(phase) && !topic) {
        if (observedRemote?.main?.remote !== 'origin' || observedRemote.main.ref !== 'refs/heads/main' ||
            !sha(observedRemote.main.sha) || observedRemote.main.sha !== current.originMain ||
            integration && observedRemote.main.sha !== c.baseSha) fail('remote-main-mismatch');
    }
    if (phase === 'push') {
        if (!pushRequest || pushRequest.remote !== 'origin' || pushRequest.sourceRef !== 'refs/heads/' + c.branch ||
            pushRequest.sourceSha !== current.head || pushRequest.targetRef !== c.targetRef || pushRequest.force !== false)
            fail('push-destination-mismatch');
        if (topic) {
            const r = observedRemote?.topic;
            if (observedRemote?.main?.remote !== 'origin' || observedRemote.main.ref !== 'refs/heads/main' || !sha(observedRemote.main.sha))
                fail('remote-main-observation-missing');
            if (!Object.hasOwn(c, 'expectedTopicSha') || c.expectedTopicSha !== null && !sha(c.expectedTopicSha) ||
                !r || r.remote !== 'origin' || r.ref !== c.targetRef || r.sha !== c.expectedTopicSha)
                fail('remote-topic-mismatch');
            if (c.expectedTopicSha !== null && (!current.publicationBase?.ancestor || current.publicationBase.sha !== c.expectedTopicSha))
                fail('publication-not-fast-forward');
            if (!current.base?.history?.commits?.length) fail('empty-publication');
        }
    }
    return result();
}

export function readGit(root, baselineHead, contract) {
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8',
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 32 * 1024 * 1024 });
    const actualRoot = realpathSync(git('rev-parse', '--show-toplevel').trim());
    if (realpathSync(root) !== actualRoot) throw Error('Repository root required');
    const raw = git('status', '--porcelain=v1', '-z', '--untracked-files=normal').split('\0');
    const changes = [];
    for (let i = 0; i < raw.length; i++) {
        const row = raw[i]; if (!row) continue;
        const xy = row.slice(0, 2), path = row.slice(3);
        if (/[U]/.test(xy) || ['AA', 'DD'].includes(xy)) throw Error('Unmerged Git entry: ' + path);
        const previousPath = /[RC]/.test(xy) ? raw[++i] : undefined;
        const untracked = xy === '??', directory = untracked && path.endsWith('/');
        if (directory && owner(path) === 'studio') {
            const files = git('ls-files', '--others', '--exclude-standard', '-z', '--', path).split('\0').filter(Boolean);
            for (const file of files) raw.push('?? ' + file);
            continue;
        }
        const digest = createHash('sha256');
        if (directory) {
            if (owner(path) === 'news') {
                const files = git('ls-files', '--others', '--exclude-standard', '-z', '--', path).split('\0').filter(Boolean).sort();
                if (files.length > 10000) throw Error('Parallel inventory budget exceeded');
                let bytes = 0;
                for (const file of files) {
                    const stat = lstatSync(resolve(root, file));
                    bytes += stat.size;
                    if (!stat.isFile() || stat.isSymbolicLink() || bytes > 32 * 1024 * 1024) throw Error('Parallel inventory unsupported or too large');
                    digest.update(JSON.stringify(file)); digest.update(readFileSync(resolve(root, file)));
                }
            } else {
                // Inventory only: do not traverse preexisting user tooling/dependency directories.
                digest.update(path);
            }
        } else if (untracked) {
            const absolute = resolve(root, path), stat = lstatSync(absolute);
            if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Unsupported untracked file: ' + path);
            digest.update(readFileSync(absolute));
        } else {
            const ps = previousPath ? [path, previousPath] : [path];
            digest.update(git('diff', '--binary', 'HEAD', '--', ...ps));
            digest.update(git('diff', '--binary', '--cached', '--', ...ps));
        }
        changes.push({ path, ...(previousPath ? { previousPath } : {}), staged: !untracked && xy[0] !== ' ',
            unstaged: !untracked && xy[1] !== ' ', untracked, directory, signature: digest.digest('hex') });
    }
    const head = git('rev-parse', 'HEAD').trim(), parents = git('show', '-s', '--format=%P', 'HEAD').trim().split(' ').filter(Boolean);
    const result = { version: 1, root: actualRoot, branch: git('symbolic-ref', '--short', 'HEAD').trim(), head, originMain: git('rev-parse', 'origin/main').trim(),
        parent: parents.length === 1 ? parents[0] : null, changes,
        commitFiles: git('diff-tree', '--root', '--no-renames', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD').split('\0').filter(Boolean) };
    if (baselineHead && head !== baselineHead) {
        let ancestor = false;
        try { git('merge-base', '--is-ancestor', baselineHead, head); ancestor = true; } catch (e) { if (e.status !== 1) throw e; }
        const commits = ancestor ? git('rev-list', '--parents', head, '^' + baselineHead).trim().split('\n').filter(Boolean).map(row => {
            const [id, ...parents] = row.split(' ');
            return { id, parents, files: git('diff-tree', '--no-renames', '--no-commit-id', '--name-only', '-r', '-z', id).split('\0').filter(Boolean) };
        }) : [];
        result.history = { ancestor, commits };
    }
    const common = git('rev-parse', '--git-common-dir').trim();
    result.commonDir = realpathSync(resolve(root, common));
    result.worktrees = git('worktree', 'list', '--porcelain', '-z').split('\0\0').filter(Boolean).map(block => {
        const fields = block.split('\0').filter(Boolean);
        return { root: fields.find(x => x.startsWith('worktree '))?.slice(9),
            branch: fields.find(x => x.startsWith('branch '))?.slice(7),
            prunable: fields.some(x => x === 'prunable' || x.startsWith('prunable ')) };
    });
    let fetchUrl = null, pushUrls = [];
    if (git('remote').split('\n').includes('origin')) {
        fetchUrl = git('remote', 'get-url', 'origin').trim();
        pushUrls = git('remote', 'get-url', '--push', '--all', 'origin').trim().split('\n');
    }
    result.remote = { name: 'origin', fetchUrl, pushUrls };
    result.operationPending = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_LOG']
        .some(name => { try { lstatSync(resolve(root, git('rev-parse', '--git-path', name).trim())); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } });
    function historyFrom(base, end = head) {
        let exists = false, ancestor = false;
        if (sha(base)) {
            try { git('cat-file', '-e', base + '^{commit}'); exists = true; } catch (e) { if (![1, 128].includes(e.status)) throw e; }
            if (exists) try { git('merge-base', '--is-ancestor', base, end); ancestor = true; } catch (e) { if (e.status !== 1) throw e; }
        }
        const commits = ancestor ? git('rev-list', '--parents', end, '^' + base).trim().split('\n').filter(Boolean).map(row => {
            const [id, ...parents] = row.split(' ');
            return { id, parents, files: git('diff-tree', '--root', '--no-renames', '--no-commit-id', '--name-only', '-r', '-z', id).split('\0').filter(Boolean) };
        }) : [];
        return { sha: base, exists, ancestor, commits };
    }
    if (contract) {
        const h = historyFrom(contract.baseSha);
        result.base = { sha: contract.baseSha, exists: h.exists, history: { ancestor: h.ancestor, commits: h.commits } };
        if (sha(contract.expectedTopicSha)) result.publicationBase = historyFrom(contract.expectedTopicSha);
        const a = contract.integrationApproval;
        if (contract.mode === 'main-integration' && a && sha(a.topicSha) && sha(a.topicBaseSha)) {
            const th = historyFrom(a.topicBaseSha, a.topicSha), bh = historyFrom(a.topicBaseSha, contract.baseSha);
            result.integration = { parents, topicSha: a.topicSha, topicBaseSha: a.topicBaseSha,
                baseContainsTopicBase: bh.ancestor, topicHistory: { ancestor: th.ancestor, commits: th.commits },
                files: h.ancestor ? git('diff', '--no-renames', '--name-only', '-z', contract.baseSha, head).split('\0').filter(Boolean) : [] };
        }
    }
    return result;
}

// Reads only. Baseline capture is printed for the operator to save outside the repository.
// remoteHead must be freshly measured with `git ls-remote origin refs/heads/main`.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const [command, baselinePath, ...rest] = process.argv.slice(2);
        const root = process.cwd();
        if (command === 'capture') {
            const config = baselinePath ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {};
            console.log(JSON.stringify(readGit(root, undefined, config.contract), null, 2));
        }
        else if (command === 'release') {
            const result = evaluateSafety({ current: readGit(root), phase: 'release' });
            console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1;
        } else if (command === 'check') {
            const config = JSON.parse(readFileSync(baselinePath, 'utf8'));
            const phase = rest[0] || 'development', remoteHead = rest[1];
            const result = evaluateSafety({ ...config, current: readGit(root, config.baseline?.head, config.contract), phase,
                remoteHead, observedRemote: remoteHead && config.contract ? JSON.parse(readFileSync(remoteHead, 'utf8')) : undefined });
            console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1;
        } else throw Error('Usage: git-safety.mjs capture [plan.json] | release | check <plan.json> <phase> [remote SHA / observations.json]');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
