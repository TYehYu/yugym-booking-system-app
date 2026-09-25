/* 訓練紀錄的日期要用「上課日」，不是「記錄時間」（2026-09-25 使用者回報）

   「這個會員幫我查一下　為什麼這四張課表都是同一天　張雅雯」

   查出來：那四堂分別在 9/05、9/12、9/19、9/25，但教練 9/24 晚上
   18:07–18:16 十分鐘內一次補記完（用「套用歷史課表」帶的）。
   畫面顯示的是 created_at，所以四張都寫 9/24，
   連會員端的「本週 4 次」都跟著錯 —— 那四堂分屬四個不同的週。

   ⚠ 補記在這家店很常見，不是邊緣案例。跨午夜記錄、套用歷史課表也一樣會分家。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,a===e,`得到 ${a}，預期 ${e}`);
const grab=n=>{let i=src.indexOf('function '+n+'(');if(i<0)i=src.indexOf('async function '+n+'(');
  if(i<0)throw new Error('切不到 '+n);
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 張雅雯那四堂（使用者回報的實際資料）');
{
  /* 正式庫查到的：四堂上課日不同，但 created_at 全在 9/24 18:0x */
  const META={'BK-a':{d:'2026-09-25',t:'10:00'},'BK-b':{d:'2026-09-19',t:'13:00'},
              'BK-c':{d:'2026-09-12',t:'19:00'},'BK-d':{d:'2026-09-05',t:'10:00'}};
  const f=new Function('window', grab('tlSessKey')+'\nreturn tlSessKey;')({_tlBkMeta:META});
  const LOG=[{created_at:'2026-09-24T10:15:20Z'}];
  eq('★★★ BK-a → 9/25（不是記錄日 9/24）', f('BK-a',LOG).slice(0,10), '2026-09-25');
  eq('★★★ BK-b → 9/19', f('BK-b',LOG).slice(0,10), '2026-09-19');
  eq('★★★ BK-c → 9/12', f('BK-c',LOG).slice(0,10), '2026-09-12');
  eq('★★★ BK-d → 9/05', f('BK-d',LOG).slice(0,10), '2026-09-05');
  ok('★★★ 四堂不再擠在同一天', new Set(['BK-a','BK-b','BK-c','BK-d']
      .map(b=>f(b,LOG).slice(0,10))).size===4);
}

console.log('\n② 排序鍵帶 start_time（同一天上兩堂要分得出先後）');
{
  const f=new Function('window', grab('tlSessKey')+'\nreturn tlSessKey;')(
    {_tlBkMeta:{A:{d:'2026-09-20',t:'10:00'},B:{d:'2026-09-20',t:'19:00'}}});
  eq('★★ 早上那堂', f('A',[]), '2026-09-20 10:00');
  eq('★★ 晚上那堂', f('B',[]), '2026-09-20 19:00');
  ok('★★★ 晚上的排在前面（清單是最近的在上）', f('B',[])>f('A',[]));
  ok('★★ 顯示時只取前 10 字（時間不進標題）',
     /String\(x\.t\)\.slice\(0,10\)\.replace\(\/-\/g,'\/'\)/.test(src));
}

console.log('\n③ 查不到 booking 時的退路');
{
  const f=new Function('window', grab('tlSessKey')+'\nreturn tlSessKey;')({_tlBkMeta:{}});
  eq('★★ 退回 created_at（舊資料或 booking 被刪掉，至少有個日期不要空白）',
     f('BK-x',[{created_at:'2026-09-24T10:15:20Z'}]), '2026-09-24');
  eq('　　連 log 都沒有也不會爆', f('BK-x',[]), '');
  eq('　　_tlBkMeta 還沒載好也不會爆',
     new Function('window', grab('tlSessKey')+'\nreturn tlSessKey;')({})('BK-x',[{created_at:'2026-09-24T01:02:03Z'}]),
     '2026-09-24');
  eq('　　booking 沒有 date 就當查不到',
     new Function('window', grab('tlSessKey')+'\nreturn tlSessKey;')(
       {_tlBkMeta:{A:{d:'',t:'10:00'}}})('A',[{created_at:'2026-09-24T01:02:03Z'}]), '2026-09-24');
}

console.log('\n④ 五個列訓練紀錄的地方都改了');
{
  ok('★★★ 四處分組都吃 tlSessKey（會員資料視窗／共用 tlSessionsHtml／會員端每週／會員檔案頁）',
     (src.match(/t:tlSessKey\(bid,_ls\)/g)||[]).length===4);
  ok('★★★ 套用歷史課表的清單也是（教練挑「哪一堂」時看的也該是上課日）',
     /let hist=Object\.entries\(byBk\)\.map\(\(\[bid,ls\]\)=>\(\{bid,ls,t:tlSessKey\(bid,ls\)\}\)\)/.test(src));
  ok('★★★ 舊的 created_at 當日期已經收乾淨',
     !/t:\(_ls\[0\]&&_ls\[0\]\.created_at\)/.test(src)
     && !/t:ls\[0\]\.created_at/.test(src));
}

console.log('\n⑤ 對照表要先載好（tlSessionsHtml 是同步的）');
{
  ok('★★★ 四個入口都 await tlBkMetaLoad()',
     (src.match(/await tlBkMetaLoad\(\);/g)||[]).length===4);
  ok('★★ 會員檔案頁那支載在呼叫 tlSessionsHtml 之前',
     src.indexOf('await tlBkMetaLoad(); }catch(_){}\n    }') < src.indexOf('const _body=tlSessionsHtml(_tl,40);')
     || /c\.trainLogs=\(await dbGetAll\('training_logs'\)\)[\s\S]{0,300}?await tlBkMetaLoad\(\)/.test(src));
  ok('★★ 讀 bookings 不會多打網路，理由寫在原地',
     /bookings 幾乎一定已經在快取裡（每一頁都在用），這一行不會多打網路/.test(src));
  ok('★★ 會員端讀得到自己的 booking（RLS），也寫在原地',
     /會員端也讀得到自己的（RLS bookings_select_member）/.test(src));
  ok('★★★ 成因寫在 tlSessKey 原地（下一個人不要又改回 created_at）',
     /訓練紀錄要回答的是「\*\*哪一天上的課\*\*」，不是「教練哪一天打的字」/.test(src)
     && /補記在這家店很常見（張雅雯這四堂就是），不是邊緣案例/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
