/* 2026-08-04 讀取量優化第一批（使用者指示：「一批批調整，調整前確認不會弄壞」）

   bookings 46 欄 × 5,708 筆＝整表 JSON 6.4 MB，而 25 個頁面都在抓它。
   列表讀取改成不搬那 9 個「全程式碼從沒被引用」的欄位（實測 6,392 KB → 5,076 KB）。

   這支測試就是那句「確認不會弄壞」：
   ① 逐一重驗那 9 個欄位真的沒有任何地方在用 —— 哪天有人開始用，這裡會先紅燈
   ② 欄位清單是「從回傳資料學來的」，不是寫死的（資料庫加欄位不會讀不到）
   ③ 單筆讀取仍是全欄位
   ④ 寫入護欄：列表物件回寫時會先補齊，不可能把沒抓的欄位寫成 null */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');

let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const grabFn=n=>{const i=src.indexOf('function '+n+'(');if(i<0)return'';let d=0;for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}return'';};

// 程式裡宣告的精簡名單（唯一真相來源，改了這裡測試就跟著驗新的）
const DROP=(()=>{
  const m=/const LEAN_DROP=\{ bookings:\[([^\]]*)\]/.exec(src);
  return m ? m[1].split(',').map(s=>s.trim().replace(/^'|'$/g,'')).filter(Boolean) : [];
})();

console.log('① 被精簡掉的欄位，程式裡真的沒人用');
{
  ok('★ 名單讀得到（9 欄）', DROP.length===9, DROP);
  /* 把 LEAN_DROP 這一段本身挖掉再掃，否則名單自己會匹配到自己 */
  const body=src.replace(/const LEAN_DROP=\{[\s\S]*?\]\s*\};/,'');
  DROP.forEach(c=>{
    const re=new RegExp('[.\'"\\[]'+c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b');
    ok('　　'+c+' 沒有任何引用', !re.test(body));
  });
}

console.log('\n② 欄位清單是「學」來的，不是寫死的');
{
  const f=grabFn('leanLearn');
  ok('★ 從實際回傳的資料列取欄位（DB 加欄位會自動被學進來）',
     /Object\.keys\(row\)\.filter\(c=>drop\.indexOf\(c\)<0\)/.test(f));
  ok('★ 只在「有東西可扣」時才記（沒學到就照舊全欄位）',
     /cols\.length && cols\.length<Object\.keys\(row\)\.length/.test(f));
  const g=grabFn('_dbGetAllFresh');
  ok('★ 沒學到之前用 select(\'*\')，且趁首抓學起來',
     /const _sel=_leanSel\.get\(tbl\(store\)\)\|\|'\*';/.test(g)
     && /if\(_sel==='\*' && first && first\.data && first\.data\[0\]\) leanLearn\(store, first\.data\[0\]\);/.test(g));
  ok('　　只有列在 LEAN_DROP 的表會精簡（其他表完全不變）',
     /const key=tbl\(store\), drop=LEAN_DROP\[key\];\n\s*if\(!drop \|\| !row \|\| _leanSel\.has\(key\)\) return;/.test(f));
}

console.log('\n③ 單筆讀取維持全欄位（編輯流程的來源）');
{
  const f=grabFn('dbGet');
  ok('★ dbGet 仍是 select(\'*\')', /sb\.from\(tbl\(store\)\)\.select\('\*'\)\.eq\('id',id\)/.test(f));
  ok('　　順便當學習來源', /if\(data\) leanLearn\(store, data\);/.test(f));
}

console.log('\n④ 寫入護欄：不可能把沒抓的欄位寫成 null');
{
  const f=grabFn('dbPut');
  ok('★ 缺欄位就先撈完整資料合併再寫',
     /const _lean=obj&&obj\.id\?LEAN_DROP\[tbl\(store\)\]:null;/.test(f)
     && /if\(_lean && _lean\.some\(c=>!\(c in obj\)\)\)/.test(f)
     && /const full=await dbGet\(store,obj\.id\); if\(full\) obj=Object\.assign\(\{\},full,obj\);/.test(f));
  ok('★ 合併順序是「完整資料在前、呼叫端的改動在後」（改動不會被蓋掉）',
     /Object\.assign\(\{\},full,obj\)/.test(f));
  ok('　　新建的資料撈不到 → 照原樣寫（不擋新增）', /if\(full\)/.test(f));
  ok('　　撈不到／出錯不擋寫入', /catch\(_\)\{\}/.test(f));
}

console.log('\n⑤ 少變動設定表的快取拉長');
{
  ok('★ 票種／方案／場地／動作庫 5 分鐘',
     /const DB_CACHE_TTL_BY=\{ticket_types:300000,course_plans:300000,exercises:300000,venues:300000\};/.test(src));
  ok('　　寫入直改快取（自己改的立刻看得到、不整表重抓，2026-08-05）', /dbCacheApply\(store, data\|\|obj\);/.test(src));
  ok('　　分頁隱藏 15 秒回來全清（跨裝置補償）',
     /else if\(_hidAt && Date\.now\(\)-_hidAt>15000\)\{ dbCacheClear\(\); \}/.test(src));
}

