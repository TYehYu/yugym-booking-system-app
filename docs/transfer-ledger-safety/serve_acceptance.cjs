#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),http=require('http');
const {readEnv}=require('./acceptance_common.cjs');const {configJs,injectSession,safeFile}=require('../contract-hold-settlement/serve_acceptance.cjs');
const args=process.argv.slice(2),opt=(n,d)=>{const i=args.indexOf(n);return i<0?d:args[i+1];};
const root=path.resolve(__dirname,'../..'),work=path.resolve(opt('--work','/private/tmp/yugym-transfer-acceptance-20261120')),env=readEnv(opt('--env')),port=Number(opt('--port','8794'));
http.createServer((req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),p=url.pathname;
 res.setHeader('Cache-Control','no-store');
 if(p==='/config.js'){res.setHeader('Content-Type','application/javascript');return res.end(configJs(env.SB_URL,env.ANON_KEY));}
 if(p==='/sw.js'){res.writeHead(404);return res.end();}
 const f=safeFile(root,p==='/'?'/index.html':p);if(!f||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}
 if(p==='/'||p==='/index.html'){
  const coach=url.searchParams.get('as')==='coach';const sessions=JSON.parse(fs.readFileSync(path.join(work,'sessions.json'),'utf8')),map=JSON.parse(fs.readFileSync(path.join(work,'browser_fixture_map.json'),'utf8'));
  let html=injectSession(fs.readFileSync(f,'utf8'),coach?sessions.coach:sessions.desk);
  const keys=coach?['DC','MC']:['DD','MD'];
  const buttons=keys.map(k=>{const id=map.fixtures[k].to;if(!/^CC-TLS-[A-Za-z0-9-]+$/.test(id))throw Error('Invalid fixture id');return `<button type="button" onclick="document.getElementById('cc-tls-panel').hidden=true;openBkMoveTicket('${id}')">${map.ui[k]}：調課</button>`;}).join(' ');
  const panel='<aside id="cc-tls-panel" style="position:fixed;bottom:80px;right:8px;z-index:99999;background:#fff4d9;border:1px solid #9a762c;padding:10px;border-radius:10px;max-width:90vw">假資料驗收 '+buttons+'</aside>';
  const end=html.lastIndexOf('</body>');if(end<0)throw Error('Missing body');html=html.slice(0,end)+panel+html.slice(end);res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
 }
 const mime={'.js':'application/javascript','.png':'image/png','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'};
 res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res);
}catch(_){res.writeHead(503);res.end('驗收夾具尚未就緒');}}).listen(port,'127.0.0.1',()=>console.log('測試前端 http://127.0.0.1:'+port+'/ （教練加 ?as=coach）'));
