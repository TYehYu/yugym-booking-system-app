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
const _p1=(async()=>{
  const i=src.indexOf('  if(bk.member_id){');
  const j=src.indexOf('\n  }\n', src.indexOf('const selfOK', i))+4;
  const seg=src.slice(i,j);
  /* 2026-08-13：段內用 await dbGet 取本人姓名（具名使用人＝別人才放行）→ 沙箱改 async */
  const AsyncFn=Object.getPrototypeOf(async function(){}).constructor;
  const run=(bk,dup)=>new AsyncFn('bk','sameDay','ns','ne','timeToMin','overlaps','bkIsSelf','dbGet',
      seg+'\nreturn null;')(bk,[dup],660,720,
    t=>{const[h,m]=String(t||'0:0').split(':').map(Number);return h*60+(m||0);},
    (a,b,c,d)=>a<d&&c<b,
    x=>!!(x&&x.category==='自主訓練'),
    async()=>({name:'本人'}));
  const PT={member_id:'M',category:'私人教練',start_time:'11:00',duration:60};
  const GRP={member_id:'M',category:'小班肌力',start_time:'11:00',duration:60};
  const SELF=n=>({member_id:'M',category:'自主訓練',start_time:'11:00',duration:60,trial_name:n||null});

  eq('★ 使用者的例子：媽媽 11:00 教練課、爸爸（具名使用人）約同時段自主 → 放行',
     await run(SELF('爸爸'),PT), null);
  eq('★ 本人（沒指定使用人）約自主撞自己的教練課 → 仍擋（防分身的原意）',
     await run(SELF(null),PT), '會員於該時段已有預約');
  eq('★ 反向也通：先有爸爸的自主，櫃檯再幫本人排教練課 → 放行',
     await run(PT,SELF('爸爸')), null);
  eq('　　教練課撞本人的自主 → 仍擋', await run(PT,SELF(null)), '會員於該時段已有預約');
  eq('　　自主 vs 自主照舊放行（多名額）', await run(SELF(null),SELF(null)), null);
  eq('　　團課撞家人的自主 → 放行（規則不分課種，看的是那格自主是誰在用）',
     await run(GRP,SELF('爸爸')), null);
  eq('　　trial_name 是空白字串不算具名', await run(SELF('  '),PT), '會員於該時段已有預約');
  /* 2026-08-13 吳宸維案例（使用者說明：自主是自己用、教練課給阿姨上）——
     具名使用人不再限自主訓練：教練課具名給家人也放行；具名寫本人名字仍擋。 */
  eq('★ 教練課具名「阿姨」撞本人的自主 → 放行（2026-08-13 起）',
     await run(Object.assign({},PT,{trial_name:'阿姨'}),SELF(null)), null);
  eq('★ 教練課使用人寫本人名字 → 仍擋（不是別人代用）',
     await run(Object.assign({},PT,{trial_name:'本人'}),SELF(null)), '會員於該時段已有預約');
})();

console.log('\n② 手機端流程：使用人要在驗證前掛上');
ok('★ famUser 先算、掛在 vbk.trial_name，再跑 validateBooking',
   /const famUser=\(s\.pickFam>0&&Array\.isArray\(s\.famOpts\)\)\?s\.famOpts\[s\.pickFam\]:\(\(tk&&tk\.family_user\)\|\|null\);[\s\S]{0,300}trial_name:famUser\|\|null\};\n\s*const verr=await validateBooking/.test(src));   // 2026-08-04 票券預設使用人
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

console.log('\n④ 手機端撞到重疊時要指路，不是死路');
/* 2026-08-03 使用者問：「家庭共享從會員手機端預約自主訓練是不是會很麻煩」——
   流程本身只多一步（確認頁點一下使用人）；真正麻煩的是忘了選、或還沒建名單時，
   只會得到一句「該時段已有預約」，看不出下一步。 */
{
  const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};
  const mk=st=>new Function('window', grabFn('_msbDupHint')+'\nreturn _msbDupHint;')({_msb:st});
  const MSG='會員於該時段已有預約';
  ok('★ 有名單但忘了選使用人 → 提示去選',
     /請在「使用人」選擇家人後再送出/.test(mk({famOpts:['自己','爸爸'],pickFam:0,family:['爸爸']})(MSG)));
  ok('★ 還沒建家庭名單 → 指到「☰ → 家庭成員」',
     /先到「☰ → 家庭成員」建立名單/.test(mk({family:[]})(MSG)));
  ok('★ 已經選了家人卻仍被擋（真的撞位）→ 原訊息照出，不誤導',
     mk({famOpts:['自己','爸爸'],pickFam:1,family:['爸爸']})(MSG)===MSG);
  ok('★ 其他錯誤訊息原樣通過', mk({family:[]})('點數不足')==='點數不足');
  ok('　　前端驗證與 RPC 失敗兩條路都套', /showToast\(_msbDupHint\(verr\)\)/.test(src)
     && /showToast\(_msbDupHint\(r\.reason\)\)/.test(src));
  ok('　　為什麼補提示，寫在程式裡', /只會得到一句「該時段已有預約」的死路，看不出下一步。/.test(src));
}

_p1.then(()=>{ console.log(`\n${pass} 通過 / ${fail} 失敗`); process.exit(fail?1:0); });
