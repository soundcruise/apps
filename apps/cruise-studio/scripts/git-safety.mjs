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

export function evaluateSafety({ baseline, current, allowedFiles = [], phase = 'development', remoteHead, commitBase }) {
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

export function readGit(root, baselineHead) {
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
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
        commitFiles: git('diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD').split('\0').filter(Boolean) };
    if (baselineHead && head !== baselineHead) {
        let ancestor = false;
        try { git('merge-base', '--is-ancestor', baselineHead, head); ancestor = true; } catch (e) { if (e.status !== 1) throw e; }
        const commits = ancestor ? git('rev-list', '--parents', head, '^' + baselineHead).trim().split('\n').filter(Boolean).map(row => {
            const [id, ...parents] = row.split(' ');
            return { id, parents, files: git('diff-tree', '--no-commit-id', '--name-only', '-r', '-z', id).split('\0').filter(Boolean) };
        }) : [];
        result.history = { ancestor, commits };
    }
    return result;
}

// Reads only. Baseline capture is printed for the operator to save outside the repository.
// remoteHead must be freshly measured with `git ls-remote origin refs/heads/main`.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const [command, baselinePath, ...rest] = process.argv.slice(2);
        const root = process.cwd();
        if (command === 'capture') console.log(JSON.stringify(readGit(root), null, 2));
        else if (command === 'release') {
            const result = evaluateSafety({ current: readGit(root), phase: 'release' });
            console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1;
        } else if (command === 'check') {
            const config = JSON.parse(readFileSync(baselinePath, 'utf8'));
            const phase = rest[0] || 'development', remoteHead = rest[1];
            const result = evaluateSafety({ baseline: config.baseline, current: readGit(root, config.baseline?.head),
                allowedFiles: config.allowedFiles, commitBase: config.commitBase, phase, remoteHead });
            console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1;
        } else throw Error('Usage: git-safety.mjs capture | release | check <plan.json> <phase> [remoteHead]');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
