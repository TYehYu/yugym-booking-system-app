/* 2026-08-03 使用者指示：「上個月尚未抽獎的客戶名單不見了，
   可以幫我保持抽獎提醒直到客戶來抽嗎？」

   原本 earned 與 used 都只看「當月」，所以 8/1 一到，七月滿了 4 堂卻還沒來抽的人
   就整批從名單上消失 —— 機會是客人掙到的，不該因為換月就沒了。

   改成：earned＝從系統上線那個月（LOTTO_FROM）起，逐月 floor(當月教練課簽到 ÷ 4) 累加；
        used ＝已登記的抽獎次數（不分月份）。left 就是「還欠客人幾次」。
   「滿 4 堂」仍然逐月結算（月底沒滿 4 堂的零頭不帶到下個月）—— 變的只有
   「抽獎機會不會過期」，不是門檻的算法。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grabFn=n=>{const i=src.indexOf('function '+n+'(');let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

const API=new Function('lottoVipSet','_lotPuDate',
  "const LOTTO_FROM='2026-07';\n"
  +['lottoEarnedByMember','lottoUsedByMember','lottoStats','lottoMapAll','lottoPendingFrom'].map(grabFn).join('\n')
  +'\nreturn {lottoEarnedByMember,lottoUsedByMember,lottoStats,lottoMapAll,lottoPendingFrom};')(
  ()=>new Set(), p=>p.date||'');

const bk=(mid,date,n,cat,st)=>Array.from({length:n},(_,i)=>
  ({member_id:mid, date:date, category:cat||'私人教練', status:st||'checked_in'}));
const lot=(mid,date)=>({source:'lottery', member_id:mid, date});

console.log('① 上個月沒抽的要留著');
{
  /* 使用者的情境：七月滿 4 堂、沒來抽；八月只上了 1 堂 */
  const B=[...bk('M1','2026-07-10',4), ...bk('M1','2026-08-01',1)];
  const now=API.lottoStats(B, [], '2026-08', []);
  eq('★ 八月看名單，七月那一次還在', now.map(x=>[x.id,x.left]), [['M1',1]]);
  eq('　　舊寫法會消失（當月只有 1 堂）—— 這裡確認不會', now.length, 1);

  const drawn=API.lottoStats(B, [lot('M1','2026-08-03')], '2026-08', []);
  eq('★ 客人來抽了就從名單移除', drawn.length, 0);
  eq('★ 八月抽掉的是七月掙的那一次（不分月份對沖）',
     API.lottoUsedByMember([lot('M1','2026-08-03')], '2026-08'), {M1:1});
}

console.log('\n② 門檻還是逐月結算（零頭不帶到下個月）');
{
  const B=[...bk('M1','2026-07-10',3), ...bk('M1','2026-08-05',3)];
  eq('★ 七月 3 堂＋八月 3 堂 → 0 次（不是合起來 6 堂算 1 次）',
     API.lottoStats(B, [], '2026-08', []).length, 0);
  const B2=[...bk('M1','2026-07-10',4), ...bk('M1','2026-08-05',4)];
  eq('★ 兩個月各滿 4 堂 → 累積 2 次', API.lottoStats(B2, [], '2026-08', [])[0].left, 2);
  eq('　　同一個月 8 堂 → 2 次', API.lottoStats(bk('M1','2026-07-10',8), [], '2026-07', [])[0].left, 2);
}

console.log('\n③ 起算月份要卡住（舊系統匯入的簽到不能回頭生機會）');
{
  const B=[...bk('M1','2026-05-10',8), ...bk('M1','2026-06-10',8)];
  eq('★ 2026-07 以前的簽到不算', API.lottoStats(B, [], '2026-08', []).length, 0);
  ok('　　起算月寫成常數', /const LOTTO_FROM='2026-07';/.test(src));
  ok('　　原因寫在程式裡', /舊系統匯入的簽到紀錄不該回頭生出抽獎機會。/.test(src));
}

console.log('\n④ 只算教練課、只算已簽到');
{
  eq('★ 團課不計', API.lottoStats(bk('M1','2026-07-10',8,'小班肌力'), [], '2026-07', []).length, 0);
  eq('★ 自主訓練不計', API.lottoStats(bk('M1','2026-07-10',8,'自主訓練'), [], '2026-07', []).length, 0);
  eq('★ 只預約沒簽到不計', API.lottoStats(bk('M1','2026-07-10',8,'私人教練','booked'), [], '2026-07', []).length, 0);
  eq('　　已完成也算（簽到即視為上課完成）',
     API.lottoStats(bk('M1','2026-07-10',4,'私人教練','completed'), [], '2026-07', [])[0].left, 1);
  eq('　　取消的不算', API.lottoStats(bk('M1','2026-07-10',8,'私人教練','cancelled'), [], '2026-07', []).length, 0);
}

