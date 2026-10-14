# Studio / NEWS parallel development Git safety

Studio 0.37.0 / project schema1を維持する開発補助契約。製品ロジック・NEWSの起動/試験・資格・保存・Syncは変更しない。

## Worktree-aware Git Safety Contract v1 (W1)

W1は読み取り専用checker・隔離fixture・運用契約の整備のみ。正式repoのworktree/branch作成・切替、モックコピー、stage/commit/push、main統合は実施しない。
以下の旧main運用は`contract`を指定しない既存API/CLIとしてそのまま維持する。topicをmainと見せかける、未知branchをprefixだけで許可する、remote一致を常時PASSにする変更は禁止。

### Registration and modes

`contract.version=1`は開発補助契約の版であり、製品version/schemaとは独立。baselineは生のcaptureを保持する。
登録値は人が承認したplanの入力であり、任意GitコマンドをOS/backendで禁止する認証機構ではない。checkerはGit書込み・ネットワーク・push実行を一切持たない。

| Mode | root / branch / base | Scope / ancestry | Publication |
|---|---|---|---|
| `main-development` | 正確なcanonical root/commonDir、`main`、既知base SHA | 旧main判定を維持。開始NEWS差分の追加/変化/消失/index変化は拒否。介在NEWS commitの旧監査も維持 | origin/mainとの旧HEAD/親一致に加え、明示push requestが必要 |
| `topic-development` | 正確な登録root/commonDir、登録された`codex/...` branch、既知ancestor base SHA | clean baselineから開始。baseから全topic commitとbaselineからの祖先関係を監査。各commitは単一親・非空・全pathが個別intent内。別worktreeのdirtyは読まない | 登録topic refのみ。fresh topic SHAが期待値と一致し、既存remote SHAがHEADの祖先であること |
| `main-integration` | 登録された専用integration branch/root/commonDir、最新承認main SHA | 統合前baselineのHEADはbase。明示承認された完成結果だけ検査。exact HEAD/base/topic/topic-base、親順序、topic全履歴、baseからの差分を検証 | fresh remote mainが承認baseに一致する場合のみ。開発/commit/自動取り込みを許可するモードではない |

全モードでbranchのcheckout先が登録rootの1件だけであることをbaseline/current両方で検査。branch重複、root/commonDir/remote URLの変化、複数push URL、merge/rebase/cherry-pick/revert/bisect途中状態を拒否する。
root/commonDirはcaptureのcanonical値を登録する。worktree一覧は共有Git metadataだけを読み、他worktreeのファイル・NEWS dirty内容を走査しない。
allowedFilesはStudio内の正確なファイル一覧。ディレクトリ・wildcard・共有root/Port/Shared/Workerの包括許可は不可。renameは旧新pathを検査し、commit履歴では`--no-renames`で削除側も監査する。
同じStudio worktreeにNEWS/未知dirtyが出た場合、topic modeでは拒否する。別worktree NEWS dirtyとの区別を維持する。

### Plan / observations

topic plan例（path/SHA/URL/branchは実測・承認値へ置換、これは実行承認ではない）:

```json
{
  "baseline": {},
  "allowedFiles": ["apps/cruise-studio/tests/example.test.mjs"],
  "commitBase": "PRECOMMIT_HEAD_SHA",
  "contract": {
    "version": 1,
    "mode": "topic-development",
    "root": "/approved/studio-worktree",
    "commonDir": "/approved/repository/.git",
    "branch": "codex/studio-approved-task",
    "baseSha": "APPROVED_BASE_COMMIT_SHA",
    "remote": "origin",
    "remoteFetchUrl": "https://github.com/soundcruise/apps.git",
    "remotePushUrl": "https://github.com/soundcruise/apps.git",
    "targetRef": "refs/heads/codex/studio-approved-task",
    "expectedTopicSha": null
  },
  "pushRequest": {
    "remote": "origin",
    "sourceRef": "refs/heads/codex/studio-approved-task",
    "sourceSha": "EXACT_PUBLISH_HEAD_SHA",
    "targetRef": "refs/heads/codex/studio-approved-task",
    "force": false
  }
}
```

`expectedTopicSha=null`は「fresh ls-remoteで該当refが存在しないと確認する」という明示期待。未測定/undefinedではない。既存topicは期待するexact SHAを登録する。
登録値変更は新しい正式承認・baselineで扱い、失敗を消すために値を書き換えない。remote main用baseとremote topic用期待SHAを混同しない。

