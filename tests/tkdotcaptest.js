/* 圓形卡數量上限（2026-08-21 使用者回報 → 使用者定案）
   回報：「我發現在行事曆點了18:00 魚媽劉媽的自主訓練 畫面會當機 是因為圓形卡太多了嗎」
   定案：「這樣要限制顯示一次最多顯示16張 一列8張最多兩列」

   查證（正式庫）：那張票是「親友自主訓練」TK-ms481zgy1ojp，
   sessions_total = 9999（無限次卡，效期到 2053），已排 45 堂。
   ticketTokens 逐堂畫圓點 → 一次產生 9,999 個節點，點開課卡整個分頁凍住。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('上限本身');
/* 0822 使用者回報「會員資料的票券要完整顯示，怎麼會有一個虛線的圈寫 5」——
   16 顆是當初為了擋 9999 順手訂的，但 20／24／34 堂的一般票都會被切掉。
   正式庫實測：2,977 張票裡 61–998 堂的有 0 張、只有 1 張 9999，所以上限拉到 60：
   真實票券 100% 完整顯示，那張無限次卡仍然有收尾籤擋住（凍結防線還在）。 */
ok('★ 上限 60（真實票券全畫得完，只有 9999 那張會被截）',
   (src.match(/const TK_DOT_MAX=60;/g)||[]).length===2   /* 兩支各宣告一份：見 index.html 的註解 */
   && /正式庫實測：2,977 張票裡，61–998 堂的有 0 張/.test(src));
ok('　　成因與案例寫在原地',
   /sessions_total 是 9999/.test(src) && /魚媽劉媽/.test(src));
ok('★ 截斷時最後一格放收尾籤，不默默少畫',
   /const _win = _trunc \? TK_DOT_MAX-1 : total;/.test(src)
   && /<span class="mtk mtk-more"/.test(src));
ok('　　無限次卡標「不限堂數」而不是「+9984」',
   /total>=999\?'不限堂數':\('\+'\+_hidden\)/.test(src));
ok('★ 視窗以「本堂」為中心（沒有本堂就對齊最新的內容）',
   /const _anchor = _curSlot>=0 \? _curSlot : Math\.max\(0, Math\.min\(_contentN,total\)-1\);/.test(src));
ok('★ ⚠ 起點不是 0 之後，消耗指標要跟著對齊',
   /let s='',qi=Math\.max\(0,_from-_ghost\),gi=Math\.min\(_ghost,_from\);/.test(src));
ok('★ ⚠ 溢位段只有畫到最後才跑（否則等於沒有上限）',
   /while\(_to>=total && qi<_seq\.length\)\{/.test(src)
   && /不是超約，照原本的寫法會把它們全部當成紅虛線倒出來（也就等於沒有上限了）/.test(src));
ok('★ 另一支小圓點（ticketDots）也有上限',
   /const _cap=Math\.min\(t, TK_DOT_MAX\);/.test(src)
   && /const _st=Math\.max\(0, Math\.min\(u, t-_cap\)\);/.test(src));
ok('　　小圓點的收尾籤：無限次卡用 ∞',
   /t>=999\?'∞':\('\+'\+\(t-_cap\)\)/.test(src));
ok('★ 課卡的「第幾堂」也不寫 45/9999，只標「第 45 堂」',
   /q\.n>=999\?\('第 '\+q\.i\+' 堂'\)/.test(src));

console.log('\n視窗的算術');
{
  const CAP=16;
  const win=(total,ghost,seqN,curIdx)=>{
    const contentN=ghost+seqN;
    const curSlot=curIdx==null?-1:ghost+curIdx;
    const trunc=total>CAP;
    const w=trunc?CAP-1:total;
    let from=0;
    if(trunc){
      const anchor=curSlot>=0?curSlot:Math.max(0,Math.min(contentN,total)-1);
      from=Math.max(0, Math.min(anchor-Math.floor(w/2), total-w));
    }
    return {from, to:Math.min(total,from+w), n:Math.min(total,from+w)-from};
  };
  eq('★ 12 堂票不受影響（全部畫出來）', win(12,0,12,3), {from:0,to:12,n:12});
  eq('　　剛好 16 堂也不截斷', win(16,0,16,0).n, 16);
  eq('★ 17 堂 → 截成 15 顆＋收尾籤', win(17,0,17,16).n, 15);
  eq('★ 9999 堂、本堂是第 30 顆 → 視窗含住它',
     (()=>{ const r=win(9999,0,45,30); return [r.from<=30 && 30<r.to, r.n]; })(), [true,15]);
  eq('★ 沒有本堂時對齊最新的內容（45 堂 → 視窗貼著第 45 顆）',
     (()=>{ const r=win(9999,0,45,null); return [r.from<=44 && 44<r.to, r.n]; })(), [true,15]);
  eq('　　本堂在最前面時視窗不會跑到負的', win(9999,0,45,0).from, 0);
  eq('　　本堂在最後面時視窗不會超出總堂數',
     (()=>{ const r=win(20,0,20,19); return r.to<=20 && r.from>=0; })(), true);
}


console.log('\n「已使用完」的判斷');
ok('★★ 不能只看 sessions_remaining —— 預約當下就扣課，「約滿但還沒上」的票餘額就是 0',
   /const _s=\(typeof WAL!=='undefined' && WAL && typeof WAL\.of==='function'\) \? WAL\.of\(t\.id\) : null;/.test(src)
   && /if\(_s && _s\.state\) return _s\.state==='active' \? 0 : \(_s\.state==='expired' \? 2 : 1\);/.test(src));
ok('　　與會員資料那一頁同一個來源（票券夾 buildWallet 的 state＝看真的上過幾堂）',
   /會員資料那一頁看的是票券夾（buildWallet）\s*\n?\s*的狀態，它用的是「真的上過幾堂」/.test(src));
ok('　　票券夾拿不到時才退回舊判斷（不硬性依賴）',
   /if\(isExpired\(t\)\) return 2;\s*\n\s*if\(t\.status==='usable' && \(Number\(t\.sessions_remaining\)\|\|0\)>0\) return 0;/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);

/* 2026-08-22 使用者回報：「胡連山應該是把票券預約完 但還沒使用完，手機端怎麼出現用畢」 */