console.log('\n⑤ 回頭看歷史月份要看得到當時的狀態');
{
  const B=[...bk('M1','2026-07-10',4), ...bk('M1','2026-08-05',4)];
  eq('★ 站在七月看：只有七月那一次', API.lottoStats(B, [], '2026-07', [])[0].left, 1);
  eq('★ 站在八月看：兩次', API.lottoStats(B, [], '2026-08', [])[0].left, 2);
  eq('　　八月才登記的抽獎，站在七月看不算',
     API.lottoStats(B, [lot('M1','2026-08-03')], '2026-07', [])[0].left, 1);
}

console.log('\n⑥ 名單上要標出是哪個月的舊帳');
{
  const B=[...bk('M1','2026-07-10',4), ...bk('M1','2026-08-05',4)];
  const x=API.lottoStats(B, [], '2026-08', [])[0];
  eq('★ 兩次都沒抽 → 標出七月那筆', API.lottoPendingFrom(x,'2026-08'), '7 月 未抽');
  const y=API.lottoStats(B, [lot('M1','2026-08-06')], '2026-08', [])[0];
  eq('★ 抽掉一次 → 先抵最早的，剩下的是八月的（不標）', API.lottoPendingFrom(y,'2026-08'), '');
  const z=API.lottoStats([...bk('M1','2026-07-10',8)], [], '2026-08', [])[0];
  eq('　　同一個月欠兩次 → 寫次數', API.lottoPendingFrom(z,'2026-08'), '7 月 2 次 未抽');
  eq('　　沒有資料不會爆', API.lottoPendingFrom(null,'2026-08'), '');
  ok('　　名單上用得到（沒有舊帳時退回顯示簽到堂數）',
     /\$\{lottoPendingFrom\(x, ym\)\|\|`簽到 \$\{x\.att\} 堂`\}/.test(src));
}

console.log('\n⑦ 課卡的禮物圖示與說明文字');
{
  const B=[...bk('M1','2026-07-10',4)];
  const map=API.lottoMapAll(B, [], '2026-08', []);
  eq('★ 首頁課卡的禮物也跟著累積（八月仍看得到七月未抽的）', map.M1, {earned:1,used:0,left:1,months:[{ym:'2026-07',n:1}]});
  const map2=API.lottoMapAll(B, [lot('M1','2026-08-01')], '2026-08', []);
  eq('　　抽完了仍回傳（卡片要畫「打開的禮物盒」）', map2.M1.left, 0);
  ok('★ 提示文字改成累計，並講明不會過期',
     /累計可抽 \$\{earned\} 次（已抽 \$\{used\}、待抽 \$\{left\}）　·　沒來抽的不會過期/.test(src));
  ok('★ 彈窗的說明也改了（原本寫「次月歸零」）',
     /<b>沒來抽的次數會一直留著<\/b>，直到客人來抽為止。/.test(src)
     && !/可累計、次月歸零/.test(src));
  ok('　　空狀態不再寫「本月」', /<div class="em-t">目前沒有待抽獎的會員<\/div>/.test(src));
}

console.log('\n名單版面（2026-08-21 使用者：「會員名單也改成一列 白色底」）');
ok('★ 卡片牆改成一列一位（直向排列，不再是自動填滿的格子）',
   /\.lot-btns\{max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;/.test(src)
   && !/\.lot-btns\{[^}]*grid-template-columns/.test(src));
ok('★ 白底（原本是米底 var(--card2)）',
   /\.lot-btn\{display:flex;flex-direction:row;[\s\S]{0,160}?background:#fff;/.test(src));
ok('　　整列橫向：姓名靠左撐開，可抽次數與簽到堂數靠右',
   /\.lot-btn-nm\{font-size:14\.5px;font-weight:800;color:var\(--text\);flex:1;min-width:0;/.test(src)
   && /\.lot-btn-n\{[^}]*flex:none;\}/.test(src)
   && /\.lot-btn-sub\{[^}]*flex:none;\}/.test(src));
ok('　　長姓名截斷不換行（一列的高度要固定）',
   /overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\}\n\.lot-btn-n\{/.test(src));
ok('　　選中仍是綠框綠底（沒有被白底蓋掉）',
   /\.lot-btn\.sel\{border-color:var\(--green\);background:#eaf3ee;/.test(src));
ok('　　改的原因寫在原地', /一位會員時會孤零零一張卡佔掉一大格/.test(src));

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
