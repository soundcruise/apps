(function (global) {
    'use strict';

    var refreshCurrent = null;
    var openAttentionCurrent = null;

    function tokenFor(action) {
        var provider = global.__SOUND_CRUISE_SYNC_GET_TURNSTILE_TOKEN__;
        if (typeof provider === 'function') return Promise.resolve(provider(action));
        return Promise.resolve(null);
    }

    function messageFor(code) {
        var labels = {
            pairing_expired: 'コードの有効期限が切れました。新しいコードを発行してください。',
            pairing_already_used: 'このコードはすでに使用されています。',
            pairing_cancelled: 'このコードは無効になりました。新しいコードを発行してください。',
            pairing_attempts_exhausted: '試行回数の上限に達しました。新しいコードを発行してください。',
            device_limit: 'この同期には接続できる端末数の上限があります。',
            rate_limited: '少し時間をおいてからもう一度お試しください。',
            sync_admission_paused: '現在、新しいクラウド同期の受付を一時停止しています。',
            enrollment_required: 'クラウド同期を開始するには招待コードが必要です。',
            enrollment_invalid: '招待コードが無効、期限切れ、または使用済みです。',
            sync_write_paused: 'クラウド同期は一時停止中です。端末内の保存は利用できます。',
            sync_read_paused: 'クラウドからの同期取得は一時停止中です。端末内の保存は利用できます。',
            sync_recovery_paused: 'クラウドデータの復旧を一時停止しています。',
            sync_cloud_delete_paused: 'クラウドデータの削除を一時停止しています。',
            rollout_control_unavailable: 'クラウド同期の状態を確認できません。端末内の保存は利用できます。',
            turnstile_failed: '認証を完了できませんでした。もう一度お試しください。',
            client_storage_failed: 'この端末の同期情報を安全に更新できませんでした。もう一度お試しください。',
            recovery_invalid: '復旧コードが正しくありません。',
            recovery_uncertain: '通信結果を確認できませんでした。保存した復旧情報から再確認できます。',
            recovery_pending_missing: '再開できる復旧情報がありません。',
            recovery_rotation_failed: '新しい復旧コードを発行できませんでした。',
            device_list_failed: '端末の一覧を取得できませんでした。',
            device_not_found: '指定した端末は見つかりませんでした。',
            device_revoke_failed: '端末の同期を解除できませんでした。もう一度お試しください。',
            delete_intent_expired: '削除の確認期限が切れました。もう一度最初から操作してください。',
            delete_pending_missing: '再開できるクラウド削除の確認情報がありません。',
            delete_uncertain: '削除結果を確認できませんでした。通信を確認してもう一度お試しください。',
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

    function initialMigrationNeedsResume(credential, syncState, migrationState) {
        return Boolean(
            credential && credential.credential &&
            syncState === 'provisioning' &&
            migrationState !== 'complete'
        );
    }

    function install(client) {
        if (!global.document || global.document.getElementById('cc-sync-pairing-section')) return false;
        var host = global.document.querySelector('[data-sync-join-entry-host]');
        var anchor = global.document.querySelector('.cc-settings-refresh-bar');
        if (!host && !anchor) return false;
        var section = global.document.createElement('section');
        section.id = 'cc-sync-pairing-section';
        section.className = 'cc-settings-reset cc-sync-settings-entry';
        section.setAttribute('aria-labelledby', 'cc-sync-pairing-title');
        section.innerHTML = '' +
            '<button type="button" class="cc-sync-entry-row" data-sync-open aria-describedby="cc-sync-entry-status">' +
                '<span><strong id="cc-sync-pairing-title">クラウド同期</strong><small>端末間でコードと設定を同期</small></span>' +
                '<span class="cc-sync-entry-state"><span id="cc-sync-entry-status" data-sync-entry-status>確認中…</span><b aria-hidden="true">›</b></span>' +
            '</button>' +
            '<section class="cc-sync-screen" data-sync-screen aria-labelledby="cc-sync-screen-title" hidden>' +
                '<header class="cc-sync-screen-head"><button type="button" class="cc-settings-back-btn" data-sync-close>戻る</button><h3 id="cc-sync-screen-title">クラウド同期</h3><button type="button" class="cc-sync-help-btn" data-sync-help aria-label="クラウド同期のヘルプ">?</button></header>' +
                '<div class="cc-sync-status-card" data-sync-status-card><strong data-sync-pairing-status>確認中…</strong><p data-sync-status-detail></p><p class="cc-sync-account-id" data-sync-account-id hidden></p></div>' +
                '<div class="cc-sync-screen-actions" data-sync-pairing-actions></div>' +
                '<p class="cc-settings-note cc-sync-result" data-sync-pairing-result aria-live="polite"></p>' +
            '</section>';
        if (host) {
            host.textContent = '';
            host.appendChild(section);
        } else {
            anchor.parentNode.insertBefore(section, anchor);
        }
        var screen = section.querySelector('[data-sync-screen]') || section;
        var entry = section.querySelector('[data-sync-open]');
        var entryStatus = section.querySelector('[data-sync-entry-status]');
        var status = section.querySelector('[data-sync-pairing-status]');
        var statusDetail = section.querySelector('[data-sync-status-detail]');
        var accountIdDisplay = section.querySelector('[data-sync-account-id]');
        var actions = section.querySelector('[data-sync-pairing-actions]');
        var result = section.querySelector('[data-sync-pairing-result]');
        var transientResult = '';
        var transientTimer = null;
        var pairingCodeTimer = null;
        var busy = false;
        var enrollmentRequired = global.__SOUND_CRUISE_SYNC_ENROLLMENT_REQUIRED__ === true;
        var sensitiveCore = global.SoundCruiseSyncAccount && global.SoundCruiseSyncAccount.core;
        var RECOVERY_PHASES = Object.freeze({ input: true, summary: true, 'new-code': true, commit: true, complete: true });

        function setRecoveryPhase(phase) {
            if (!RECOVERY_PHASES[phase]) {
                section.removeAttribute('data-sync-recovery-phase');
                return;
            }
            section.setAttribute('data-sync-recovery-phase', phase);
        }

        function setTransient(message) {
            transientResult = message || '';
            result.textContent = transientResult;
            if (transientTimer && typeof global.clearTimeout === 'function') global.clearTimeout(transientTimer);
            if (message && typeof global.setTimeout === 'function') {
                transientTimer = global.setTimeout(function () {
                    transientResult = '';
                    if (result.textContent === message) result.textContent = '';
                }, global.SoundCruiseSyncUI?.temporaryFeedbackMs || 5000);
            }
        }

        function setStatus(label, detail) {
            status.textContent = label;
            if (statusDetail) statusDetail.textContent = detail || '';
        }

        function setEntryStatus(label) {
            if (entryStatus) entryStatus.textContent = label;
        }

        function showScreen() {
            if (entry) entry.hidden = true;
            if (screen !== section) screen.hidden = false;
            if (typeof screen.scrollIntoView === 'function') screen.scrollIntoView({ block: 'start' });
            return render();
        }

        function closeScreen() {
            if (pairingCodeTimer && typeof global.clearTimeout === 'function') global.clearTimeout(pairingCodeTimer);
            pairingCodeTimer = null;
            if (screen !== section) screen.hidden = true;
            if (entry) entry.hidden = false;
            setRecoveryPhase(null);
            if (entry && typeof entry.focus === 'function') entry.focus();
        }

        function setButtonBusy(element, label, isBusy) {
            if (!element) return;
            if (isBusy) {
                element.setAttribute('data-sync-label', element.textContent);
                element.disabled = true;
                element.setAttribute('aria-busy', 'true');
                element.textContent = label || '処理中…';
                return;
            }
            element.disabled = false;
            element.removeAttribute('aria-busy');
            var savedLabel = typeof element.getAttribute === 'function' ? element.getAttribute('data-sync-label') : null;
            if (savedLabel) {
                element.textContent = savedLabel;
                element.removeAttribute('data-sync-label');
            }
        }

        function button(label, action, className) {
            var element = global.document.createElement('button');
            element.type = 'button';
            element.className = className || 'cc-settings-reset-trigger';
            element.textContent = label;
            element.setAttribute('data-sync-action', '');
            element.addEventListener('click', async function () {
                if (busy || element.disabled) return;
                busy = true;
                setButtonBusy(element, '処理中…', true);
                try {
                    await action();
                } finally {
                    busy = false;
                    setButtonBusy(element, null, false);
                }
            });
            return element;
        }

        function recoveryActionButton(label, action, actionName, className) {
            var element = button(label, action, className);
            element.setAttribute('data-sync-recovery-action', actionName);
            return element;
        }

        function recoveryCodeView(issued, onSaved, options) {
            setRecoveryPhase('new-code');
            actions.textContent = '';
            setStatus('Step 3 / 4　新しい復旧コードを保存', 'このコードは再表示できません。本人だけが確認できる場所に保管してください。');
            appendRecoverySteps(3);
            var output = global.document.createElement('output');
            output.className = 'cc-settings-note';
            output.setAttribute('data-sync-recovery-code', '');
            output.setAttribute('data-sync-sensitive', 'recovery-code');
            output.textContent = issued.displayRecoveryCode;
            actions.appendChild(output);
            var explanation = global.document.createElement('p');
            explanation.className = 'cc-settings-note';
            explanation.textContent = 'すべての端末を失った場合のデータ復旧に必要です。運営者へ送らず、安全な場所に保管してください。';
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
            actions.appendChild(recoveryActionButton(options && options.commitOnSaved === true ? '保存しました。復旧を確定' : '保存しました', async function () {
                if (options && options.commitOnSaved === true) setRecoveryPhase('commit');
                output.textContent = '';
                output.removeAttribute('data-sync-recovery-code');
                output.removeAttribute('data-sync-sensitive');
                actions.textContent = '';
                await onSaved();
            }, 'confirm-saved', 'cc-settings-reset-trigger cc-settings-pro-link'));
        }

        function appendRecoverySteps(activeStep) {
            var steps = global.document.createElement('ol');
            steps.className = 'cc-sync-recovery-steps';
            ['復旧コードを入力', 'クラウドデータを確認', '新しいコードを保存', '復旧を確定'].forEach(function (label, index) {
                var item = global.document.createElement('li');
                item.textContent = (index + 1) + '. ' + label;
                if (index + 1 === activeStep) item.setAttribute('aria-current', 'step');
                steps.appendChild(item);
            });
            actions.appendChild(steps);
        }

        function recoverySummaryView(prepared) {
            setRecoveryPhase('summary');
            actions.textContent = '';
            result.textContent = '';
            setStatus('Step 2 / 4　復旧するデータを確認', '内容が正しいことを確認してから次へ進んでください。');
            appendRecoverySteps(2);
            var heading = global.document.createElement('strong');
            heading.setAttribute('data-sync-recovery-summary', 'app');
            heading.textContent = 'コードクルーズ';
            actions.appendChild(heading);
            var summary = prepared.summary;
            [
                { name: 'chords', text: 'クラウドに保存されているコード：' + summary.chordCount + '件' },
                { name: 'folders', text: 'フォルダ：' + summary.folderCount + '件' },
                { name: 'records', text: '同期データ：' + summary.recordCount + '件' },
                { name: 'devices', text: '同期中の環境：' + summary.activeDeviceCount + '件' },
                { name: 'updated-at', text: '最終更新：' + formatLastSeen(summary.updatedAt) }
            ].forEach(function (item) {
                var detail = global.document.createElement('p');
                detail.className = 'cc-settings-note';
                detail.setAttribute('data-sync-recovery-summary', item.name);
                detail.textContent = item.text;
                actions.appendChild(detail);
            });
            var warning = global.document.createElement('p');
            warning.className = 'cc-settings-note';
            warning.textContent = '次の画面で新しい復旧コードを保存します。復旧を確定すると、現在同期中の他の端末はすべて同期解除されます。';
            actions.appendChild(warning);
            actions.appendChild(button('戻る', render));
            actions.appendChild(recoveryActionButton('新しい復旧コードを確認', function () {
                recoveryCodeView(prepared, async function () {
                    result.textContent = '端末へ安全に保存して復旧しています…';
                    var recovered = await client.commitRecovery(prepared);
                    if (!recovered.ok) { result.textContent = messageFor(recovered.code); return; }
                    await render();
                    setRecoveryPhase('complete');
                    result.textContent = recovered.localState === 'empty'
                        ? '復旧しました。導入内容を確認してからクラウドデータを反映できます。'
                        : '復旧しました。統合内容を確認するまで、どちらのデータも変更しません。';
                }, { commitOnSaved: true });
            }, 'continue', 'cc-settings-reset-trigger cc-settings-pro-link'));
        }

        function formatLastSeen(value) {
            if (!Number.isFinite(value)) return '不明';
            var date = new Date(value);
            if (isNaN(date.getTime())) return '不明';
            return date.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        function clearActionsForDecision() {
            actions.textContent = '';
            result.textContent = '';
        }

        function actionGroup(title, description, className) {
            var group = global.document.createElement('section');
            group.className = 'cc-sync-action-group' + (className ? ' ' + className : '');
            if (title) {
                var heading = global.document.createElement('h4');
                heading.textContent = title;
                group.appendChild(heading);
            }
            if (description) {
                var note = global.document.createElement('p');
                note.className = 'cc-settings-note';
                note.textContent = description;
                group.appendChild(note);
            }
            actions.appendChild(group);
            return group;
        }

        function appendEnrollmentStart(start) {
            start.textContent = '';
            var enrollmentInput = global.document.createElement('input');
            enrollmentInput.type = 'text';
            enrollmentInput.inputMode = 'text';
            enrollmentInput.autocomplete = 'off';
            enrollmentInput.autocapitalize = 'characters';
            enrollmentInput.spellcheck = false;
            enrollmentInput.maxLength = 29;
            enrollmentInput.placeholder = 'SCE1-XXXX-XXXX-XXXX-XXXX-XXXX';
            enrollmentInput.setAttribute('aria-label', 'クラウド同期の招待コード');
            enrollmentInput.setAttribute('data-sync-sensitive', 'enrollment-code-input');
            var enrollmentSecret = sensitiveCore.createSensitiveInputController(enrollmentInput);
            start.appendChild(enrollmentInput);
            start.appendChild(button('招待コードでクラウド同期を設定', function () {
                return startIdentity(enrollmentSecret.take(), enrollmentSecret);
            }, 'cc-sync-primary-action'));
        }

        function appendConnectedActions() {
            var everyday = actionGroup('', '', 'cc-sync-action-group--everyday');
            everyday.appendChild(button('別の環境を追加', issueCode, 'cc-sync-primary-action'));
            everyday.appendChild(button('同期中の環境', showDevices));

            var security = actionGroup('復旧と安全', '新しい復旧コードを発行すると、現在のコードは使えなくなります。');
            security.appendChild(button('新しい復旧コードを発行', regenerateRecoveryCode));
            security.appendChild(button('この端末の同期を解除', function () { disconnectAfterConfirmation(false); }));

            var danger = actionGroup('危険な操作', 'クラウド上の同期データを削除します。この端末に保存されているコードは削除されません。削除要求から7日後に完全削除の対象になります。', 'cc-sync-action-group--danger');
            danger.appendChild(button('クラウド上の同期データを削除', deleteCloudData, 'cc-settings-reset-trigger cc-settings-danger-trigger'));
        }

        function showHelp() {
            actions.textContent = '';
            setStatus('クラウド同期のヘルプ', '必要な項目だけ確認できます。');
            [
                ['クラウド同期とは？', '保存したコード、フォルダ、並び順、対応設定を対応する端末間で同期できます。'],
                ['別の環境で使うには？', '同期済みの環境で「別の環境を追加」を選び、表示された接続コードを新しい環境へ入力します。'],
                ['復旧コードとは？', '端末を失った場合などにクラウド上のデータを復旧するためのコードです。本人だけが確認できる安全な場所に保存し、運営者へ送らないでください。'],
                ['同期解除とは？', 'この端末の同期資格だけを解除します。この端末に保存されたコードとクラウド上のデータは削除されません。'],
                ['クラウドデータ削除とは？', 'クラウド上の同期データの削除を要求します。端末内のコードは自動削除されず、クラウド側は7日後に完全削除の対象になります。']
            ].forEach(function (item) {
                var group = actionGroup(item[0], item[1]);
                group.classList.add('cc-sync-help-item');
            });
            actions.appendChild(button('戻る', render));
        }

        async function disconnectAfterConfirmation(force) {
            var pending = await client.pendingOutboxCount();
            if (pending > 0 && !force) {
                clearActionsForDecision();
                setStatus('未送信の変更があります', '先に同期するか、同期せずにこの端末だけ解除するかを選べます。');
                result.textContent = '先に同期するか、同期せずにこの端末の同期だけを解除できます。コードはこの端末に残ります。';
                actions.appendChild(button('先に同期', async function () {
                    result.textContent = '未同期の変更を同期しています…';
                    var synced = await client.syncNow();
                    if (!synced.ok || await client.pendingOutboxCount() > 0) { result.textContent = '同期を完了できませんでした。データはそのままです。'; return; }
                    await disconnectAfterConfirmation(true);
                }));
                actions.appendChild(button('同期せずに解除', function () { disconnectAfterConfirmation(true); }, 'cc-settings-reset-trigger cc-settings-pro-link'));
                actions.appendChild(button('戻る', render));
                return;
            }
            if (global.confirm && !global.confirm('この端末の同期を解除しますか？\nこの端末に保存されているコードは残ります。クラウド上のデータも削除されません。')) return;
            setStatus('同期を解除しています…', 'この端末のコードとクラウド上のデータは削除されません。');
            var disconnected = await client.disconnectCurrentDevice();
            if (!disconnected.ok) {
                result.textContent = messageFor(disconnected.code);
                if (disconnected.revoked === true) {
                    actions.appendChild(button('この端末の同期情報を削除', async function () {
                        var cleared = await client.clearCloudState();
                        if (!cleared.ok) { result.textContent = messageFor(cleared.code); return; }
                        await render();
                        result.textContent = 'この端末の同期を解除しました。コードとクラウドデータは残っています。';
                    }, 'cc-settings-reset-trigger cc-settings-pro-link'));
                }
                return;
            }
            await render();
            result.textContent = 'この端末の同期を解除しました。コードとクラウドデータは残っています。';
        }

        async function showDevices() {
            clearActionsForDecision();
            setStatus('同期中の環境', 'この環境と接続済みの環境を確認できます。');
            var listed = await client.listDevices();
            if (!listed.ok) { result.textContent = messageFor(listed.code); actions.appendChild(button('戻る', render)); return; }
            listed.devices.forEach(function (device) {
                var row = global.document.createElement('div');
                row.className = 'cc-settings-note';
                var heading = global.document.createElement('strong');
                heading.textContent = device.isCurrent ? 'この端末：' + (device.label || '名称なし') : (device.label || '名称なし');
                row.appendChild(heading);
                var detail = global.document.createElement('p');
                detail.textContent = '最終同期：' + formatLastSeen(device.lastSeenAt);
                row.appendChild(detail);
                if (!device.isCurrent) {
                    row.appendChild(button((device.label || 'この端末') + ' の同期を解除', async function () {
                        if (global.confirm && !global.confirm((device.label || 'この端末') + ' の同期を解除しますか？この端末のコードは削除されません。')) return;
                        var revoked = await client.revokeDevice(device.deviceId);
                        if (!revoked.ok) { result.textContent = messageFor(revoked.code); return; }
                        result.textContent = '端末の同期を解除しました。';
                        showDevices();
                    }, 'cc-settings-reset-trigger cc-settings-pro-link'));
                }
                actions.appendChild(row);
            });
            actions.appendChild(button('戻る', render));
        }

        async function deleteCloudData() {
            if (global.confirm && !global.confirm('クラウドに保存されているSound Cruise Syncデータを削除します。各端末のコードは削除されません。続けますか？')) return;
            setStatus('クラウドデータの削除を準備しています…', 'この端末に保存されているコードは削除されません。');
            var prepared = await client.prepareAccountDelete();
            if (!prepared.ok) { result.textContent = messageFor(prepared.code); return; }
            if (global.confirm && !global.confirm('最終確認：クラウドデータを削除します。他の同期端末もクラウドへアクセスできなくなります。')) return;
            setStatus('クラウドデータを削除しています…', '削除要求を送信しています。');
            var deleted = await client.commitAccountDelete(prepared);
            if (!deleted.ok) { result.textContent = messageFor(deleted.code); return; }
            await render();
            result.textContent = 'クラウドデータを削除しました。この端末のコードは残っています。';
        }

        async function resumeAccountDelete() {
            setStatus('クラウド削除の結果を確認しています…', '通信結果を確認しています。');
            var deleted = await client.resumeAccountDelete();
            if (!deleted.ok) { result.textContent = messageFor(deleted.code); return; }
            await render();
            result.textContent = 'クラウドデータを削除しました。この端末のコードは残っています。';
        }

        async function render(options) {
            if (pairingCodeTimer && typeof global.clearTimeout === 'function') global.clearTimeout(pairingCodeTimer);
            pairingCodeTimer = null;
            var store = await client.openStore();
            var credential = await store.getMeta('deviceCredential');
            var pendingRecovery = await store.getMeta('pendingRecovery');
            var pendingAccountDelete = await store.getMeta('pendingAccountDelete');
            var syncState = await store.getMeta('syncState');
            var migrationState = await store.getMeta('migrationState');
            var runtimePause = await store.getMeta('runtimePause');
            var unresolved = typeof store.listConflicts === 'function' ? await store.listConflicts() : [];
            var activeMergeId = await store.getMeta('activeMergeSessionId');
            var activeMerge = activeMergeId ? await store.getMergeSession(activeMergeId) : null;
            var attentionCount = unresolved.length || (activeMerge?.stage === 'awaiting_confirmation'
                ? activeMerge.plan?.conflicts?.length || 0 : 0);
            var accountManagedSetup = await store.getMeta('accountManagedSetup');
            if (accountIdDisplay) {
                accountIdDisplay.hidden = true;
                accountIdDisplay.textContent = '';
            }
            if (credential && credential.credential && accountManagedSetup === true && accountIdDisplay) {
                try {
                    var savedAccount = await global.SoundCruiseSyncAccount?.storage?.getAccount?.();
                    var displayId = global.SoundCruiseSyncAccount?.core?.formatAccountDisplayId?.(savedAccount?.accountId);
                    if (displayId) {
                        accountIdDisplay.textContent = 'アカウント：' + displayId;
                        accountIdDisplay.hidden = false;
                    }
                } catch (_) {
                    accountIdDisplay.hidden = true;
                }
            }
            setRecoveryPhase(null);
            actions.textContent = '';
            if (!options || options.preserveTransientResult !== true) transientResult = '';
            result.textContent = transientResult;
            if (pendingAccountDelete && pendingAccountDelete.intentToken) {
                setStatus('要確認', 'クラウド削除の結果を確認する必要があります。');
                setEntryStatus('要確認');
                actions.appendChild(button('クラウド削除を再確認', resumeAccountDelete));
                return;
            }
            if (credential && credential.credential) {
                if (initialMigrationNeedsResume(credential, syncState, migrationState)) {
                    setStatus('準備中', migrationState === 'not_started'
                        ? '復旧コードの保存後、初回同期を開始してください。'
                        : '初回同期を再開できます。');
                    setEntryStatus('準備中');
                    result.textContent = '最初に表示された復旧コードを安全な場所へ保存済みの場合だけ、初回同期を再開してください。';
                    actions.appendChild(button('復旧コードを保存しました。初回同期を再開', resumeInitialMigration));
                    actions.appendChild(button('復旧コードを保存していない場合は更新', regenerateRecoveryCode));
                    return;
                }
                if (runtimePause && runtimePause.code) {
                    setStatus('同期一時停止', messageFor(runtimePause.code));
                    setEntryStatus('一時停止中');
                } else if (syncState === 'paired_pending' || unresolved.length) {
                    setStatus('要確認', 'この端末とクラウドのデータ統合を確認してください。');
                    setEntryStatus(attentionCount ? '確認が必要 ' + attentionCount + '件' : '確認が必要');
                } else {
                    setStatus('同期済み', 'この端末のデータはクラウドと同期されています。');
                    setEntryStatus('同期済み');
                }
                if (syncState === 'paired_pending' || unresolved.length) {
                    var pending = actionGroup('', '統合内容を確認するまで、どちらのデータも変更しません。', 'cc-sync-action-group--attention');
                    pending.appendChild(button('同期内容を確認', showMergePreview, 'cc-sync-primary-action'));
                    return;
                }
                appendConnectedActions();
                return;
            }
            if (pendingRecovery && pendingRecovery.deviceCredential) {
                setRecoveryPhase('commit');
                setStatus('要確認', '復旧処理の結果を確認する必要があります。');
                setEntryStatus('要確認');
                appendRecoverySteps(4);
                actions.appendChild(recoveryActionButton('復旧を再確認', resumeRecovery, 'resume-commit'));
                return;
            }
            setStatus('未設定', 'この端末はまだクラウド同期に接続していません。');
            setEntryStatus('未設定');
            var start = actionGroup('', '保存したコードやフォルダ、設定を対応する端末間で同期できます。', 'cc-sync-action-group--start');
            if (enrollmentRequired) appendEnrollmentStart(start);
            else start.appendChild(button('クラウド同期を設定', function () { startIdentity(null); }, 'cc-sync-primary-action'));
            var existing = actionGroup('すでに別の端末で利用していますか？', '同期済みの端末で発行した接続コードを入力します。');
            existing.appendChild(button('別の端末から接続', showPairForm));
            var recovery = actionGroup('困ったとき', '端末を失った場合などは、保存した復旧コードで復旧できます。');
            recovery.appendChild(recoveryActionButton('復旧コードで復旧', showRecoveryForm, 'open'));
        }

        async function resumeInitialMigration() {
            setStatus('初回同期を開始しています…', 'ローカルデータを安全に同期しています。');
            actions.textContent = '';
            result.textContent = 'ローカルデータを安全に同期しています…';
            var migrated = await client.beginInitialMigration();
            if (!migrated.ok) {
                await render();
                result.textContent = messageFor(migrated.code);
                return;
            }
            await render();
        }

        async function startIdentity(enrollmentCode, enrollmentSecret) {
            transientResult = '';
            result.textContent = '';
            var token = await tokenFor('sound_cruise_sync_start');
            if (!token) {
                if (enrollmentSecret) enrollmentSecret.reject({ code: 'network_unavailable', retryable: true });
                result.textContent = '認証を完了してから同期を開始してください。'; return;
            }
            setStatus('クラウド同期を設定しています…', '認証と同期情報を準備しています。');
            actions.textContent = '';
            var started = await client.startIdentity({ turnstileToken: token, enrollmentCode: enrollmentCode || null });
            if (!started.ok) {
                if (enrollmentSecret) enrollmentSecret.reject(started);
                if (started.code === 'enrollment_required') enrollmentRequired = true;
                transientResult = messageFor(started.code);
                await render({ preserveTransientResult: true });
                return;
            }
            if (enrollmentSecret) enrollmentSecret.resolve();
            recoveryCodeView(started, resumeInitialMigration);
        }

        async function regenerateRecoveryCode() {
            if (global.confirm && !global.confirm('現在の復旧コードは使えなくなります。新しい復旧コードを発行しますか？')) return;
            setStatus('復旧コードを更新しています…', '現在の復旧コードは使えなくなります。');
            var issued = await client.regenerateRecoveryCode();
            if (!issued.ok) { result.textContent = messageFor(issued.code); return; }
            recoveryCodeView(issued, async function () {
                await render();
                setTransient('復旧コードを更新しました。');
            });
        }

        async function resumeRecovery() {
            setRecoveryPhase('commit');
            setStatus('復旧結果を確認しています…', '通信結果を確認しています。');
            var recovered = await client.resumeRecovery();
            if (!recovered.ok) { result.textContent = messageFor(recovered.code); return; }
            await render();
            setRecoveryPhase('complete');
            setTransient(recovered.localState === 'empty'
                ? '復旧しました。導入内容を確認してからクラウドデータを反映できます。'
                : '復旧しました。統合内容を確認するまで、どちらのデータも変更しません。');
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
            setStatus('統合内容を確認しています…', 'クラウドとこの端末のデータを安全に読み取っています。');
            actions.textContent = '';
            result.textContent = '';
            var prepared = await client.preparePairingMerge();
            if (!prepared.ok) {
                setStatus('要確認', '統合内容を確認できませんでした。');
                result.textContent = messageFor(prepared.code);
                actions.appendChild(button('もう一度確認', showMergePreview));
                return;
            }
            renderMergePreview(prepared);
        }

        function renderMergePreview(prepared) {
            var plan = prepared.plan;
            setStatus('統合内容を確認', summaryLine(plan));
            actions.textContent = '';
            var form = global.document.createElement('div');
            form.setAttribute('data-sync-merge-preview', '');
            var choices = {};
            plan.conflicts.forEach(function (conflict, index) {
                var row = global.document.createElement('div');
                row.className = 'cc-settings-note';
                if (conflict.recordType === 'settings' && Array.isArray(conflict.fields) &&
                    conflict.fields.some(function (field) { return field && typeof field === 'object'; })) {
                    var heading = global.document.createElement('h3');
                    heading.textContent = '設定の違いを確認';
                    row.appendChild(heading);
                    choices[conflict.conflictId] = {};
                    conflict.fields.forEach(function (field, fieldIndex) {
                        var fieldset = global.document.createElement('fieldset');
                        var legend = global.document.createElement('legend');
                        legend.textContent = String(field.field || field.path || '設定項目');
                        fieldset.appendChild(legend);
                        var comparison = global.document.createElement('p');
                        comparison.textContent = 'この端末：' + String(field.local) + ' ／ クラウド：' + String(field.remote);
                        fieldset.appendChild(comparison);
                        [['local', 'この端末'], ['remote', 'クラウド']].forEach(function (entry) {
                            var option = global.document.createElement('label');
                            var radio = global.document.createElement('input');
                            radio.type = 'radio';
                            radio.name = 'cc-sync-setting-' + index + '-' + fieldIndex;
                            radio.value = entry[0];
                            radio.addEventListener('change', function () {
                                choices[conflict.conflictId][field.path] = entry[0];
                            });
                            option.appendChild(radio);
                            option.appendChild(global.document.createTextNode(entry[1]));
                            fieldset.appendChild(option);
                        });
                        row.appendChild(fieldset);
                    });
                    if (conflict.automaticCount) {
                        var automatic = global.document.createElement('p');
                        automatic.textContent = conflict.automaticCount + '項目は自動で統合されます';
                        row.appendChild(automatic);
                    }
                    form.appendChild(row);
                    return;
                }
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
                setStatus('同期済み', 'この端末とクラウドのデータ統合が完了しました。');
                setEntryStatus('同期済み');
                actions.textContent = '';
                appendConnectedActions();
                setTransient('この端末とクラウドの内容を検証し、同期を開始しました。');
            });
            form.appendChild(confirm);
            form.appendChild(button('あとで決める', render));
            actions.appendChild(form);
        }

        async function issueCode() {
            if (pairingCodeTimer && typeof global.clearTimeout === 'function') global.clearTimeout(pairingCodeTimer);
            pairingCodeTimer = null;
            var issued = await client.issuePairingCode();
            if (!issued.ok) { result.textContent = messageFor(issued.code); return; }
            setStatus('別の環境を追加', '別のChord Cruise環境で、この8桁の接続コードを入力してください。');
            actions.textContent = '';
            var output = global.document.createElement('output');
            output.className = 'cc-settings-note';
            output.setAttribute('data-sync-sensitive', 'pairing-code');
            output.textContent = issued.displayCode;
            actions.appendChild(output);
            if (typeof global.setTimeout === 'function') {
                pairingCodeTimer = global.setTimeout(function () {
                    pairingCodeTimer = null;
                    if (!actions.contains(output)) return;
                    output.textContent = '';
                    actions.textContent = '';
                    result.textContent = '接続コードの有効期限が切れました。';
                    actions.appendChild(button('新しい接続コードを発行', issueCode));
                    actions.appendChild(button('戻る', render));
                }, Math.max(0, issued.expiresAt - Date.now()));
            }
            actions.appendChild(button('コードをコピー', async function () {
                try {
                    if (global.navigator && global.navigator.clipboard) await global.navigator.clipboard.writeText(issued.pairingCode);
                    result.textContent = 'コードをコピーしました。';
                } catch (error) { result.textContent = 'コピーできませんでした。表示中のコードを入力してください。'; }
            }));
            actions.appendChild(button('新しい接続コードを発行', issueCode));
            actions.appendChild(button('戻る', render));
        }

        function showPairForm() {
            actions.textContent = '';
            setStatus('別の端末から接続', '同期済みの端末で発行した8桁の接続コードを入力してください。');
            var input = global.document.createElement('input');
            input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'one-time-code';
            input.maxLength = 9; input.placeholder = '1234 5678'; input.setAttribute('aria-label', '8桁の同期コード');
            input.setAttribute('data-sync-sensitive', 'pairing-code-input');
            var pairingSecret = sensitiveCore.createSensitiveInputController(input);
            input.addEventListener('input', function () {
                var code = global.ChordCruiseSync.client.normalizePairingCode(input.value);
                input.value = code ? global.ChordCruiseSync.client.formatPairingCode(code) : input.value.replace(/[^0-9\s-]/g, '');
            });
            actions.appendChild(input);
            actions.appendChild(button('接続する', async function () {
                var token = await tokenFor('sound_cruise_sync_pair');
                if (!token) { result.textContent = '認証を完了してから接続してください。'; return; }
                var pairingCode = pairingSecret.take();
                if (!pairingCode) { result.textContent = '接続コードを入力してください。'; return; }
                var paired = await client.pairWithCode({ pairingCode: pairingCode, turnstileToken: token });
                if (!paired.ok) { pairingSecret.reject(paired); result.textContent = messageFor(paired.code); return; }
                pairingSecret.resolve();
                await render();
                setTransient(paired.localState === 'empty'
                    ? '接続しました。導入内容を確認してからクラウドデータを反映できます。'
                    : '接続しました。統合内容を確認するまで、どちらのデータも変更しません。');
            }));
            actions.appendChild(button('戻る', render));
        }

        function showRecoveryForm() {
            setRecoveryPhase('input');
            actions.textContent = '';
            result.textContent = '';
            setStatus('Step 1 / 4　復旧コードを入力', '安全な場所に保存した20文字の復旧コードを入力してください。');
            appendRecoverySteps(1);
            var input = global.document.createElement('input');
            input.type = 'text'; input.inputMode = 'text'; input.autocomplete = 'off';
            input.autocapitalize = 'characters'; input.spellcheck = false;
            input.maxLength = 24; input.placeholder = 'ABCD-EFGH-JKMP-QRST-WXYZ';
            input.setAttribute('aria-label', '20文字の復旧コード');
            input.setAttribute('data-sync-sensitive', 'recovery-code-input');
            var recoverySecret = sensitiveCore.createSensitiveInputController(input);
            input.addEventListener('input', function () {
                var normalized = global.ChordCruiseSync.client.normalizeRecoveryCode(input.value);
                if (normalized) input.value = global.ChordCruiseSync.client.formatRecoveryCode(normalized);
                else input.value = input.value.toUpperCase().replace(/[^0-9ABCDEFGHJKMNPQRSTVWXYZ\s-]/g, '');
            });
            actions.appendChild(input);
            actions.appendChild(recoveryActionButton('クラウドデータを確認', async function () {
                var token = await tokenFor('sound_cruise_sync_recover');
                if (!token) { result.textContent = '認証を完了してから復旧してください。'; return; }
                result.textContent = '復旧コードを確認しています…';
                var recoveryCode = recoverySecret.take();
                if (!recoveryCode) { result.textContent = '復旧コードを入力してください。'; return; }
                var prepared = await client.prepareRecovery({ recoveryCode: recoveryCode, turnstileToken: token });
                if (!prepared.ok) { recoverySecret.reject(prepared); result.textContent = messageFor(prepared.code); return; }
                recoverySecret.resolve();
                recoverySummaryView(prepared);
            }, 'prepare'));
            actions.appendChild(button('戻る', render, 'cc-settings-reset-trigger cc-settings-pro-link'));
        }

        if (entry) entry.addEventListener('click', showScreen);
        var closeButton = section.querySelector('[data-sync-close]');
        if (closeButton) closeButton.addEventListener('click', closeScreen);
        var helpButton = section.querySelector('[data-sync-help]');
        if (helpButton) helpButton.addEventListener('click', showHelp);

        function refresh() {
            return render().catch(function () {
                setStatus('要確認', '同期状態を確認できませんでした。接続を確認してもう一度お試しください。');
                setEntryStatus('要確認');
                return false;
            });
        }

        refreshCurrent = refresh;
        openAttentionCurrent = function () {
            return Promise.resolve(showScreen()).then(function () {
                return client.openStore().then(function (store) {
                    return Promise.all([store.getMeta('syncState'), store.listConflicts()]);
                }).then(function (state) {
                    if (state[0] === 'paired_pending' || state[1].length) return showMergePreview();
                    return render();
                });
            });
        };
        refresh();
        return true;
    }

    global.ChordCruiseSync = global.ChordCruiseSync || {};
    global.ChordCruiseSync.pairingUi = Object.freeze({
        install: install,
        refresh: function () { return refreshCurrent ? refreshCurrent() : Promise.resolve(false); },
        openAttention: function () { return openAttentionCurrent ? openAttentionCurrent() : Promise.resolve(false); }
    });
}(typeof window !== 'undefined' ? window : globalThis));
