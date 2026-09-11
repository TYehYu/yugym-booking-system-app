/* 2026-09-11 使用者兩條（課表這個功能）：
   ①「只要能開課的教練　都要可以使用」
   ②「該課卡的負責教練　才可以看到課表的按鈕」
   從 index.html 抽出真正的判準函式實跑，名單照正式庫在職員工的身份組合排。 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };
const eq=(n,a,b)=>ok(n,a===b,{得到:a,預期:b});
const fn=name=>{ const m=src.match(new RegExp('function '+name+'\\([^)]*\\)\\{[^\\n]*\\n')); if(!m) throw new Error('找不到 '+name); return m[0]; };

let SESSION=null;
const env=new Function('getS', `
  ${fn('isCoachable')}${fn('isTeachable')}${fn('bkCoachId')}
  ${fn('tlCanLog').replace(/SESSION/g,'getS()')}
  ${fn('tlOwnsBk').replace(/SESSION/g,'getS()')}
  return {tlCanLog, tlOwnsBk};`)(()=>SESSION);
const as=s=>{ SESSION=s; };
/* 課表鈕畫不畫：兩處課卡都是 tlCanLog && tlOwnsBk（自主訓練另外擋） */
const btn=(s,b)=>{ as(s); return env.tlCanLog() && env.tlOwnsBk(b); };

const adminTeach ={role:'admin',id:'a1',can_teach:true};                    // 余東曄
const adminNoTeach={role:'admin',id:'a2',can_teach:false};                  // 劉怡秀
const mgrNoTeach ={role:'coach',id:'m1',can_teach:false,is_manager:true};   // 余東翰
const mgrTeach   ={role:'coach',id:'m2',can_teach:true, is_manager:true};   // 黃沛瀞
const coach      ={role:'coach',id:'c1',can_teach:true};
const coach2     ={role:'coach',id:'c2',can_teach:true};
const coachNoTeach={role:'coach',id:'c3',can_teach:false};                  // 羅威
const deskTeach  ={role:'front_desk',id:'f1',can_teach:true};               // 有肌1
const member     ={role:'member',id:'u1'};

console.log('① 能開課的人都能用');
[['一般教練',coach,true],['開課的管理員',adminTeach,true],['開課的店長',mgrTeach,true],
 ['舊帳號沒有 can_teach 欄位（預設開）',{role:'coach',id:'c9'},true],
 ['不開課的管理員',adminNoTeach,false],['不開課的店長',mgrNoTeach,false],['不開課的教練',coachNoTeach,false],
 ['★ 櫃檯就算開課開關是開的也不行',deskTeach,false],['會員',member,false],['沒登入',null,false]]
 .forEach(([n,s,want])=>{ as(s); eq('★★★ '+n+(want?' → 可以':' → 不行'), env.tlCanLog(), want); });

console.log('\n② 只有這堂的負責教練看得到課表鈕');
const bC1={coach_id:'c1'}, bA1={coach_id:'a1'}, bM2={coach_id:'m2'};
eq('★★★ 自己的課 → 看得到', btn(coach,bC1), true);
eq('★★★ 別的教練的課 → 看不到', btn(coach2,bC1), false);
eq('★★★ 管理員看別人的課 → 看不到（原本 own 恆為 true 所以看得到）', btn(adminTeach,bC1), false);
eq('★★★ 管理員自己帶的課 → 看得到', btn(adminTeach,bA1), true);
eq('★★★ 店長看別人的課 → 看不到', btn(mgrTeach,bC1), false);
eq('★★★ 店長自己帶的課 → 看得到', btn(mgrTeach,bM2), true);
eq('★★ 不開課的管理員什麼課都看不到', btn(adminNoTeach,bC1), false);
eq('★★ 不開課的店長什麼課都看不到', btn(mgrNoTeach,bC1), false);
const sub={coach_id:'c1',substitute_coach_id:'c2'};
eq('★★★ 代課：代課教練看得到', btn(coach2,sub), true);
eq('★★★ 代課：被代掉的原教練看不到（那堂他不在場）', btn(coach,sub), false);
eq('★★ id 型別不同也比得到（數字 vs 字串）', btn({role:'coach',id:7,can_teach:true},{coach_id:'7'}), true);
eq('★★ 沒有教練的課卡 → 誰都看不到', btn(adminTeach,{coach_id:null}), false);

console.log('\n③ 畫面與進入點走同一條判準');
ok('★★★ 圓形課卡鈕不再看 own（own 對管理員／店長恆為 true）',
   /if\(!_calCtx && tlOwnsBk\(b\) && !bkIsSelf\(b\) && tlCanLog\(\)\)/.test(src)
   && !/if\(!_calCtx && own && !bkIsSelf\(b\) && tlCanLog\(\)\)/.test(src));
ok('★★★ 教練首頁課卡鈕也過 tlOwnsBk',
   /const _tlOk=!bkIsSelf\(b\) && tlCanLog\(\) && tlOwnsBk\(b\);/.test(src));
ok('★★★ openTrainingLog 用同一支，主管／管理員不再一律放行',
   /if\(!tlOwnsBk\(b\)\)\{ showToast\('這不是你的課，看不到課表'\); return; \}/.test(src)
   && !/SESSION\.role==='coach' && !SESSION\.is_manager && !bkIsCoach\(b,SESSION\.id\)\)\{\s*\n\s*showToast\('這不是你的課/.test(src));
ok('★★ 原因寫在原地', /拿 own 來畫這顆鈕，別的教練的課卡也會出現課表鈕/.test(src));

console.log('\n'+pass+' 過 / '+fail+' 敗');
process.exit(fail?1:0);
