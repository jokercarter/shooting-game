import {chromium} from '@playwright/test';
const port=process.argv[2]||'4191';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(String(e)));
const reqfail=[];p.on('response',r=>{if(r.status()>=400)reqfail.push(r.status()+' '+r.url())});
await p.goto(`http://127.0.0.1:${port}/arena/`);
await p.waitForTimeout(1500);
await p.screenshot({path:'output/art/lobby-simple.png'});
const counts=await p.evaluate(()=>({
  visibleButtons:[...document.querySelectorAll('.lobby-card button')].filter(b=>b.offsetParent!==null).length,
  hasModes:!!document.querySelector('.lobby-card.compact .mode-section'),
}));
await p.click('#toggle-advanced');
await p.waitForTimeout(400);
await p.screenshot({path:'output/art/lobby-expanded.png'});
const after=await p.evaluate(()=>[...document.querySelectorAll('.lobby-card button')].filter(b=>b.offsetParent!==null).length);

await p.getByLabel('玩家名称').fill('Carter');
await p.getByRole('button',{name:'进入战场'}).click();
await p.getByText('LIVE FRONTIER',{exact:true}).waitFor({timeout:15000});
await p.waitForTimeout(2500);
await p.screenshot({path:'output/art/terrain-cache.png'});
const fps=await p.evaluate(()=>new Promise(resolve=>{
  let frames=0;const start=performance.now();
  const tick=()=>{frames++;if(performance.now()-start<3000)requestAnimationFrame(tick);else resolve(Math.round(frames*1000/(performance.now()-start)))};
  requestAnimationFrame(tick);
}));
console.log(JSON.stringify({counts,after,fps,errs,reqfail}));
await b.close();
