/* 手機旋轉（2026-09-09 使用者回報）：
   「我剛剛在手機端　把畫面轉成橫式再轉回直式　上方就變成這樣了」
   「手機版橫式畫面　太壓縮了」「轉回來後的直式畫面　上方出現導覽列」 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,JSON.stringify(a)===JSON.stringify(b),{得到:a,預期:b});
const g=(a,b)=>{const i=src.indexOf(a); if(i<0) throw new Error('找不到 '+a); return src.slice(i, src.indexOf(b,i)+b.length);};

console.log('① 手機橫著拿也是手機');
{
  const body=g('function isMobileLayout(){','\n}');
  const M=(w,h)=>new Function('window','return '+body)({innerWidth:w,innerHeight:h})();
  eq('★★★ iPhone 直式 390×844 → 手機', M(390,844), true);
  eq('★★★ iPhone 橫式 844×390 → 手機（原本被判成桌機，整個側欄塞進 390px 高）', M(844,390), true);
  eq('★★★ Pro Max 橫式 932×430 → 手機', M(932,430), true);
  eq('★★ iPad 直式 810×1080 → 手機版（維持原本的行為）', M(810,1080), true);
  eq('★★★ iPad 橫式 1080×810 → 桌機（不能被誤判成手機）', M(1080,810), false);
  eq('★★★ iPad mini 橫式 1024×744 → 桌機（短邊 744，離 520 那條線很遠）', M(1024,744), false);
  eq('★★★ 桌機 1440×900 → 桌機', M(1440,900), false);
  eq('★★ 桌機視窗拉窄 500×900 → 手機（原本就是這樣）', M(500,900), true);
  eq('★★ 桌機視窗拉扁 1200×600 → 還是桌機（600 > 520，不要誤判）', M(1200,600), false);
  ok('★★ 為什麼是 520 不是 600，寫在原地',
     /目前最大的手機短邊約 430，\s*\n\s*iPad mini 橫式的短邊是 744 —— 520 這條線把兩者分得開/.test(src));
}

console.log('\n② 轉回直式時要把桌機的左側欄收掉');
{
  const NAV=g('function buildNav(){','\n  let items;');
  ok('★★★ 手機版而 body 還留著 mc-mode 就清掉',
     /if\(isMobile && document\.body\.classList\.contains\('mc-mode'\)\)\{/.test(NAV)
     && /document\.body\.classList\.remove\('mc-mode'\);/.test(NAV));
  ok('★★★ 收合狀態與側欄內容一起清（不然下次開回桌機是半殘的）',
     /document\.body\.classList\.remove\('mc-collapsed'\);/.test(NAV)
     && /const _mc=document\.getElementById\('mc-sidebar'\); if\(_mc\) _mc\.innerHTML='';/.test(NAV));
  ok('★★★ 根因寫在原地：mc-mode 全檔只有 renderLeftSidebar 會開關，手機那幾條路不呼叫它',
     /body\.mc-mode 全檔只有 renderLeftSidebar 會開關，而下面那幾條手機的路\s*\n\s*從來不呼叫它/.test(src));
  ok('★★ 真的只有那一支在開關 mc-mode（根因描述不是憑空寫的）',
     (src.match(/classList\.toggle\('mc-mode'/g)||[]).length===1);
  ok('★★ 只在本來開著時才動，不要每次建導覽都寫一次 class',
     /只在「本來是開著」時才動 —— 不要每次建導覽都寫一次 class/.test(src));
}

console.log('\n③ 旋轉本來就有的那條線沒有被動到');
ok('★★ resize 與 orientationchange 都會重判版面並重繪',
   /window\.addEventListener\('resize', handleLayoutModeChange\);/.test(src)
   && /window\.addEventListener\('orientationchange', \(\)=>\{ setTimeout\(handleLayoutModeChange, 120\); \}\);/.test(src));
ok('★★ 模式沒變就不動作（避免每一次 resize 都整頁重繪）',
   /if\(nowMobile === _lastMobileLayout\) return;/.test(src));
ok('★★ 重判時會重建導覽列 —— 上面那個清理才有機會跑到',
   /if\(typeof buildNav==='function' && SESSION\)\{ try\{ buildNav\(\); \}catch\(_\)\{\} \}/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
