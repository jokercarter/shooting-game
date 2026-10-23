import {chromium} from '@playwright/test';
const port=process.argv[2]||'4191';
const b=await chromium.launch();
async function run(query){
  const p=await b.newPage({viewport:{width:1440,height:900}});
  await p.goto(`http://127.0.0.1:${port}/arena/${query}`);
  await p.getByLabel('玩家名称').fill('Bench');
  await p.getByRole('button',{name:'进入战场'}).click();
  await p.getByText('LIVE FRONTIER',{exact:true}).waitFor({timeout:15000});
  await p.waitForTimeout(3000);
  const s=await p.evaluate(()=>window.__morrowTestRenderState());
  await p.close();
  return s;
}
const off=await run('?terrain-off&test-reconnect');
const on=await run('?test-reconnect');
console.log(JSON.stringify({off:{ms:off.draw_ms,builds:off.terrain_builds},on:{ms:on.draw_ms,builds:on.terrain_builds}}));
await b.close();
