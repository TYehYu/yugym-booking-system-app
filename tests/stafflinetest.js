/* 2026-08-04 使用者指示：
   ①「line 有辦法自動通知會員繳費提醒給教練嗎？教練沒有從 line 登入的話可以怎麼做」
     →「教練綁定 line 通知，製作一個 QRCode 在管理員員工資料[綁定 line]，
        點開讓員工用 line 的掃描後點授權嗎？」（確認即為此流程）
   ②「待分期跟待簽約改成兩個明顯的按鈕一左一右；如果該會員本身有分期的票券
      才顯示待分期，不然待分期的按鈕應該要淡化且不能按」

   本檔驗前端三段：員工資料的綁定入口、QR / 一次性 token、掃描回來的綁定頁與路由，
   以及步驟 2 兩顆並排按鈕的顯示與停用規則。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

console.log('① 員工資料 → 綁定 LINE 入口');
{
  ok('★ 員工表頭有 LINE 欄（empLine 併進 meta）', /empChips \+ empLine;/.test(src));
  const seg=src.slice(src.indexOf('const empLine = !isM'), src.indexOf('const ecItem = isM'));
  ok('★ 未綁定 → 點擊開 ppStaffLineBind', /ppStaffLineBind\('\$\{r\.id\}'\)/.test(seg));
  ok('★ 已綁定 → 顯示「已綁定」且可解除', /已綁定/.test(seg) && /ppStaffLineUnbind/.test(seg));
  ok('★ 權限：櫃檯以上或本人（對齊 employees 的 update policy）',
     /isDeskLike\(\) \|\| \(SESSION && SESSION\.id===r\.id\)/.test(seg));
  ok('　　沒權限的人只看到「未綁定」不可點', /canBind\?'＋ 綁定 LINE':'未綁定'/.test(seg));
}

console.log('\n② 產 QR：一次性 token 寫進 employees.line_bind_token');
{
  const f=grabFn('ppStaffLineBind');
  ok('★ 產隨機 token 存 line_bind_token', /c\.line_bind_token=token;/.test(f) && /dbPut\('coaches',c\)/.test(f));
  ok('★ token 只留英數（進得了 hash 與 QR）', /replace\(\/\[\^a-zA-Z0-9\]\/g,''\)/.test(f));
  ok('★ QR 內容＝#staff-line-bind=TOKEN', /staffLineBindLink\(token\)/.test(f)
     && /#staff-line-bind='\+token/.test(grabFn('staffLineBindLink')));
  ok('★ 用 qrcodejs 畫（與會員申辦 QR 同一套樣式）', /new QRCode\(box,\{text:link,width:200,height:200/.test(f));
  ok('　　離線／產生失敗有退路（顯示連結）', /QR 產生失敗/.test(f) && /離線無法產生 QR/.test(f));
  ok('　　解除綁定會清掉 line_user_id 與殘留 token',
     /c\.line_user_id=null; c\.line_bind_token=null;/.test(grabFn('ppStaffLineUnbind')));
}

console.log('\n③ 員工掃描後：授權 → 寫入 → 結果頁');
{
  const f=grabFn('runStaffLineBind');
  ok('★ 呼叫 line-member-auth 的 staff_bind', /action:'staff_bind',bind_token:token/.test(f));
  ok('★ 未登入 LINE 先 liff.login（回來續跑）', /liff\.login\(\{redirectUri/.test(f));
  ok('★ liff.login 會洗掉 hash → token 存 sessionStorage 續跑',
     /sessionStorage\.setItem\('_staffBindToken',token\)/.test(f)
     && /_staffBindToken/.test(src.slice(src.indexOf('function bootYugym'), src.indexOf('function bootYugym')+2600)));
  ok('★ 成功：清 token、清 hash、顯示完成頁', /removeItem\('_staffBindToken'\)/.test(f)
     && /history\.replaceState\(null,'',location\.pathname\)/.test(f) && /showStaffBindPage\('done'/.test(f));
  ok('★ token 失效有明講可重新產生 QR', /BIND_TOKEN_INVALID/.test(f) && /重新產生 QR/.test(f));
  /* 2026-08-04 實測 BIND_FAILED：畫面只印錯誤碼，得翻 Postgres log 才知道是
     service_role 少了 employees 的 UPDATE 授權（已補 migration）。錯誤要帶 detail。 */
  ok('★ 其他錯誤帶出後端 detail（不用翻 log）', /\(d\.detail\?'（'\+d\.detail\+'）':''\)/.test(f));
  ok('★ 失敗也清待辦（重掃可重來）', /catch\(e\)\{[\s\S]*?removeItem\('_staffBindToken'\)[\s\S]*?showStaffBindPage\('err'/.test(f));
  ok('★ boot 與 hashchange 兩條路由都認 #staff-line-bind',
     (src.match(/staff-line-bind=\(\[a-zA-Z0-9\]\+\)/g)||[]).length>=2);
  ok('　　綁定頁不需登入（在 login/app 之外自成一頁）',
     /login-screen'\)\?\.classList\.add\('hidden'\)/.test(grabFn('showStaffBindPage')));
}

console.log('\n④ 步驟 2：待分期／待簽約兩顆並排');
{
  const seg=src.slice(src.indexOf('window._bkInstMax=_instMax;'), src.indexOf('/* 待分期繳費保留（2026-08-04）'));
  ok('★ 兩顆同一列（flex 各佔一半）', /display:flex;gap:10px;/.test(seg)
     && (seg.match(/style="flex:1;padding:13px 8px;/g)||[]).length===2);
  const row=seg.slice(seg.indexOf('display:flex;gap:10px;'));
  ok('★ 左＝待分期、右＝待簽約', row.indexOf('待分期繳費保留')<row.indexOf('待簽約卡位'));
  ok('★ 沒有分期票 → 淡化且不能按', /\$\{_instOk\?'':'opacity:\.4;filter:grayscale\(\.5\);cursor:not-allowed;'\}/.test(seg)
     && /\$\{_instOk\?'onclick="bkInstHold\(\)"':'disabled'\}/.test(seg));
  ok('★ 有分期票才綁 onclick（_instOk 由分期票判定）',
     /x\.installment && typeof x\.installment==='object'/.test(src) && /_instOk=true/.test(src));
  ok('★ 停用時說明為什麼', /這位會員沒有分期中的票券，故不可選/.test(seg));
  ok('　　連續預約只跟著待分期出現（上限＝未開通堂數）',
     /_instOk\?`\$\{\/\*[\s\S]*?recurBoxHtml\('bk', _instMax\|\|12\)/.test(seg));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