```sh
# approved workspaceにおける読取のみ。capture結果はrepo外で保存する。
node apps/cruise-studio/scripts/git-safety.mjs capture /private/tmp/approved-plan.json
node apps/cruise-studio/scripts/git-safety.mjs check /private/tmp/approved-plan.json development
node apps/cruise-studio/scripts/git-safety.mjs check /private/tmp/approved-plan.json commit /private/tmp/fresh-remote-observations.json
```

`capture [plan]`でbase ancestry等を実測し、その結果をbaselineへそのまま入れる。legacy capture/checkの引数形式は維持。
worktree-mode checkの最後の引数はfresh観測JSON。checker内でls-remote/fetchは行わない:

```json
{
  "main": {"remote": "origin", "ref": "refs/heads/main", "sha": "FRESH_MAIN_SHA"},
  "topic": {"remote": "origin", "ref": "refs/heads/codex/studio-approved-task", "sha": null}
}
```

観測値は直前の`git ls-remote origin refs/heads/main refs/heads/codex/studio-approved-task`から作成する。終了コード成功も必要。行がないこととネットワーク失敗を混同しない。
JSON自体にfreshnessの暗号学的証明はない。測定コマンド/時点/結果を記録し、並行公開を直列化し、checker通過後のHEAD/ref/remote再変化では停止する。

### Topic lifecycle and push destination

development/commitではbase以降の自branch全履歴と自worktree scopeを検査。mainが進んでも自動取り込みをせず、`remote-main-advanced` noticeを返す。既知topicでのローカル編集・commitは可能。
commitは非空・完全stage・他owner stageゼロを要求。postcommitは指定commitBaseのdirect child、commit scope、index/worktree cleanを検査。
pushはtopic全履歴を再検査し、fresh main観測とfresh topic観測を要求。main進展はtopic公開とmain統合を分けて報告する。topic ref更新の期待値不一致・非fast-forward・source SHA/ref/remote/target誤指定・force requestは停止。
topic modeでtargetをmainへ変えても拒否する。`git push origin main`はStudio branchをpushする操作ではなく共有local main refを選ぶため、Studio topic worktreeで使用禁止。
実際の公開コマンドは別途承認後に正確なtopic source:destinationだけを指定する。W1でpushは行わない。checkerは任意の手動pushを物理的に阻止しない。

main-integrationは`integrationApproval={approvalId,baseSha,topicSha,topicBaseSha,headSha}`を要求する。approvalIdは人の承認記録への参照であり、空でなければ自動承認される意味ではない。
完成結果の親は順に`[baseSha,topicSha]`。topicBaseはbase/topic両方の祖先。topicBaseからtopic全commitがintent内、baseから統合結果差分もintent内。HEAD/親/承認SHA/remote mainが変われば拒否する。
統合作業自体・fetch/pull/merge/rebase・mainへの公開は別工程の明示承認が必要。W1は完成結果のpush/release reviewだけを検査し、統合コマンドを生成/実行しない。
現v1の統合gateは上記2-parent方式だけを受理する。squash/fast-forward等へ無断で広げず、別契約と反例で扱う。

### Readonly originals and release clean

W1の未追跡モック原本は移行対象でもcommit対象でもない。必要な保全は`preservedUntracked=[{path,sha256}]`として明示登録する。
生baselineから消さない。baseline/currentの両方に同じ通常untracked file hashが存在し、非staged/非directoryで、個別intentと重複しないことを別predicateで検査する。
検証済み原本は変更scope判定から除くが、hash/状態/消失を常に拒否する。stage/commitへの採用許可や一般Studio dirty例外にはならない。legacy modeでは原本保全manifestを解釈せず、既存Studio dirty拒否を維持する。
W2ではclean destinationを先にcaptureし、9ファイルの検証付きコピーを新intentとして扱う。元の原本は削除しない。W1 checkerはコピーを行わない。

release cleanは対象worktreeのtracked/staged/untracked全件空を要求し、NEWS・tooling・保全原本の例外もない。topicのcleanはmain統合/製品公開の承認にはならない。
他worktreeのdirtyを対象worktreeのdirtyに混ぜない。main-integrationのrelease reviewは承認結果/最新remote mainも要求する。旧`release`コマンドの全件clean要求は維持する。
8765/8766、NEWS差分、原本、既存worktree/branchは不触。共有refs/remote/configへの更新、common-dirのcleanupは別承認。

