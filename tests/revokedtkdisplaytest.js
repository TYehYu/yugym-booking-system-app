/* 取消簽到回收的贈點券（source_type='checkin_revoked'）——只改顯示的規則（2026-11-23）

   fn_undo_checkin 把「這堂簽到發的贈點券」作廢：status='expired'、source_type='checkin_revoked'，帳本整份保留。
   那不是「期限到了」：
     ・標「已回收」，不可顯示「已過期」；註明「取消簽到，贈點已回收」
     ・不提供校正／展延／重新啟用
     ・不列入一般（可用）票券清單與可用張數；歷史／全部狀態查詢保留
     ・正常過期的票維持原樣 */
globalThis.bkIsGroup=b=>!!(b&&b.category==='小班肌力');
globalThis.bkEatenCancel=b=>!!(b&&b.status==='cancelled'&&b.refund_waived);
globalThis.inferAllowed=()=>true;
globalThis.mids=b=>(b&&Array.isArray(b.member_ids))?b.member_ids:[];
const fs=require('fs');
require('./_bkenv.js');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)throw new Error('切不到 '+n);let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const TODAY=new Date(2026,10,23);
const ymd=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
const attObj=b=>{const v=b&&b.attendance;return (v&&typeof v==='object'&&!Array.isArray(v))?v:{};};
const buildWallet=new Function('ymd','TODAY','parseYmd','attObj',
  [grabFn('mids'),grabFn('bkHasMember'),grabFn('tkSharedIds'),grabFn('tkUsableBy'),grabFn('tkClass5'),
   grabFn('allocBookingsToTickets'),grabFn('grpTicketAlloc'),grabFn('buildWallet')].join('\n')
  +'\nreturn buildWallet;')(ymd,TODAY,parseYmd,attObj);
const ME='MEM-1';
const TYPES={'tt-s':{id:'tt-s',name:'自主訓練',category:'自主訓練'},'tt-g':{id:'tt-g',name:'團體課',category:'小班肌力'}};
const TK=(id,o)=>Object.assign({id,member_id:ME,ticket_type_id:'tt-s',plan_name:'友善自主訓練點數',sessions_total:2,sessions_remaining:2,
  purchase_date:'2026-11-23',expire_date:'2026-12-20',status:'usable',source:'checkin_grant',source_type:'checkin'},o||{});
const W=ts=>buildWallet(ME,{tickets:ts,bookings:[],logs:[],typeMap:TYPES});

console.log('① 票券夾：已回收不是可用、不是已過期，只在歷史');
{
  const REV=TK('REV',{status:'expired',source_type:'checkin_revoked'});       // 效期還沒到、餘額 2/2（最容易被當成可用）
  const ACT=TK('ACT');
  const EXP=TK('EXP',{status:'expired',source:'purchase',source_type:null,expire_date:'2026-10-01',sessions_total:4,sessions_remaining:3,ticket_type_id:'tt-g',plan_name:'團體課'});
  const w=W([REV,ACT,EXP]);
  eq('★ 已回收的狀態是 revoked', w.of('REV').state, 'revoked');
  eq('★ 一般（持有中）清單不含它', w.active().map(s=>s.id), ['ACT']);
  eq('★ 已過期清單不含它（只有真的過期的）', w.expired().map(s=>s.id), ['EXP']);
  ok('★ 歷史查詢仍找得到它', w.history().map(s=>s.id).includes('REV'));
  eq('★ 可用堂數只算有效票（不含已回收）', w.sessionsLeft('self'), 2);
  eq('　　正常過期票維持原狀態', w.of('EXP').state, 'expired');
}

