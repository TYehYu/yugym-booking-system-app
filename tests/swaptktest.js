/* 2026-08-08 使用者定案（為接電子發票鋪路）：
   「發票開出去但課程選錯，這時候不退費、只更改課程票券 —— 會註銷整筆但是不退費，
     所以發票還是存在，然後重新開一筆不開發票的正確票券給客人。
     但如果是金額錯誤必須要整筆修正，就要作廢或開折讓。
     所以差別在於註銷時金額是 0 還是有數字的。」

   判別點是「這次註銷有沒有錢退回去」：
     ・沒退錢（賣錯方案）→ 收款與發票原封不動，只把票券換成正確的 ← openSwapTicket
     ・有退錢（金額錯了）→ 既有的 voidTicketAsk（收款金額歸零）

   在此之前系統只有後者，所以櫃檯遇到「選錯方案但錢沒退」只能作廢再重開 ——
   營收會先消失一筆再憑空出現一筆，而發票是掛在第一筆上的（金額已被歸零）。
   接發票之後那是直接的破口；就算不接，現在的營收紀錄也已經在說謊。

   ⚠ 最容易做錯的一點：錢要跟著新票走。
     今日營收的票券口徑排除 status='refunded' 的票（_dayTk），
     金額若留在註銷的舊票上，當天營收就會平白少一筆。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{let i=src.indexOf('function '+n+'(');if(src.slice(i-6,i)==='async ')i-=6;
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 兩條路分得清楚');
/* 2026-08-30 使用者定案：入口按鈕已移除，改走「作廢 →〔轉儲值金〕→ 重新儲值」。
   「刪除更換方案　把這個功能做到[作廢]裡面…結算後會變儲值金　再另外儲值新的方案使用」
   ⚠ 函式本體刻意留著（舊分頁按下去不會白畫面），所以以下的規則測試照跑。 */
