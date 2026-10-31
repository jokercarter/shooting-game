import {test,expect,Page} from '@playwright/test';

const guideKey='morrow-fields-guide-v1';
async function experienced(page:Page){
  await page.addInitScript(key=>localStorage.setItem(key,'done'),guideKey);
}

test('first-run guide precedes deployment, persists and can be reviewed',async({page,request})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/arena/');
  await page.getByLabel('Pilot name').fill('FirstPilot');
  await page.getByRole('button',{name:'Enter the arena'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#guide-step')).toHaveText('01 / 03');
  await expect(page.locator('#guide-note')).toContainText('You have not entered yet');
  expect((await (await request.get('/api/arena/rooms')).json()).length).toBe(0);
  await page.screenshot({path:'output/playwright/friends-guide.png'});
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.locator('#guide-title')).toContainText('weapon');
  await page.getByRole('button',{name:'Back'}).click();
  await expect(page.locator('#guide-step')).toHaveText('01 / 03');
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.locator('#guide-copy')).toContainText('level 1');
  await page.getByRole('button',{name:'Ready — enter the arena'}).click();
  await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
  expect(await page.evaluate(key=>localStorage.getItem(key),guideKey)).toBe('done');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Replay the tutorial'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#guide-note')).toContainText('The match is still running');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button',{name:'Back to Lobby',exact:true}).first().click();
  await page.getByRole('button',{name:'Enter the arena'}).click();
  await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(errors).toEqual([]);
});

