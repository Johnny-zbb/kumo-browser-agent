import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { PlaywrightPagePort } from '../../dist/packages/playwright-runtime/src/playwright-page.js';
import { runAgent } from '../../dist/packages/agent-core/src/run-agent.js';
import { SandboxActionPolicy } from '../../dist/packages/agent-core/src/action-policy.js';

const root = resolve(import.meta.dirname, '../..');
const isolated = process.env.KUMO_E2E_ISOLATED === '1';
const html = `<!doctype html><html lang="zh-CN"><head><title>授权页面</title></head><body>
  <button id="outside">外部控件</button>
  <main id="workspace"><h1>测试应用</h1><label for="query">搜索关键词</label>
    <input id="query" aria-label="搜索关键词" />
    <button id="search">查询</button><p id="result">暂无结果</p>
    <a href="/next" id="next">下一页</a>
  </main>
  <script>document.querySelector('#search').onclick=()=>{document.querySelector('#result').textContent='搜索结果：'+document.querySelector('#query').value}</script>
</body></html>`;

async function withRuntime(t, fn) {
  const server = createServer((req,res) => {
    if (req.url === '/redirect') {res.writeHead(302,{location:'https://not-allowed.example/secret'});res.end();return;}
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    res.end(req.url === '/next' ? html.replace('测试应用','第二页') : html);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true,...(process.env.KUMO_CHROMIUM_EXECUTABLE?{executablePath:process.env.KUMO_CHROMIUM_EXECUTABLE}:{})});
  const context = await browser.newContext({serviceWorkers:'block',acceptDownloads:false,permissions:[]});
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror',error=>failures.push(error.message));
  const runtime = new PlaywrightPagePort(page,{
    allowedOrigins:[origin],rootSelector:'#workspace',
    driverSource:await readFile(resolve(root,'dist/browser-dom-driver.js'),'utf8'),
    ...(isolated?{testAllowInitialBlank:true}:{})
  });
  try {
    await runtime.start();
    if (isolated) await page.setContent(html);
    else await runtime.navigate(origin+'/');
    await fn({runtime,page,origin,failures});
  } catch(error) {
    await mkdir(resolve(root,'test-results/e2e'),{recursive:true});
    await page.screenshot({path:resolve(root,'test-results/e2e/playwright-runtime.png')}).catch(()=>{});
    await writeFile(resolve(root,'test-results/e2e/playwright-runtime.txt'),`${String(error)}\n${failures.join('\n')}`);
    throw error;
  } finally {
    await runtime.dispose();await context.close();await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}

test('Playwright runtime reuses the DOM Engine for a multi-turn verified task', async t => {
  await withRuntime(t,async({runtime,page,failures})=>{
    const first = await runtime.observe();
    assert.ok(first.tree.some(n=>n.role==='heading' && n.name==='测试应用'));
    assert.ok(first.elements.some(n=>n.name==='搜索关键词'));
    assert.ok(!first.elements.some(n=>n.name==='外部控件'));
    const planner = {async decide(task, snapshot) {
      if(snapshot.text.includes('搜索结果：agent'))return {kind:'done',reason:'找到结果'};
      const input=snapshot.elements.find(n=>n.name==='搜索关键词');
      if(input.value!=='agent')return {kind:'act',reason:'填写查询',action:{kind:'input',ref:input.ref,value:'agent'}};
      const button=snapshot.elements.find(n=>n.name==='查询');
      return {kind:'act',reason:'执行查询',action:{kind:'click',ref:button.ref}};
    }};
    const verifier={verify(_task,snap){return snap.text.includes('搜索结果：agent')?{status:'passed',reason:'已检查结果'}:{status:'rejected',reason:'查询无结果'};}};
    const result=await runAgent('查询 agent',runtime,planner,{maxTurns:5,taskVerifier:verifier,actionPolicy:new SandboxActionPolicy()});
    assert.equal(result.status,'completed',JSON.stringify(result));
    assert.ok(result.history.some(n=>n.actionVerification?.status==='matched'));
    assert.match(await page.locator('#result').innerText(),/搜索结果：agent/);
    assert.deepEqual(failures,[]);
  });
});

test('old refs never survive navigation; off-allowlist navigation is refused',async t=>{
  if(isolated){t.skip('real navigation/redirect requires HTTP browser access; CI tests this path');return;}
  await withRuntime(t,async({runtime,page,origin})=>{
    const before=await runtime.observe();
    const input=before.elements.find(n=>n.name==='搜索关键词');
    await runtime.navigate(origin+'/next');
    assert.match(await page.locator('h1').innerText(),/第二页/);
    await assert.rejects(runtime.execute({kind:'input',ref:input.ref,value:'bad'},before),/stale_snapshot/);
    const current=await runtime.observe();
    assert.notEqual(current.id,before.id);
    await assert.rejects(runtime.navigate('https://not-allowed.example'),/origin_not_allowed/);
    await assert.rejects(runtime.navigate(origin+'/redirect'));
    // Regardless of redirect behavior, no action may run without a fresh authorized observation.
    await assert.rejects(runtime.execute({kind:'input',ref:input.ref,value:'bad'},before),/stale_snapshot|origin_not_allowed/);
  });
});
