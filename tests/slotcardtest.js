/* 2026-08-20 使用者想法：「預約行事曆的時候可以先開課卡 只顯示標題卡 下面有個新增＋
   有三種情境 1 有票券的會員直接預約 2 待簽約的會員卡位 3 沒有安排會員但是先卡位」

   第一步（本檔涵蓋）只做管理員手機端；桌機的步驟 2 一個字都沒動。
   情境 3 的「空堂」不新增欄位，用既有形狀表示：
     pending_contract=true ＋ 沒有 member_id ＋ 沒有 trial_name
   正式庫查過這個組合原本 0 筆。這樣一來程式裡針對 pending_contract 的
   排除（教練堂數／銷課金額／營收／扣課）全部自動涵蓋空堂。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

/* 檢查「某段舊文案已經不見了」時要先把註解拿掉 —— 否則「在註解裡解釋為什麼拿掉」
   會讓斷言自己失敗，等於逼人把變更理由從程式裡刪掉。 */
const srcNC=src.replace(/\/\*[\s\S]*?\*\//g,'');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

/* 從 index.html 抽出真正的原始碼來跑（不是複製一份副本） */
const grabFn=n=>{
  let i=src.indexOf('function '+n+'(');
  if(i<0) throw new Error('找不到 '+n);
  if(src.slice(i-6,i)==='async ') i-=6;
  let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){
    if(src[k]==='{')d++; else if(src[k]==='}'){ d--; if(!d) return src.slice(i,k+1); }
  }
  throw new Error('抽不完整 '+n);
};
const lib=new Function([grabFn('bkIsOpenHold'),grabFn('bkIsInstHold'),grabFn('bkTag'),grabFn('bkName'),grabFn('bkNameFull')].join('\n')
  +';return {bkIsOpenHold,bkTag,bkName,bkNameFull};')();

console.log('空堂的判定（形狀而非新欄位）');
{
  const open  ={pending_contract:true, member_id:null, trial_name:null,   category:'私人教練'};
  const open2 ={pending_contract:true, member_id:null, trial_name:'   ',  category:'私人教練'};   // 只有空白也算空堂
  const named ={pending_contract:true, member_id:null, trial_name:'王小明',category:'私人教練'};
  const bound ={pending_contract:true, member_id:'M1', trial_name:null,   category:'私人教練'};
  const normal={member_id:'M1', category:'私人教練'};
  const trial ={member_id:null, trial_name:'路人甲', category:'體驗'};
  eq('★ 待簽約＋無會員＋無姓名 → 空堂', lib.bkIsOpenHold(open), true);
  eq('★ 姓名只有空白也算空堂（trim 後為空）', lib.bkIsOpenHold(open2), true);
  eq('★ 有姓名的待簽約卡位 → 不是空堂', lib.bkIsOpenHold(named), false);
  eq('★ 已綁會員的待簽約 → 不是空堂', lib.bkIsOpenHold(bound), false);
  eq('　　一般預約 → 不是空堂', lib.bkIsOpenHold(normal), false);
  eq('　　體驗課（沒 pending_contract）→ 不是空堂', lib.bkIsOpenHold(trial), false);
  eq('　　null 不會爆', lib.bkIsOpenHold(null), false);

  console.log('\n課卡上分得出來（櫃檯不能把「沒排人」看成「沒收錢」）');
  eq('★ 空堂的標籤是「待安排」，不是「待簽約」', lib.bkTag(open), '待安排');
  eq('★ 有姓名的卡位仍是「待簽約」', lib.bkTag(named), '待簽約');
  eq('★ 空堂的主行寫「尚未安排」（原本會顯示成「客戶」）', lib.bkName(open, ()=>''), '尚未安排');
  eq('　　有姓名的卡位照樣顯示姓名', lib.bkName(named, ()=>''), '王小明');
  eq('　　完整字串帶標籤', lib.bkNameFull(open, ()=>''), '尚未安排（待安排）');
}

