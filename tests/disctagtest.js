/* 票券卡的折抵標籤（2026-09-06 使用者回報：鄭超元 #23 運動按摩用了 4 張折抵券，
   卡片只寫「$300」——「這張看起來像只花了 300」）。
   折抵券的張數與金額只寫在 purchases.note，儲值金走 credit_used 欄位。
   ⚠ 不能用 list_price − deal_amount 回推：分期的 deal_amount 只有第 1 期。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} };

/* 從 index.html 抽真正的 tkMoneyHtml 來跑 */
const i0=src.indexOf('function tkMoneyHtml(');
const fnSrc=src.slice(i0, src.indexOf('\n}\n', i0)+2);
const mk=(payMap)=>{
  const win={_tkPayMap:payMap};
  return (new Function('window','isDeskLike', fnSrc+'\nreturn tkMoneyHtml;'))(win, ()=>true);
};

/* 正式庫 PUR-mtnz70a6a8el（鄭超元 9/05 運動按摩）的真實資料 */
const REAL_NOTE='（折抵券×4 −$1,200）';
const parse=(note)=>{ const m=/折抵券×(\d+)\s*−\$([\d,]+)/.exec(String(note||''));
  return m?{vn:Number(m[1]), va:Number(m[2].replace(/,/g,''))}:{vn:0,va:0}; };

console.log('① note 解析（格式由發放那支自己寫，這裡釘住它）');
const r=parse(REAL_NOTE);
ok('★★ 抓得到張數（鄭超元＝4 張）', r.vn===4);
ok('★★ 抓得到折抵金額（$1,200，逗號要吃掉）', r.va===1200);
ok('★  儲值金那句不會被誤認成折抵券', parse('（儲值金折抵 −$1,200）').vn===0);
ok('★  沒有折抵的備註回 0', parse('').vn===0 && parse('（分期第1期／總額 $12,000）').vn===0);

console.log('\n② 卡片畫出來的樣子');
const t={id:'TK-mtnz6zdoo22d', amount_paid:300, plan_name:'運動按摩'};
const html=mk({'TK-mtnz6zdoo22d':{m:'transfer', sp:null, vn:4, va:1200, cu:0, lp:1500}})(t);
ok('★★ 實收金額還在（$300）', html.includes('$300'));
ok('★★ 折抵券張數與金額都寫出來了', html.includes('折抵券×4') && html.includes('−$1,200'));
ok('★★ 原價放在 title（$1,500）', html.includes('title="原價 $1,500"'));
ok('★  付款方式標籤沒有被擠掉（匯款）', html.includes('匯款'));
ok('★  折抵用中性色 class，不是現金綠那顆', html.includes('class="tk-disc"'));

const html2=mk({'TK-x':{m:'cash', sp:null, vn:0, va:0, cu:2000, lp:5000}})({id:'TK-x', amount_paid:3000});
ok('★★ 儲值金折抵也標得出來', html2.includes('儲值金 −$2,000'));
ok('★  沒有折抵券時不會多畫一顆空標籤', !html2.includes('折抵券'));

const html3=mk({'TK-y':{m:'cash', sp:null, vn:0, va:0, cu:0, lp:1300}})({id:'TK-y', amount_paid:1300});
ok('★★ 沒有任何折抵＝維持原樣（不多一顆標籤）', !html3.includes('tk-disc'));

const html4=mk({})({id:'TK-z', amount_paid:1300});
ok('　  查不到收款紀錄不會炸（舊匯入票）', typeof html4==='string' && html4.includes('$1,300'));

console.log('\n③ 分期不能被誤標成折抵');
ok('★★ 沒有用 list_price − deal_amount 回推（那會把分期的未收期數算成折抵）',
   !/lp\s*-\s*(amt|_da)/.test(fnSrc));
const html5=mk({'TK-i':{m:'transfer', sp:null, vn:0, va:0, cu:0, lp:12000}})({id:'TK-i', amount_paid:4000});
ok('★★ 分期第 1 期（原價 12,000 收 4,000）不會冒出「折抵 −$8,000」', !html5.includes('tk-disc'));

console.log(`\n${pass} 過 / ${fail} 敗`);
process.exit(fail?1:0);