ok('★★★ 更換方案的入口已移除（唯一的換方案路線＝作廢轉儲值金）',
   !/onclick="openSwapTicket\(/.test(src));
ok('★★ 但函式沒被刪 —— 舊分頁還開著的人按下去不能變成白畫面',
   /async function openSwapTicket\(id\)\{/.test(src));
ok('★★ 作廢按鈕改講三選一（不再只有「歸零」一種）',
   /title="結束這張票：可選轉儲值金（營收保留）、全額退款、或扣 20％ 手續費退款" onclick="voidTicketAsk\('\$\{t\.id\}'\)">作廢<\/button>/.test(src));
ok('★ 使用者的原話寫在程式裡',
   /所以差別在於註銷時金額是 0 還是有數字的。」/.test(src));

console.log('\n② 什麼情況不給換');
{
  const F=grabFn('openSwapTicket');
  ok('★ 只有櫃檯／管理員', /if\(!isDeskLike\(\)\)\{ showToast\('僅管理員／櫃台可更換方案'\); return; \}/.test(F));
  ok('★★ 已經在用的票擋下（扣過堂或綁著預約）',
     /if\(used>0\|\|bks\.length\)\{/.test(F)
     && /更換方案只適用「還沒開始用」的票，請先取消那些預約/.test(F));
  ok('★★ 分期票擋下（期數與已開通堂數會對不上）',
     /blocked='分期票券不適用更換方案 —— 分期的期數與已開通堂數會對不上，請走退費後重開'/.test(F));
  ok('★ 贈點／補課券擋下（只有購買的票適用）',
     /else if\(tk\.source!=='purchase'\)\{ blocked='只有購買的票券可以更換方案/.test(F));
  ok('★ 不是使用中的票擋下', /else if\(tk\.status!=='usable'\)\{ blocked='這張票不是使用中的狀態，不能更換'; \}/.test(F));
  ok('★ 方案清單排掉「本來就是這個方案」', /pl\.id!==tk\.source_plan_id/.test(F));
  ok('★★ 視窗先講清楚「不退錢、發票不受影響」，並指路給金額錯的情況',
     /已收的 \$\{amt\?`<b>\$\$\{amt\.toLocaleString\(\)\}<\/b>`:'款項'\}原封不動，<b>發票不受影響<\/b>/.test(F)
     && /如果是<b>金額算錯<\/b>要退錢給客人，請改用「作廢」/.test(F));
}

console.log('\n③ 換的時候錢怎麼走');
{
  const F=grabFn('_doSwapTicket');
  ok('★★ 金額整筆搬到新票（不能留在註銷的舊票上）',
     /const oldAmt=Number\(tk\.amount_paid\)\|\|0;/.test(F)
     && /unit_price:Number\(plan\.unit_price\)\|\|0, amount_paid:oldAmt,/.test(F)
     && /tk\.status='refunded'; tk\.sessions_remaining=0; tk\.amount_paid=0;/.test(F));
  ok('★★ 為什麼不能留在舊票上，寫在原地',
     /今日營收的票券口徑會排除 status='refunded' 的票（見 _dayTk），\s*\n\s*金額留在舊票上，當天營收就會平白少一筆。/.test(src));
  ok('★★ 收款紀錄金額一毛不動，只改指向新票（發票就掛在它上面）',
     /pc\.ticket_id=nt\.id; pc\.plan_id=plan\.id; pc\.plan_name=plan\.name;/.test(F)
     && /【\$\{_note\}｜金額與發票不變】/.test(F)
     && !/pc\.deal_amount=0/.test(F));
  ok('★★ 購買日沿用原本的（不然營收會跳到今天）',
     /purchase_date:tk\.purchase_date, start_date:null, expire_date:null,/.test(F)
     && /購買日不能改成今天，不然營收會跳到今天。/.test(F));
  ok('★ 業績歸屬與約別沿用（同一筆買賣，不是新的一筆續約）',
     /sale_kind:tk\.sale_kind\|\|null, sold_by:tk\.sold_by\|\|null,/.test(F));
  ok('★ 共享設定與指定使用人也跟著走', /shared_with:tk\.shared_with\|\|null, family_user:tk\.family_user\|\|null,/.test(F));
  ok('★★ 新票的效期規則吃新方案（valid_days），且仍是「首堂課才起算」',
     /valid_days:plan\.valid_days\|\|null,/.test(F)
     && /purchase_date:tk\.purchase_date, start_date:null, expire_date:null,/.test(F));
  ok('★ 兩張票的帳本都留痕，寫得出來龍去脈',
     /await logTicket\(nt\.id,'grant',total,null,SESSION\.id,_note\+'（承接原票券的收款，未另行收費）'\);/.test(F)
     && /await logTicket\(id,'adjust',-\(Number\(tk\.sessions_total\)\|\|0\),null,SESSION\.id,_note\+'（本票券註銷，不退費）'\);/.test(F));
  ok('★ 合約掛在舊票上時一併改指向新票',
     /const cs=\(await dbGetAll\('contracts'\)\.catch\(\(\)=>\[\]\)\)\.filter\(c=>c&&c\.ticket_id===id\);/.test(F)
     && /full\.ticket_id=nt\.id; await dbPut\('contracts',full\);/.test(F));
  ok('　　收款紀錄改指向失敗要出聲（不能靜靜留在舊票上）',
     /showToast\('收款紀錄沒有跟著換，請手動確認'\);/.test(F));
  ok('　　防連點', /async function doSwapTicket\(id\)\{ return onceAct\('swaptk:'\+id, \(\)=>_doSwapTicket\(id\)\); \}/.test(src));
  ok('　　寫入後清快取', /dbCacheClear\(\['member_tickets','ticket_logs','purchases','contracts'\]\);/.test(F));
}

console.log('\n④ 作廢那一條沒被動到');
{
  const F=grabFn('_voidTicketDo');   // 2026-08-30 加了 onceAct 護欄，本體搬到底線那一支
  ok('★★ 退款那兩種仍然沖收款（歸零或只留手續費）；轉儲值金那種**不**動收款',
     /pc\.deal_amount=keep;/.test(F) && /【已作廢 原\$\$\{orig\.toLocaleString\(\)\}/.test(F)
     && /if\(mode==='credit'\)\{\s*\n\s*pc\.note=/.test(F));
  ok('★ 仍然限「完全未使用」', /if\(used>0\|\|bks\.length>0\)\{ showToast\(`不可作廢/.test(grabFn('voidTicketAsk')));
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);

/* 2026-08-13 使用者回報：「更換方案沒辦法選 4 堂／自訂，只好作廢重開多出一張票」 */
console.log('\n自訂方案（2026-08-13）');
{
  const fs2=require('fs');
  const src2=fs2.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
  const okx=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };
  okx('★★ 選單多「自訂方案」選項，選了才展開自訂欄位',
     /<option value="__custom__">自訂方案（自填票種／堂數／效期）<\/option>/.test(src2)
     && /id="swap-custom" style="display:none;"/.test(src2));
  okx('★★ 自訂欄位：票種（預設帶原票券的）／堂數／效期',
     /id="swap-c-type"/.test(src2) && /t\.id===tk\.ticket_type_id\?' selected':''/.test(src2)
     && /id="swap-c-sessions"/.test(src2) && /id="swap-c-valid"/.test(src2));
  okx('★★ 送出時 __custom__ 組出方案物件（金額沿用舊票、不動錢）',
     /if\(planId==='__custom__'\)\{/.test(src2)
     && /plan=\{ id:null, name:'自訂方案', ticket_type_id:_ttid, format:null,/.test(src2)
     && /unit_price:Math\.round\(\(Number\(tk\.amount_paid\)\|\|0\)\/_sess\)\|\|0,/.test(src2));
  okx('★ 票種或堂數沒填要擋', /if\(!_ttid\|\|!_sess\)\{ done\(\); showToast\('自訂方案要選票種並填堂數'\); return; \}/.test(src2));
}
console.log((fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗（含自訂方案追加）');
