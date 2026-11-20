// Test-only bridge. Reads a captured production helper but never reads production secrets.
import fs from 'node:fs';import {stripTypeScriptTypes} from 'node:module';import crypto from 'node:crypto';
export async function provider(sourceFile){
 const source=fs.readFileSync(sourceFile,'utf8'),start=source.indexOf('const ENV'),a=source.indexOf('async function callEcpay'),next=source.indexOf('\n/*',a);if(start<0||a<0||next<0)throw Error('SOURCE_SHAPE');
 let code=source.slice(start,next).replace("const ENV   = Deno.env.get('ECPAY_ENV') || 'stage';","const ENV = 'stage';");if(!code.includes("const ENV = 'stage';"))throw Error('STAGE_PIN');
 code="const Deno={env:{get:()=>undefined}};\nconst fetch=async(url,options)=>{if(!['/B2CInvoice/Issue','/B2CInvoice/GetIssue','/B2CInvoice/Invalid'].includes(new URL(url).pathname)||new URL(url).origin!=='https://einvoice-stage.ecpay.com.tw')throw Error('STAGE_HOST_ONLY');return globalThis.fetch(url,{...options,signal:AbortSignal.timeout(20000),redirect:'error'});};\n"+code+"\nexport {callEcpay};";
 const mod=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(code)).toString('base64'));
 return {hash:crypto.createHash('sha256').update(source).digest('hex'),call:mod.callEcpay};
}
