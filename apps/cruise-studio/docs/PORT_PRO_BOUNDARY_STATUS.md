# Studio Port Pro 境界（未受入）

Studio は `port-pro-components.mjs` を起動時に読み込み、tuner/metronome の要求を `port-pro-boundary.mjs` で停止する。画面入口の切替やPort Controllerの製品mountは行っていない。現行の5ツールは Standard iframe。ここにある `open` はアクセス確認だけであり UI を開かない。

既存の shared Pro gate の状態と `SoundCruiseProOperationSource` の read/validate を使用し、非同期検証中の source・revision・qualification・gate・invalidate の変化を拒否する。Studio入口gateが未実装のため通常はsource不在で拒否する。仮に既存sourceが検証を返しても、Account/device writer admission は未接続として拒否する。表示ポリシーや固定資格は一切付与しない。無効化は非表示・pagehide時の保留中の認可要求を失効させる。稼働するProツールがないため、この段階ではProツールの音声停止やGlobal Stopは未実装。

次工程ではPort/Sync所有者が、全既存writer参加・Account/Device generation・実際のcommit直前確認・切替と失効のfence・画像参照とbinaryの原子性・複数タブ・未確定Outboxの処理を定義する。資格sourceとのライフサイクルを一体化した上でPort既存DOM/CSSとcontrollerを起動し、Port変更の既存単独動作回帰を実施する。Proとwriter admissionは別条件。Studio Project SyncとPort共通Syncも別受入。writer P2は未解決。

Port側チューナーは初期化後に既存のlocalStorageへ書き、メトロノームは独自の既存Pro operation sourceとrepository revision guardを使う。単にPort Pro policyを渡すだけでは安全な書込みにならない。練習・機材・My Appsも共通writerと未保存フォーム／画像IDB・timerを守るcontroller境界が必要。

実Pro資格・Account・二端末Sync・Safari・スマートフォンは未検証。本コードは共有認証・保存契約の実装でも、Pro UIの同等性の証拠でもない。
