import {test,expect} from '@playwright/test';

test('public arena controls, crowd-aware room state and mobile lobby',async({page,request})=>{
 const pageErrors:string[]=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.goto('/arena/');
 await expect(page.getByRole('heading',{name:/苔木边境/})).toBeVisible();
 const arenaScript=await page.locator('script[src*="/arena/game.js"]').getAttribute('src');
 expect(arenaScript).toMatch(/game\.js\?v=\d+$/);
 await expect(page.locator('.control-hint')).toContainText('H/J/L');
 await expect(page.locator('.control-hint')).toContainText('右键跳跃');
 await expect(page.locator('.control-hint')).toContainText('Space');
 await expect(page.locator('.control-hint')).toContainText('Y 副射击');

 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.getByLabel('玩家名称').fill('ArenaSmoke');
 await page.getByRole('button',{name:'进入战场'}).click();
 await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
 await expect(page.locator('#pilot-count')).toHaveText('1 / 20');
 await expect.poll(async()=>Number(await page.locator('#energy-fill').evaluate(el=>parseFloat((el as HTMLElement).style.width)||0)),{timeout:2500}).toBeGreaterThan(0);

 await page.locator('#arena').click({button:'right',position:{x:180,y:180}});
 await expect.poll(async()=>Number(await page.locator('#dash-fill').evaluate(el=>parseFloat((el as HTMLElement).style.width)||0)),{timeout:2500}).toBeGreaterThan(0);
 const velocity=page.locator('[data-upgrade="velocity"]');
 await velocity.click();
 await expect(velocity).toHaveClass(/selected/);
 await expect(page.locator('#confirm-upgrade')).toBeDisabled();
 await page.keyboard.press('Space');
 await expect(page.locator('#toast')).toHaveText('没有可用技能点');

 await page.getByRole('button',{name:'返回大厅'}).click();
 await expect(page.getByLabel('玩家名称')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:'output/playwright/morrow-fields-arena-smoke-mobile.png',fullPage:true});
 await expect.poll(async()=>(await (await request.get('/api/arena/rooms')).json()).length,{timeout:5000}).toBe(0);
 expect(pageErrors).toEqual([]);
});

