import {test,expect} from '@playwright/test';

// Baseline combat tests use an experienced pilot. First-run onboarding is
// exercised explicitly in friend-playtest.spec.ts with a fresh browser state.
test.beforeEach(async({context})=>{
 await context.addInitScript(()=>localStorage.setItem('morrow-fields-guide-v1','done'));
});

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
 await expect(page.locator('#toast')).toHaveText('没有可用属性点');
 // The progression HUD shows the starting level and an empty XP bar.
 await expect(page.locator('#level-badge')).toHaveText('LV 1');
 await expect(page.locator('#xp-label')).toHaveText('0 / 60 XP');
 await expect(page.locator('#upgrade-points')).toContainText('属性点 0');
 // All eight stats are offered in the upgrade panel.
 await expect(page.locator('[data-upgrade]')).toHaveCount(8);
 await expect(page.locator('#arena')).toBeVisible();

 await page.getByRole('button',{name:'返回大厅'}).click();
 await expect(page.getByLabel('玩家名称')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:'output/playwright/morrow-fields-arena-smoke-mobile.png',fullPage:true});
 await expect.poll(async()=>(await (await request.get('/api/arena/rooms')).json()).length,{timeout:5000}).toBe(0);
 expect(pageErrors).toEqual([]);
});

test('two local browser windows share one arena room',async({browser,request})=>{
 const context=await browser.newContext();
 await context.addInitScript(()=>localStorage.setItem('morrow-fields-guide-v1','done'));
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
 const originalPilot=await page.evaluate(()=>(window as any).__morrowTestLocalPlayer()?.id);
 await page.evaluate(()=>{(window as typeof window & {__morrowTestDisconnect?:()=>void}).__morrowTestDisconnect?.()});
 await expect.poll(async()=>JSON.stringify(await page.evaluate(()=>({reconnects:(window as typeof window & {__morrowTestReconnects?:number}).__morrowTestReconnects||0,closeEvents:(window as typeof window & {__morrowTestCloseEvents?:number}).__morrowTestCloseEvents||0,ignored:(window as typeof window & {__morrowTestIgnoredCloses?:number}).__morrowTestIgnoredCloses||0,branch:(window as typeof window & {__morrowTestCloseBranch?:string}).__morrowTestCloseBranch||''}))),{timeout:7000}).toMatch(/"reconnects":[1-9]/);
 await expect.poll(async()=>page.getByText('LIVE FRONTIER',{exact:true}).isVisible(),{timeout:12000}).toBeTruthy();
 await expect(page.locator('#pilot-count')).toHaveText('1 / 20');
 expect(await page.evaluate(()=>(window as any).__morrowTestLocalPlayer()?.id)).toBe(originalPilot);
 await page.close();
 await expect.poll(async()=>(await (await request.get('/api/arena/rooms')).json()).length,{timeout:6000}).toBe(0);
});

test('missile explosion shake attenuates with distance',async({page})=>{
 await page.goto('/arena/?test-reconnect');
 await page.getByLabel('玩家名称').fill('ShakePilot');
 await page.getByRole('button',{name:'进入战场'}).click();
 await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
 // Let a couple of state frames land so the camera has settled on the pilot;
 // measuring during the spawn transition reads a stale camera position.
 await page.waitForTimeout(800);
 const measurements=await page.evaluate(()=>{
  const api=window as typeof window & {
   __morrowTestLocalPlayer?:()=>{x:number;y:number}|null;
   __morrowTestTriggerExplosion?:(options:{x:number;y:number;blast:number})=>number;
  };
  const player=api.__morrowTestLocalPlayer?.();
  if(!player||!api.__morrowTestTriggerExplosion)return null;
  const blast=72;
  return {
   near:api.__morrowTestTriggerExplosion({x:player.x+12,y:player.y,blast}),
   middle:api.__morrowTestTriggerExplosion({x:player.x+220,y:player.y,blast}),
   far:api.__morrowTestTriggerExplosion({x:player.x+800,y:player.y,blast}),
  };
 });
 expect(measurements).not.toBeNull();
 expect(measurements!.near).toBeGreaterThan(measurements!.middle);
 expect(measurements!.middle).toBeGreaterThan(measurements!.far);
 expect(measurements!.near).toBeGreaterThan(.9);
 expect(measurements!.far).toBe(0);
 await page.getByRole('button',{name:'返回大厅'}).click();
});

