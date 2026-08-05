/* 合約「購買內容」表（2026-07-31 使用者指示）

   第一列＝購買日期／課程類別，第二列＝購買堂數／購買金額。
   原本第一列擠三欄（日期／類別／堂數）、金額被推到第二列跟每堂費用併排，
   最重要的「買了幾堂、多少錢」反而不在同一列。

   同一支函式服務三個地方：電腦版檢視、紙本列印、簽約當下存進 contracts.fill_snapshot。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

const i=src.indexOf('function contractFillBlockHTML(d){');
const fn=new Function(src.slice(i, src.indexOf('\n}\n',i)+2)+'\nreturn contractFillBlockHTML;')();

/* 只看「購買內容」那張表：抓標題之後、下一個 </table> 之前 */
const buyTable=html=>{
  const k=html.indexOf('購買內容 Personal Training Sessions');
  return html.slice(k, html.indexOf('</table>', k));
};
const rowsOf=t=>t.split('<tr>').slice(1).map(r=>
  (r.match(/>([^<]*?)：/g)||[]).map(x=>x.slice(1,-1)));

const D={ name:'王小明', phone:'0912345678', buyDate:'2026/07/31', planName:'私人教練課 1V1',
  sessions:24, unit:1600, amount:38400, validDays:365, pay:'cash', installN:1, instAmts:[], instSess:[] };

console.log('帶資料版（簽約當下自動帶入）');
{
  const t=buyTable(fn(D));
  const rows=rowsOf(t);
  eq('★ 第一列＝購買日期／課程類別', rows[0], ['購買日期','課程類別']);
  eq('★ 第二列＝購買堂數／購買金額', rows[1], ['購買堂數','購買金額']);
  eq('　　第三列＝每堂費用／付款方式', rows[2], ['每堂費用','付款方式']);
  eq('　　第四列＝課程有效期限（整列）', rows[3], ['課程有效期限']);
  ok('★ 數字有帶進去', /購買日期：<b[^>]*>2026\/07\/31<\/b>/.test(t)
     && /課程類別：<b[^>]*>私人教練課 1V1<\/b>/.test(t)
     && /購買堂數：<b[^>]*>24<\/b> 堂/.test(t)
     && /購買金額：<b[^>]*>\$38,400<\/b>/.test(t));
  ok('★ 改叫「購買堂數／購買金額」（原本是課程堂數／應付總金額）',
     !/課程堂數/.test(t) && !/應付總金額/.test(t));
  ok('★ 兩欄各半，不再是三欄擠一列', /width="50%"/.test(t) && !/colspan="3"/.test(t));
  ok('　　贈送堂數仍然不列入合約標的（2026-07-30 定案）', !/贈送/.test(t));
  ok('　　付款方式的勾選跟著資料走（現金）', /付款方式：☑現金　□匯款/.test(t));
  ok('　　有效期限 365 天 → 勾「12 個月」', /☑啟用日起 12 個月/.test(t));
}

console.log('\n空白手寫版（沒帶資料時）');
{
  const t=buyTable(fn(null));
  const rows=rowsOf(t);
  eq('★ 第一列＝購買日期／課程類別', rows[0], ['購買日期','課程類別']);
  eq('★ 第二列＝購買堂數／購買金額', rows[1], ['購買堂數','購買金額']);
  eq('　　第三列＝每堂費用／付款方式', rows[2], ['每堂費用','付款方式']);
  ok('★ 堂數留手寫空格', /購買堂數：　　　堂/.test(t));
  ok('　　與帶資料版同一套欄位（兩邊不會長得不一樣）',
     !/課程堂數/.test(t) && !/應付總金額/.test(t));
  ok('　　分期表整列跨滿（改成 2 欄後 colspan 跟著改）', /colspan="2"/.test(t) && !/colspan="3"/.test(t));
}

console.log('\n分期表沒被動到');
{
  const t3=fn(Object.assign({},D,{installN:3, instAmts:[10000,10000,18400], instSess:[8,8,8]}));
  ok('★ 分期時列出每一期的金額與開通堂數',
     /第一期/.test(t3) && /＄<b[^>]*>10,000<\/b>/.test(t3) && /<b[^>]*>8 堂<\/b>/.test(t3));
  /* 2026-08-05 使用者回報：第一期簽約當下就收款——收款日帶簽約日、簽名欄標「同本約簽名」，
     只有第二期起留空白手寫。 */
  ok('★ 第一期收款日帶簽約日、簽名欄標「同本約簽名」，其餘期留空白',
     (t3.match(/＿＿ \/ ＿＿/g)||[]).length===2
     && /同本約簽名/.test(t3)
     && new RegExp('<b[^>]*>'+String(D.buyDate||'').slice(5).replace('-',' / ')+'</b>').test(t3));
  ok('　　一次付清時給三列空白讓櫃檯手寫', (fn(D).match(/＄＿＿＿＿＿/g)||[]).length===3);
}

console.log('\n原因寫在程式裡');
ok('　　為什麼改成兩欄', /最重要的「買了幾堂、多少錢」反而不在同一列/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
