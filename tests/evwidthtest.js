/* 行事曆課卡的教練標籤：分級要吃「卡片真實寬度」，不能吃 JS 估的
   （2026-09-03 使用者附截圖，畫面上是「ND」「NGO」「RR」殘字）

   ⚠ 這不是樣式沒調好，是**分級用錯了輸入**：
       const colW=(window.innerWidth-80)/nDays;  const cardW=colW/lane.total;
       wCls = cardW<70 ? 'ev-w-tiny' : (cardW<90 ? 'ev-w-narrow' : '');
     那個 80 要涵蓋時間軸欄、容器內距、捲軸、每張卡自己的 left/right:3px。
     估寬了就把實際 52px 的卡判成「≥90px 顯示教練全名」，全名膠囊靠右排、
     寬 33–34px 蓋回卡片左半，正好壓在左下角那顆 16px 的簽到章底下 ——
     實測 RANDY 被蓋 12px（前 2 字）、MANGO 13px、BARRY 12px。
     短名（ZOE）剛好躲過，所以問題看起來時有時無。

   ⚠ 修法：@container 查卡片自己的寬度。.cal-ev.cal-ev-std 本來就有
     container-type:size，手機那套（.cag-wk-col 的 @container (max-width:62px)）
     0823 起就這樣做了，桌機這條路只是沒跟上。門檻沿用 90／70，行為不變。

   ⚠ 只有**教練標籤**改吃容器寬度。字級與場地那一列仍走 wCls ——
     那兩項估錯的後果只是字略大或多一列，不會像這裡一樣把字蓋掉。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

console.log('① 先歸零，再由容器查詢重新分段');
/* 不歸零的話，估錯的方向相反時（估成 tiny、其實很寬）教練名會平白消失。 */
ok('★★★ 三條歸零：不管 JS 加了什麼 class，都先當寬卡',
   /\.cal-ev\.cal-ev-std \.co-fl\{display:inline;\}\s*\n\s*\.cal-ev\.cal-ev-std \.co-ab\{display:none;\}\s*\n\s*\.cal-ev\.cal-ev-std \.evc-coach\{display:inline-flex;\}/.test(src));
ok('★★★ 90px 以下換兩字縮寫',
   /@container \(max-width:90px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.co-fl\{display:none;\}\s*\n\s*\.cal-ev\.cal-ev-std \.co-ab\{display:inline;\}\s*\n\s*\}/.test(src));
ok('★★★ 70px 以下整個不顯示',
   /@container \(max-width:70px\)\{\s*\n\s*\.cal-ev\.cal-ev-std \.evc-coach\{display:none;\}\s*\n\s*\}/.test(src));
ok('★★ 卡片本身要是查詢容器（沒有 container-type 的話整組不會生效）',
   /\.cal-ev\.cal-ev-std\{container-type:size;\}/.test(src));

console.log('\n② wCls 那兩份「藏教練」規則一定要拿掉');
/* 留著的話權重更高又更後面，會把上面的歸零蓋回去 —— 等於白改。
   ⚠ 有**兩份**（5121 與 601px 媒體查詢裡各一），只刪一份不會有任何效果。 */
{
  const noC=src.replace(/\/\*[\s\S]*?\*\//g,'');
  ok('★★★ 沒有任何 ev-w-* 規則再去藏教練標籤',
     !/ev-w-(narrow|tiny)\s+\.evc-coach\s*\{[^}]*display\s*:\s*none/.test(noC)
     && !/ev-w-(narrow|tiny)\s*,\s*\n?\s*[^{]*\.evc-coach\{display:none;\}/.test(noC));
  ok('★★★ 也沒有 ev-w-* 再去切換全名／縮寫',
     !/ev-w-(narrow|tiny)\s+\.co-(fl|ab)\b/.test(noC));
}
ok('★★ 場地那一列仍走 wCls（估錯只是多／少一列，不會蓋掉字）',
   /\.cal-ev\.cal-ev-std\.ev-w-narrow \.evc-vsub\{display:none;\}/.test(src)
   && /\.cal-ev\.cal-ev-std\.ev-w-tiny   \.evc-vsub\{display:none;\}/.test(src));
ok('★★ 為什麼只改教練這一項，寫在原地',
   /那兩項估錯的後果只是字略大或多一列，不會像這裡一樣把字蓋掉/.test(src));

console.log('\n③ 成因與實測數字寫在原地');
ok('★★★ 記下「分級用錯了輸入」而不是樣式問題',
   /實測後發現不是樣式沒調好，是\*\*分級用錯了輸入\*\*/.test(src));
ok('★★★ 記下被蓋掉幾 px（下次同樣症狀對得起來）',
   /RANDY 被蓋掉 12px（前 2 字）、MANGO 13px、BARRY 12px/.test(src));
ok('★★ 記下短名剛好躲過，所以問題時有時無',
   /短名（ZOE）剛好躲過，問題才時有時無/.test(src));
ok('★★ 記下手機那套早就這樣做了（不是新發明）',
   /手機那套（\.cag-wk-col 的\s*\n?\s*@container \(max-width:62px\)）0823 起就這樣做了，桌機這條路只是沒跟上/.test(src));

console.log('\n④ UI 實驗室已整組拆除');
ok('★★★ 兩間實驗室的程式都不在了',
   !/PAGES\.g_uilab/.test(src) && !/uilabShell/.test(src)
   && !/classList\.toggle\('uilab'/.test(src));
ok('★★★ 導覽沒有殘留項目', !/label:'UI 實驗室'/.test(src));
ok('★★★ 實驗樣式與提示條都不在了',
   !/\.uilab-bar/.test(src) && !/body\.uilab /.test(src));
ok('★★ 但「下次怎麼開一間」的作法留著（含拿掉前綴會掉權重這個坑）',
   /拿掉前綴上線時記得權重會從 \(0,5,1\) 掉到 \(0,4,1\)，/.test(src)
   && /可能打不過 body\.ink/.test(src));
ok('★★ 也記下哪些試出來留下、哪些被判定沒差別',
   /使用者看過實機後判定「兩個都沒什麼差別」，整組丟掉/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