/* ⑥ 實跑：把資料層四支函式抓出來，配一個假的 sb 真的跑一遍。
   靜態比對只證明「程式碼長這樣」，這一段才證明「跑起來是對的」。 */
console.log('\n⑥ 實跑資料層（假 sb）：學欄位 → 精簡讀 → 回寫不掉資料');
{
  const FULL={id:'BK-1',date:'2026-08-04',status:'booked',member_id:'M1',note:'原本的備註',
    import_ref:'IMPB-B123',makeup_status:'none',checkin_source:'qr',space_id:'S1',resource_id:'R1',
    is_substitute:false,original_coach_id:'C0',actor_user_id:'U1',operator_employee_id:'E1'};
  const DB={'BK-1':Object.assign({},FULL)};
  let lastUpsert=null, selUsed=[];
  const sb={ from:()=>({
    select(sel){ selUsed.push(sel);
      const pick=r=>sel==='*'?Object.assign({},r):Object.fromEntries(sel.split(',').map(c=>[c,r[c]]));
      const rows=Object.values(DB).map(pick);
      const api={ range:()=>Promise.resolve({data:rows,error:null}),
        eq:()=>({ maybeSingle:()=>Promise.resolve({data:rows[0]?Object.assign({},DB['BK-1']):null,error:null}) }),
        maybeSingle:()=>Promise.resolve({data:lastUpsert,error:null}) };
      return api; },
    upsert(obj){ lastUpsert=obj; DB[obj.id]=Object.assign({},DB[obj.id],obj);
      return { select:()=>({ maybeSingle:()=>Promise.resolve({data:lastUpsert,error:null}) }) }; }
  })};
  const env={sb, tbl:s=>s, dbFriendlyError:e=>new Error(String(e)), dbCacheClear:()=>{}, dbCacheApply:()=>{}, mchgNotify:null,
    LEAN_DROP:{bookings:DROP}, _leanSel:new Map()};
  const code=['leanLearn','_dbGetAllFresh','dbGet','dbPut'].map(n=>{
    const s=grabFn(n); return /^\s*$/.test(s)?'':(src.indexOf('async function '+n+'(')>=0?'async ':'')+s;
  }).join('\n');
  const api=new Function(...Object.keys(env), code+'\nreturn {leanLearn,_dbGetAllFresh,dbGet,dbPut,_leanSel};')(...Object.values(env));

  (async()=>{
    const first=await api._dbGetAllFresh('bookings');
    ok('★ 第一次讀：用 select(\'*\')（還沒學過）', selUsed[0]==='*');
    ok('　　拿到完整資料', Object.keys(first[0]).length===Object.keys(FULL).length);
    const lean=api._leanSel.get('bookings');
    ok('★ 學到精簡清單，且不含那 9 欄', !!lean && DROP.every(c=>lean.split(',').indexOf(c)<0));
    ok('　　該有的欄位一個都沒少', ['id','date','status','member_id','note'].every(c=>lean.split(',').indexOf(c)>=0));

    selUsed.length=0;
    const rows=await api._dbGetAllFresh('bookings');
    ok('★ 第二次讀：改用精簡欄位', selUsed[0]===lean && selUsed[0]!=='*');
    ok('　　列表物件確實少了那 9 欄（這就是省下來的量）', DROP.every(c=>!(c in rows[0])));

    // 最危險的情境：從列表拿物件改一改直接回寫
    const fromList=rows[0];
    fromList.note='改過的備註';
    await api.dbPut('bookings', fromList);
    ok('★★ 回寫後，沒抓回來的欄位原封不動（護欄生效）',
       DB['BK-1'].import_ref==='IMPB-B123' && DB['BK-1'].makeup_status==='none'
       && DB['BK-1'].space_id==='S1' && DB['BK-1'].actor_user_id==='U1',
       {import_ref:DB['BK-1'].import_ref, makeup_status:DB['BK-1'].makeup_status});
    ok('★★ 這次的改動有寫進去', DB['BK-1'].note==='改過的備註');
    ok('　　upsert 送出的是補齊後的完整資料', DROP.every(c=>c in lastUpsert));

    // 新建：撈不到舊資料也要寫得進去
    await api.dbPut('bookings', {id:'BK-NEW', date:'2026-08-10', status:'booked'});
    ok('　　新建資料不受影響', !!DB['BK-NEW'] && DB['BK-NEW'].date==='2026-08-10');

    console.log('\n'+(fail?'✗ ':'✓ ')+pass+' 通過 / '+fail+' 失敗');
    process.exit(fail?1:0);
  })();
}
