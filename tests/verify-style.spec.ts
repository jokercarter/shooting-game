import {test,expect} from '@playwright/test';

test('flat restyle renders without errors and uses the flat palette',async({page})=>{
  const pageErrors:string[]=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')pageErrors.push('console: '+message.text())});

  // Lobby screenshot.
  await page.goto('/arena/');
  await expect(page.getByRole('heading',{name:/苔木边境/})).toBeVisible();
  await page.screenshot({path:'output/playwright/flat-lobby.png',fullPage:true});

  // Enter the arena (default map: tidal).
  await page.getByLabel('玩家名称').fill('FlatVerify');
  await page.getByRole('button',{name:'进入战场'}).click();
  await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
  await expect(page.locator('#arena')).toBeVisible();
  await page.waitForTimeout(1200);

  // Move + shoot so pilots, weapons, muzzles and projectiles are on screen.
  const canvasBox=await page.locator('#arena').boundingBox();
  if(canvasBox){
    await page.locator('#arena').focus();
    await page.keyboard.down('d');await page.waitForTimeout(250);await page.keyboard.up('d');
    await page.keyboard.down('w');await page.waitForTimeout(250);await page.keyboard.up('w');
    const aimX=canvasBox.x+canvasBox.width*.7,aimY=canvasBox.y+canvasBox.height*.5;
    await page.mouse.move(aimX,aimY);
    await page.mouse.down();await page.waitForTimeout(700);await page.mouse.up();
    await page.waitForTimeout(200);
  }
  await page.screenshot({path:'output/playwright/flat-ingame.png'});
  await page.waitForTimeout(400);
  await page.screenshot({path:'output/playwright/flat-combat.png'});

  // Sample the live 2D canvas to confirm the flat palette is actually drawn.
  const summary=await page.evaluate(()=>{
    const c=document.querySelector('#arena') as HTMLCanvasElement|null;
    if(!c)return null;
    const ctx=c.getContext('2d');
    if(!ctx)return null;
    const w=c.width,h=c.height;
    const data=ctx.getImageData(0,0,w,h).data;
    let total=0,nonBlack=0,green=0,gray=0,blue=0,red=0;
    for(let i=0;i<data.length;i+=4*53){
      const r=data[i],g=data[i+1],b=data[i+2];total++;
      if(r+g+b>45)nonBlack++;
      if(g>70&&g>r+8&&g>b+8)green++;                 // ground / leaf
      if(Math.abs(r-g)<20&&Math.abs(g-b)<20&&r>105&&r<240)gray++; // stone slab
      if(b>r+15&&b>g+5)blue++;                        // water / blue team
      if(r>g+15&&r>b+10)red++;                        // ember / red team
    }
    return {w,h,total,nonBlack,green,gray,blue,red};
  });
  expect(summary).not.toBeNull();
  // The scene must be substantially filled (not a black screen).
  expect(summary!.nonBlack/summary!.total).toBeGreaterThan(0.25);
  // Flat ground/leaf greens should be present on the tidal map.
  expect(summary!.green).toBeGreaterThan(0);
  // Stone-grey obstacles should be present.
  expect(summary!.gray).toBeGreaterThan(0);
  // No runtime errors during the restyled render loop.
  expect(pageErrors).toEqual([]);

  await page.getByRole('button',{name:'返回大厅'}).click();
});

test('lobbed grenade draws its throw arc without runtime errors',async({page})=>{
  const pageErrors:string[]=[];
  page.on('pageerror',error=>pageErrors.push(error.message));

  await page.goto('/arena/?test-reconnect');
  await page.getByLabel('玩家名称').fill('ArcVerify');
  await page.getByRole('button',{name:'进入战场'}).click();
  await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
  await page.waitForTimeout(1200);

  // The dev hook mirrors a real lob: ground path, flight time and blast radius.
  const spawned=await page.evaluate(()=>{
    const spawn=(window as any).__morrowTestSpawnArc;
    if(typeof spawn!=='function')return null;
    const shot=spawn({dir:0,weapon:'lobber'});
    return shot?{kind:shot.kind,life:shot.total_life,blast:shot.blast}:null;
  });
  expect(spawned).not.toBeNull();
  expect(spawned!.kind).toBe('arc');
  expect(spawned!.life).toBeGreaterThan(0);
  expect(spawned!.blast).toBeGreaterThan(0);

  await page.waitForTimeout(120);
  await page.screenshot({path:'output/playwright/arc-flight.png'});
  await page.waitForTimeout(300);
  await page.screenshot({path:'output/playwright/arc-apex.png'});
  expect(pageErrors).toEqual([]);
});

test('blast feedback shakes the view and leaves rising smoke',async({page})=>{
  const pageErrors:string[]=[];
  page.on('pageerror',error=>pageErrors.push(error.message));

  await page.goto('/arena/?test-reconnect');
  await page.getByLabel('玩家名称').fill('BlastVerify');
  await page.getByRole('button',{name:'进入战场'}).click();
  await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
  await page.waitForTimeout(1400);

  const after=await page.evaluate(()=>{
    const pilot=(window as any).__morrowTestLocalPlayer?.();
    (window as any).__morrowTestClear?.();
    (window as any).__morrowTestImpact?.({weapon:'flare',x:pilot.x+180,y:pilot.y-30});
    return (window as any).__morrowTestRenderState?.();
  });
  // The shockwave has to move the view and drop smoke, or the blast reads flat.
  expect(after.screen_shake).toBeGreaterThan(5);
  expect(after.camera_shake).toBeGreaterThan(3);
  expect(after.smoke).toBeGreaterThan(5);
  expect(after.particles).toBeGreaterThan(after.smoke);

  // Bots keep firing in the background, so only the immediate reaction is
  // asserted here; a live match would add its own smoke later on.
  expect(pageErrors).toEqual([]);
});

test('explosion tremor is view-gated and falls off with distance',async ({page}) => {
  const pageErrors:string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/arena/?test-reconnect');
  await page.getByLabel('玩家名称').fill('TremorVerify');
  await page.getByRole('button', {name: '进入战场'}).click();
  await expect(page.getByText('LIVE FRONTIER', {exact: true})).toBeVisible();
  await page.waitForTimeout(1400);

  const result = await page.evaluate(() => {
    const w = window as any;
    const pilot = w.__morrowTestLocalPlayer();
    // Try several directions so the sample stays on screen even when the
    // pilot is pinned against the map edge.
    const sample = (distance: number) => {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]];
      for (const [ux, uy] of dirs) {
        const x = pilot.x + ux * distance, y = pilot.y + uy * distance;
        if (w.__morrowTestProject(x, y).inside) {
          return {distance, scale: w.__morrowTestTriggerExplosion({x, y, blast: 82}) };
        }
      }
      return {distance, scale: -1};
    };
    return {
      near: sample(30),
      mid: sample(180),
      far: sample(300),
      behind: w.__morrowTestTriggerExplosion({x: pilot.x - 1600, y: pilot.y, blast: 82}),
    };
  });

  // Off-screen blasts never move the view, however large.
  expect(result.behind).toBe(0);
  // On screen: point blank is full strength and it decays with distance.
  if (result.near.scale >= 0 && result.mid.scale >= 0 && result.far.scale >= 0) {
    expect(result.near.scale).toBeGreaterThan(0.9);
    expect(result.mid.scale).toBeLessThan(result.near.scale);
    expect(result.far.scale).toBeLessThan(result.mid.scale);
  }
  expect(pageErrors).toEqual([]);
});
