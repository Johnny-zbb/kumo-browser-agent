import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createLocalAgentBridge } from '../scripts/local-agent-bridge.mjs';

const snapshot = origin => ({
  id:1,url:origin+'/',title:'Demo',text:'测试',tree:[],
  elements:[{ref:1,role:'button',name:'打开详情',disabled:false,actions:['click']}],
  viewport:{scrollTop:0,clientHeight:100,scrollHeight:100,atBottom:true}
});
async function setup(decisionModel) {
  let handler;
  const server=createServer(async (req,res)=>{if(!(await handler(req,res))){res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  handler=createLocalAgentBridge({port,...(decisionModel?{decisionModel}:{})});
  const origin=`http://127.0.0.1:${port}`;
  return {origin,close:()=>new Promise(resolve=>server.close(resolve))};
}
async function post(origin,body,headers={}) {
  return fetch(origin+'/api/agent/decision',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
}
test('bridge defaults OFF; config never exposes credentials',async()=>{
  const s=await setup();
  try{
    const config=await (await fetch(s.origin+'/api/agent/config')).json();
    assert.deepEqual(config,{llmConfigured:false});
    const p=await post(s.origin,{task:'点击',snapshot:snapshot(s.origin),history:[]});
    assert.equal(p.status,503);
  }finally{await s.close();}
});
test('local bridge returns validated one-step decision without leaking a credential',async()=>{
  let count=0;
  const s=await setup({complete:async ({system,user})=>{count++;assert.match(system,/UNTRUSTED/);assert.match(user,/打开详情/);return '{"kind":"act","reason":"查看详情","action":{"kind":"click","ref":1}}';}});
  try{
    const config=await (await fetch(s.origin+'/api/agent/config')).json();
    assert.deepEqual(config,{llmConfigured:true});
    const resp=await post(s.origin,{task:'打开详情',snapshot:snapshot(s.origin),history:[]});
    assert.equal(resp.status,200);
    assert.deepEqual((await resp.json()).decision,{kind:'act',reason:'查看详情',action:{kind:'click',ref:1}});
    assert.equal(count,1);
    assert.equal(resp.headers.get('cache-control'),'no-store');
  }finally{await s.close();}
});
test('bridge rejects forged origin, URL mismatch, malformed payload, and hallucinated refs',async()=>{
  const s=await setup({complete:async()=>'{ "kind":"act","reason":"bad","action":{"kind":"click","ref":900}}'});
  try{
    const input={task:'打开详情',snapshot:snapshot(s.origin),history:[]};
    assert.equal((await post(s.origin,input,{origin:'https://malicious.example'})).status,403);
    assert.equal((await post(s.origin,{...input,snapshot:snapshot('https://other.example')})).status,400);
    assert.equal((await post(s.origin,{...input,history:Array.from({length:6},()=>({}))})).status,400);
    assert.equal((await post(s.origin,input)).status,502);
  }finally{await s.close();}
});
