const windowMode=new URLSearchParams(location.search).get('mode')||'paper';
const t={id:'DEMO',member_id:'MEM',plan_name:'示範教練課',sessions_total:12,unlocked_sessions:4,amount_paid:4000,installment:{current:1,count:3,segments:[4,4,4],amounts:[4000,4000,4000]}};
const ct={id:'DEMO-CT',ticket_id:'DEMO',member_id:'MEM',sign_type:windowMode,signed_at:'2026-11-19',installment_signs:[]};
function instSignFind(){return null}function isDeskLike(){return true}async function dbGet(k){return k==='member_tickets'?t:k==='contracts'?ct:{name:'示範會員'}}async function dbGetAll(){return [ct]}
function showModal(h){document.getElementById('preview').innerHTML=h}function showToast(m){document.getElementById('note').textContent=m}function invFieldsHTML(){return '<div style="padding:12px;background:#fff;border:1px solid #ddd;border-radius:10px;margin-bottom:12px;">發票（驗收示意）：寄信箱／存載具／不開發票</div>'}function inxInvSync(){}function inxVoucherSync(){instCollectSync()}async function inxVoucherInit(){}function confirmInstallNext(){showToast('唯讀預覽：不送出收款、不連線資料庫')}

function invReadFields(){return {mode:'none'}}function invCheckFields(){return null}
