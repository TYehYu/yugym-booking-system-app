/* 2026-08-08 使用者回報／指示三則（都圍繞「看得懂、看得到」）：

   ①「首頁點今日營收名單，跳會員資料視窗的時候畫面會停住，也沒有任何讀取中的提示」
      —— openPersonProfile 一次載 7 張表，冷快取時好幾秒完全沒回饋，看起來像當機。
      cxBusy 只能掛在「已經開著的彈窗」的按鈕列，這裡需要的是「彈窗還沒開」那一段
      → 補一支全域遮罩 uiBusy。

   ②「今日營收名單，教練 tag 要上教練的顏色；新約跟續約要用金色跟綠色區分」
      —— 教練 tag 穿行事曆同一套代表色；新約＝金、續約＝綠（原本新約灰、續約金）。

   ③「會員合約因為使用期限是從啟用日開始計算，所以很難在一開始就寫在合約上讓會員知道，
      會員端在我的票券可以看到該票券的使用期限嗎」
      —— 看得到到期日，但**還沒開通的票原本顯示「永久有效」**（expire_date 是空的，
      而空值在舊票代表永久有效）—— 正好是最需要說清楚的那一種。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 讀取中的提示（點名單 → 開會員資料）');
{
  const F=grabFn('uiBusy');
  ok('★★ 有一支全域遮罩，回傳關閉函式', /let _uiBusyN=0;/.test(src) && /return \(\)=>\{/.test(F));
  ok('★★ 可重入：巢狀呼叫用計數，最後一個關掉才收起來',
     /_uiBusyN\+\+;/.test(F) && /_uiBusyN=Math\.max\(0,_uiBusyN-1\);/.test(F)
     && /if\(!_uiBusyN\)\{ const x=document\.getElementById\('ui-busy'\); if\(x\) x\.style\.display='none'; \}/.test(F));
  ok('★ 關閉函式重複呼叫也安全', /let done=false;/.test(F) && /if\(done\) return; done=true;/.test(F));
  ok('★★ openPersonProfile 全程包住（含中途 return 的那條）',
     /const _busy=uiBusy\('讀取資料中…'\);/.test(src)
     && /\}finally\{ _busy\(\); \}/.test(src));
  ok('★ 遮罩會擋住重複點擊（整面覆蓋、有底色）',
     /#ui-busy\{position:fixed;inset:0;z-index:900;display:none;align-items:center;justify-content:center;/.test(src));
  ok('　　用既有的轉圈樣式（不另做一顆）', /<span class="cx-spin"><\/span>/.test(F));
  ok('　　為什麼不是 cxBusy，寫在原地',
     /cxBusy 只能掛在「已經開著的彈窗」的按鈕列；這裡要蓋的是「彈窗還沒開、正在抓資料」/.test(src));
}

console.log('\n② 今日營收名單的顏色');
{
  const F=grabFn('revAttribChip');
  ok('★★ 教練 tag 穿行事曆同一套教練代表色',
     /const _c=nm\?coachTagColor\(r\.att\):null;/.test(F)
     && /const _sty=_c\?` style="background:\$\{_c\.bg\};color:\$\{_c\.fg\};"`:'';/.test(F));
  ok('★ 可點與不可點兩種都上色（櫃檯與教練看到的一致）',
     (F.match(/\$\{_sty\}/g)||[]).length===2);
  ok('★ 未歸屬維持金色提醒（那是要處理的事，不是某位教練）',
     /rev-att-none/.test(F) && /\.rev-att-none\{background:#f7efe0;color:#8a5e28;\}/.test(src));
  ok('　　顏色來源是既有的 coachTagColor（沒有另外配一套）',
     /function coachTagColor\(id\)\{/.test(src));
  // 實跑一次，確認樣式真的組進去
  const chip=new Function('window','isDeskLike','coachTagColor',
    F+'\nreturn revAttribChip;')({_revCoachTag:{'c-1':'BARRY'}},()=>true,
    ()=>({bg:'#C9E4E6',fg:'#2F6068'}));
  const html=chip({attKind:'tk',att:'c-1',attRef:'TK-1'});
  ok('★★ 產出的 HTML 帶著教練色', /background:#C9E4E6;color:#2F6068;/.test(html) && /BARRY/.test(html));
  const none=chip({attKind:'tk',att:null,attRef:'TK-1'});
  ok('　　未歸屬不硬塞顏色（交給 .rev-att-none）', !/style="background:/.test(none) && /未歸屬/.test(none));
}
ok('★★ 新約＝金', /\.rev-kind-new\{background:#f7efe0;color:#8a5e28;border-color:#e8d9b8;\}/.test(src));
ok('★★ 續約＝綠', /\.rev-kind-renewal\{background:#eef5f1;color:#1f6f54;border-color:#cfe3d8;\}/.test(src));
ok('　　分期維持淡紫（與前兩者分得開）', /\.rev-kind-installment\{background:#efe7f3;color:#6e3a86;/.test(src));
ok('　　使用者的原話寫在程式裡', /「新約跟續約要用金色跟綠色區分」/.test(src));

console.log('\n③ 會員端看得到使用期限');
{
  const F=grabFn('fmtExpire');
  const fmt=new Function(F+'\nreturn fmtExpire;')();
  eq('★ 已開通 → 顯示到期日', fmt('2026-09-11',{valid_days:28,activated_at:'x'}), '2026-09-11');
  eq('★★ 還沒開通 → 「未開通（首堂課後 N 天）」，不是「永久有效」',
     fmt(null,{valid_days:28}), '未開通（首堂課後 28 天）');
  eq('★ 真正的永久有效票（沒有 valid_days）→ 永久有效', fmt(null,{}), '永久有效');
  ok('★★ 會員票券卡改用 fmtExpire（原本 expire_date 為空就寫死「永久有效」）',
     /\$\{t\.expire_date\?`\$\{dim\?'':'到期'\} \$\{t\.expire_date\}`:fmtExpire\(null,t\)\}/.test(src));
  ok('★★ 未開通的票多一行說明「什麼時候開始算」',
     /\$\{\(!t\.expire_date && t\.valid_days && !t\.activated_at\)\?`<div class="mck-notyet">使用期限自<b>第一堂課<\/b>起算 \$\{t\.valid_days\} 天（含當天）；還沒排課就不會開始倒數。<\/div>`:''\}/.test(src));
  ok('★ 展開明細的「到期日」那列也一樣',
     /<div class="mck-d-row"><span class="mck-d-k">到期日<\/span><span class="mck-d-v">\$\{fmtExpire\(t\.expire_date,t\)\}<\/span><\/div>/.test(src));
  ok('★ 已開通的票多列出「開始計算」是哪一天',
     /<span class="mck-d-k">開始計算<\/span>/.test(src));
  ok('★ 使用規則那段也講一次（含當天）',
     /使用期限自<b>第一堂課當天<\/b>起算 \$\{t\.valid_days\} 天（含當天），排了第一堂才開始倒數。/.test(src));
  ok('　　說明用金色（要留意但不是警告；品牌色強度 紅>金>綠）',
     /\.mck-notyet\{margin-top:6px;font-size:11px;line-height:1\.7;color:#8a5e28;background:#f7efe0;/.test(src));
  ok('　　使用者的原話寫在程式裡',
     /「使用期限是從啟用日開始計算，所以很難在一開始就寫在\s*\n\s*合約上讓會員知道，會員端在我的票券可以看到該票券的使用期限嗎」/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
