/* 2026-08-04 使用者指示：「如果是連續預約的課卡包含簽約或分期，取消也要有連續取消的功能」

   舊 seriesOf 第一行就是 if(!b || !b.member_id) return [] —— 待簽約卡位沒有 member_id
   （客戶名記在 trial_name），所以整串連續建立的卡位永遠問不出「後面的要不要一起取消」，
   只能一堂一堂點掉。分期的待繳費保留有 member_id、本來就抓得到，這裡一併固定住，
   並確認清單會標出是待簽約／分期保留／已扣課（三種取消後果不同）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};
const parseYmd=x=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null;};

/* 週四 18:00 的一串：4 堂已扣課（正式）＋ 8 堂分期保留（同一位會員），
   另外一組是同時段但別人的卡位，以及同名客戶的待簽約卡位（沒有 member_id）。 */
const BK=[];
const mk=(id,date,o)=>Object.assign({id,date,start_time:'18:00',status:'booked',category:'私人教練',
  coach_id:'K',member_id:null,trial_name:null,ticket_id:null,pending_contract:false},o);
['2026-08-06','2026-08-13','2026-08-20'].forEach((d,i)=>BK.push(mk('real'+i,d,{member_id:'M1',ticket_id:'TK1'})));
['2026-08-27','2026-09-03','2026-09-10'].forEach((d,i)=>BK.push(mk('hold'+i,d,{member_id:'M1',pending_contract:true})));
// 待簽約卡位（沒有會員，只有客戶名）：同一人三堂連續
['2026-08-07','2026-08-14','2026-08-21'].forEach((d,i)=>BK.push(mk('pend'+i,d,{trial_name:'程凱郁',pending_contract:true,start_time:'09:00'})));
BK.forEach(b=>{ if(/^pend/.test(b.id)) b.start_time='09:00'; });
// 干擾項：同時段但別的客戶、已取消的、別的教練
BK.push(mk('other',  '2026-08-14',{trial_name:'林政緯',pending_contract:true,start_time:'09:00'}));
BK.push(mk('cxled',  '2026-08-28',{trial_name:'程凱郁',pending_contract:true,start_time:'09:00',status:'cancelled'}));
BK.push(mk('coachB', '2026-08-28',{trial_name:'程凱郁',pending_contract:true,start_time:'09:00',coach_id:'Z'}));

const deps={ dbGetAll:async()=>BK.slice(), ymd:()=>'2026-08-04', TODAY:new Date(2026,7,4), parseYmd };
// grabFn 抓的是 function 起頭，原始碼是 async function → 這裡補回 async
const seriesOf=new Function(...Object.keys(deps),'return async '+grabFn('seriesOf'))(...Object.values(deps));

(async()=>{
console.log('① 待簽約卡位（沒有 member_id）也要成串');
{
  const r=await seriesOf(BK.find(b=>b.id==='pend0'));
  eq('★ 用 trial_name 認人，抓到同一串三堂', r.map(x=>x.id), ['pend0','pend1','pend2']);
  ok('　　別的客戶不會被掃進來', !r.some(x=>x.id==='other'));
  ok('　　已取消的不算', !r.some(x=>x.id==='cxled'));
  ok('　　別的教練不算（同名同時段也不併）', !r.some(x=>x.id==='coachB'));
  const noName=await seriesOf(Object.assign({},BK[0],{member_id:null,trial_name:'',id:'x'}));
  eq('★ 認不出是誰就不猜（沒會員也沒客戶名 → 單堂取消）', noName, []);
}

console.log('\n② 分期的待繳費保留（有 member_id）照樣成串');
{
  const r=await seriesOf(BK.find(b=>b.id==='real0'));
  eq('★ 正式預約＋後面的分期保留一起列出', r.map(x=>x.id), ['real0','real1','real2','hold0','hold1','hold2']);
  const r2=await seriesOf(BK.find(b=>b.id==='hold0'));
  ok('★ 從保留課取消也抓得到同一串', r2.length===6);
  ok('　　沒有會員的卡位不會混進有會員的那一串', !r.some(x=>/^pend/.test(x.id)));
}

console.log('\n③ 追問視窗要講清楚取消掉的是什麼');
{
  const f=grabFn('__askSeriesCancel');
  ok('★ 三種標示分開：待簽約卡位／分期保留／已扣 1 堂',
     /x\.member_id\?'分期保留':'待簽約卡位'/.test(f) && /x\.ticket_id\?'已扣 1 堂':'未綁票券'/.test(f));
  ok('★ 整串都沒票券時不講「扣課不退／退回票券」',
     /const _noTk=\[b\]\.concat\(later\)\.every\(x=>!x\.ticket_id\);/.test(f)
     && /取消只會釋出時段與場地，不會動到任何堂數/.test(f));
  ok('★ 沒有會員的那串要顯示客戶名（不然分不出是誰的卡位）',
     /const whoLine=b\.member_id\?'':\(b\.trial_name\?`客戶：<b>\$\{b\.trial_name\}<\/b>/.test(f));
  ok('　　仍是「只取消這堂／連同後面 N 堂」兩顆（不另做按鈕）',
     /只取消這堂/.test(f) && /連同後面 \$\{later\.length\} 堂/.test(f));
  ok('　　待簽約卡位的取消確認也走 askSeriesCancel',
     /<button class="btn btn-danger" onclick="askSeriesCancel\('\$\{id\}','none'\)">確定取消<\/button>/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
})();
