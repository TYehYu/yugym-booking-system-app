#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),http=require('http');
const {configJs,injectSession,safeFile}=require('../../booking-health/performance/serve_acceptance_frontend');
const {parseEnv}=require('../../booking-health/performance/run_acceptance');
function faultScript(member){return `<script>(function(){
if(!window.YUGYM_CONFIG||window.YUGYM_CONFIG.url!=='https://kucvxpjatptfckhlxptj.supabase.co')throw Error('TEST_ONLY');
const originalFetch=window.fetch.bind(window);let drop=false,dropped=0;
window.fetch=async function(input,options){const url=String(input&&input.url||input);
 if(url.includes('rlpiomzplckzqnqrvrwc.supabase.co'))throw Error('Production API blocked in test frontend');
 if(url.includes('/functions/v1/ecpay-invoice'))return new Response(JSON.stringify({ok:false,msg:'Test frontend blocks external invoice provider'}),{status:503,headers:{'Content-Type':'application/json'}});
 const response=await originalFetch(input,options);
 if(drop&&url.includes('/rpc/fn_installment_collect_v2')){let body;try{body=await response.clone().json()}catch(_){}if(body&&body.ok){drop=false;dropped++;const el=document.getElementById('ica-fault-state');if(el)el.textContent='已遺失 '+dropped+' 次成功收款回應；請以原內容重試';throw TypeError('Injected response loss after successful commit');}}
 return response;
};window.icaArmLostResponse=function(){drop=true;document.getElementById('ica-fault-state').textContent='下一次成功收款：模擬回應遺失（不會再送一次）';};
window.addEventListener('DOMContentLoaded',function(){
 const box=document.createElement('aside');box.id='ica-test-panel';box.style.cssText='position:fixed;bottom:78px;right:8px;z-index:2147483647;max-width:290px;padding:8px;background:#fff9de;color:#5c4715;border:1px solid #b7984a;border-radius:9px;font:12px sans-serif';
 box.innerHTML='<b>驗收工具・假資料・不連外發票</b><div><button id="ica-open-member">開啟驗收會員</button> <button id="ica-arm-loss">遺失一次收款回應</button> <button id="ica-hide-panel">收起</button></div><div id="ica-fault-state">正常收款；發票固定模擬失敗</div>';
 document.body.appendChild(box);document.getElementById('ica-open-member').onclick=function(){if(typeof openMemberDetail==='function')openMemberDetail(${JSON.stringify(member||'')});};document.getElementById('ica-arm-loss').onclick=window.icaArmLostResponse;document.getElementById('ica-hide-panel').onclick=function(){box.style.display='none';};
 // Actual invoice rendering/payload/persistence paths run, but no real provider is contacted.
 invCfg=async function(){return {on:true,test:true,env:'stage',why:'驗收模擬：不連外發票'};};
 invCall=async function(action,data){return {ok:false,msg:'驗收模擬：發票服務暫時失敗，未連外開票'};};
});})();</script>`;}
function injectFault(html,member){return html.replace(/<\/head>/i,faultScript(member)+'</head>');}
module.exports={faultScript,injectFault};
if(require.main===module){const args=process.argv.slice(2),opt=(n,d)=>{const i=args.indexOf(n);return i<0?d:args[i+1]},env=parseEnv(opt('--env')),work=path.resolve(opt('--work','/private/tmp/yugym-installment-accept-20261119')),root=path.resolve(__dirname,'../../..'),port=Number(opt('--port','8796'));const cfg=configJs(env.SB_URL,env.ANON_KEY);
 http.createServer((req,res)=>{try{const u=req.url||'/',p=u.split('?')[0];if(p==='/cc-logout'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end('<script>localStorage.clear();sessionStorage.clear()</script><p>測試登入已清除。</p>');}
 if(p==='/config.js'){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});return res.end(cfg);}
 if(p==='/sw.js'||!(/^(\/|\/index\.html|\/manifest\.json|\/icon-[0-9]+\.png)$/.test(p)||p.startsWith('/img/'))){res.writeHead(404);return res.end('not found');}
 const file=safeFile(root,p==='/'?'/index.html':p);if(!file||(p.startsWith('/img/')&&!file.startsWith(path.join(root,'img')+path.sep))||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('not found');}
 if(p==='/'||p==='/index.html'){let session=null,member='';try{const all=JSON.parse(fs.readFileSync(path.join(work,'sessions.json'),'utf8')),prof=JSON.parse(fs.readFileSync(path.join(work,'profiles.json'),'utf8'));session=all[/[?&]as=member/.test(u)?'member':/[?&]as=coach/.test(u)?'coach':'desk'];member=prof.member;}catch(_){}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(injectFault(injectSession(fs.readFileSync(file,'utf8'),session),member));}
 const ext=path.extname(file);res.writeHead(200,{'Content-Type':({'.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp'})[ext]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
 }catch(_){res.writeHead(500);res.end('test frontend error');}}).listen(port,'127.0.0.1',()=>console.log('測試前端 http://127.0.0.1:'+port+'/；禁止正式 API 與外部發票'));
}
