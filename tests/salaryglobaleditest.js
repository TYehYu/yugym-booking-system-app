'use strict';
/* 全店薪資設定視窗（2026-11-26 GPT 驗收 P2）：openSalaryGlobalEdit 用了作用域內沒有的 money()，
   一點就 ReferenceError、視窗打不開。這裡真的執行它：視窗要能組出來，且舊制主管獎金說明有帶金額。 */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync(process.env.INDEX_PATH||require('path').join(__dirname,'../index.html'),'utf8');
function fn(name){const i=src.indexOf('function '+name+'(');assert(i>=0,name);let d=0,k=src.indexOf('{',i);for(;;k++){if(src[k]=='{')d++;if(src[k]=='}'&&--d==0)break;}return src.slice(i,k+1);}
let html='';
const c={window:{SALARY_GLOBAL:{leader_per_classes:80,leader_per_amount:4000,insurance_levels:[{grade:29500,labor_emp:1,health_emp:2,labor_co:3,health_co:4}]}},showModal:h=>{html=h;},document:{},console};
vm.createContext(c);
vm.runInContext(fn('openSalaryGlobalEdit')+'\nthis.F=openSalaryGlobalEdit;',c);
let n=0;const test=(l,f)=>{f();n++;console.log('✓ '+l);};
test('openSalaryGlobalEdit 可執行、不丟 ReferenceError',()=>{c.F();assert(html.includes('全域薪資制度'));});
test('舊制主管獎金說明帶出金額（每滿 80 堂 $4,000）',()=>assert(html.includes('每滿 80 堂 $4,000')));
test('勞健保級距列有渲染（29500）',()=>assert(html.includes('id="sg-ins-grade-0"')&&html.includes('29500')));
test('沒有 SALARY_GLOBAL 也能開（預設值）',()=>{c.window.SALARY_GLOBAL=undefined;html='';c.F();assert(html.includes('每滿 80 堂 $4,000'));});
console.log(n+' passed, 0 failed');
