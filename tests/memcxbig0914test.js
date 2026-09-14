/* 會員端取消視窗的銀髮友善改版（2026-09-14 使用者：「是不是有更適合銀髮族的方式
   視窗大一點 資訊少一點 選項單純一點」）——先做這一組，最短也最常用。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),{得到:a,預期:e});
const fnBody=name=>{ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('找不到 '+name);
  let d=0,st=false; for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{'){d++;st=true;} else if(src[k]==='}'){ d--; if(st&&!d) return src.slice(i,k+1); } } };

console.log('① 「哪一堂」寫成長輩看得懂的一行');
{
  const env=new Function('parseYmd','timeToMin','WD','QB_PERIODS', fnBody('memWhenText')+'\nreturn memWhenText;')(
    s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);},
    t=>Number(String(t).split(':')[0])*60+Number(String(t).split(':')[1]),
    ['日','一','二','三','四','五','六'],
    {am:{s:540},pm:{s:720},night:{s:1080}});
  /* 2026-09-14 是週一（9/13 才是週日，見行事曆） */
  eq('★★★ 早上 → 上午', env('2026-09-14','10:00'), '9/14（一）上午 10:00');
  eq('★★★ 中午過後 → 下午', env('2026-09-15','14:30'), '9/15（二）下午 14:30');
  eq('★★★ 18 點以後 → 晚上', env('2026-09-16','19:00'), '9/16（三）晚上 19:00');
  eq('★★ 不寫年份、不寫結束時間（fmtRange 那套對長輩太長）', env('2026-09-14','10:00').indexOf('2026'), -1);
  ok('★★ 上午／下午的切法沿用 QB_PERIODS，不另立一套',
     /mm<QB_PERIODS\.pm\.s\?'上午':\(mm<QB_PERIODS\.night\.s\?'下午':'晚上'\)/.test(fnBody('memWhenText')));
}

console.log('\n② 兩張取消視窗：資訊少、選項單純');
const SELF=fnBody('memCancelSelf'), GRP=fnBody('memLeaveGroup');
ok('★★★ 自主訓練：大字一行＋只留「會退回 1 點」',
   /<p class="mcx-when">\$\{memWhenText\(b\.date,b\.start_time\)\}<span>自主訓練<\/span><\/p>/.test(SELF)
   && /<div class="mk-key green">會退回 1 點<\/div>/.test(SELF));
/* ⚠ 這一條我一開始寫錯了：原本主張「7 天效期那句拿掉」，但 cancelwarntest 釘著它，
   而且理由成立 —— 取消本身不扣點，**真正會損失的就是點數只有 7 天**。所以保留事實，
   只改呈現：從綠框裡的小字改成 .mk-pts 一行短句（0911 定的「規則只列重點」）。 */
ok('★★★ 效期提醒留著，但從綠框小字改成條列一行',
   /<ul class="mk-pts"><li>點數本身有 7 天效期，過期就不能用了<\/li><\/ul>/.test(SELF)
   && !/cx-note/.test(SELF)
   && !/opacity:\.85;margin-top:4px/.test(SELF));
ok('★★★ 團體課：同一套版面，但「這堂課照常開課」要留著',
   /<p class="mcx-when">\$\{memWhenText\(b\.date,b\.start_time\)\}<span>團體課<\/span><\/p>/.test(GRP)
   && /只取消您的名額，這堂課照常開課/.test(GRP));
/* 0914 稍晚：memEditAsk（更改二選一）也用同一套版面，所以 mcx-foot 變成三處 */
ok('★★★ 兩張都是上下排、確定在上、返回在下寫「先不要」',
   (src.match(/<div class="modal-foot mcx-foot">/g)||[]).length===3
   && /<button class="btn btn-danger" onclick="doMemCancelSelf\('\$\{id\}'\)">確定取消<\/button>\s*\n\s*<button class="btn btn-ghost" onclick="closeModal\(\)">先不要<\/button>/.test(SELF)
   && /<button class="btn btn-danger" onclick="doMemLeaveGroup\('\$\{id\}'\)">確定取消<\/button>\s*\n\s*<button class="btn btn-ghost" onclick="closeModal\(\)">先不要<\/button>/.test(GRP));
ok('★★ 標題改成動作本身（取消預約／取消報名）',
   /<div class="modal-title">取消預約<\/div>/.test(SELF) && /<div class="modal-title">取消報名<\/div>/.test(GRP));

console.log('\n③ 放大只掛在會員端這兩張，櫃檯不受影響');
ok('★★★ 用 .mcx 這個旗標開啟放大，不是改全域 .modal',
   /\.modal:has\(\.mcx\) \.modal-title\{font-size:22px;font-weight:900;/.test(src)
   && (src.match(/<div class="mcx"><\/div>/g)||[]).length===3);   // 取消 ×2 ＋ 更改二選一 ×1
ok('★★★ 按鈕 56px／17px、整列寬', /\.modal-foot\.mcx-foot \.btn\{flex:0 0 auto;width:100%;min-height:56px;font-size:17px;/.test(src));
ok('★★★ 直排時要把 flex:1 1 auto 改掉（手機那條會變成分配高度，按鈕忽高忽低）',
   /\.modal-foot \.btn 在手機斷點是 flex:1 1 auto（橫向分配寬度），改直排後那條會變成/.test(src));
ok('★★ 櫃檯的取消視窗沒有被動到（仍是左右並排的 .modal-foot）',
   /<div class="modal-foot" style="flex-wrap:wrap;gap:8px;">/.test(src));

console.log('\n'+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