test('ten-player crowd keeps the private HUD patch responsive @performance',async({page,request},testInfo)=>{
 const peerSockets:WebSocket[]=[];
 const browserPeerStress=process.env.ARENA_CROWD_TOPOLOGY==='browser';
 let remoteOwnerShot=false;
 try{
 const pageErrors:string[]=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.goto('/arena/?test-reconnect');
 await page.getByLabel('玩家名称').fill('CrowdOwner');
 await page.getByRole('button',{name:'进入战场'}).click();
 await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
 const room=new URL(page.url()).searchParams.get('room');
 expect(room).toMatch(/^[A-Z0-9]{6}$/);
 if(browserPeerStress)await page.evaluate(async(roomCode)=>{
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
 else{
  // Other players live on other machines in a real match. Keep synthetic
  // peers in the Node runner so one renderer does not parse ten clients' traffic.
  const ownerId=await page.evaluate(()=>(window as any).__morrowTestLocalPlayer()?.id);
  for(let index=1;index<=9;index++){
   await new Promise<void>((resolve,reject)=>{
    const socket=new WebSocket(new URL('/ws/arena',page.url()).href.replace(/^http/,'ws'));
    peerSockets.push(socket);
    const timer=setTimeout(()=>reject(new Error('crowd handshake timed out')),10000);
    socket.onopen=()=>socket.send(JSON.stringify({type:'join',name:`Crowd-${index}`,room,map:'tidal',mode:'normal'}));
    socket.onmessage=event=>{
     const message=JSON.parse(String(event.data));
     if(message.type==='welcome'){clearTimeout(timer);resolve()}
     if(message.type==='error'){clearTimeout(timer);reject(new Error(message.message))}
     if(message.type==='state'&&(message.projectiles||[]).some((p:any)=>p.owner===ownerId))remoteOwnerShot=true;
    };
    socket.onerror=()=>{clearTimeout(timer);reject(new Error('crowd socket failed'))};
   });
  }
 }
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
  // A ten-pilot room can down the test pilot before the movement probe; input
  // is ignored while respawning, so make sure it is alive first.
  await expect.poll(async()=>parseInt((await page.locator('#health-number').textContent())||'0',10),{timeout:8000}).toBeGreaterThan(0);
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
 await expect.poll(async()=>browserPeerStress?await page.evaluate(()=>Boolean((window as any).__crowdOwnerShot?.())):remoteOwnerShot,{timeout:4000}).toBeTruthy();
 await expect.poll(async()=>page.locator('#score-rows .score-row').count(),{timeout:3000}).toBe(14);
 const sampleStart=await page.evaluate(()=>performance.now());
 const profiler=process.env.ARENA_PROFILE_BROWSER==='1'?await page.context().newCDPSession(page):null;
 if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.start')}
 await page.waitForTimeout(5000);
 const performanceReport=await page.evaluate(since=>(window as any).__morrowTestPerformance(since),sampleStart);
 const environment={...performanceReport,browser:page.context().browser()?.version(),viewport:page.viewportSize(),sample_seconds:5,humans:10,peer_topology:browserPeerStress?'ten sockets in one renderer':'one rendered client plus nine Node peers'};
 await testInfo.attach('ten-player-performance.json',{body:JSON.stringify(environment,null,2),contentType:'application/json'});
 console.log('ten-player performance: '+JSON.stringify(environment));
 if(profiler){
  const {profile}=await profiler.send('Profiler.stop');
  await testInfo.attach('browser-cpu-profile.json',{body:JSON.stringify(profile),contentType:'application/json'});
  const nodes=new Map(profile.nodes.map((n:any)=>[n.id,n]));
  const counts=new Map<number,number>();
  for(const id of profile.samples||[])counts.set(id,(counts.get(id)||0)+1);
  console.log('CPU samples: '+JSON.stringify([...counts].sort((a,b)=>b[1]-a[1]).slice(0,14).map(([id,n])=>({samples:n,...nodes.get(id)?.callFrame}))));
 }
 expect(performanceReport.frames).toBeGreaterThan(200);
 expect(performanceReport.fps).toBeGreaterThanOrEqual(55);
 await page.evaluate(()=>{for(const socket of (window as typeof window & {__crowdSockets?:WebSocket[]}).__crowdSockets||[])socket.close();});
 for(const socket of peerSockets)socket.close();
 await expect.poll(async()=>(await (await request.get('/api/arena/rooms')).json()).length,{timeout:6000}).toBe(1);
 await page.close();
 await expect.poll(async()=>(await (await request.get('/api/arena/rooms')).json()).length,{timeout:6000}).toBe(0);
 expect(pageErrors).toEqual([]);
 }finally{for(const socket of peerSockets)socket.close()}
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

test('minimap only plots pilots inside the camera view, and concealment hides them',async({page})=>{
  const pageErrors:string[]=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto('/arena/?test-reconnect');
  await page.getByLabel('玩家名称').fill('MiniVerify');
  await page.getByRole('button',{name:'进入战场'}).click();
  await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
  await page.waitForTimeout(1400);

  const result=await page.evaluate(()=>{
    const w=window as any;
    const pilot=w.__morrowTestLocalPlayer();
    let mismatch=0,samples=0,offShown=0,insideShown=0;
    for(let dx=-2400;dx<=2400;dx+=200){
      for(let dy=-1600;dy<=1600;dy+=200){
        const x=pilot.x+dx,y=pilot.y+dy;
        const shown=w.__morrowTestMinimapShown({id:'enemy',x,y});
        const inside=w.__morrowTestProject(x,y).inside;
        samples++;
        if(shown!==inside)mismatch++;        // gating must match the view box exactly
        if(shown&&!inside)offShown++;        // never plot an off-screen pilot
        if(shown&&inside)insideShown++;
      }
    }
    return {
      self:w.__morrowTestMinimapShown({id:pilot.id,x:pilot.x,y:pilot.y}),
      concealed:w.__morrowTestMinimapShown({id:'enemy',x:null,y:null}),
      mismatch,samples,offShown,insideShown
    };
  });

  expect(result.self).toBe(true);            // your own marker is always shown
  expect(result.concealed).toBe(false);      // grass-concealed enemy (x/y null) stays hidden
  expect(result.offShown).toBe(0);           // the core rule: nothing off-screen on the map
  expect(result.insideShown).toBeGreaterThan(0);
  expect(result.mismatch).toBe(0);           // view gating == the drawn view box
  expect(pageErrors).toEqual([]);
});
