/* 會員列表的圓形卡：共享票也要看得出「誰用、哪一天」（2026-09-02 陳瀚竣案例）

   症狀：列表上陳瀚竣的教練課畫成「✓ ✓ 8/15 8/29 9/5」，前面兩顆是沒有日期的打勾，
   點進會員資料卻看得到那兩堂是共享票（陳玟淂 7/10、8/08 用掉的）。

   成因：列表把預約索引成 `會員 → 他自己的預約`，共享票上別人用掉的那幾堂
   完全不在他的清單裡；票券夾只知道「帳面上用掉 4 堂」但只找得到 2 筆預約，
   差額就補成無日期的 ✓ —— 那個 ✓ 本來的語意是「舊系統轉過來、沒有逐堂紀錄」，
   兩件完全不同的事長成同一顆點，櫃檯分不出來。

   ⚠ 索引方向很容易搞錯：陳瀚竣是**被分享的那一邊**（票是陳玟淂的），
     只索引「持有人 → 他的票」永遠走不到這條路。要用「他用得到的票」。
   ⚠ 標名字一定要在**蓋完戳記之後**：團課的使用人在名額鍵 _seat 上，
     而 _seat 是 buildWallet 裡的 grpTicketAlloc 才寫上去的（0901 林政緯的同一個坑）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 索引要涵蓋「他用得到的票」，不是只有他持有的');
ok('★★★ 用 tkSharedIds 把被分享的一邊也算進去（陳瀚竣就是這一邊）',
   /const _tkUseIdx=\{\};[\s\S]{0,420}?\(tkSharedIds\(t\)\|\|\[\]\)\.forEach\(id=>\{ who\[String\(id\)\]=1; \}\);/.test(src));
ok('★★ 舊的「只看持有人」索引已經沒有了', !/_tkOwnIdx/.test(src));
ok('★★ 票 → 預約走 ticket_id，並且**連扣課紀錄一起認**（團課的 ticket_id 是 null）',
   /const _bkByTk=\{\}, _lgTkOfBk=\{\};/.test(src)
   && /\(allLg\|\|\[\]\)\.forEach\(l=>\{ if\(l && l\.booking_id && l\.ticket_id\)/.test(src));
ok('★★ 取消但扣課不退的要留著（票被吃掉了，那一格要畫得出來）',
   /const _bkAlive=b=>!!b && !\(b\.status==='cancelled' && !bkEatenCancel\(b\)\);/.test(src));
ok('★ 聯集不重複（自己的 ∪ 掛在票上的）',
   /const seen=\{\}; own\.forEach\(b=>\{ seen\[b\.id\]=1; \}\);/.test(src));
ok('★ 每位會員只算一次（一頁 20 列，不能每格重算）', /if\(_bkOfIdx\[mid\]\) return _bkOfIdx\[mid\];/.test(src));

console.log('\n② 標名字的時機');
ok('★★★ 標在蓋完戳記之後（sl.stamps），不是在 bookingsOf 那一步',
   /let dots=ticketTokens\(tk,_shMarkList\(sl\.stamps\.concat\(extra\|\|\[\]\),_who\),/.test(src)
   && /const _bkOf=\(mid\)=>\{[\s\S]{0,900}?return \(_bkOfIdx\[mid\]=out\);/.test(src)
   && !/const _bkOf=\(mid\)=>\{[\s\S]{0,900}?_shName/.test(src));
ok('　　為什麼不能提前標，寫在原地', /_seat 是 buildWallet 裡的 grpTicketAlloc 寫上去的/.test(src));

console.log('\n③ _shMarkList 本身');
{
  const m=src.match(/const _shMarkList=\(arr,mid\)=>[\s\S]*?\n  \}\);/);
  const _shMarkList=new Function('seatMid','_memNm',
    (m?m[0]:'')+'\nreturn _shMarkList;')(
    k=>{const s=String(k),i=s.indexOf('#');return i<0?s:s.slice(0,i);},
    {A:'陳瀚竣', B:'陳玟淂'});
  const out=_shMarkList([
    {id:'1',date:'2026-07-10',member_id:'B'},
    {id:'2',date:'2026-08-15',member_id:'A'},
    {id:'3',date:'2026-08-20',member_id:null,_seat:'B#2'},   // 團課：使用人在名額鍵上
    {id:'4',date:'2026-08-21',member_id:null},               // 沒有使用人（先卡位的空堂）
    null,
  ],'A');
  eq('★★ 別人用的那堂標上姓名', [out[0]._shBy,out[0]._shName], ['享','陳玟淂']);
  ok('★★ 自己用的不標', !out[1]._shBy && !out[1]._shName);
  eq('★★ 團課看名額鍵（member_id 是 null）', out[2]._shName, '陳玟淂');
  ok('★ 沒有使用人的不標（不能標成「共享對象」）', !out[3]._shBy);
  ok('　　null 進來不會爆', out[4]===null);
  ok('★★ 原物件不被就地改（stamps 還有別處在用）',
     /return Object\.assign\(\{\}, b, \{_shBy:'享', _shName:_memNm\[who\]\|\|'共享對象'\}\);/.test(src));
}

console.log('\n④ 圓形卡本身早就會畫「色點＋姓名＋日期」了（0827 定案），列表只是沒把資料餵進去');
ok('★★ _shBody：有 _shName 就畫 色點／姓名／日期 三層',
   /const _shBody=\(b,dt\)=>\(b&&b\._shName\)\s*\n\s*\? `<i class="mtk-shdot"><\/i>`/.test(src));
ok('★★ 列表的迷你圓點有替共享那顆放寬寬度（不然名字會被擠掉）',
   /\.tkm-dots \.mtk\.mtk-sh,\.tkm-dots \.mtk\.mtk-lv\{min-width:34px;max-width:46px;font-size:8px;\}/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
