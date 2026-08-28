/* 08:00 建立預約會噴錯（2026-08-28 使用者回報）

   「剛剛有教練反應　預約早上8:00的時候　會出現錯誤訊息」
   「我用桌機預約出現的」「桌機行事曆新增預約」「太快消失我截不到」

   成因鏈（每一環都在下面驗）：
     ① showModal 是「單一彈窗」——開新的之前會先把現有的 .modal-bg 整個 remove
     ② submitBooking 是從「新增預約」那張彈窗裡跑起來的
     ③ 08:00 早於開店（09:00）→ 觸發 confirmOffHours，它原本用 showModal
        → 表單被拆掉
     ④ 回到 submitBooking 後 `document.getElementById('bk-member').value`
        → null.value → TypeError → 最外層 catch → 一閃即逝的紅吐司
   09:00–21:00 不會觸發 confirmOffHours，所以只有非營業時間的時段會炸 ——
   這正是「只有 8:00 有問題」的原因。

   修法：confirmOffHours／confirmVenueOverflow 改走獨立浮層 bkAskOverlay，
   不碰 .modal-bg。openBkFamPickNew 早在 0803 就因為同一個理由這樣做了。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);

console.log('① 前提：showModal 真的是「單一彈窗」（這是整條錯誤鏈的第一環）');
{
  ok('★★ showModal 開新的之前會移除所有 .modal-bg',
     /document\.querySelectorAll\('\.modal-bg'\)\.forEach\(el=>el\.remove\(\)\); \/\/ 單一彈窗/.test(src));
  ok('★★ submitBooking 確實是從彈窗裡跑起來、而且之後還要讀表單',
     /const _mEl=document\.getElementById\('bk-member'\);/.test(src)
     && src.indexOf("async function _submitBookingInner(){") < src.indexOf("const _mEl=document.getElementById('bk-member');"));
}

console.log('\n② 兩個中途確認框都不再用 showModal');
{
  /* 只切到「下一個 function 宣告」為止 —— 切太多會把後面別支的 showModal 算進來 */
  const seg=a=>{ const i=src.indexOf(a); const j=src.indexOf('\nfunction ', i+10); return src.slice(i, j>0?j:i+1400); };
  const off=seg('function confirmOffHours(ds, time, dur, actLabel, cat){');
  const ven=seg('function confirmVenueOverflow(vbk, noLabel){');
  ok('★★ confirmOffHours 走 bkAskOverlay，完全沒有 showModal／closeModal',
     /return bkAskOverlay\(/.test(off) && !/showModal\(/.test(off) && !/closeModal\(/.test(off));
  ok('★★ confirmVenueOverflow 同樣',
     /return bkAskOverlay\(/.test(ven) && !/showModal\(/.test(ven) && !/closeModal\(/.test(ven));
  ok('★★ 兩支的 window._ohYes／_venueOvYes 全域旗標一併退場（那是 onclick 字串時代的東西）',
     !/_ohYes|_ohNo|_venueOvYes|_venueOvNo/.test(src));
  ok('★★ 浮層自己只 remove 自己 —— 絕對不能呼叫 closeModal（那會關掉底下的表單）',
     /const fin=v=>\{ if\(done\) return; done=true; try\{ ov\.remove\(\); \}catch\(_\)\{\} resolve\(v\); \};/.test(src)
     && /絕對不要呼叫 closeModal\(\)/.test(src));
  ok('★ 蓋在彈窗之上（z-index 9860 > modal-bg 9750），與 openBkFamPickNew 同一層',
     /z-index:9860/.test(src)
     && (src.match(/z-index:9860/g)||[]).length>=2);
  ok('★★ 成因寫在原地（下次不要又在 submitBooking 中途開 showModal）',
     /showModal 是「單一彈窗」，開新的之前會先/.test(src)
     && /08:00 早於開店（09:00）會觸發\s*\n\s*confirmOffHours，而 09:00–21:00 不會，所以只有非營業時間的時段會炸。/.test(src));
}

console.log('\n③ 實跑：浮層不會動到 .modal-bg，而且會照按鈕回值');
{
  const seg=src.slice(src.indexOf('function bkAskOverlay(bodyHtml, yesLabel, noLabel){'),
                      src.indexOf('function confirmVenueOverflow(vbk, noLabel){'));
  /* 極簡假 DOM：只要能記錄 appendChild／remove，並讓 click 監聽跑起來 */
  const mk=()=>{
    const listeners=[];
    const node={id:'', style:{cssText:''}, innerHTML:'', _removed:false,
      addEventListener:(k,fn)=>{ if(k==='click') listeners.push(fn); },
      remove(){ this._removed=true; }, listeners};
    return node;
  };
  let created=null, appended=[], modalBgTouched=false;
  const doc={
    getElementById:()=>null,
    createElement:()=>{ created=mk(); return created; },
    querySelectorAll:()=>{ modalBgTouched=true; return []; },
    body:{ appendChild:n=>appended.push(n) }
  };
  const run=(answer)=>{
    created=null; appended=[]; modalBgTouched=false;
    const f=new Function('document','escH', seg+'\nreturn bkAskOverlay;')(doc, x=>String(x));
    const p=f('<div>x</div>','要','不要');
    const btn={ getAttribute:k=>k==='data-a'?answer:null, closest:()=>btn };
    created.listeners[0]({ target:{ closest:()=>btn } });
    return p;
  };
  return (async()=>{
    eq('★★ 按「要」回 true', await run('yes'), true);
    eq('★★ 按「不要」回 false', await run('no'), false);
    ok('★★ 從頭到尾沒有碰過 .modal-bg（表單活著）', !modalBgTouched);
    ok('★★ 浮層掛在 document.body（不是塞進彈窗裡，彈窗被關就跟著沒了）', appended.length===1);
    ok('★ 回答過就不再回答第二次（done 旗標；點背景與按鈕不會打架）',
       /let done=false;/.test(seg) && /if\(done\) return; done=true;/.test(seg));

    console.log('\n④ 護欄：表單真的不在時要講人話，不要丟 TypeError');
    {
      ok('★★ bk-member 先取元素再讀值，取不到就明說',
         /const _mEl=document\.getElementById\('bk-member'\);\s*\n\s*if\(!_mEl\)\{ showToast\('預約表單已經關閉了，請重新開啟「新增預約」', 6000\); return; \}\s*\n\s*const member_id=_mEl\.value;/.test(src));
      ok('★★ 體驗課的姓名欄同一套（手機欄改用 ?. ）',
         /const _tnEl=document\.getElementById\('bk-trial-name'\);/.test(src)
         && /document\.getElementById\('bk-trial-phone'\)\?\.value/.test(src));
      ok('　 護欄只是保險，根因已在 bkAskOverlay 修掉 —— 理由寫在原地',
         /根因已在 bkAskOverlay 修掉，這一層是防下一次有人又在中途開 showModal/.test(src));
      ok('★★ 失敗訊息留久一點（使用者：「太快消失我截不到」）',
         /showToast\('預約失敗：'\+\(e&&e\.message\?e\.message:e\), 9000\);/.test(src));
    }

    console.log('\n⑤ 規則本身沒有被改動（08:00 本來就該放行）');
    {
      ok('★★ 越線上限仍是營業時間前後各 1 小時', /const OFFHOURS_GRACE_MIN=60;/.test(src));
      ok('★★ 08:00 仍然只是「提示後可越線」，不是硬擋（硬擋是 07:30）',
         /if\(st>=lo && en<=hi\) return '';/.test(src)
         && /恰好 1 小時要放行（open-60 \/ close\+60 皆為合法邊界）/.test(src));
      ok('★★ 三種課別共用同一個入口，順序沒動（硬擋→會員擋→提示確認）',
         /const _ohBlk=bizOffHoursHardBlock\(date, time, 60\);[\s\S]{0,200}?const _selfBlk=bkSelfOffHoursBlock\(t&&t\.category, date, time, 60\);[\s\S]{0,120}?if\(!\(await confirmOffHours\(date, time, 60, '取消預約', t&&t\.category\)\)\) return;/.test(src));
      ok('★ 自主訓練仍多問一句「誰來開門」',
         /這個時間店裡沒有人。要排的話，請先確認有教練或櫃檯會到場幫學員開門。/.test(src));
    }

    console.log(`\n${pass} 通過 / ${fail} 失敗`);
    process.exit(fail?1:0);
  })();
}
