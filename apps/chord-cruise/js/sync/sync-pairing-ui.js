(function (global) {
    'use strict';

    function tokenFor(action) {
        var provider = global.__SOUND_CRUISE_SYNC_PILOT_GET_TURNSTILE_TOKEN__;
        if (typeof provider === 'function') return Promise.resolve(provider(action));
        return Promise.resolve(global.__SOUND_CRUISE_SYNC_PILOT_TURNSTILE_TOKEN__ || null);
    }

    function messageFor(code) {
        var labels = {
            pairing_expired: 'コードの有効期限が切れました。新しいコードを発行してください。',
            pairing_already_used: 'このコードはすでに使用されています。',
            pairing_cancelled: 'このコードは無効になりました。新しいコードを発行してください。',
            pairing_attempts_exhausted: '試行回数の上限に達しました。新しいコードを発行してください。',
            device_limit: 'この同期には接続できる端末数の上限があります。',
            rate_limited: '少し時間をおいてからもう一度お試しください。',
            turnstile_failed: '認証を完了できませんでした。もう一度お試しください。',
            client_storage_failed: 'この端末に同期情報を保存できませんでした。コードを再発行してやり直してください。',
            recovery_invalid: '復旧コードが正しくありません。',
            recovery_uncertain: '通信結果を確認できませんでした。保存した復旧情報から再確認できます。',
            recovery_pending_missing: '再開できる復旧情報がありません。',
            recovery_rotation_failed: '新しい復旧コードを発行できませんでした。',
            invalid_cloud_snapshot: 'クラウドデータを安全に検証できませんでした。統合は行っていません。',
            cloud_snapshot_stale: '確認後にクラウドデータが変わりました。もう一度内容を確認してください。',
            local_snapshot_stale: '確認後にこの端末のデータが変わりました。もう一度内容を確認してください。',
            merge_conflicts_unresolved: '競合ごとに残す内容を選んでください。',
            local_apply_failed: 'この端末への反映に失敗したため、元のデータへ戻しました。',
            backup_failed: '安全なバックアップを作成できなかったため、統合は行っていません。',
            remote_post_verify_failed: '送信後の検証を完了できませんでした。再試行できます。'
        };
        return labels[code] || '接続を完了できませんでした。';
    }

    function install(client) {
        if (!global.document || global.document.getElementById('cc-sync-pairing-section')) return false;
        var anchor = global.document.querySelector('.cc-settings-refresh-bar');
        if (!anchor) return false;
        var section = global.document.createElement('section');
        section.id = 'cc-sync-pairing-section';
        section.className = 'cc-settings-reset';
        section.setAttribute('aria-labelledby', 'cc-sync-pairing-title');
        section.innerHTML = '<h4 id="cc-sync-pairing-title">クラウド同期</h4><p class="cc-settings-note" data-sync-pairing-status>確認中…</p><div data-sync-pairing-actions></div><p class="cc-settings-note" data-sync-pairing-result aria-live="polite"></p>';
        anchor.parentNode.insertBefore(section, anchor);
        var status = section.querySelector('[data-sync-pairing-status]');
        var actions = section.querySelector('[data-sync-pairing-actions]');
        var result = section.querySelector('[data-sync-pairing-result]');

        function button(label, action, className) {
            var element = global.document.createElement('button');
            element.type = 'button';
            element.className = className || 'cc-settings-reset-trigger';
            element.textContent = label;
            element.addEventListener('click', action);
            return element;
        }

        function recoveryCodeView(issued, onSaved) {
            actions.textContent = '';
            status.textContent = '重要：復旧コード';
            var output = global.document.createElement('output');
            output.className = 'cc-settings-note';
            output.setAttribute('data-sync-recovery-code', '');
            output.textContent = issued.displayRecoveryCode;
            actions.appendChild(output);
            var explanation = global.document.createElement('p');
            explanation.className = 'cc-settings-note';
            explanation.textContent = 'すべての端末を失った場合のデータ復旧に必要です。安全な場所に保管してください。このコードは再表示できません。';
            actions.appendChild(explanation);
            actions.appendChild(button('コピー', async function () {
                try {
                    if (!global.navigator || !global.navigator.clipboard) throw new Error('Clipboard unavailable');
                    await global.navigator.clipboard.writeText(issued.recoveryCode);
                    result.textContent = '復旧コードをコピーしました。';
                } catch (error) {
                    result.textContent = 'コピーできませんでした。表示中のコードを安全な場所へ保存してください。';
                }
            }));
            actions.appendChild(button('保存しました', onSaved, 'cc-settings-reset-trigger cc-settings-pro-link'));
        }

        async function render() {
            var store = await client.openStore();
            var credential = await store.getMeta('deviceCredential');
            var pendingRecovery = await store.getMeta('pendingRecovery');
            var syncState = await store.getMeta('syncState');
            actions.textContent = '';
            result.textContent = '';
            if (credential && credential.credential) {
                status.textContent = syncState === 'paired_pending' ? '同期接続済み（データ統合の確認待ち）' : '同期済み';
                if (syncState === 'paired_pending') {
                    actions.appendChild(button('統合内容を確認', showMergePreview));
                }
                actions.appendChild(button('別のアプリと同期', issueCode));
                actions.appendChild(button('新しい復旧コードを発行', regenerateRecoveryCode, 'cc-settings-reset-trigger cc-settings-pro-link'));
                return;
            }
            if (pendingRecovery && pendingRecovery.deviceCredential) {
                status.textContent = '復旧処理の確認が必要です。';
                actions.appendChild(button('復旧を再確認', resumeRecovery));
                return;
            }
            status.textContent = 'この端末はまだクラウド同期に接続していません。';
            actions.appendChild(button('同期をはじめる', startIdentity));
            actions.appendChild(button('すでに同期しています', showPairForm, 'cc-settings-reset-trigger cc-settings-pro-link'));
            actions.appendChild(button('復旧コードを使う', showRecoveryForm, 'cc-settings-reset-trigger cc-settings-pro-link'));
        }

        async function startIdentity() {
            result.textContent = '';
            var token = await tokenFor('sound_cruise_sync_start');
            if (!token) { result.textContent = '認証を完了してから同期を開始してください。'; return; }
            status.textContent = '同期を開始しています…';
            actions.textContent = '';
            var started = await client.startIdentity({ turnstileToken: token });
            if (!started.ok) { result.textContent = messageFor(started.code); await render(); return; }
            recoveryCodeView(started, async function () {
                result.textContent = 'ローカルデータを安全に同期しています…';
                var migrated = await client.beginInitialMigration();
                if (!migrated.ok) { result.textContent = messageFor(migrated.code); return; }
                await render();
                result.textContent = '同期を開始しました。';
            });
        }

        async function regenerateRecoveryCode() {
            if (global.confirm && !global.confirm('現在の復旧コードは使えなくなります。新しい復旧コードを発行しますか？')) return;
            result.textContent = '新しい復旧コードを発行しています…';
            var issued = await client.regenerateRecoveryCode();
            if (!issued.ok) { result.textContent = messageFor(issued.code); return; }
            recoveryCodeView(issued, async function () {
                await render();
                result.textContent = '新しい復旧コードを発行しました。';
            });
        }

        async function resumeRecovery() {
            result.textContent = '復旧結果を確認しています…';
            var recovered = await client.resumeRecovery();
            if (!recovered.ok) { result.textContent = messageFor(recovered.code); return; }
            await render();
            result.textContent = recovered.localState === 'empty'
                ? '復旧しました。導入内容を確認してからクラウドデータを反映できます。'
                : '復旧しました。統合内容を確認するまで、どちらのデータも変更しません。';
        }

        function choiceLabel(choice) {
            return { local: 'この端末', cloud: 'クラウド', both: '両方残す', delete: '削除を反映' }[choice] || choice;
        }

        function summaryLine(plan) {
            var finalCount = plan.finalManifest ? plan.finalManifest.recordCount : '確認後に確定';
            return (plan.localState === 'empty' ? '空の端末へクラウドデータを導入' : 'この端末とクラウドのデータを統合') +
                'します。この端末 ' + plan.source.localRecordCount + '件、クラウド ' + plan.source.cloudRecordCount +
                '件。同一 ' + plan.summary.identical + '件、この端末から追加 ' + plan.summary.local_only +
                '件、クラウドから追加 ' + plan.summary.cloud_only + '件、競合 ' + plan.conflicts.length +
                '件、ID調整 ' + plan.idRemaps.length + '件、統合後 ' + finalCount + '件。';
        }

        async function showMergePreview() {
            status.textContent = 'クラウドとこの端末のデータを読み取り、統合内容を確認しています…';
            actions.textContent = '';
            result.textContent = '';
            var prepared = await client.preparePairingMerge();
            if (!prepared.ok) {
                status.textContent = '統合内容を確認できませんでした。';
                result.textContent = messageFor(prepared.code);
                actions.appendChild(button('もう一度確認', showMergePreview));
                return;
            }
            renderMergePreview(prepared);
        }

        function renderMergePreview(prepared) {
            var plan = prepared.plan;
            status.textContent = summaryLine(plan);
            actions.textContent = '';
            var form = global.document.createElement('div');
            form.setAttribute('data-sync-merge-preview', '');
            var choices = {};
            plan.conflicts.forEach(function (conflict, index) {
                var row = global.document.createElement('div');
                row.className = 'cc-settings-note';
                var label = global.document.createElement('label');
                label.textContent = (conflict.recordType === 'chord' && conflict.local && conflict.local.payload
                    ? (conflict.local.payload.chordName || conflict.recordKey) : conflict.recordKey) + '：';
                var select = global.document.createElement('select');
                select.setAttribute('aria-label', '競合 ' + (index + 1) + ' の残し方');
                var placeholder = global.document.createElement('option');
                placeholder.value = ''; placeholder.textContent = '残す内容を選択';
                select.appendChild(placeholder);
                conflict.choices.forEach(function (choice) {
                    var option = global.document.createElement('option');
                    option.value = choice; option.textContent = choiceLabel(choice);
                    select.appendChild(option);
                });
                select.addEventListener('change', function () { choices[conflict.conflictId] = select.value; });
                label.appendChild(select);
                row.appendChild(label);
                if (conflict.local || conflict.cloud) {
                    var comparison = global.document.createElement('p');
                    comparison.textContent = 'この端末：' + (conflict.local && conflict.local.payload
                        ? (conflict.local.payload.chordName || conflict.local.payload.name || '変更あり') : '削除') +
                        ' ／ クラウド：' + (conflict.cloud && conflict.cloud.payload
                            ? (conflict.cloud.payload.chordName || conflict.cloud.payload.name || '変更あり') : '削除');
                    row.appendChild(comparison);
                }
                form.appendChild(row);
            });
            var confirm = button(plan.conflicts.length ? '選択内容で統合' : 'この内容で統合', async function () {
                confirm.disabled = true;
                result.textContent = 'バックアップを作成して統合しています。画面を閉じずにお待ちください…';
                var applied = await client.applyPairingMerge(prepared.sessionId, choices);
                if (!applied.ok) {
                    result.textContent = messageFor(applied.code);
                    confirm.disabled = false;
                    if (applied.code === 'cloud_snapshot_stale' || applied.code === 'local_snapshot_stale') {
                        actions.textContent = '';
                        actions.appendChild(button('最新の内容を再確認', showMergePreview));
                    }
                    return;
                }
                status.textContent = '同期データの統合が完了しました。';
                actions.textContent = '';
                actions.appendChild(button('別のアプリと同期', issueCode));
                result.textContent = 'この端末とクラウドの内容を検証し、同期を開始しました。';
            });
            form.appendChild(confirm);
            form.appendChild(button('今は統合しない', render));
            actions.appendChild(form);
        }

        async function issueCode() {
            var issued = await client.issuePairingCode();
            if (!issued.ok) { result.textContent = messageFor(issued.code); return; }
            status.textContent = '別のChord Cruiseで、この8桁コードを入力してください。';
            actions.textContent = '';
            var output = global.document.createElement('output');
            output.className = 'cc-settings-note';
            output.textContent = issued.displayCode;
            actions.appendChild(output);
            actions.appendChild(button('コードをコピー', async function () {
                try {
                    if (global.navigator && global.navigator.clipboard) await global.navigator.clipboard.writeText(issued.pairingCode);
                    result.textContent = 'コードをコピーしました。';
                } catch (error) { result.textContent = 'コピーできませんでした。表示中のコードを入力してください。'; }
            }));
            actions.appendChild(button('新しいコードを発行', issueCode, 'cc-settings-reset-trigger cc-settings-pro-link'));
        }

        function showPairForm() {
            actions.textContent = '';
            var input = global.document.createElement('input');
            input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'one-time-code';
            input.maxLength = 9; input.placeholder = '1234 5678'; input.setAttribute('aria-label', '8桁の同期コード');
            input.addEventListener('input', function () {
                var code = global.ChordCruiseSync.client.normalizePairingCode(input.value);
                input.value = code ? global.ChordCruiseSync.client.formatPairingCode(code) : input.value.replace(/[^0-9\s-]/g, '');
            });
            actions.appendChild(input);
            actions.appendChild(button('接続する', async function () {
                var token = await tokenFor('sound_cruise_sync_pair');
                if (!token) { result.textContent = '認証を完了してから接続してください。'; return; }
                var paired = await client.pairWithCode({ pairingCode: input.value, turnstileToken: token });
                if (!paired.ok) { result.textContent = messageFor(paired.code); return; }
                await render();
                result.textContent = paired.localState === 'empty'
                    ? '接続しました。導入内容を確認してからクラウドデータを反映できます。'
                    : '接続しました。統合内容を確認するまで、どちらのデータも変更しません。';
            }));
        }

        function showRecoveryForm() {
            actions.textContent = '';
            result.textContent = '';
            status.textContent = '安全な場所に保存した20文字の復旧コードを入力してください。';
            var input = global.document.createElement('input');
            input.type = 'text'; input.inputMode = 'text'; input.autocomplete = 'off';
            input.autocapitalize = 'characters'; input.spellcheck = false;
            input.maxLength = 24; input.placeholder = 'ABCD-EFGH-JKMP-QRST-WXYZ';
            input.setAttribute('aria-label', '20文字の復旧コード');
            input.addEventListener('input', function () {
                var normalized = global.ChordCruiseSync.client.normalizeRecoveryCode(input.value);
                if (normalized) input.value = global.ChordCruiseSync.client.formatRecoveryCode(normalized);
                else input.value = input.value.toUpperCase().replace(/[^0-9ABCDEFGHJKMNPQRSTVWXYZ\s-]/g, '');
            });
            actions.appendChild(input);
            actions.appendChild(button('復旧する', async function () {
                var token = await tokenFor('sound_cruise_sync_recover');
                if (!token) { result.textContent = '認証を完了してから復旧してください。'; return; }
                result.textContent = '復旧コードを確認しています…';
                var prepared = await client.prepareRecovery({ recoveryCode: input.value, turnstileToken: token });
                if (!prepared.ok) { result.textContent = messageFor(prepared.code); return; }
                recoveryCodeView(prepared, async function () {
                    result.textContent = '端末へ安全に保存して復旧しています…';
                    var recovered = await client.commitRecovery(prepared);
                    if (!recovered.ok) { result.textContent = messageFor(recovered.code); return; }
                    await render();
                    result.textContent = recovered.localState === 'empty'
                        ? '復旧しました。導入内容を確認してからクラウドデータを反映できます。'
                        : '復旧しました。統合内容を確認するまで、どちらのデータも変更しません。';
                });
            }));
            actions.appendChild(button('戻る', render, 'cc-settings-reset-trigger cc-settings-pro-link'));
        }

        render().catch(function () { status.textContent = '同期状態を確認できませんでした。'; });
        return true;
    }

    global.ChordCruiseSync = global.ChordCruiseSync || {};
    global.ChordCruiseSync.pairingUi = Object.freeze({ install: install });
}(typeof window !== 'undefined' ? window : globalThis));
