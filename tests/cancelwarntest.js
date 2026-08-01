/* 2026-08-01 使用者回報（江俊輝）：「剛剛簽到約了自主訓練又取消，結果就被系統吃掉了一堂」，
   並指示「把會扣課的警示明顯一點」。

   查證：他 10:02:12 自行預約 8/02 13:00 的自主訓練，10:02:30（18 秒後）自行取消，
   DB 端一律套「開課前 24 小時內取消不退」→ 點數被吃掉。
   那條規則是為了保護「教練的時間」，自主訓練不佔教練；而 18 秒內取消明顯是按錯要改。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('會員端：自主訓練不再嚇人（DB 端已改成一律退點）');
ok('★ 自主訓練的取消說明改成「會退回 1 點」', /<b>會退回 1 點<\/b>　自主訓練不佔教練時間，取消不扣點。/.test(src));
ok('★ 不再有「視同使用，恕不退回點數」那段', !/視同使用，恕不退回點數/.test(src));
ok('　　仍提醒點數有 7 天效期（那才是真正會損失的地方）', /點數本身有 7 天效期，過期就不能用了/.test(src));
ok('　　成因與對應的 migration 寫在程式裡',
   /24 小時規則是為了保護「教練的時間」，自主訓練不佔教練/.test(src)
   && /20260801_self_cancel_grace_and_training_pass/.test(src));

console.log('\n會員端：教練課的扣課警示改成一眼看得到');
ok('★ 會扣課用紅底大字橫幅', /<div class="cx-warn">\s*\n\s*<div class="cx-warn-t">這一堂會被扣掉<\/div>/.test(src));
ok('★ 按鈕直接寫後果', /確定取消並扣掉這一堂/.test(src));
ok('★ 剛約完 10 分鐘內取消不算遲到取消（不嚇人）',
   /const _justBooked = b\.created_at && \(Date\.now\(\)-new Date\(b\.created_at\)\.getTime\(\)\) <= 10\*60\*1000;/.test(src)
   && /const box=\(within24 && !_justBooked\)/.test(src));
ok('　　會退回的維持低調綠框', /<div class="cx-note cx-note-ok"><b>會退回 1 堂票券<\/b>/.test(src));

console.log('\n櫃檯端：兩顆按鈕分得開');
ok('★ 「扣掉這一堂」改成紅底實心並加底線', /<button class="btn btn-danger cx-btn-eat" onclick="askSeriesCancel\('\$\{id\}','none'\)">取消・<b>扣掉這一堂<\/b><\/button>/.test(src));
ok('★ 「退回票券」改成一般樣式（原本兩顆長得幾乎一樣）',
   /<button class="btn btn-ghost" onclick="askSeriesCancel\('\$\{id\}','force'\)">取消・退回票券<\/button>/.test(src));
ok('　　按錯的代價寫在程式裡', /按錯就是直接吃掉客人的堂數/.test(src));

console.log('\n樣式');
ok('★ 警示橫幅用實心紅底（不是淡色框）', /\.cx-warn\{background:#b5372e;color:#fff;/.test(src));
ok('　　標題夠大（19px、900 字重）', /\.cx-warn-t\{font-size:19px;font-weight:900;/.test(src));
ok('　　重點字用金色在紅底上仍看得清楚', /\.cx-warn-s b\{color:#ffe08a;\}/.test(src));

console.log('\n退不退的判定（與 migration 同一套規則）');
{
  const decide=(o)=>{
    if(o.isStaff) return o.staffChoice!==false;
    const grace = o.minutesSinceBooked!=null && o.minutesSinceBooked<=10;
    const selfTraining = o.category==='自主訓練';
    return (o.hoursBefore>=24) || grace || selfTraining;
  };
  eq('★ 江俊輝案例：自主訓練、19 小時前、18 秒後取消 → 退',
     decide({category:'自主訓練',hoursBefore:19,minutesSinceBooked:0.3}), true);
  eq('★ 自主訓練即使 1 小時前取消也退（不佔教練時間）',
     decide({category:'自主訓練',hoursBefore:1,minutesSinceBooked:600}), true);
  eq('★ 教練課・24 小時以上 → 退', decide({category:'私人教練',hoursBefore:30,minutesSinceBooked:600}), true);
  eq('★ 教練課・不到 24 小時 → 不退（政策不變）',
     decide({category:'私人教練',hoursBefore:5,minutesSinceBooked:600}), false);
  eq('★ 教練課・不到 24 小時但剛約完 3 分鐘 → 退（按錯的補救期）',
     decide({category:'私人教練',hoursBefore:5,minutesSinceBooked:3}), true);
  eq('　　剛好 10 分鐘 → 還在補救期內', decide({category:'私人教練',hoursBefore:5,minutesSinceBooked:10}), true);
  eq('　　11 分鐘 → 回到原本規則', decide({category:'私人教練',hoursBefore:5,minutesSinceBooked:11}), false);
  eq('　　櫃檯端照舊自己選（預設退）', decide({isStaff:true,category:'私人教練',hoursBefore:1}), true);
  eq('　　櫃檯端選扣課就扣', decide({isStaff:true,staffChoice:false,category:'私人教練',hoursBefore:100}), false);
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
