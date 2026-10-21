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
    return options.contract?.version === 2 ? evaluateBatchSafety(options) :
        options.contract === undefined ? evaluateMainSafety(options) : evaluateWorktreeSafety(options);
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

// Batch v2 is a separate, read-only gate. Trust is supplied out of band by the operator,
// never taken from the candidate plan. Hashes bind records; they do not authenticate people.
const hash256 = bytes => createHash('sha256').update(bytes).digest('hex');
const objectId = x => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x);
const digestId = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keysExactly = (x, keys) => x && typeof x === 'object' && !Array.isArray(x) &&
    same(Object.keys(x).sort(), [...keys].sort());
const safePath = p => typeof p === 'string' && !/[\\\x00-\x1f*?\[\]]/.test(p) && !p.startsWith('/') &&
    p.split('/').every(x => x && x !== '.' && x !== '..');
const exactPaths = ps => Array.isArray(ps) && ps.length > 0 && new Set(ps).size === ps.length && ps.every(safePath);
const batchError = code => { throw Object.assign(Error(code), { gateCode: code }); };
const requireBatch = (value, code) => { if (!value) batchError(code); };
const jsonHash = x => hash256(JSON.stringify(x));
function readRecord(ref, code) {
    requireBatch(keysExactly(ref, ['path', 'sha256']) && typeof ref.path === 'string' &&
        ref.path.startsWith('/') && digestId(ref.sha256), code);
    const stat = lstatSync(ref.path);
    requireBatch(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 32 * 1024 * 1024, code);
    const bytes = readFileSync(ref.path);
    requireBatch(hash256(bytes) === ref.sha256, code);
    return JSON.parse(bytes);
}
function batchGit(root) {
    // Explicit arguments defeat inherited fixture Git variables; never write an index/object/ref.
    const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1' };
    for (const k of ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[k];
    return (...args) => execFileSync('git', ['-C', root, ...args], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
function inventory(git, ref) {
    requireBatch(objectId(ref), 'invalid-object');
    const entries = git('ls-tree', '-r', '-z', ref).split('\0').filter(Boolean).map(row => {
        const [meta, path] = row.split('\t'), [mode, type, blob] = meta.split(' ');
        requireBatch(type === 'blob' && ['100644', '100755', '120000'].includes(mode) && safePath(path), 'invalid-tree-entry');
        return [path, { mode, blob }];
    });
    return Object.fromEntries(entries);
}
const treeEqual = (a, b) => same(Object.entries(a).sort(), Object.entries(b).sort());
const changedPaths = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(p => !same(a[p], b[p])).sort();
function commitObject(git, ref) {
    requireBatch(objectId(ref), 'invalid-object');
    const [tree, ...parents] = git('show', '-s', '--format=%T %P', ref + '^{commit}').trim().split(' ');
    return { tree, parents };
}
function verifyApproval(options, purpose) {
    const { approval, trust, contract, baseline, evidence } = options;
    requireBatch(keysExactly(trust, ['approvalSha256']) && digestId(trust.approvalSha256), 'trusted-approval-missing');
    requireBatch(approval?.sha256 === trust.approvalSha256, 'trusted-approval-mismatch');
    const a = readRecord(approval, 'approval-record-invalid');
    requireBatch(keysExactly(a, ['version', 'purpose', 'reference', 'contractSha256', 'baselineSha256', 'evidenceSha256']) &&
        a.version === 1 && typeof a.reference === 'string' && a.reference.trim() && a.purpose === purpose &&
        a.contractSha256 === jsonHash(contract) && a.baselineSha256 === jsonHash(baseline) &&
        a.evidenceSha256 === evidence?.sha256, 'approval-scope-mismatch');
}
export const BATCH_RELEASE_GATES = Object.freeze(['rhythm-node', 'rhythm-browser', 'studio-node', 'studio-browser',
    'owner-9-104', 'real-owner-loader', 'versions-cache', 'asset-pin', 'no-write', 'performance', 'git-safety', 'release-clean']);
function verifyArtifacts(ref, tree) {
    const record = readRecord(ref, 'artifact-invalid');
    requireBatch(keysExactly(record, ['sourceTree', 'files']) && record.sourceTree === tree &&
        Array.isArray(record.files) && record.files.length > 0, 'artifact-invalid');
    const names = new Set();
    for (const item of record.files) {
        requireBatch(keysExactly(item, ['name', 'path', 'sha256']) && safePath(item.name) && !names.has(item.name) &&
            typeof item.path === 'string' && item.path.startsWith('/') && digestId(item.sha256), 'artifact-invalid');
        names.add(item.name);
        const stat = lstatSync(item.path);
        requireBatch(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 64 * 1024 * 1024 &&
            hash256(readFileSync(item.path)) === item.sha256, 'artifact-invalid');
    }
}
function verifyRuns(e, tree, purpose) {
    requireBatch(keysExactly(e, ['version', 'purpose', 'sourceTree', 'required', 'runs', 'performance', 'noWrite']) &&
        e.version === 1 && e.purpose === purpose && e.sourceTree === tree, 'evidence-source-mismatch');
    const required = purpose === 'batch-release' ? BATCH_RELEASE_GATES : ['studio-node', 'studio-browser'];
    requireBatch(same([...e.required].sort(), [...required].sort()) && Array.isArray(e.runs) &&
        e.runs.length === required.length && same(e.runs.map(x => x.id).sort(), [...required].sort()), 'evidence-cohort-mismatch');
    for (const run of e.runs) {
        requireBatch(keysExactly(run, ['id', 'sourceTree', 'command', 'environment', 'source', 'fixture', 'startedAt', 'endedAt', 'exit', 'counts', 'log']) &&
            run.sourceTree === tree && Array.isArray(run.command) && run.command.length && run.command.every(x => typeof x === 'string') &&
            run.environment && run.source && run.fixture &&
            Number.isFinite(Date.parse(run.startedAt)) && Date.parse(run.endedAt) >= Date.parse(run.startedAt), 'run-binding-invalid');
        requireBatch(keysExactly(run.counts, ['pass', 'fail', 'skip', 'cancelled', 'todo']) &&
            Number.isSafeInteger(run.counts.pass) && run.counts.pass > 0 && run.exit === 0 &&
            ['fail', 'skip', 'cancelled', 'todo'].every(k => run.counts[k] === 0), 'required-result-failed');
        for (const ref of [run.environment, run.source, run.fixture]) verifyArtifacts(ref, tree);
        // Log reference is content checked as raw bytes, not parsed as JSON.
        requireBatch(keysExactly(run.log, ['path', 'sha256']) && digestId(run.log.sha256) &&
            typeof run.log.path === 'string' && run.log.path.startsWith('/'), 'raw-log-invalid');
        const stat = lstatSync(run.log.path);
        requireBatch(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 64 * 1024 * 1024 &&
            hash256(readFileSync(run.log.path)) === run.log.sha256, 'raw-log-invalid');
    }
    if (purpose !== 'batch-release') {
        requireBatch(e.performance === null && e.noWrite === null, 'tooling-purpose-mismatch');
        return;
    }
    requireBatch(keysExactly(e.noWrite, ['read', 'preview', 'apply', 'clear', 'undo', 'redo', 'rejection', 'sharedCanWrite']) &&
        e.noWrite.sharedCanWrite === false && Object.entries(e.noWrite).filter(([k]) => k !== 'sharedCanWrite').every(([, n]) => n === 0), 'no-write-failed');
    requireBatch(Array.isArray(e.performance) && e.performance.length === 3 &&
        new Set(e.performance.map(t => t.process)).size === 3, 'performance-failed');
    for (const trial of e.performance) {
        requireBatch(keysExactly(trial, ['process', 'warmup', 'measured', 'rows']) && typeof trial.process === 'string' &&
            trial.process.length > 0 && trial.warmup === 3 && trial.measured === 20 && Array.isArray(trial.rows) && trial.rows.length === 32, 'performance-failed');
        const seen = new Set();
        for (const row of trial.rows) {
            requireBatch(keysExactly(row, ['bars', 'scenario', 'saved', 'command', 'staff', 'completed']) &&
                [8, 32, 64, 128].includes(row.bars) && ['legacy', 'shared', 'distinct', 'chord-distinct'].includes(row.scenario) &&
                typeof row.saved === 'boolean' && row.completed === true, 'performance-failed');
            const key = `${row.bars}/${row.scenario}/${row.saved}`;
            requireBatch(!seen.has(key), 'performance-failed'); seen.add(key);
            for (const metric of ['command', 'staff']) {
                const samples = row[metric];
                requireBatch(Array.isArray(samples) && samples.length === 20 && samples.every(n => Number.isFinite(n) && n >= 0), 'performance-failed');
                if (row.bars === 64) requireBatch([...samples].sort((a, b) => a - b)[18] <= (metric === 'command' ? 16 : 500), 'performance-failed');
            }
        }
    }
}
function verifyWorkspace(snapshot, c) {
    requireBatch(snapshot && snapshot.version === 1 && snapshot.root === c.root && snapshot.commonDir === c.commonDir &&
        snapshot.branch === c.branch, 'batch-registration-mismatch');
    requireBatch(snapshot.remote?.name === 'origin' && snapshot.remote.fetchUrl === c.remoteFetchUrl &&
        same(snapshot.remote.pushUrls, [c.remotePushUrl]), 'remote-identity-mismatch');
    const peers = snapshot.worktrees?.filter(w => w.branch === 'refs/heads/' + c.branch);
    requireBatch(peers?.length === 1 && peers[0].root === c.root && !peers[0].prunable, 'branch-ownership');
    requireBatch(!snapshot.operationPending, 'git-operation-pending');
    requireBatch(Array.isArray(snapshot.changes) && snapshot.changes.length === 0, 'batch-not-clean');
}
function verifyObservation(o, c) {
    requireBatch(keysExactly(o, ['url', 'observedAt', 'exit', 'command', 'raw']) && o.url === c.remoteFetchUrl && o.exit === 0 &&
        Number.isFinite(Date.parse(o.observedAt)) && Date.parse(o.observedAt) <= Date.now() && Date.now() - Date.parse(o.observedAt) <= 300000 &&
        same(o.command, ['git', 'ls-remote', 'origin', 'refs/heads/main', c.rhythm.ref, c.studio.ref]) && typeof o.raw === 'string', 'fresh-observation-missing');
    const expected = { 'refs/heads/main': c.baseSha, [c.rhythm.ref]: c.rhythm.sha, [c.studio.ref]: c.studio.sha };
    const lines = o.raw.trim().split('\n');
    requireBatch(lines.length === 3 && new Set(lines.map(l => l.split(/\s+/)[1])).size === 3 && lines.every(l => {
        const pair = l.split(/\s+/); return pair.length === 2 && expected[pair[1]] === pair[0];
    }), 'remote-refs-mismatch');
}
export function evaluateBatchSafety(options) {
    const { contract: c, phase, baseline } = options;
    try {
        requireBatch(keysExactly(c, ['version', 'mode', 'root', 'commonDir', 'branch', 'remoteFetchUrl', 'remotePushUrl',
            'baseSha', 'baseTree', 'rhythm', 'studio', 'm1', 'm2', 'finalSha', 'finalTree', 'sourcePin']) &&
            c.version === 2 && c.mode === 'main-integration-batch' && ['push', 'release'].includes(phase), 'invalid-contract');
        requireBatch(typeof c.root === 'string' && c.root.startsWith('/') && typeof c.commonDir === 'string' && c.commonDir.startsWith('/') &&
            topicBranch(c.branch) && typeof c.remoteFetchUrl === 'string' && c.remoteFetchUrl.length > 0 && c.remotePushUrl === c.remoteFetchUrl &&
            [c.baseSha, c.baseTree, c.finalSha, c.finalTree].every(objectId), 'invalid-registration');
        verifyApproval(options, 'batch-release');
        // Snapshots supplied by callers cannot replace current object/working-tree inspection.
        requireBatch(!['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES'].some(k => process.env[k]), 'git-environment-override');
        const current = readGit(c.root), git = batchGit(c.root);
        verifyWorkspace(baseline, c); verifyWorkspace(current, c);
        requireBatch(baseline.head === c.baseSha && current.originMain === c.baseSha, 'base-mismatch');
        requireBatch(commitObject(git, c.baseSha).tree === c.baseTree, 'base-tree-mismatch');
        let composed = inventory(git, c.baseSha);
        const touched = new Set();
        for (const [name, prefix, count] of [['rhythm', 'apps/rhythm-cruise/', 1], ['studio', STUDIO, 9]]) {
            const t = c[name];
            requireBatch(keysExactly(t, ['sha', 'tree', 'base', 'ref', 'commits', 'allowedFiles']) &&
                [t.sha, t.tree, t.base].every(objectId) && typeof t.ref === 'string' && t.ref.startsWith('refs/heads/codex/') &&
                exactPaths(t.allowedFiles) && t.allowedFiles.every(p => p.startsWith(prefix)) &&
                Array.isArray(t.commits) && t.commits.length === count && t.commits.every(objectId) &&
                new Set(t.commits).size === count && t.commits.at(-1) === t.sha, 'owner-contract-invalid');
            requireBatch(commitObject(git, t.sha).tree === t.tree, 'owner-tree-mismatch');
            requireBatch(git('merge-base', c.baseSha, t.sha).trim() === t.base, 'owner-base-mismatch');
            const actual = git('rev-list', '--reverse', t.base + '..' + t.sha).trim().split('\n');
            requireBatch(same(actual, t.commits), 'owner-history-mismatch');
            let previous = t.base;
            for (const commit of actual) {
                requireBatch(same(commitObject(git, commit).parents, [previous]), 'owner-history-mismatch');
                const files = changedPaths(inventory(git, previous), inventory(git, commit));
                requireBatch(files.length > 0 && files.every(p => t.allowedFiles.includes(p)), 'owner-scope-mismatch');
                previous = commit;
            }
            const before = inventory(git, t.base), after = inventory(git, t.sha), delta = changedPaths(before, after);
            requireBatch(same(delta, [...t.allowedFiles].sort()), 'owner-scope-mismatch');
            for (const p of delta) {
                requireBatch(!touched.has(p) && same(composed[p], before[p]), 'owner-overlay-conflict'); touched.add(p);
                if (after[p]) composed[p] = after[p]; else delete composed[p];
            }
            const merge = name === 'rhythm' ? c.m1 : c.m2;
            requireBatch(keysExactly(merge, ['sha', 'tree', 'parents']) && [merge.sha, merge.tree].every(objectId), 'invalid-merge');
            const parents = [name === 'rhythm' ? c.baseSha : c.m1.sha, t.sha], object = commitObject(git, merge.sha);
            requireBatch(same(merge.parents, parents) && same(object.parents, parents), 'batch-parent-mismatch');
            requireBatch(object.tree === merge.tree && treeEqual(inventory(git, merge.sha), composed), 'batch-tree-mismatch');
        }
        requireBatch(c.finalSha === c.m2.sha && c.finalTree === c.m2.tree && current.head === c.finalSha, 'final-mismatch');
        const pin = c.sourcePin;
        requireBatch(keysExactly(pin, ['commit', 'tree', 'path', 'sha256']) && pin.commit === c.rhythm.sha && pin.tree === c.rhythm.tree &&
            safePath(pin.path) && c.rhythm.allowedFiles.includes(pin.path) && digestId(pin.sha256), 'source-pin-mismatch');
        // cat-file is binary: hashing UTF-8 text would silently change non-UTF8 source bytes.
        const blob = composed[pin.path]?.blob;
        requireBatch(blob && hash256(execFileSync('git', ['-C', c.root, 'cat-file', 'blob', blob],
            { env: { ...process.env, GIT_DIR: c.commonDir, GIT_WORK_TREE: c.root, GIT_NO_REPLACE_OBJECTS: '1' } })) === pin.sha256, 'source-pin-mismatch');
        verifyRuns(readRecord(options.evidence, 'evidence-record-invalid'), c.finalTree, 'batch-release');
        verifyObservation(options.observedRemote, c);
        requireBatch(keysExactly(options.pushRequest, ['remote', 'sourceRef', 'sourceSha', 'targetRef', 'force']) &&
            options.pushRequest.remote === 'origin' && options.pushRequest.sourceRef === 'refs/heads/' + c.branch &&
            options.pushRequest.sourceSha === c.finalSha && options.pushRequest.targetRef === 'refs/heads/main' &&
            options.pushRequest.force === false, 'push-destination-mismatch');
        return { ok: true, mode: c.mode, candidateSha: c.finalSha, candidateTree: c.finalTree,
            evidenceDigest: options.evidence.sha256, failures: [], publicationExecuted: false };
    } catch (error) { return { ok: false, failures: [{ code: error.gateCode || 'batch-read-failed', detail: error.message }] }; }
}

// Evidence A/B binding for this tooling topic only. This never authorizes main publication.
// The trusted approval digest must be recorded outside the mutable plan (CLI last argument).
export function verifyToolingEvidence(options) {
    try {
        const { contract: c, baseline, binding, phase, pushRequest } = options;
        requireBatch(c?.version === 1 && c.mode === 'topic-development' && ['commit', 'postcommit', 'push'].includes(phase), 'tooling-contract-invalid');
        verifyApproval(options, 'tooling-composite');
        requireBatch(keysExactly(binding, ['baseSha', 'topicTree', 'compositeTree', 'files', 'diffSha256', 'commitSha']) &&
            binding.baseSha === c.baseSha && [binding.topicTree, binding.compositeTree].every(objectId) &&
            digestId(binding.diffSha256) && (binding.commitSha === null || objectId(binding.commitSha)) &&
            exactPaths(Object.keys(binding.files)) && same(Object.keys(binding.files).sort(), [...options.allowedFiles].sort()), 'tooling-binding-invalid');
        const current = readGit(c.root, baseline.head, c);
        const a = evaluateWorktreeSafety({ ...options, current });
        requireBatch(a.ok, 'tooling-git-safety-failed');
        requireBatch(options.observedRemote?.main?.sha === c.baseSha, 'tooling-main-mismatch');
        const git = batchGit(c.root), staged = phase === 'commit';
        requireBatch(staged ? current.head === c.baseSha && binding.commitSha === null :
            same(commitObject(git, current.head).parents, [c.baseSha]) &&
            (binding.commitSha === null || binding.commitSha === current.head), 'tooling-commit-mismatch');
        const entries = staged ? Object.fromEntries(git('ls-files', '--stage', '-z').split('\0').filter(Boolean).map(row => {
            const [meta, path] = row.split('\t'), [mode, blob, stage] = meta.split(' ');
            requireBatch(stage === '0', 'tooling-index-mismatch'); return [path, { mode, blob }];
        })) : inventory(git, current.head);
        const base = inventory(git, c.baseSha);
        requireBatch(same(changedPaths(base, entries), Object.keys(binding.files).sort()), 'tooling-scope-mismatch');
        for (const [p, expected] of Object.entries(binding.files)) {
            requireBatch(keysExactly(expected, ['mode', 'blob', 'sha256']) && digestId(expected.sha256) &&
                same(entries[p], { mode: expected.mode, blob: expected.blob }), 'tooling-bytes-mismatch');
            const stat = lstatSync(resolve(c.root, p));
            requireBatch(stat.isFile() && !stat.isSymbolicLink() && hash256(readFileSync(resolve(c.root, p))) === expected.sha256,
                'tooling-bytes-mismatch');
        }
        const diff = git('diff', '--binary', '--full-index', '--no-renames', ...(staged ? ['--cached', c.baseSha] : [c.baseSha, current.head]), '--');
        requireBatch(hash256(diff) === binding.diffSha256, 'tooling-diff-mismatch');
        // Reconstruct tree hashes in memory; no write-tree, temporary index or formal Git writes.
        requireBatch(treeHash(entries) === binding.topicTree, 'tooling-tree-mismatch');
        const e = readRecord(options.evidence, 'evidence-record-invalid');
        requireBatch(keysExactly(e, ['binding', 'inputs', 'regression']) && same(e.binding, { ...binding, commitSha: null }), 'tooling-evidence-mismatch');
        requireBatch(Array.isArray(e.inputs) && e.inputs.length === 2, 'composite-input-invalid');
        const composite = { ...base }, touched = new Set();
        for (const [i, input] of e.inputs.entries()) {
            requireBatch(keysExactly(input, ['sha', 'tree', 'base', 'files']) && [input.sha, input.tree, input.base].every(objectId) &&
                exactPaths(input.files) && input.files.every(p => p.startsWith(i === 0 ? 'apps/rhythm-cruise/' : STUDIO)) &&
                commitObject(git, input.sha).tree === input.tree && git('merge-base', c.baseSha, input.sha).trim() === input.base,
                'composite-input-invalid');
            const before = inventory(git, input.base), after = inventory(git, input.sha);
            requireBatch(same(changedPaths(before, after), [...input.files].sort()), 'composite-input-invalid');
            for (const path of input.files) {
                requireBatch(!touched.has(path) && !Object.hasOwn(binding.files, path) && same(composite[path], before[path]), 'composite-overlay-conflict');
                touched.add(path); if (after[path]) composite[path] = after[path]; else delete composite[path];
            }
        }
        for (const [path, value] of Object.entries(binding.files)) composite[path] = { mode: value.mode, blob: value.blob };
        requireBatch(treeHash(composite) === binding.compositeTree, 'composite-tree-mismatch');
        verifyRuns(e.regression, binding.compositeTree, 'tooling-composite');
        if (phase === 'push') requireBatch(pushRequest.targetRef === 'refs/heads/' + c.branch, 'tooling-publication-forbidden');
        return { ok: true, failures: [], head: current.head, topicTree: binding.topicTree, compositeTree: binding.compositeTree, publicationExecuted: false };
    } catch (error) { return { ok: false, failures: [{ code: error.gateCode || 'tooling-read-failed', detail: error.message }] }; }
}
function treeHash(entries) {
    const root = {};
    for (const [path, entry] of Object.entries(entries)) {
        const parts = path.split('/'); let node = root;
        for (const part of parts.slice(0, -1)) node = node[part] ??= {};
        node[parts.at(-1)] = entry;
    }
    function hash(node) {
        const parts = Object.entries(node).map(([name, value]) => value.blob ?
            { name, mode: value.mode, blob: value.blob, sort: name } : { name, mode: '40000', blob: hash(value), sort: name + '/' });
        parts.sort((a, b) => Buffer.compare(Buffer.from(a.sort), Buffer.from(b.sort)));
        const bytes = Buffer.concat(parts.map(x => Buffer.concat([Buffer.from(`${x.mode} ${x.name}\0`), Buffer.from(x.blob, 'hex')])));
        return createHash('sha1').update(Buffer.from(`tree ${bytes.length}\0`)).update(bytes).digest('hex');
    }
    return hash(root);
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
        } else if (command === 'check' || command === 'evidence') {
            const config = JSON.parse(readFileSync(baselinePath, 'utf8'));
            const phase = rest[0] || 'development', remoteHead = rest[1];
            const evaluate = command === 'evidence' ? verifyToolingEvidence : evaluateSafety;
            const result = evaluate({ ...config, trust: rest[2] ? { approvalSha256: rest[2] } : undefined, current: readGit(root, config.baseline?.head, config.contract), phase,
                remoteHead, observedRemote: remoteHead && config.contract ? JSON.parse(readFileSync(remoteHead, 'utf8')) : undefined });
            console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1;
        } else throw Error('Usage: git-safety.mjs capture [plan.json] | release | check <plan.json> <phase> [remote SHA / observations.json]');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
