/* 底部自主訓練列改成「一張票一組」（2026-09-09 客訴）：
   「一組期限到9號一組期限到14號　然後他點後面約好時間以後　他會跑到第一格」
   「是否可以讓這種期限不同的票顯示上有區分　因為從他的介面會看到下方有四個[+]
     但無法確定哪個期限比較短　都要點進去才知道」
   「然後點數位子就固定　而且要完整顯示所有點數不要超過視窗　必要時縮小圓形」
   「可以在兩點下方顯示使用期限嗎　例如1/1~1/7」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};
const B=g('async function memSelfBarSync(){','\n}');

console.log('① 位子固定：一張票一組，約掉一點只是那一顆換樣子');
ok('★★★ 依票分組，不是「已約的全排前面、可約的全排後面」',
   /const groups=\[\];/.test(B)
   && /const mine=booked\.filter\(b=>String\(b\.ticket_id\|\|''\)===String\(t\.id\)\);/.test(B)
   && !/const pts=\[\];/.test(B));
ok('★★★ 組內先列已約再列可約，整列照票的效期由近到遠',
   /_selfTk=[\s\S]{0,600}\.sort\(\(a,b\)=>String\(a\.expire_date\|\|'9999'\)\.localeCompare\(String\(b\.expire_date\|\|'9999'\)\)\)/.test(B)
   && B.indexOf('mine.forEach(b=>{ if(_n<CAP){ g.cards.push({bk:b}); _n++; } });')
      < B.indexOf('for(let i=0;i<left && _n<CAP;i++){ g.cards.push({from, ex}); _n++; }'));
ok('★★★ 可約的顆數＝餘額 − 這張票已經約掉的（不然約完總數會多一顆）',
   /const left=Math\.max\(0, \(Number\(t\.sessions_remaining\)\|\|0\) - mine\.length\);/.test(B));
ok('★★★ 歸不到票的已約自成一組排最後，不硬塞進某一張票',
   /const rest=booked\.filter\(b=>!_tkIds\.has\(String\(b\.ticket_id\|\|''\)\)\);/.test(B)
   && /不要硬塞進某一張票裡 —— 那會讓「這張票還剩幾點」看起來是錯的/.test(src));
ok('★★ 客訴原話寫在原地（下次不會又被改回去）',
   /他會跑到第一格/.test(src) && /無法確定哪個期限比較短/.test(src));

console.log('\n② 使用期限寫在整組下方（使用者指定的 1/1~1/7 形式）');
{
  /* _rangeTxt 用到 _md，兩支要一起帶進沙箱 */
  const R=new Function('tkUnlimited',
    g('const _md=x=>{','\n    };')+'\n'+
    'return '+g('const _rangeTxt=(t,g)=>{','\n    };').replace(/^const _rangeTxt=/,'').replace(/;\s*$/,'')
  )(t=>!!(t&&t._inf));
  eq('★★★ 有起訖就寫 1/1~1/7', R({start_date:'2026-01-01'},{ex:'2026-01-07'}), '1/1~1/7');
  eq('★★ 只有到期日就寫「至 1/7」（沒有起算日的票很常見）', R({},{ex:'2026-01-07'}), '至 1/7');
  eq('★★ 只有起算日就寫「1/1 起」', R({start_date:'2026-01-01'},{ex:''}), '1/1 起');
  eq('★★ 兩個都沒有就不畫那一行（不要留一條空的）', R({},{ex:''}), '');
  eq('★★ 無限次卡講「不限次」，有到期日就一起寫', R({_inf:1,expire_date:'2026-01-07'},{ex:'2026-01-07'}), '至 1/7・不限次');
  eq('　　無限次又沒到期日', R({_inf:1},{ex:''}), '不限次數');
  eq('　　月／日不補零（1/7 不是 01/07）', R({start_date:'2026-10-01'},{ex:'2026-11-20'}), '10/1~11/20');
}
ok('★★★ 寫在整組下方，不是每一顆圓卡上（一組四顆會重複四次）',
   /<div class="mh2-sbex">\$\{_rt\}<\/div>/.test(B)
   && /期限是整張票的事，寫在每一顆圓卡上會重複四次/.test(src));
ok('★★ 圓卡本身維持「＋ 可約」／「＋ 不限」',
   /<b>＋<\/b><span>\$\{c\.inf\?'不限':'可約'\}<\/span>/.test(B));
ok('★★ 手機沒有 hover，所以不能只寫在 title 裡',
   /手機沒有 hover，寫在 title 等於沒寫 —— 這一行必須是看得見的文字/.test(src));
ok('★★ 字級 11px：會員端的下限，不為了塞得下調小',
   /\.mh2-sbex\{font-family:var\(--num\);font-size:11px;/.test(src));

console.log('\n③ 全部塞進畫面，必要時縮小圓形');
{
  const F=g('function memSelfBarFit(){','\n}');
  ok('★★★ 依實際顆數算圓形大小，寫進 --sbsz',
     /const sz=Math\.max\(44, Math\.min\(84, Math\.floor\(avail\/n\)\)\);/.test(F)
     && /el\.style\.setProperty\('--sbsz', sz\+'px'\);/.test(F));
  ok('★★★ 下限 44px —— 再小是「看得到但點不準」',
     /縮到 44px 就不再縮：那是手指點得到的下限，再小是「看得到但點不準」/.test(src));
  ok('★★★ 字級跟著等比縮（寫死字級的話小圓圈會爆字）',
     /font-size:calc\(var\(--sbsz,84px\)\*0\.226\)/.test(src)
     && /font-size:calc\(var\(--sbsz,84px\)\*0\.178\)/.test(src)
     && /font-size:calc\(var\(--sbsz,84px\)\*0\.286\)/.test(src));
  ok('★★ 算式要扣掉標籤寬、內距、組間距與組內間距（不然會算得太寬）',
     /const avail=el\.clientWidth - lw - PAD - Math\.max\(0,grps-1\)\*GGAP - Math\.max\(0,n-grps\)\*GAP;/.test(F));
  ok('★★★ 旋轉／改變寬度要重算（不重抓資料）',
     /window\.addEventListener\('resize', \(\)=>\{ try\{ memSelfBarFit\(\); \}catch\(_\)\{\} \}\);/.test(src)
     && /window\.addEventListener\('orientationchange', \(\)=>\{ setTimeout\(\(\)=>\{ try\{ memSelfBarFit\(\); \}catch\(_\)\{\} \},200\); \}\);/.test(src));
  ok('★★ 組與組拉開、組內靠緊（一眼分得出哪幾顆是同一張票）',
     /\.mh2-sbrow\{flex:1 1 auto;min-width:0;display:flex;gap:16px;/.test(src)
     && /\.mh2-sbgrow\{display:flex;gap:8px;\}/.test(src));
  ok('★★ 真的多到 44px 還排不下才水平捲（比縮到點不到好）',
     /真的多到 44px 還排不下，才讓它水平捲 —— 那比縮到點不到好/.test(src));
}
ok('★★ 上限 12 顆仍在，超過用「＋N」說一聲（無限次卡的防線）',
   /const CAP=12;/.test(B) && /mh2-sbmore">＋\$\{_more\}/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
