/* 教練排體驗課時建不了檔（2026-10-20 使用者附截圖）

   Barry（鄭百益，一般教練）排 10/22 19:00 的體驗課、填了手機 0975893791，
   跳「建立會員失敗：權限不足，系統無法儲存這筆資料（會員）」，
   而且那一步是 return —— **整堂體驗課都沒建起來**。

   兩個原因疊在一起，只修一個沒有用：
     ① members 的 INSERT policy 只給 is_staff_desk()（管理員／櫃檯／主管），一般教練沒有
     ② 就算開了 INSERT，教練的 SELECT 只看得到自己的學員 ——
        填到現有客人的手機時這裡查不到、會去新建 → 撞 members_phone_key（手機唯一）
        → 跳一個更難懂的錯

   所以改成走 fn_trial_member（SECURITY DEFINER）：繞過 RLS 查一次，
   查到回那一位、查不到才建，而且只回 id 與姓名。

   正式庫實跑驗過（以 Barry 的身分）：
     真實案例 0975893791 → ok，找到既有的張育瑄（created:false）
     沒填姓名 → NAME.REQUIRED
     手機格式錯 → PHONE.INVALID
     已存在的別人手機 → ok，回那一位（黃姸元），不會建出第二筆 */
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/Projects/yugym-booking-system-app/index.html','utf8');
let pass=0,fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(x!==undefined?'  → '+JSON.stringify(x):''));} };

/* 只看體驗課那一段 */
const i0=src.indexOf("if(memNameErr(tname)){showToast(memNameErr(tname));return;}");
const i1=src.indexOf("const vbk={id:null,coach_id,category:t.category,ticket_type_id:type_id,venue_pref:bkWizVenue()};", i0);
const SEG=src.slice(i0,i1);

console.log('① 不再自己查、自己寫 members');
{
  ok('★★★ 改走 fn_trial_member',
     /const r=await sb\.rpc\('fn_trial_member',\{p_name:tname, p_phone:tphone, p_coach_id:coach_id\|\|null\}\);/.test(SEG));
  ok('★★★ 前端不再直接 insert members（權限本來就不該在這裡解）',
     !/dbPut\('members'/.test(SEG));
  ok('★★★ 那個空 catch 拿掉了（它會把 RLS 擋掉偽裝成「查無此人」）',
     !/\}catch\(_\)\{\}/.test(SEG)
     && /空 catch 偽裝成沒資料/.test(SEG));
  ok('★★ RPC 繞過 dbPut → 要 dbCacheClear',
     /dbCacheClear\(\['members'\]\);   \/\/ RPC 繞過 dbPut/.test(SEG));
  ok('★★ 既有會員與新建的分得出來（決定 toast 要講哪一句）',
     /mem=\{id:_tr\.id, name:_tr\.name\|\|tname\};/.test(SEG)
     && /memIsNew=!!_tr\.created;/.test(SEG));
}

console.log('\n② 失敗要講人話，而且仍然擋住整堂課（不能半套）');
{
  ok('★★ 四種錯誤碼都翻譯了',
     ['AUTH.FORBIDDEN','NAME.REQUIRED','PHONE.INVALID','PHONE.DUPLICATE']
       .every(c=>SEG.indexOf("'"+c+"':")>=0));
  ok('★★ 手機被別人用走要指路（教練自己看不到那一位）',
     /'PHONE\.DUPLICATE':'這支手機已經有別的會員在用，請櫃檯協助'/.test(SEG));
  ok('★★ 失敗仍然 return —— 不要建出一堂沒有綁到人的體驗課',
     (SEG.match(/showToast\(M\[c\]\|\|\('建立會員失敗：'\+\(c\|\|'未知錯誤'\)\), 7000\); return;/g)||[]).length===1);
  ok('★ 丟出來的例外有留痕跡（不要靜靜吞掉）',
     /console\.error\('fn_trial_member 失敗',e\);/.test(SEG));
}

console.log('\n③ 根因寫在原地');
{
  ok('★★★ 兩個原因都寫出來（只修一個沒有用）',
     /INSERT policy 只給管理員／櫃檯／主管，一般教練沒有。/.test(SEG)
     && /撞上手機唯一索引/.test(SEG));
  ok('★★ 也寫明教練看得到什麼（只回 id 與姓名）',
     /教練照樣看不到別人的電話、生日、票券。/.test(SEG));
}

console.log('\n④ 沒有順手改到別條路');
{
  /* grpCompNew（當場建一位再招待）是 admin 限定，而且管理員看得到全部會員，
     兩個問題都不成立 —— 刻意不動。 */
  ok('★★ grpCompNew 維持原樣（admin 限定，不受這次影響）',
     /if\(!\(SESSION&&SESSION\.role==='admin'\)\)\{ showToast\('招待名額只有管理員可以開'\); return; \}/.test(src));
}

console.log(`\n${pass} 通過 / ${fail} 失敗`);
process.exit(fail?1:0);
