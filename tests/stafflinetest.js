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

/* 2026-08-24 使用者定案：「待簽約跟分期，應該留到＋新增這邊」＋「還是把視窗二的會員
   移除，安排會員統一都從＋新增這邊」——原本這一節守的是步驟 2 那兩顆並排按鈕，
   整組搬到課卡的［＋新增］了（細節在 addmembertest／instholdtest）。
   這裡改守「搬乾淨了、而且沒有留下第二個入口」。 */
console.log('\n④ 待分期／待簽約已搬到課卡的［＋新增］');
{
  ok('★★ 步驟 2 不再有那兩顆按鈕',
     !/⏳ 待分期繳費保留<\/button>/.test(src) && !/🕒 待簽約卡位<\/button>/.test(src));
/* 2026-08-24 二修：按鈕的字跟著「有沒有選會員」變 ——
   選了人就是「（待簽約）」（整串掛他名下），沒選才是「（空堂）」。 */
  ok('★★ 沒票的那條路改成一顆「先建立這一堂」',
     /onclick="bkOpenHoldCreate\(\)">＋ 先建立這一堂\$\{preMid\?'（待簽約）':'（空堂）'\}<\/button>/.test(src));
  ok('★★ 選了會員就整串掛他名下（不是匿名空堂）',
     /member_id:w\.member_id\|\|null, coach_id:w\.coach_id\|\|null/.test(src)
     && /openHold 不代表「沒有人」/.test(src));
  ok('★★ 兩種保留都在［＋新增］裡，而且只有一種可選時不多問一層',
     /onclick="closeModal\(\);bamHoldDo\('\$\{mid\}','inst'\)"/.test(src)
     && /onclick="closeModal\(\);bamHoldDo\('\$\{mid\}','sign'\)"/.test(src)
     && /if\(!r\.inst\) return bamHoldDo\(mid,'sign'\);/.test(src));
  ok('★ 有分期票才給「待分期」（判定沿用同一段分期票條件）',
     /!tkIsInstall\(x\)/.test(src) && /_instSet\[mid\]=1/.test(src));
  ok('★ 搬家的理由寫在原地', /待簽約跟分期，應該留到＋新增這邊/.test(src));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