### W1 verification / W2 gate

隔離Git fixtureに限りbranch/worktree/commitを作り、正式repoへは作らない。既存main反例を全件継続し、linked topicのreal reader、別worktree NEWS dirty保持、実feature-metadata guardも確認する。
main正常/divergence、topic正常/commit/publication、topic remote変化、main進展、同じworktreeの未知dirty/stage/共有変更、branch重複、base/root/common-dir/remote URL/ref/force/source誤り、無承認統合、release clean、原本保全を必須とする。
Node全回帰と以下の正規Browser cohortを実行し、skipや常時PASS化をしない。W2開始には本W1差分の正式確定と、worktree root/branch/base/manifest/操作範囲の個別承認が必要。

## Ownership and gates

| Gate | Responsibility | NEWS dirty |
|---|---|---|
| Functional Node / Browser | Studio挙動、released dependency境界 | 独立ownerとして許可 |
| Development scope | 開始baselineと明示Studioファイルintentの照合 | 開始差分の完全保持が必要 |
| Commit | 全変更対象の個別stage、他owner混入/部分stage拒否 | stage禁止 |
| Remote / history | origin/main・fresh remote・HEAD・親・祖先・commit範囲 | 不明履歴は停止 |
| Release clean | index/worktree/untrackedを含むリポジトリ全体clean | 拒否 |

Studioは`apps/cruise-studio/`、NEWSは`workers/sound-cruise-news/`がowner。ファイル名ごとの暫定例外は作らない。
それ以外はprotected。共通root設定、Shared、Port、他apps、他Workerを変更する必要があれば停止し、別ownerとの範囲合意を先に行う。
同じStudioファイルを別作業が変更中でも停止する。Studio全域を一括で変更許可せず、その工程のファイルを個別に指定する。

`feature-metadata.test.mjs`のlive guardは、元のtracked dependency検査を維持し、NEWSを独立ownerとして分離する。
Studio以外/NEWS以外のtracked変更は引き続き拒否する。untracked・正確なStudio intent・stage・remoteは機能試験とは別の必須gate。
機能試験PASSだけをcommit許可としない。release gateのFAILを開発gateのFAILへ混同しない。

## Start / development

正式rootのmainでstatus、HEAD、origin/main、fresh `git ls-remote origin refs/heads/main`、ahead/behind、tracked/staged/untrackedを実測。
差分の所有者を確認する。開始時Studio差分、staged、未知owner差分、remote divergenceは停止。
既知の`.claude/`と`workers/sound-cruise-sync/node_modules/`は開始時存在したuntracked directory inventoryに限り保持可。
これらをimport/実行/変更/stageしない。新たな無関係directoryは拒否する。

変更前に次を実行し、JSONをrepo外の一時領域へ記録する。

```sh
node apps/cruise-studio/scripts/git-safety.mjs capture
```

plan JSONの形式は次のとおり。baselineは上の実測結果をそのまま入れる。allowedFilesは工程の正確なファイル名だけ。

```json
{
  "baseline": {},
  "allowedFiles": ["apps/cruise-studio/tests/example.test.mjs"]
}
```

`baseline: {}`はテンプレート。captureの実測objectへ置き換える。空baselineはgateが拒否する。

```sh
node apps/cruise-studio/scripts/git-safety.mjs check /private/tmp/task-plan.json development
node --test apps/cruise-studio/tests/*.test.mjs
```

このtoolはGit読取だけを行う。captureはstdout、check/releaseはJSON結果とexit0/1。Git add/commit/push、ネットワーク、資格へのアクセスは持たない。
tracked差分はHEAD diffとcached diffのbinary hash、NEWS untrackedは内容hashを保持する。renameは旧新両pathを検査する。
NEWS directory内のuntrackedは最大10000 files/32MiB。超過/非regular file/競合は停止する。
既知tooling directoryは内部を走査せず存在inventoryだけ確認するため、内部不変をhashで証明したとは報告しない。
同じStudioファイルで発生した他作業との同時編集はpath判定だけでは識別できない。運用でexclusive ownerを維持する。

NEWS差分が追加/変化/消失/stageされたら停止し、他作業へ勝手に復旧しない。
別作業がmainを進めた場合は祖先関係と全介在commitを確認する。toolは単一親・NEWS配下のみの介在commitだけを候補として許容する。
origin/mainとfresh remote一致も確認し、手動でowner/内容を監査する。merge/共有変更/不明commitなら停止。
NEWS baseline差分がcommitされて消えた場合もdriftとして停止。勝手にbaselineを書き換えず、境界を再測定して別の開始として扱う。

