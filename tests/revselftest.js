/* 2026-09-22 使用者回報：「這一筆怎麼沒出現在今日營收」
   —— 曹子安 0922 走自訂銷售買了一張自主訓練票 $200（收款 source='backoffice'），
   票券有、發票開了（FX28688380）、收款紀錄也在，但今日營收看不到那 $200。

   根因：今日營收的票券側（_dayTk）有一條「排除 category==='自主訓練' 的票」，
   而收款側（_dayPur）只認 reactivate／facility_rental／merchandise／installment
   → 兩邊都漏，錢憑空消失。

   那條排除原本是為了擋 0801~0922「場地租借」賣出的自主訓練票（收款另寫
   facility_rental，票券側再算一次就雙算）。但**用課別去猜「是不是已經算過」會誤傷正常售票**。
   改成直接問：這張票今天有沒有那種收款紀錄。

   ⚠ 影響範圍查過：歷來只有 3 張這種票（都是曹子安），前兩張走場租所以有被算到，
     只有 0922 這張掉進縫裡。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

/* 把兩條過濾照抄成可以跑的版本 —— 改了 index.html 要同步改這裡，
   否則這支會變成只驗字串的空殼。 */
const DATE='2026-09-22';
const puLocalDate=p=>p.d;
function dayTk(tickets, purchases){
  const paidInPur=new Set();
  purchases.forEach(p=>{ if(p&&p.ticket_id&&puLocalDate(p)===DATE
    && (p.source==='reactivate'||p.source==='facility_rental'||p.source==='merchandise'))
      paidInPur.add(p.ticket_id); });
  return tickets.filter(t=>t.source==='purchase'&&t.purchase_date===DATE
    &&(t.status!=='refunded'||t.void_mode==='credit')
    &&!paidInPur.has(t.id));
}
function dayPur(purchases, dTk){
  return purchases.filter(p=>puLocalDate(p)===DATE&&(p.source==='reactivate'||p.source==='facility_rental'
    ||p.source==='merchandise'||(p.source==='installment'&&!(p.ticket_id&&dTk.some(t=>t.id===p.ticket_id)))));
}
const total=(tk,pu)=>{ const d=dayTk(tk,pu);
  return d.reduce((s,t)=>s+(Number(t.amount_paid)||0),0)
       + dayPur(pu,d).reduce((s,p)=>s+(Number(p.deal_amount)||0),0); };

console.log('① 使用者回報的那一筆');
{
  const tk=[{id:'TK1',source:'purchase',purchase_date:DATE,amount_paid:200,cat:'自主訓練'}];
  const pu=[{id:'P1',ticket_id:'TK1',d:DATE,source:'backoffice',deal_amount:200}];
  eq('★★★ 自訂銷售賣出的自主訓練票要算進營收（原本是 0）', total(tk,pu), 200);
}

console.log('\n② 不可以因此變成雙算');
{
  const tk=[{id:'TK2',source:'purchase',purchase_date:DATE,amount_paid:200}];
  const pu=[{id:'P2',ticket_id:'TK2',d:DATE,source:'facility_rental',deal_amount:200}];
  eq('★★★ 場租：票券側排掉、收款側算 → 只算一次', total(tk,pu), 200);
  eq('　　 票券側真的被排掉了', dayTk(tk,pu).length, 0);
}
{
  const tk=[{id:'TK3',source:'purchase',purchase_date:DATE,amount_paid:1000}];
  const pu=[{id:'P3',ticket_id:'TK3',d:DATE,source:'reactivate',deal_amount:1000}];
  eq('★★★ 重啟：同樣只算一次', total(tk,pu), 1000);
}
{
  const tk=[{id:'TK4',source:'purchase',purchase_date:DATE,amount_paid:12000}];
  const pu=[{id:'P4',ticket_id:'TK4',d:DATE,source:'backoffice',deal_amount:12000}];
  eq('★★★ 一般售票（教練課）維持只算一次 —— backoffice 不進 _dayPur', total(tk,pu), 12000);
}

console.log('\n③ 原本那條「用課別猜」為什麼不行');
{
  const codeOnly=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^[ \t]*\/\/.*$/gm,'');
  ok('★★★ 不再用 category==='+"'自主訓練'"+' 當排除條件',
     !/category==='自主訓練'\)\)\|\|\(t\.plan_name\|\|''\)\.includes\('自主訓練'\)/.test(codeOnly));
  ok('★★★ 改成問「今天有沒有那種收款紀錄」',
     /const _tkPaidInPur=new Set\(\);/.test(src)
     && /_tkPaidInPur\.add\(p\.ticket_id\);/.test(src)
     && /&&!_tkPaidInPur\.has\(t\.id\)\);/.test(src));
  ok('★★★ 兩邊的來源清單要一致（票券側排掉的，收款側就要算到）',
     (src.match(/p\.source==='reactivate'\|\|p\.source==='facility_rental'\|\|p\.source==='merchandise'/g)||[]).length>=2);
  ok('★★ 成因與影響範圍寫在原地（下次不必重查）',
     /用課別猜「這筆是不是已經在別處算過」會誤傷正常售票/.test(src)
     && /歷來只有 3 張這種票（都是曹子安）/.test(src));
}

console.log('\n④ 既有規則沒被動到');
{
  const tk=[{id:'TK5',source:'purchase',purchase_date:DATE,amount_paid:500,status:'refunded'}];
  eq('★★ 已退費／作廢的仍然不算', total(tk,[]), 0);
  const tk2=[{id:'TK6',source:'purchase',purchase_date:DATE,amount_paid:500,status:'refunded',void_mode:'credit'}];
  eq('★★ 作廢→轉儲值金仍然保留營收（0830 定案）', total(tk2,[]), 500);
  const tk3=[{id:'TK7',source:'checkin_grant',purchase_date:DATE,amount_paid:0}];
  eq('★★ 簽到贈送的點數不是售票，本來就不算', total(tk3,[]), 0);
}

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
