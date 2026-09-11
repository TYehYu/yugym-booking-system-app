/* 會員自主訓練：跑步機人數顯示＋自己改場地（2026-09-11 使用者）
   「剛剛有會員來問 他手機端看不到跑步機預約是幾個人 … 1人也要顯示
     然後點自主訓練課卡的時候要能夠修改場地 包含跑步機使用的數量」（三選一挑「會員自己在手機改」）
   「每一個按鈕的副標 都靠右 更改場地·更改跑步機人數」 */
const fs=require('fs');
const root=process.env.HOME+'/Projects/yugym-booking-system-app/';
const src=fs.readFileSync(root+'index.html','utf8');
const sql=fs.readFileSync(root+'docs/migrations/20260911_member_self_venue.sql','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const fn=name=>{ const i=src.indexOf('function '+name+'('); if(i<0) return ''; let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){ d--; if(!d) return src.slice(i,k+1); } } };

console.log('① 跑步機 1 人也要顯示');
ok('★★★ 會員點開課卡（兩個入口）都寫「跑步機・N 人」，1 人也寫',
   (src.match(/if\(!b\.coach_id && bkIsSelf\(b\) && selfVenueLabel\(b\)==='跑步機'\) who\+=`・\$\{await bkUnitCount\(b\)\} 人`;/g)||[]).length===2);
ok('★★ 人數用 bkUnitCount 實際去數（單筆 dbGet 身上沒有 _units）', /單筆 dbGet 身上沒有 _units，bkUnitCount 自己去數同行的第 2 台/.test(src));
ok('★★ 櫃檯簡易課卡標題：跑步機 1 人也寫', /const _unitTxt = String\(b\.venue_unit\|\|''\)\.startsWith\('treadmill'\) \? `・\$\{_units\} 人` : \(_units>1 \? ` ×\$\{_units\}` : ''\);/.test(src));

console.log('\n② 會員自己改場地：入口');
ok('★★★ 兩個會員課卡都多一顆「場地」，條件跟「更改時間」一樣',
   /let vnBtn=\(selfServe && _isSelfBk && b\.member_id===SESSION\.id\)\s*\n\s*\? orb\('go','📍','場地'/.test(src)
   && /let vnBtn=\(!done && !past && bkIsSelf\(b\) && b\.member_id===SESSION\.id\)\s*\n\s*\? orb\('go','📍','場地'/.test(src));
ok('★★ 排在「更改時間」旁邊（兩處）', (src.match(/<div class="mtp-orbs">\$\{ckBtn\}\$\{rsBtn\}\$\{vnBtn\}\$\{cxBtn\}<\/div>/g)||[]).length===2);
ok('★★ 待付款鎖住、範例課卡都不給', /rsBtn=''; cxBtn=''; vnBtn='';/.test(src) && /rsBtn=''; vnBtn='';\s*\n\s*cxBtn=orb\('cx','✕','取消',_dtap\);/.test(src));

console.log('\n③ 會員自己改場地：視窗');
const O=fn('memVenueOpen'), R=fn('memVenueRender'), SV=fn('_memVenueSave');
ok('★★★ 每個場地先用 validateBooking＋venue_pref 探一次（跟櫃檯 openVenueChange 同一個探法），滿的標出來',
   /const probe=\{\.\.\.b, venue_pref:v\.id\};/.test(O) && /validateBooking\(probe,b\.date,b\.start_time,b\.duration\|\|60,\{skipBizHours:true\}\)/.test(O)
   && /（該時段已滿）/.test(R));
ok('★★ 只列自主訓練能用的三個場地', /const MEM_VENUES=\['multi','group','treadmill'\];/.test(src));
ok('★★★ 選跑步機才出現 1 人／2 人', /\$\{S\.pick==='treadmill'\?`<div class="wpe-row"/.test(R) && /\[1,2\]\.map\(n=>/.test(R));
ok('★★★ 寫入走 RPC（會員沒有 bookings 寫入權）', /sb\.rpc\('fn_member_self_venue',\{p_booking_id:S\.bid, p_venue_unit:o\.unit\|\|S\.pick, p_units:want\}\)/.test(SV));
ok('★★ 另一台被約走 → 照實講只保留 1 人', /want>got\?'（另一台被約走了，只保留 1 人）'/.test(SV));
ok('★★ 什麼都沒改就直接關掉，不打 RPC', /if\(o\.cur && \(S\.pick!=='treadmill' \|\| S\.units===S\.curUnits\)\)\{ closeModal\(\); return; \}/.test(SV));
ok('★ 防連點＋寫完清快取', /return onceAct\('mvn:'\+S\.bid, _memVenueSave\);/.test(src) && /dbCacheClear\(\['bookings'\]\); try\{ occCacheClear\(\); \}catch\(_\)\{\}/.test(SV));

console.log('\n④ DB 函式（docs/migrations/20260911_member_self_venue.sql）');
ok('★★★ security definer＋驗本人、自主訓練、booked、還沒開始、只能從主預約改',
   /security definer/.test(sql) && /b\.member_id is distinct from v_mid/.test(sql) && /b\.category::text <> '自主訓練' or b\.status::text <> 'booked'/.test(sql)
   && /<= now\(\) then\s*\n\s*return jsonb_build_object\('ok',false,'error_code','BOOKING\.TOO_LATE'\)/.test(sql) && /b\.sibling_of is not null/.test(sql));
ok('★★★ 先收同行第 2 台，再擋「那一台被別人佔」，擋到就 raise（收掉的一起復原）',
   sql.indexOf("update bookings set status='cancelled' where sibling_of=b.id")>0
   && sql.indexOf("update bookings set status='cancelled' where sibling_of=b.id") < sql.indexOf("raise exception 'BOOKING.RESOURCE_BUSY'"));
ok('★★★ 第 2 台照 fn_member_self_book：不扣點、台數不信任前端、自己找空的', /'同行使用（跑步機）・不另外扣點'/.test(sql) && /for v_i in 1\.\.v_cap loop/.test(sql) && !/sessions_remaining/.test(sql));
ok('★★ 通知櫃檯', /desk_alert\(v_mid,'self_move','　自行改了自主訓練的場地'/.test(sql));
ok('★ 給 authenticated 執行權', /grant execute on function public\.fn_member_self_venue\(text, text, integer\) to authenticated;/.test(sql));

console.log('\n⑤ 調整課程：副標靠右、場地那列寫能做什麼');
ok('★★★ 這張清單每一列都掛 .ash-ei-r，副標靠右', /class="ash-eirow ash-ei-r\$\{cls\?' '\+cls:''\}"/.test(src) && /\.ash-eirow\.ash-ei-r \.ash-eisub\{align-self:stretch;text-align:right;\}/.test(src));
ok('★★ 自主訓練：更改場地・更改跑步機人數；其他課別：更改場地', /,'更換場地','更改場地・更改跑步機人數'\);/.test(src) && /,'更換場地','更改場地'\);/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