## Commit / push

1. Node全回帰・正規Browser全回帰・diff --check・development scope・NEWS保持を確認する。
2. HEAD/origin/main/fresh remoteが一致することを確認。許可したファイルだけ`git add <exact-file>`で個別stage。
3. stage後に再確認する。未stage/部分stage、NEWS/他ownerの混入、空commitは拒否。
4. 最新precommit HEADをplanの`commitBase`として明示記録する。

```sh
git ls-remote origin refs/heads/main
node apps/cruise-studio/scripts/git-safety.mjs check /private/tmp/task-plan.json commit <fresh-remote-SHA>
```

commit後はdirect child、commit filesがintent内、staged空、Studio差分なし、ahead1/behind0、NEWS保持を確認。
commitFilesの実測と予定一覧を人も照合し、required回帰を確認する。

```sh
node apps/cruise-studio/scripts/git-safety.mjs check /private/tmp/task-plan.json postcommit <fresh-remote-SHA>
git ls-remote origin refs/heads/main
node apps/cruise-studio/scripts/git-safety.mjs check /private/tmp/task-plan.json push <fresh-remote-SHA>
git push origin main
```

`<fresh-remote-SHA>`は直前のls-remote結果で、cacheを使わない。tool引数はその由来を証明しないため、測定コマンド/結果を作業記録に残す。
push後はHEAD=origin/main=remote、ahead0/behind0、stage空、commit範囲、NEWS保持を確認する。
remoteが進んだら停止。fetch/pull/rebase/mergeで勝手に解消しない。index検査とcommit間にも競合はあり得るため、commit後検査は省略しない。

git add . / add -A / reset / restore / checkout / clean / stash / rebase / merge / revert / amend / force pushは禁止。
他作業差分を一時退避したり、全体cleanを見せかけたりしない。

## Release and worktree

```sh
node apps/cruise-studio/scripts/git-safety.mjs release
```

これはuntrackedを含む全体cleanを要求し、開発用NEWS/toolingの例外を持たない。本番deploy/リリース承認を自動実行しない。
`.claude/`やnode_modulesが残る現在のworkspaceでは、release gateの失敗が正常。削除やignore追加で回避しない。

長期開発はNEWSとStudioのworktree/branch分離が望ましい。index・HEAD・作業ツリーを分離し、同じmain/indexの同時変更を減らせる。
Git object/remoteは共有なので、remote競合・共有ファイルのレビュー・通常pushの直前検査は引き続き必要。
導入は現在のNEWSとStudio作業の区切りで別途明示承認後に行う。未commit差分を無断移動しない。
今回worktree作成、workspace再構成、NEWSテスト変更は行わない。

## Verification

`git-safety.test.mjs`はclean/NEWS dirty、unexpected Studio/protected、parallel hash drift、rename、stage混入、remote divergence、
祖先/介在scope/direct parent、release cleanを固定fixtureで検証する。実workspaceのNEWSを変更して反例を作らない。
使い捨てGit fixtureでもNEWS tracked/untracked dirtyを保持し、実metadata suiteのGit読取をfixtureへ向けて機能回帰を確認する。

Browserのrequired cohortは`DOMAIN_UNDO_REDO_UI.md`の正規15 suite（406件）を継続する:
active-document、chord-presentation、domain-undo-ui、editing-session、keyboard-modal、library、metronome-presentation、
metronome-settings、metronome、pc-shell-layout、practice-presentation、structure-operation、structure-text、tuner、workspace-focus。
すべて`tests/<name>.browser.cjs`。別port・使い捨てChrome・合成micで実行し、既存8765/8766を操作しない。
`port-data-host.browser.cjs`は旧Host単独補助試験であり、上記15 suiteの件数には含まれない。
globで追加実行した際のFAILは隠さず別記録する。今回、折畳みDockのhidden Startをclickする旧fixtureがtimeoutした。
製品/Host試験を変更せず、正規15 suiteを明示実行してrequired gateを判定する。旧Host試験の整合は別工程。
失敗時は差分保持で停止。gate自体の修正は運用契約と反例の更新を伴う別工程で行い、単純skip/常時PASSへ変更しない。