console.log('\n「安排這一堂」課卡（管理員手機端）');
ok('★ 只在管理員手機端接手，桌機走原本的步驟 2',
   /function _ashSlotMode\(\)\{ return SESSION\.role==='admin' && isMobileLayout\(\); \}/.test(src)
   && /if\(_ashSlotMode\(\) && !preMid\)\{\s*\n\s*return ashSlotSheet\(withTicket\);/.test(src));
ok('★ 標題卡沿用既有的 bkSummaryCard（不另做一張）',
   /showModal\(`<div class="ash-sheetmk"><\/div><div class="modal-title">安排這一堂<\/div>\s*\n\s*\$\{bkSummaryCard\(t,date,time,cn\)\}/.test(src));
ok('★ 三條路都在：選會員／待簽約／先卡位',
   /<select id="ash-slot-mem" onchange="ashSlotPickMember\(this\.value\)">/.test(src)
   && /ashSlotPending\(\)`,'待簽約卡位'/.test(src)
   && /ashSlotHoldOpen\(\)`,'先卡位，之後再安排會員'/.test(src));
ok('★ 樣式沿用 調整課程 那張卡（ash-eirow／ash-eilb／ash-eisub）',
   /const row=\(onclick,label,sub,cls\)=>`<button class="ash-eirow\$\{cls\?' '\+cls:''\}"/.test(src));
ok('★ 沒有任何會員有票時講清楚，不是給一個空下拉',
   /目前沒有任何會員持有這個課程的可用票券——請改用「待簽約」或先把時段空著。/.test(src));
ok('★ 挑人走統一挑選視窗（0801 定案：行內浮動下拉退場）',
   /<div class="mem-pick-row">[\s\S]{0,400}?id="ash-slot-mem"/.test(src));

console.log('\n情境 1：選了人就回到原本那一頁（不重寫一份票券邏輯）');
ok('★ 步驟 2 的私教段抽成 bkStep2PT，可以自己重畫',
   /^async function bkStep2PT\(preMid\)\{/m.test(src)
   && /const \{type_id,t,coach_id,date,time\}=_bkWizard;/.test(src)
   && /  return bkStep2PT\(preMid\);\n\}/.test(src));
ok('★ 挑完人直接重畫同一頁（票券／使用人／連續預約全是既有邏輯）',
   /_bkWizard\.member_id=mid; _bkWizard\.viaSlot=true;\s*\n\s*await bkStep2PT\(mid\);/.test(src));
ok('★ 從課卡進來的，上一步回課卡而不是回步驟 1 重填',
   /onclick="\$\{_bkWizard\.viaSlot\?'ashSlotBack\(\)':'openBookingModalBack\(\)'\}"/.test(src)
   && /async function ashSlotBack\(\)\{ _bkWizard\.member_id=''; await bkStep2PT\(''\); \}/.test(src));

console.log('\n情境 3：空堂只佔時段，不碰票券也不進統計');
ok('★ 建立時沒有票、沒有人、沒有姓名，且掛 pending_contract',
   /const bk=\{id:uid\('BK'\),member_id:null,trial_name:null,trial_phone:null,/.test(src)
   && /pending_contract:true, venue_unit:vbk\.venue_unit\|\|null,/.test(src));
ok('★ 照樣跑衝堂／場地檢查（validateBooking）',
   /const verr=await validateBooking\(vbk,date,time,60\);\s*\n\s*if\(verr\)\{ showToast\(verr\); return; \}/.test(src));
ok('★ 防連點（沿用 onceAct，不另寫一套）',
   /async function ashSlotHoldOpen\(\)\{ return onceAct\('ashslotopen', _ashSlotHoldOpen\); \}/.test(src));
ok('　　為什麼用既有形狀而不加欄位，寫在程式裡',
   /48 處針對 pending_contract 的排除/.test(src)
   && /正式庫查過這個組合原本是 0 筆/.test(src));

console.log('\n把人補上去：綁定待簽約回到簡易課卡');
ok('★ 沒綁會員的卡位給「安排會員／綁定會員」，不是「轉正」',
   /if\(staff && !closed && b\.status==='booked' && !b\.member_id\)\s*\n\s*btns \+= evoBtn\('evo-r2','evo-gold',`collapseBkCard\(\);openBindPending\('\$\{id\}'\)`,'plus',bkIsOpenHold\(b\)\?'安排會員':'綁定會員'\);/.test(src));
ok('★ 已綁會員的才給轉正（原本的行為不變）',
   /else if\(staff && !closed && b\.status==='booked'\) btns \+= evoBtn\('evo-r2','evo-primary',`collapseBkCard\(\);openConvertPending\('\$\{id\}'\)`,'check','轉正'\);/.test(src));
ok('　　openBindPending 本來就吃「待簽約＋沒綁會員」',
   /if\(!b\|\|!b\.pending_contract\|\|b\.member_id\)\{ showToast\('這筆不是未綁定的待簽約卡位'\); return; \}/.test(src));

/* 2026-08-20 使用者指示：「幫我把建立預約的步驟調整
   建立預約 設定課程 日期 時間 教練 會員(選填) 是否連續預約(選填)」 */
console.log('\n建立預約的欄位順序（步驟 1）');
{
  const i=src.indexOf('<div class="modal-title">新增預約 · 步驟 1 / 2</div>');
  const j=src.indexOf('onclick="bkStep2()"', i);
  ok('★ 抽得到步驟 1 的表單', i>0 && j>i);
  const form=src.slice(i,j);
  const at=s=>form.indexOf(s);
  const 課程=at('<label>課程類型</label>'), 日期=at('<label>日期</label>'), 時間=at('<label>時間</label>'),
        教練=at('>授課教練<'), 會員=at('<label>會員<'), 連續=at('id="bk-recur-row"');
  ok('★ 六個欄位都在', [課程,日期,時間,教練,會員,連續].every(x=>x>0), {課程,日期,時間,教練,會員,連續});
  ok('★ 順序＝課程 → 日期 → 時間 → 教練 → 會員 → 連續預約',
     課程<日期 && 日期<時間 && 時間<教練 && 教練<會員 && 會員<連續,
     {課程,日期,時間,教練,會員,連續});
  ok('★ 會員標「選填」（原本寫「體驗課／待簽約卡位可不選」）',
     /<label>會員<span style="font-weight:400;color:var\(--t3\);">（選填）<\/span><\/label>/.test(form)
     && !/體驗課／待簽約卡位可不選/.test(srcNC));
  ok('★ 連續預約在步驟 1（不帶上限，票券的上限在步驟 2 才夾）',
     /<div class="form-row" id="bk-recur-row" style="margin-bottom:0;">\$\{recurBoxHtml\('bk'\)\}<\/div>/.test(form));
}

console.log('\n連續預約搬家之後不能無聲失效');
ok('★ 全檔只剩一個 bk 的連續預約控制項（同 id 兩份會讀錯）',
   (src.match(/recurBoxHtml\('bk'/g)||[]).length===1);
ok('★ 步驟 1 的設定在換頁前就收進 _bkWizard.rc',
   /Object\.assign\(_bkWizard,\{type_id,t,coach_id,date,time,member_id:preMid,rc:readRecur\('bk'\)\}\);/.test(src));
ok('★ 送出時一律讀收起來的那份，不再直接讀已被換掉的 DOM',
   /const rc=bkReadRecurBk\(window\._bkInstMax\);/.test(src)
   && /const _rc=bkReadRecurBk\(window\._bkRecurMax\);/.test(src)
   && !/const rc=readRecur\('bk'\);/.test(src)
   && !/const _rc=readRecur\('bk'\);/.test(src));
ok('★ 票券只剩 N 堂時把堂數夾住（不要建立了才一堂堂失敗）',
   /return Object\.assign\(\{\},rc,\{count:Math\.max\(1,Math\.min\(Number\(rc\.count\)\|\|1,m\)\),max:m\}\);/.test(src));
ok('★ 步驟 2 改成唯讀覆述，不再畫第二個開關',
   /\$\{bkRecurRecap\(preSum\)\}/.test(src) && /\$\{bkRecurRecap\(_instMax\|\|0\)\}/.test(src));
ok('★ 團課收起步驟 1 的開關（它的連續預約在步驟 2、prefix grp）',
   /const isGrp = !!t && bkIsGroup\(\{category:t\.category\}\);/.test(src)
   && /rrow\.style\.display = isGrp \? 'none' : '';/.test(src)
   && /if\(sw && sw\.checked\)\{ sw\.checked=false;/.test(src));

console.log('\n回上一步的還原（原本整個壞掉）');
ok('★ 先拷貝暫存再開視窗——openBookingModal 會把 _bkWizard 整個換掉',
   /const W=Object\.assign\(\{\},_bkWizard\|\|\{\}\);\s*\n\s*_prefill=\{date:W\.date,time:W\.time\};\s*\n\s*await openBookingModal\(\);/.test(src));
ok('★ 還原後續讀的是拷貝 W，不是被清空的 _bkWizard',
   /ty\.value=W\.type_id\|\|'';/.test(src) && /co&&W\.coach_id/.test(src) && /mp&&W\.member_id/.test(src)
   && !/ty\.value=_bkWizard\.type_id;/.test(src));
ok('★ 連續預約也還原（不然回上一步等於清空設定）',
   /try\{ bkRestoreRecur\(W\.rc\); \}catch\(_\)\{\}/.test(src)
   && /function bkRestoreRecur\(rc\)\{/.test(src));
ok('　　成因寫在程式裡（2026-08-14 只補了寫回文字框，值早就沒了）',
   /其實一路讀到 undefined/.test(src));

console.log('\nLINE 通知已收回');
ok('★ 空堂不再承諾「開課前 24 小時會提醒教練」（使用者：line通知先不要好了）',
   !/開課前 24 小時會提醒教練/.test(srcNC)
   && /'先卡位，之後再安排會員','時段與場地先留著，名單稍後補'/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
