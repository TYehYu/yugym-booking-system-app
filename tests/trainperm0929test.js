/* 會員資料的訓練紀錄：櫃檯看不到（2026-09-29）

   使用者：「會員資料的訓練紀錄　如果沒有權限可以看　可以隱藏　櫃檯應該都不能查看」

   ⚠ 只藏入口不等於藏資料 —— 櫃檯的 RLS 本來就讀不到 training_logs
     （tlog_select_scoped 沒有給 is_staff_desk），所以這是把「點了也是空的」那條死路收掉。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,e)=>ok(n,JSON.stringify(a)===JSON.stringify(e),`得到 ${JSON.stringify(a)}，預期 ${JSON.stringify(e)}`);
const grab=n=>{let i=src.indexOf('function '+n+'(');
  let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}};

console.log('① 誰看得到');
{
  const F=grab('ppCanSeeTrain');
  const run=ses=>new Function('SESSION', F+'\nreturn ppCanSeeTrain();')(ses);
  eq('★★★ 櫃檯看不到（使用者指名的那一個）', run({role:'front_desk'}), false);
  eq('★★★ 管理員看得到（出事時要查得到）', run({role:'admin'}), true);
  eq('★★★ 教練看得到（資料庫那側只給他自己帶的）', run({role:'coach'}), true);
  eq('★★ 會員身分不走這一頁', run({role:'member'}), false);
  eq('　 沒登入不會爆', run(null), false);
  /* ⚠ 店長是 coach＋is_manager，仍然看得到 —— 他是教練身分 */
  eq('★★ 主管（教練兼）看得到', run({role:'coach',is_manager:true}), true);
}

console.log('\n② 三道一起擋');
ok('★★★ 分頁鈕不畫', /\.concat\(ppCanSeeTrain\(\)\?\[\['training','訓練紀錄'\]\]:\[\]\)/.test(src));
/* ⚠ 只擋畫面不夠：深連結／主控台／別處的程式碼仍可能帶 'training' 進來 */
ok('★★★ 直接呼叫 ppShowRecord("training") 也擋',
   /if\(kind==='training' && !ppCanSeeTrain\(\)\) return;/.test(src));
ok('★★★ 停在看不到的分頁要退回票券（不然是一片空白）',
   /if\(PP\.recView==='training' && !ppCanSeeTrain\(\)\) PP\.recView='tickets';/.test(src));

console.log('\n③ 理由寫在原地');
ok('★★ 為什麼櫃檯不給看（訓練紀錄是教練與學員之間的東西）',
   /訓練紀錄是教練與學員之間的東西/.test(src));
ok('★★ 資料庫那一側本來就擋著，這裡只是收掉死路',
   /tlog_select_scoped 沒有給 is_staff_desk/.test(src));

console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
process.exit(fail?1:0);
