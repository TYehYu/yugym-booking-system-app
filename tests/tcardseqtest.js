/* 首頁課卡的「本月第幾堂」背景數字（2026-09-02 使用者指示，附截圖）

   「可以在首頁的課卡新增一個 1 2 3 4 在背景置中靠右
     這個數字代表這堂課是這個月的第幾堂　方便知道是否要抽獎
     因為現在都要等會員簽到才會出現抽獎的圖案」

   ⚠ 口徑與 lottoEarnedByMember 對齊（category==='私人教練'、不算取消），
     但**刻意不看簽到狀態** —— 抽獎名單要等簽到才算數，這個數字的用途正好相反：
     讓櫃檯**事先**看出「這堂上完就滿 4 堂了」。兩者只差這一個條件，別順手抄成一樣。
   ⚠ 友善課的 category 也是「私人教練」，所以一起算（與抽獎規則一致）。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

/* 把編號那一段抽出來實跑 */
const SEG=src.slice(src.indexOf('  const _monSeq={};'), src.indexOf('  const coachSection = rows.length'));
const run=bks=>new Function('bookings', SEG+'\nreturn _monSeq;')(bks);

console.log('① 編號');
{
  const B=[
    {id:'a', member_id:'M1', category:'私人教練', date:'2026-09-01', start_time:'10:00', status:'completed'},
    {id:'b', member_id:'M1', category:'私人教練', date:'2026-09-08', start_time:'10:00', status:'booked'},
    {id:'c', member_id:'M1', category:'私人教練', date:'2026-09-08', start_time:'09:00', status:'booked'},   // 同日較早
    {id:'d', member_id:'M1', category:'私人教練', date:'2026-09-15', start_time:'10:00', status:'booked'},
    {id:'x', member_id:'M1', category:'私人教練', date:'2026-09-20', start_time:'10:00', status:'cancelled'},// 取消不算
    {id:'y', member_id:'M1', category:'小班肌力', date:'2026-09-03', start_time:'20:00', status:'booked'},   // 團課不算
    {id:'z', member_id:'M1', category:'自主訓練', date:'2026-09-04', start_time:'18:00', status:'booked'},   // 自主不算
    {id:'t', member_id:'M1', category:'體驗',     date:'2026-09-05', start_time:'11:00', status:'booked'},   // 體驗不算
    {id:'p', member_id:'M1', category:'私人教練', date:'2026-10-01', start_time:'10:00', status:'booked'},   // 換月重新算
    {id:'q', member_id:'M2', category:'私人教練', date:'2026-09-02', start_time:'10:00', status:'booked'},   // 別人自己算
    {id:'n', member_id:null, category:'私人教練', date:'2026-09-02', start_time:'12:00', status:'booked'},   // 沒有會員（空堂）
  ];
  const m=run(B);
  eq('★★★ 依日期＋時間排序編號（同一天多堂也數得對）',
     [m.a, m.c, m.b, m.d], [1,2,3,4]);
  ok('★★ 取消的不算，也不佔號', m.x===undefined && m.d===4);
  ok('★★ 團課／自主／體驗都不算', m.y===undefined && m.z===undefined && m.t===undefined);
  eq('★★ 換月重新從 1 開始', m.p, 1);
  eq('★★ 每位會員各自算', m.q, 1);
  ok('★ 沒有會員的空堂不編號（不然會顯示一個沒有意義的數字）', m.n===undefined);
}
console.log('\n② 刻意不看簽到狀態（與抽獎名單的差別）');
{
  const B=[
    {id:'a', member_id:'M1', category:'私人教練', date:'2026-09-01', start_time:'10:00', status:'checked_in'},
    {id:'b', member_id:'M1', category:'私人教練', date:'2026-09-08', start_time:'10:00', status:'booked'},
  ];
  const m=run(B);
  eq('★★★ 還沒簽到的那一堂照樣編號（這正是使用者要的：事先看得出來）', [m.a,m.b], [1,2]);
  ok('★★ 抽獎名單那一支仍然只認已簽到（兩支不要抄成一樣）',
     /if\(!b\.member_id \|\| !\(b\.status==='checked_in'\|\|b\.status==='completed'\)\) return;/.test(src)
     && /兩者口徑刻意只差這一個條件/.test(src));
}

console.log('\n③ 畫在卡片上');
ok('★★ 背景大數字、靠右垂直置中',
   /\.tcard-std \.tcard-seq\{position:absolute;right:8px;top:50%;transform:translateY\(-50%\);/.test(src));
ok('★★★ 不能吃掉點卡片的動作（它是背景，不是按鈕）',
   /\.tcard-std \.tcard-seq\{[\s\S]{0,200}?pointer-events:none;/.test(src));
ok('★★★ 圖層要夾在底色（.tcard-body z-index:0）與文字（.tcard-txt z-index:1）之間',
   /\.tcard-std \.tcard-seq\{[\s\S]{0,160}?z-index:0;/.test(src)
   && /\.tcard-std \.tcard-body\{position:absolute;inset:0;z-index:0;/.test(src)
   && /\.tcard-txt\{position:relative;z-index:1;/.test(src));
ok('★★ 滿 4 的那一堂標品牌金（抽獎門檻是當月每 4 堂 1 次）',
   /_sq%4===0\?' tcard-seq-hit':''/.test(src)
   && /\.tcard-std \.tcard-seq\.tcard-seq-hit\{color:var\(--gold-d,#b48a56\);opacity:\.42;\}/.test(src));
ok('★ 螢幕報讀器跳過（它是視覺輔助，唸出來只是雜訊）', /class="tcard-seq[\s\S]{0,60}?aria-hidden="true"/.test(src));
ok('★ 沒有編號就不畫（不要留一個空的圖層）', /const _sq=_monSeq\[b\.id\]; if\(!_sq\) return '';/.test(src));

console.log('\n④ 效能');
ok('★★ 整份 bookings 只掃一次，不放進逐張卡片的迴圈',
   /整份 bookings 只掃一次，不要放進逐張卡片的迴圈裡/.test(src)
   && (src.match(/const _monSeq=\{\};/g)||[]).length===1);

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
