/* 2026-08-03 使用者問（陳蘭馨帳號）：「家庭共享帳號，如果明天 11:00 是媽媽上課，
   但是爸爸想約自主，同一個帳號可以預約同時段嗎」

   原本不行：同會員時段重疊只放行「兩邊都是自主訓練」——那個防呆防的是
   「同一個人分身」。但家庭共享帳號背後不只一個人：自主訓練具名了使用人
   （trial_name＝家庭成員稱呼），就不是本人在用這個時段 → 放行。
   沒指定使用人（＝本人）維持原防呆。DB 端（fn_member_self_book /
   fn_member_self_reschedule）同一條規則，見 20260803_family_user_overlap_ok。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 實跑：validateBooking 的重疊判斷');
{
  const i=src.indexOf('  if(bk.member_id){');
  const j=src.indexOf('\n  }\n', src.indexOf('const selfOK', i))+4;
  const seg=src.slice(i,j);
  const run=(bk,dup)=>new Function('bk','sameDay','ns','ne','timeToMin','overlaps','bkIsSelf',
      seg+'\nreturn null;')(bk,[dup],660,720,
    t=>{const[h,m]=String(t||'0:0').split(':').map(Number);return h*60+(m||0);},
    (a,b,c,d)=>a<d&&c<b,
    x=>!!(x&&x.category==='自主訓練'));
  const PT={member_id:'M',category:'私人教練',start_time:'11:00',duration:60};
  const GRP={member_id:'M',category:'小班肌力',start_time:'11:00',duration:60};
  const SELF=n=>({member_id:'M',category:'自主訓練',start_time:'11:00',duration:60,trial_name:n||null});

  eq('★ 使用者的例子：媽媽 11:00 教練課、爸爸（具名使用人）約同時段自主 → 放行',
     run(SELF('爸爸'),PT), null);
  eq('★ 本人（沒指定使用人）約自主撞自己的教練課 → 仍擋（防分身的原意）',
     run(SELF(null),PT), '會員於該時段已有預約');
  eq('★ 反向也通：先有爸爸的自主，櫃檯再幫本人排教練課 → 放行',
     run(PT,SELF('爸爸')), null);
  eq('　　教練課撞本人的自主 → 仍擋', run(PT,SELF(null)), '會員於該時段已有預約');
  eq('　　自主 vs 自主照舊放行（多名額）', run(SELF(null),SELF(null)), null);
  eq('　　團課撞家人的自主 → 放行（規則不分課種，看的是那格自主是誰在用）',
     run(GRP,SELF('爸爸')), null);
  eq('　　trial_name 是空白字串不算具名', run(SELF('  '),PT), '會員於該時段已有預約');
  eq('　　具名的限自主訓練（體驗課的 trial_name 是別的意思，不套這條）',
     run(Object.assign({},PT,{trial_name:'王體驗'}),PT.member_id?{...PT}:PT)===null?null:'擋',
     '擋');
}

console.log('\n② 手機端流程：使用人要在驗證前掛上');
ok('★ famUser 先算、掛在 vbk.trial_name，再跑 validateBooking',
   /const famUser=\(s\.pickFam>0&&Array\.isArray\(s\.famOpts\)\)\?s\.famOpts\[s\.pickFam\]:null;[\s\S]{0,300}trial_name:famUser\|\|null\};\n\s*const verr=await validateBooking/.test(src));
ok('　　為什麼要先掛，寫在程式裡',
   /晚一步掛上去就會被誤擋。/.test(src));
ok('★ 案例寫在重疊防呆旁邊',
   /媽媽 11:00 上教練課、爸爸想約同時段的\n\s*自主訓練/.test(src));

console.log('\n③ DB 端同一條規則（migration 已套用正式庫）');
{
  const mig=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/docs/migrations/20260803_family_user_overlap_ok.sql','utf8');
  ok('★ fn_member_self_book：p_family_user 有值跳過重疊檢查', /p_family_user 有值 → 跳過「非自主訓練重疊」檢查/.test(mig));
  ok('★ fn_member_self_reschedule：搬的那筆具名也放行', /搬的那筆 trial_name 有值 → 同樣放行/.test(mig));
  ok('★ 舊的 5 參數版本一併移除（同名函式帶預設值會撞名 PGRST203）',
     /移除 fn_member_self_book 的 5 參數舊版/.test(mig));
  ok('　　規則的立意寫清楚（防的是同一個人分身）', /那是防同一個人分身/.test(mig));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
