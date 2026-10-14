# Studio / NEWS parallel development Git safety

Studio 0.36.0 / project schema1を維持する開発補助契約。製品ロジック・NEWSの起動/試験・資格・保存・Syncは変更しない。

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
