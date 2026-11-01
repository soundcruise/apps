/* Account/Pro display only. Port Sync Center remains the settings/status owner. */
const CS=window.CruiseStudio,node=document.querySelector('[data-port-sync-status]');
node.innerHTML='<h2>Account・Cruise Sync</h2><p data-account-status role="status"></p><p>Port共通データの同期は、既存のSync Centerで確認・設定できます。</p><button type="button" class="btn-ghost">Account・Syncを開く</button>';
node.querySelector('button').onclick=()=>CS.shellHost.navigate('portSync');
function render(){node.querySelector('[data-account-status]').textContent=CS.entryAuth?.isAuthorized()?'Account接続済み・Pro認証済み':'認証を確認してください。端末内のデータは保持しています。';}
const timer=setInterval(render,1000);render();window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