test('guide can be skipped with keyboard and does not open again',async({page})=>{
  await page.goto('/arena/');
  await page.getByRole('button',{name:'Enter the arena'}).click();
  await expect(page.locator('#guide-next')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#guide-skip')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await page.evaluate(key=>localStorage.getItem(key),guideKey)).toBe('done');
});

test('a friend opens an invitation directly into the hosts room',async({browser,page,request})=>{
  await experienced(page);
  await page.goto('/arena/');
  await page.getByLabel('Pilot name').fill('Host');
  await page.getByRole('button',{name:'Enter the arena'}).click();
  await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
  const room=new URL(page.url()).searchParams.get('room')!;
  const context=await browser.newContext();
  const friend=await context.newPage();
  try{
    await experienced(friend);
    await friend.goto('/arena/?room='+room);
    await expect(friend.getByLabel('Room code')).toHaveValue(room);
    await expect(friend.locator('#invite-note')).toContainText(room);
    await friend.getByLabel('Pilot name').fill('Friend');
    await friend.getByRole('button',{name:'Enter the arena'}).click();
    await expect(friend.locator('#pilot-count')).toHaveText('2 / 20');
    await expect(page.locator('#pilot-count')).toHaveText('2 / 20');
    const rooms=await (await request.get('/api/arena/rooms')).json();
    expect(rooms.filter((item:any)=>item.code===room)).toHaveLength(1);
  }finally{await context.close()}
});

test('expired invites explain failure, retain the message and allow a fresh room',async({page})=>{
  await experienced(page);
  await page.goto('/arena/?room=NOPENO');
  await page.getByRole('button',{name:'Enter the arena'}).click();
  await expect(page.locator('#lobby-status')).toContainText('This room has closed');
  await page.waitForTimeout(4800); // the room refresh must not erase the error
  await expect(page.locator('#lobby-status')).toContainText('This room has closed');
  await page.getByRole('button',{name:'Create a new room instead'}).click();
  await expect(page.getByLabel('Room code')).toHaveValue('');
  await page.getByRole('button',{name:'Enter the arena'}).click();
  await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
  expect(new URL(page.url()).searchParams.get('room')).not.toBe('NOPENO');
});

test('private combat receipts expire and next round replaces the cached build',async({page,request})=>{
  await experienced(page);
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  const definitions=await (await request.get('/api/arena/maps')).json();
  const maps=Object.fromEntries(definitions.map(({id,...definition}:any)=>[id,definition]));
  let server:any;
  let player:any={id:'local',name:'Pilot',x:750,y:750,hue:'#55caff',skin:'wayfinder',hp:140,max_hp:140,armor:0,max_armor:100,energy:100,weapon:'pulse',owned_weapons:['pulse'],ammo:{pulse:{mag:-1,reserve:-1,reload_remaining:0}},upgrades:{vitality:2,rapid:1},stat_points:3,level:5,xp:500,xp_start:480,xp_to_next:220,score:100,kills:1,deaths:0,angle:0,dead:false,is_bot:false};
  const state=(extra:any={})=>({type:'state',room:'FRIEND',mode:'normal',mode_name:'Free-for-All',map:'tidal',round_number:1,round_elapsed:10,round_remaining:470,capacity:20,state_interval_ms:50,players:[player],projectiles:[],feed:[],winner:null,...extra});
  await page.routeWebSocket('**/arena/ws',socket=>{
    server=socket;
    socket.onMessage(raw=>{
      const message=JSON.parse(String(raw));
      if(message.type==='join')socket.send(JSON.stringify({...state(),type:'welcome',id:'local',maps,weapons:{pulse:{name:'Pulse Needle',kind:'bolt',clip:-1},flare:{name:'Flare Rocket',kind:'rocket'}}}));
    });
  });
  await page.goto('/arena/');
  await page.getByRole('button',{name:'Enter the arena'}).click();
  await expect(page.locator('#level-badge')).toHaveText('LV 5');
  player={...player,hp:0,dead:true,dead_for:.5,respawn_in:5,deaths:1,hit_feedback:{id:1,direction:'left',age:0},death_feedback:{id:1,cause:'combat',killer:'Enemy <pilot>',weapon:'flare'}};
  server.send(JSON.stringify(state()));
  await expect(page.locator('#damage-direction')).toContainText('Hit from the left');
  await expect(page.locator('#death-receipt')).toHaveText('Was taken out by Enemy <pilot> with Flare Rocket');
  await expect(page.locator('#death-banner')).toBeVisible();
  await expect(page.locator('#health-number')).toHaveText('0 / 140');
  await expect(page.locator('#level-badge')).toHaveText('LV 5');
  await page.screenshot({path:'output/playwright/friends-death-receipt.png'});
  await expect(page.locator('#damage-direction')).toBeHidden({timeout:2000});
  server.send(JSON.stringify(state({winner:'draw'})));
  await expect(page.locator('#match-result')).toBeVisible();
  await expect(page.locator('#match-result-title')).toHaveText('Draw');
  player={...player,hp:100,max_hp:100,dead:false,dead_for:0,respawn_in:0,level:1,xp:0,xp_start:0,xp_to_next:60,stat_points:0,upgrades:{vitality:0,rapid:0},score:0,kills:0,deaths:0,hit_feedback:null,death_feedback:null};
  server.send(JSON.stringify(state({round_number:2,round_remaining:480,round_elapsed:0})));
  await expect(page.locator('#level-badge')).toHaveText('LV 1');
  await expect(page.locator('#xp-label')).toHaveText('0 / 60 XP');
  await expect(page.locator('#health-number')).toHaveText('100 / 100');
  await expect(page.locator('[data-upgrade="vitality"] .upgrade-tier')).toHaveText('0/8');
  await expect(page.locator('#timer')).toHaveText('08:00');
  await expect(page.locator('#match-result')).toBeHidden();
  await expect(page.locator('#death-banner')).toBeHidden();
  await expect(page.getByText('LIVE FRONTIER',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('desktop lobby controls stay within their panels',async({page})=>{
  await page.goto('/arena/');
  for(const viewport of [{width:1280,height:720},{width:1440,height:1000},{width:1920,height:1080}]){
    await page.setViewportSize(viewport);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const fits=await page.locator('.lobby-chat-form').evaluate(element=>{
      const parent=element.getBoundingClientRect();
      return [...element.children].every(child=>{const r=child.getBoundingClientRect();return r.left>=parent.left-1&&r.right<=parent.right+1});
    });
    expect(fits).toBe(true);
    await expect(page.getByRole('button',{name:'Enter the arena'})).toBeInViewport();
    await page.screenshot({path:`output/playwright/friends-lobby-${viewport.width}.png`});
  }
});
