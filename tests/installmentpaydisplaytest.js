'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=src.indexOf('function tkMoneyHtml(');let depth=0,end;
for(let i=src.indexOf('{',start);i<src.length;i++){if(src[i]==='{')depth++;else if(src[i]==='}'&&!--depth){end=i+1;break;}}
const a=src.indexOf('window._tkPayMap={};'),b=src.indexOf('\n    /*',src.indexOf('invs:_invs};',a));
const build=src.slice(a,b),render=src.slice(start,end);let passed=0;
function show(ps){const ctx={window:{},c:{myPc:ps},isDeskLike:()=>true};vm.createContext(ctx);vm.runInContext(build,ctx);vm.runInContext(render,ctx);return ctx.tkMoneyHtml({id:'T',amount_paid:12000,installment:{count:3,current:3,amounts:[4000,4000,4000]}});}
const p=(n,amount,note='',source='backoffice')=>({ticket_id:'T',created_at:'2026-11-'+n,payment_method:'cash',deal_amount:amount,note,source});
let html=show([p(10,4000),p(11,8000,'分期收款・開通 8 堂（第 2–3 期）','installment')]);
assert(!html.includes('未繳'));passed++;assert(html.includes('第 2～3 期'));passed++;assert(html.includes('$8,000'));passed++;
html=show([p(10,4000),p(11,4000,'分期收款・開通 4 堂（第 2–2 期）','installment')]);assert((html.match(/class="tk-due"/g)||[]).length===1);passed++;assert(html.includes('第 3 期尚未收款'));passed++;
html=show([p(10,4000),p(11,4000)]);assert((html.match(/class="tk-due"/g)||[]).length===1);passed++;
html=show([p(10,4000),p(11,8000,'分期收款・開通 8 堂（第 2–3 期）','imported')]);assert(html.includes('未繳'));passed++;
console.log(passed+' 通過 / 0 失敗');