console.log('\n② 狀態章與說明');
{
  const fns=[grabFn('tkIsRevoked'),grabFn('tkRevokedNoteHtml'),grabFn('tkStBadge'),grabFn('tkStBadgeUsed')].join('\n');
  const f=new Function('var TK_REVOKED_NOTE="取消簽到，贈點已回收";\n'+fns+'\nreturn {tkIsRevoked,tkRevokedNoteHtml,tkStBadge,tkStBadgeUsed};')();
  const rev={id:'R',status:'expired',source_type:'checkin_revoked'}, exp={id:'E',status:'expired',source_type:null};
  ok('★ 判斷只看 source_type', f.tkIsRevoked(rev)===true && f.tkIsRevoked(exp)===false && f.tkIsRevoked(null)===false);
  ok('★ 已回收章寫「已回收」，不是「已過期」', /已回收/.test(f.tkStBadgeUsed(rev,0,2)) && !/已過期/.test(f.tkStBadgeUsed(rev,0,2)));
  ok('　　正常過期票維持「已過期」章', /已過期/.test(f.tkStBadgeUsed(exp,0,2)));
  ok('★ 說明文字：取消簽到，贈點已回收', /取消簽到，贈點已回收/.test(f.tkRevokedNoteHtml(rev)) && f.tkRevokedNoteHtml(exp)==='');
}

console.log('\n③ 不提供校正／展延／重新啟用');
{
  ok('★ tkExtWhyNot 第一道就擋（不提供展延）', /function tkExtWhyNot\(t, today, usedN\)\{\s*\n\s*if\(!t\) return '找不到票券';\s*\n\s*if\(String\(t\.source_type\|\|''\)==='checkin_revoked'\) return/.test(src));
  ok('★ 展延（一般）入口守門', /async function openTicketExtend\(id\)\{[^]*?if\(tkIsRevoked\(t\)\)\{ showToast\([^)]*不提供展延/.test(src));
  ok('★ 展延（主管自訂天數）入口守門', /async function openTicketExtendMgr\(id\)\{[^]*?if\(tkIsRevoked\(t\)\)\{ showToast\([^)]*不提供展延/.test(src));
  ok('★ 重新啟用入口守門', /async function openReactivateTicket\(tid\)\{[^]*?if\(tkIsRevoked\(t\)\)\{ showToast\([^)]*不能重新啟用/.test(src));
  ok('★ 校正入口守門', /async function tkTidyOpen\(tkId\)\{[^]*?tkIsRevoked\(_t0\)[^]*?不提供校正/.test(src));
  ok('★ 會員檔案歷史卡：校正／主管展延按鈕對已回收不出現',
     /role==='admin'&&!tkIsRevoked\(t\)\)\?`<button class="btn btn-ghost btn-sm pp-hist-btn" onclick="event\.stopPropagation\(\);tkTidyOpen/.test(src)
     && /isManagerUp\(\)&&!tkIsRevoked\(t\)&&\(Number\(t\.sessions_remaining\)\|\|0\)>0/.test(src));
}

console.log('\n④ 票券總表：已回收不混進「過期」');
{
  ok('★ 狀態篩選：已回收單獨一類', /\(tkIsRevoked\(t\)\?'revoked':t\.status\)!==_tkStatus/.test(src) && /stOpt\('revoked','已回收'\)/.test(src));
  ok('★ 狀態欄寫「已回收」並註明原因', /tkIsRevoked\(t\)\?`<span class="tag tag-warn" title="\$\{TK_REVOKED_NOTE\}">已回收<\/span>/.test(src));
  ok('★ 管理端會員票券頁：排最後、標已回收', /if\(tkIsRevoked\(t\)\) return 4;/.test(src) && /rk===4 \? '<span class="mck-badge">已回收<\/span>'/.test(src));
  ok('★ 會員端：兩種版型的徽章都不寫已到期', (src.match(/tkIsRevoked\(t\)\?'已回收':\(\(t\.status==='expired'/g)||[]).length===2);
  ok('　　會員端文案：贈點已回收', /if\(tkIsRevoked\(t\)\) return \{ tone:'soft', line1:'這張贈點已回收。'/.test(src));
}
console.log(fail?`\n✗ ${pass} 通過 / ${fail} 失敗`:`\n✓ ${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