test('two local browser windows share one arena room',async({browser,request})=>{
 const context=await browser.newContext();
 const first=await context.newPage();
 const second=await context.newPage();
 try{
  await first.goto('/arena/');
  await first.getByLabel('玩家名称').fill('LocalPilotA');
  await first.getByRole('button',{name:'进入战场'}).click();
  await expect(first.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
  const room=new URL(first.url()).searchParams.get('room');
  expect(room).toMatch(/^[A-Z0-9]{6}$/);

  await second.goto('/arena/');
  await second.getByLabel('玩家名称').fill('LocalPilotB');
  await second.getByLabel('房间码').fill(room!);
  await second.getByRole('button',{name:'进入战场'}).click();
  await expect(second.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
  await expect.poll(async()=>second.locator('#pilot-count').textContent(),{timeout:5000}).toBe('2 / 20');
  await expect.poll(async()=>first.locator('#pilot-count').textContent(),{timeout:5000}).toBe('2 / 20');

  await first.close();
  await expect.poll(async()=>second.locator('#pilot-count').textContent(),{timeout:5000}).toBe('1 / 20');
  await second.close();
  await expect.poll(async()=>(await (await request.get('/api/arena/rooms')).json()).length,{timeout:5000}).toBe(0);
 }finally{
  await context.close();
 }
});

test('reconnects after a transient network drop',async({page,request})=>{
 await page.goto('/arena/?test-reconnect');
 await page.getByLabel('玩家名称').fill('ReconnectPilot');
 await page.getByRole('button',{name:'进入战场'}).click();
 await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
 const room=new URL(page.url()).searchParams.get('room');
 expect(room).toMatch(/^[A-Z0-9]{6}$/);
 await page.evaluate(()=>{(window as typeof window & {__morrowTestDisconnect?:()=>void}).__morrowTestDisconnect?.()});
 await expect.poll(async()=>JSON.stringify(await page.evaluate(()=>({reconnects:(window as typeof window & {__morrowTestReconnects?:number}).__morrowTestReconnects||0,closeEvents:(window as typeof window & {__morrowTestCloseEvents?:number}).__morrowTestCloseEvents||0,ignored:(window as typeof window & {__morrowTestIgnoredCloses?:number}).__morrowTestIgnoredCloses||0,branch:(window as typeof window & {__morrowTestCloseBranch?:string}).__morrowTestCloseBranch||''}))),{timeout:7000}).toMatch(/"reconnects":[1-9]/);
 await expect.poll(async()=>page.getByText('LIVE FRONTIER',{exact:true}).isVisible(),{timeout:12000}).toBeTruthy();
 await expect(page.locator('#pilot-count')).toHaveText('1 / 20');
 await page.close();
 await expect.poll(async()=>(await (await request.get('/api/arena/rooms')).json()).length,{timeout:6000}).toBe(0);
});

test('ten-player crowd keeps the private HUD patch responsive',async({page,request})=>{
 const pageErrors:string[]=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.goto('/arena/?test-reconnect');
 await page.getByLabel('玩家名称').fill('CrowdOwner');
 await page.getByRole('button',{name:'进入战场'}).click();
 await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
 const room=new URL(page.url()).searchParams.get('room');
 expect(room).toMatch(/^[A-Z0-9]{6}$/);
 await page.evaluate(async(roomCode)=>{
  const sockets:WebSocket[]=[];
  let ownerId='';
  let ownerShot=false;
  const connect=(index:number)=>new Promise<void>((resolve,reject)=>{
   const socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws/arena`);
   sockets.push(socket);
   socket.onopen=()=>socket.send(JSON.stringify({type:'join',name:`Crowd-${index}`,room:roomCode,map:'tidal',mode:'normal'}));
   let welcomed=false;
   socket.onmessage=event=>{try{
    const message=JSON.parse(event.data);
    if(message.type==='welcome'&&!welcomed){
     welcomed=true;
     ownerId=ownerId||message.players?.find((player:{name:string,id:string})=>player.name==='CrowdOwner')?.id||'';
     resolve();
    }
    if(message.type==='state'&&ownerId&&(message.projectiles||[]).some((projectile:{owner:string})=>projectile.owner===ownerId))ownerShot=true;
   }catch{}};
   socket.onerror=()=>reject(new Error('crowd socket failed'));
  });
  for(let index=1;index<=9;index++)await connect(index);
  (window as typeof window & {__crowdSockets?:WebSocket[]}).__crowdSockets=sockets;
  (window as typeof window & {__crowdOwnerShot?:()=>boolean}).__crowdOwnerShot=()=>ownerShot;
 },room!);
 await expect.poll(async()=>page.locator('#pilot-count').textContent(),{timeout:6000}).toBe('10 / 20');
 await expect.poll(async()=>Number(await page.locator('#energy-fill').evaluate(el=>parseFloat((el as HTMLElement).style.width)||0)),{timeout:4000}).toBeGreaterThan(0);
 await expect(page.locator('#ammo')).toContainText('∞');
 const readLocalPlayer=()=>page.evaluate(()=> (window as typeof window & {__morrowTestLocalPlayer?:()=>{x:number;y:number;state_interval_ms:number;input_interval_ms:number;render_target_fps:number}|null}).__morrowTestLocalPlayer?.());
 const initial=await readLocalPlayer();
 expect(initial).not.toBeNull();
 await expect.poll(async()=>(await readLocalPlayer())?.state_interval_ms,{timeout:3000}).toBe(11);
 await expect.poll(async()=>(await readLocalPlayer())?.input_interval_ms,{timeout:3000}).toBe(11);
 await expect.poll(async()=>(await readLocalPlayer())?.render_target_fps,{timeout:3000}).toBe(100);
 const canvasBox=await page.locator('#arena').boundingBox();
 expect(canvasBox).not.toBeNull();
 await page.locator('#arena').focus();
 let maxMove=0;
 for(const key of ['d','s','a','w']){
  const before=await page.evaluate(()=> (window as typeof window & {__morrowTestLocalPlayer?:()=>{x:number;y:number}|null}).__morrowTestLocalPlayer?.()||{x:0,y:0});
  await page.keyboard.down(key);await page.waitForTimeout(220);await page.keyboard.up(key);
  const after=await page.evaluate(()=> (window as typeof window & {__morrowTestLocalPlayer?:()=>{x:number;y:number}|null}).__morrowTestLocalPlayer?.()||{x:0,y:0});
  maxMove=Math.max(maxMove,Math.hypot(after.x-before.x,after.y-before.y));
 }
 expect(maxMove).toBeGreaterThan(20);
 const aimX=canvasBox!.x+canvasBox!.width*.72,aimY=canvasBox!.y+canvasBox!.height*.5;
 await page.mouse.move(aimX,aimY);await page.mouse.down();await page.waitForTimeout(1100);await page.mouse.up();
 await expect.poll(async()=>page.evaluate(()=>Boolean((window as typeof window & {__crowdOwnerShot?:()=>boolean}).__crowdOwnerShot?.())),{timeout:4000}).toBeTruthy();
 await expect.poll(async()=>page.locator('#score-rows .score-row').count(),{timeout:3000}).toBe(14);
 const crowdFps=await page.evaluate(()=>new Promise<number>(resolve=>{
  let frames=0;const started=performance.now();
  const sample=(now:number)=>{frames+=1;if(now-started>=3000)resolve(frames*1000/(now-started));else requestAnimationFrame(sample)};
  requestAnimationFrame(sample);
 }));
 console.log(`ten-player browser FPS: ${crowdFps.toFixed(1)}`);
 expect(crowdFps).toBeGreaterThanOrEqual(55);
 await page.evaluate(()=>{for(const socket of (window as typeof window & {__crowdSockets?:WebSocket[]}).__crowdSockets||[])socket.close();});
 await expect.poll(async()=>(await (await request.get('/api/arena/rooms')).json()).length,{timeout:6000}).toBe(1);
 await page.close();
 await expect.poll(async()=>(await (await request.get('/api/arena/rooms')).json()).length,{timeout:6000}).toBe(0);
 expect(pageErrors).toEqual([]);
});

test('display settings persist and live performance status is visible',async({page})=>{
 await page.goto('/arena/');
 await page.getByRole('button',{name:'设置'}).click();
 await page.locator('#option-low-effects').check();
 await page.locator('#option-minimap').uncheck();
 await page.locator('#option-minimap-scale').evaluate((element)=>{element.value='1.35';element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}))});
 await expect(page.locator('#option-minimap-scale-value')).toHaveText('135%');
 await page.getByLabel('玩家名称').fill('SettingsPilot');
 await page.getByRole('button',{name:'进入战场'}).click();
 await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
 await expect.poll(async()=>page.locator('#perf-label').textContent(),{timeout:4000}).toMatch(/FPS .* RTT .* STATE/);
 const state=await page.evaluate(()=>({low:document.body.classList.contains('low-effects'),hiddenMap:document.body.classList.contains('hide-minimap'),scale:localStorage.getItem('morrow-fields-minimapScale')}));
 expect(state).toEqual({low:true,hiddenMap:true,scale:'1.35'});
 expect(await page.locator('#match-result').count()).toBe(1);
 await page.getByRole('button',{name:'返回大厅'}).click();
});
