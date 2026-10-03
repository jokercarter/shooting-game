(() => {
  const canvas = document.querySelector('#arena'), ctx = canvas.getContext('2d'), W = 960, H = 640;
  // Keep gameplay coordinates stable while giving the canvas a dense backing
  // store. This removes the soft browser upscale on Retina/high-DPI screens
  // without changing the pixel-art proportions or input math.
  function setupCanvasResolution(){
    const ratio=Math.max(1,Math.min(2.5,window.devicePixelRatio||1)),width=Math.round(W*ratio),height=Math.round(H*ratio);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.imageSmoothingEnabled=false;
  }
  setupCanvasResolution();window.addEventListener('resize',setupCanvasResolution);
  const WORLD_W = 3000, WORLD_H = 2000, WORLD_SCALE = 3.125;
  const CAMERA_ZOOM = 1.08;
  const CAMERA_MOUSE_LOOK_AHEAD = 128;
  const miniMap = document.querySelector('#mini-map'), miniCtx = miniMap.getContext('2d');
  const ui = {
    start: document.querySelector('#start-screen'), startButton: document.querySelector('#start'), watchRoom: document.querySelector('#watch-room'),
    restart: document.querySelector('#restart'), name: document.querySelector('#nickname'),
    room: document.querySelector('#room-code'), status: document.querySelector('#lobby-status'),
    health: document.querySelector('#health-fill'), healthNumber: document.querySelector('#health-number'), armor: document.querySelector('#armor-fill'), energy: document.querySelector('#energy-fill'),
    score: document.querySelector('#score'), kills: document.querySelector('#kills'),
    deaths: document.querySelector('#deaths'), timer: document.querySelector('#timer'),
    dash: document.querySelector('#dash-fill'), weapon: document.querySelector('#weapon-name'),
    ammo: document.querySelector('#ammo'), info: document.querySelector('#weapon-info'), reloadStatus: document.querySelector('#reload-status'), reloadFill: document.querySelector('#reload-fill'), reloadLabel: document.querySelector('#reload-label'),
    upgradePoints: document.querySelector('#upgrade-points'),
    confirmUpgrade: document.querySelector('#confirm-upgrade'),
    state: document.querySelector('#state-label'), perf: document.querySelector('#perf-label'), settings: document.querySelector('#settings'), optionsPanel: document.querySelector('#options-panel'), copyRoom: document.querySelector('#copy-room'),
    toast: document.querySelector('#toast'), mapName: document.querySelector('#map-name'),
    pilotCount: document.querySelector('#pilot-count'), deathBanner: document.querySelector('#death-banner'),
    deathStatus: document.querySelector('#death-status'), matchResult: document.querySelector('#match-result'), matchResultTitle: document.querySelector('#match-result-title'), matchResultSubtitle: document.querySelector('#match-result-subtitle'), matchResultRows: document.querySelector('#match-result-rows'), mapVote: document.querySelector('#map-vote'), mapVoteStatus: document.querySelector('#map-vote-status'), mapVoteProgressFill: document.querySelector('#map-vote-progress-fill'), matchResultReplay: document.querySelector('#match-result-replay'), matchResultAgain: document.querySelector('#match-result-again'), matchResultLobby: document.querySelector('#match-result-lobby'), replayFile: document.querySelector('#option-replay-file'), replayControls: document.querySelector('#replay-controls'), replayToggle: document.querySelector('#replay-toggle'), replaySeek: document.querySelector('#replay-seek'), replayTime: document.querySelector('#replay-time'), replayExit: document.querySelector('#replay-exit'), skinCycle: document.querySelector('#skin-cycle'),
    skinName: document.querySelector('#skin-name'), lobbyChatList: document.querySelector('#lobby-chat-list'),
    lobbyChatForm: document.querySelector('#lobby-chat-form'), lobbyChatInput: document.querySelector('#lobby-chat-input'),
  };
  const WEAPON_KEYS = ['pulse','lobber','flame','rotary','flare','prism','seeker','cursor','scatter','rapid_flare','rapid_lobber','healing_wave','energy_sniper','bug'];
  const KEY_WEAPONS = {'1':'pulse','2':'lobber','3':'flame','4':'rotary','5':'flare','6':'prism','7':'seeker','8':'cursor','0':'scatter','n':'rapid_flare','m':'rapid_lobber','h':'healing_wave','j':'energy_sniper','l':'bug'};
  const PILOT_SKINS = [
    {id:'wayfinder',name:'巡林斥候'},
    {id:'orchard',name:'阳谷采集者'},
    {id:'ember',name:'赤叶守卫'},
    {id:'gear',name:'齿轮信使'},
  ];
  const PILOT_STYLE = {
    wayfinder:{trousers:'#2d3540',headgear:'#28283b',detail:'#d5e3d2',pack:'#364238'},
    orchard:{trousers:'#364b33',headgear:'#d2bd66',detail:'#6f8e4b',pack:'#536d3c'},
    ember:{trousers:'#4b3330',headgear:'#613b34',detail:'#f0ab64',pack:'#72483b'},
    gear:{trousers:'#364b54',headgear:'#dba84e',detail:'#d2a65b',pack:'#526871'},
  };
  // Figma-inspired visual tokens. Keeping the palette here makes the canvas
  // art easier to tune as one system when a Figma library is connected later.
  const ART_TOKENS = {
    ink:'#14211c',deepInk:'#0b1712',paper:'#f3edcf',
    shadow:'rgba(8,18,14,.46)',softShadow:'rgba(8,18,14,.28)',
    gold:'#e6c96f',cream:'#fff5c7',
    mapGlow:{tidal:'#8ed6a4',glass:'#d6d87d',ember:'#e5a06f'}
  };
  const keys = new Set(), mouse = {x:W/2,y:H/2,down:false};
  const touch = {moveId:null,aimId:null,moveX:0,moveY:0,originX:0,originY:0};
  let socket, lobbySocket, lobbyReconnectTimer, id, room, roomCapacity=20, map='tidal', mode='normal', modeName='Normal Deathmatch', maps={}, weapons={}, players=[], previousPlayers=new Map(), spectatorMode=false, privatePlayer=null, privateVotedMap=null, lastStateMessage=null;
  let cameraX=W/2,cameraY=H/2,spectatorTarget=null,spectatorId=null;
  let cameraShake=0, screenShake=0, explosionFlash=0, damageFlash=0, hitConfirm=0, weaponRecoil=new Map();
  let projectiles=[], pickups=[], pickupSpawns=[], resources=[], resourceSpawns=[], previousProjectileIds=new Set(), projectileTrails=new Map(), particles=[], rings=[], muzzles=[], damageNumbers=[], started=false;
  let flags={}, teamScores={'0':0,'1':0}, winner=null;
  let selectedMap='tidal', selectedMode='normal', selectedSkin='wayfinder', selectedUpgrade='vitality', last=0, nextRenderAt=0, stateAt=0, stateIntervalMs=50, startedAt=0, dashReadyAt=0, inputTimer, inputIntervalMs=25, pingTimer, roomTimer, toastTimer, reconnectTimer=null, reconnectAttempts=0, intentionalSocketClose=false;
  let latestFeedId=0, rackSignature='', lastHudAt=0, fpsFrames=0, fpsWindowAt=performance.now(), fpsValue=0, pingValue=0, resultShown=false;
  const groundPatterns=new Map(), MAX_RENDER_FPS=100, MAX_PARTICLES=520, MAX_RINGS=110, MAX_MUZZLES=48, HUD_INTERVAL_MS=100, PICKUP_RESPAWN_SECONDS=45, RESOURCE_RESPAWN_SECONDS=38;
  // The Figma visual kit is exported as small standalone SVG sprites at
  // build time.  Canvas keeps the procedural fallback below so a slow or
  // offline asset request never prevents the match from rendering.
  const GENERATED_ASSET_SOURCES={
    pilots:{wayfinder:'/arena/generated/pilot-wayfinder-body.svg',orchard:'/arena/generated/pilot-orchard-body.svg',ember:'/arena/generated/pilot-ember-body.svg',gear:'/arena/generated/pilot-gear-body.svg'},
    weapons:{pulse:'/arena/generated/weapon-pulse.svg',flame:'/arena/generated/weapon-flame.svg',lobber:'/arena/generated/weapon-lobber.svg',prism:'/arena/generated/weapon-prism.svg',heal:'/arena/generated/weapon-heal.svg'},
    obstacles:{tree:'/arena/generated/obstacle-tree.svg',stump:'/arena/generated/obstacle-stump.svg',crates:'/arena/generated/obstacle-crates.svg',wall:'/arena/generated/obstacle-wall.svg',spikes:'/arena/generated/obstacle-spikes.svg'},
    grounds:{tidal:'/arena/generated/ground-tidal.svg',glass:'/arena/generated/ground-glass.svg',ember:'/arena/generated/ground-ember.svg'}
  };
  const generatedAssets={pilots:new Map(),weapons:new Map(),obstacles:new Map(),grounds:new Map()};
  const WEAPON_SPRITE_KEYS={pulse:'pulse',flame:'flame',lobber:'lobber',rapid_lobber:'lobber',prism:'prism',flare:'prism',rapid_flare:'prism',healing_wave:'heal'};
  function loadGeneratedAssets(){
    for(const [group,entries] of Object.entries(GENERATED_ASSET_SOURCES))for(const [key,src] of Object.entries(entries)){
      const image=new Image();image.decoding='async';image.onload=()=>{if(group==='grounds')groundPatterns.delete(key)};image.src=src;generatedAssets[group].set(key,image);
    }
  }
  function generatedImage(group,key){const image=generatedAssets[group]?.get(key);return image&&image.complete&&image.naturalWidth>0?image:null}
  function drawGeneratedObstacle(key,x,y,w,h,fit=1){
    const image=generatedImage('obstacles',key);if(!image)return false;
    const scale=Math.max(w/image.naturalWidth,h/image.naturalHeight)*fit,dw=image.naturalWidth*scale,dh=image.naturalHeight*scale;
    ctx.save();ctx.imageSmoothingEnabled=false;ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.drawImage(image,Math.round(x+(w-dw)/2),Math.round(y+(h-dh)/2),Math.round(dw),Math.round(dh));ctx.restore();return true;
  }
  function drawSlayWall(x,y,w,h,variant=0,palette){
    // Slay-style masonry: a quiet grout bed plus offset, individually chipped
    // stones. Keeping the seams irregular prevents the obstacle from reading
    // as a repeated UI panel while preserving the rectangular collision body.
    const cell=Math.max(22,Math.min(32,Math.round(Math.min(w,h)*.42))),gap=4;
    const hash=n=>{n=(n|0)+0x6d2b79f5;n=Math.imul(n^n>>>15,1|n);n^=n+Math.imul(n^n>>>7,61|n);return((n^n>>>14)>>>0)/4294967296};
    const stonePath=(bx,by,bw,bh,seed,shrink=0)=>{
      const left=bx+shrink,top=by+shrink,right=bx+bw-shrink,bottom=by+bh-shrink;
      const cut=Math.max(3,Math.round(Math.min(right-left,bottom-top)*(.16+hash(seed)*.08)));
      const n=(hash(seed+4)-.5)*2,j=(hash(seed+9)-.5)*2;
      ctx.beginPath();ctx.moveTo(Math.round(left+cut),Math.round(top+j));
      ctx.lineTo(Math.round(right-cut+n),Math.round(top-j));ctx.lineTo(Math.round(right+n),Math.round(top+cut));
      ctx.lineTo(Math.round(right-j),Math.round(bottom-cut));ctx.lineTo(Math.round(right-cut),Math.round(bottom+j));
      ctx.lineTo(Math.round(left+cut-n),Math.round(bottom-j));ctx.lineTo(Math.round(left-n),Math.round(bottom-cut));
      ctx.lineTo(Math.round(left+j),Math.round(top+cut));ctx.closePath();
    };
    ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.beginPath();ctx.rect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));ctx.clip();
    ctx.fillStyle=palette.dark+'22';ctx.fillRect(Math.round(x+3),Math.round(y+5),Math.max(2,Math.round(w-6)),Math.max(2,Math.round(h-4)));
    for(let row=0;row<Math.ceil(h/cell)+1;row++)for(let col=-1;col<Math.ceil(w/cell)+1;col++){
      const seed=(row*97+col*131+variant*173)|0;
      const rowOffset=(row&1)*Math.round(cell*.34),jx=Math.round((hash(seed)-.5)*5),jy=Math.round((hash(seed+2)-.5)*4);
      const bx=Math.round(x+col*cell-rowOffset+gap+jx),by=Math.round(y+row*cell+gap+jy);
      const bw=Math.min(Math.round(cell-gap*1.25+hash(seed+3)*4),Math.round(x+w-bx-gap));
      const bh=Math.min(Math.round(cell-gap*1.35+hash(seed+5)*4),Math.round(y+h-by-gap));
      if(bw<13||bh<13)continue;
      stonePath(bx+3,by+5,bw,bh,seed+11);ctx.fillStyle=palette.dark;ctx.fill();
      stonePath(bx,by,bw,bh,seed+13,1);ctx.fillStyle=hash(seed+7)>.58?(palette.mid||palette.base):palette.base;ctx.fill();
      // Short bevels and chips give each block a hand-placed pixel silhouette.
      ctx.fillStyle=palette.light+'cc';ctx.beginPath();ctx.moveTo(bx+4,by+Math.round(bh*.23));ctx.lineTo(bx+Math.round(bw*.27),by+3);ctx.lineTo(bx+Math.round(bw*.72),by+3);ctx.lineTo(bx+Math.round(bw*.61),by+5);ctx.lineTo(bx+6,by+Math.round(bh*.32));ctx.closePath();ctx.fill();
      ctx.fillStyle=palette.line+'cc';ctx.beginPath();ctx.moveTo(bx+Math.round(bw*.18),by+bh-4);ctx.lineTo(bx+Math.round(bw*.86),by+bh-4);ctx.lineTo(bx+Math.round(bw*.72),by+bh-2);ctx.lineTo(bx+Math.round(bw*.24),by+bh-2);ctx.closePath();ctx.fill();
      if(hash(seed+15)>.36){ctx.strokeStyle=palette.dark;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(bx+Math.round(bw*.55),by+Math.round(bh*.38));ctx.lineTo(bx+Math.round(bw*.44),by+Math.round(bh*.55));ctx.lineTo(bx+Math.round(bw*.62),by+Math.round(bh*.72));ctx.stroke();}
      if(hash(seed+19)>.7){ctx.fillStyle=palette.mark;ctx.fillRect(bx+Math.round(bw*.18),by+Math.round(bh*.57),Math.max(2,Math.round(bw*.1)),2);}
    }
    ctx.globalAlpha=1;ctx.restore();
  }
  loadGeneratedAssets();
  let minimapStaticCanvas=null,minimapStaticKey='';
  const MISSILE_KINDS=new Set(['rocket','seeker','cursor','bug']);
  const MAX_REPLAY_FRAMES=240;
  let replayFrames=[];
  const displaySettings={lowEffects:false,minimap:true,weapons:true,chat:true,perf:true,minimapScale:1,volume:.35};
  let audioContext=null,audioLastShotAt=0,replayMode=false,replayData=null,replayElapsed=0,replayLastAt=0,replayFrameIndex=0,replayDuration=0,replayPaused=false,replayLoopActive=false,replayStopTimer=null;

  const wsUrl=()=>(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws/arena';
  const lobbyWsUrl=()=>(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws/arena/lobby';
  const testReconnectMode=new URLSearchParams(location.search).has('test-reconnect');
  const PRIVATE_PLAYER_FIELDS=['id','energy','owned_weapons','upgrades','ammo'];
  function privatePlayerFields(player){
    if(!player)return null;
    const fields={};for(const key of PRIVATE_PLAYER_FIELDS)if(Object.prototype.hasOwnProperty.call(player,key))fields[key]=player[key];
    return fields;
  }
  function hasOwnerPrivateFields(player){
    return Number.isFinite(player?.energy)&&Array.isArray(player.owned_weapons)&&
      player.upgrades&&typeof player.upgrades==='object'&&player.ammo&&typeof player.ammo==='object';
  }
  function appendLobbyChat(message){
    const list=ui.lobbyChatList;if(!list)return;
    list.querySelector('.lobby-chat-empty')?.remove();
    const row=document.createElement('div');row.className='lobby-chat-line';
    const timeLabel=document.createElement('span');timeLabel.className='lobby-chat-time';
    timeLabel.textContent=new Date((message.at||Date.now()/1000)*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    const name=document.createElement('b');name.className='lobby-chat-name';name.textContent=message.name||'Rifter';
    const content=document.createElement('span');content.textContent=message.content||'';
    row.append(timeLabel,name,content);list.append(row);
    while(list.children.length>30)list.firstElementChild.remove();
    list.scrollTop=list.scrollHeight;
  }
  function connectLobbyChat(){
    if(started||!ui.lobbyChatList||[WebSocket.CONNECTING,WebSocket.OPEN].includes(lobbySocket?.readyState))return;
    try{lobbySocket=new WebSocket(lobbyWsUrl())}catch{return}
    const current=lobbySocket;
    current.onmessage=event=>{
      let message;try{message=JSON.parse(event.data)}catch{return}
      if(message.type==='history'){
        ui.lobbyChatList.replaceChildren();
        (message.messages||[]).slice(-30).forEach(appendLobbyChat);
      }else if(message.type==='chat')appendLobbyChat(message.message);
      else if(message.type==='error')toast(message.message);
    };
    current.onclose=()=>{
      if(lobbySocket===current)lobbySocket=null;
      clearTimeout(lobbyReconnectTimer);
      if(!started)lobbyReconnectTimer=setTimeout(connectLobbyChat,3000);
    };
    current.onerror=()=>{};
  }
  const PIXEL_SPRITES={
    pulse:{cell:2,trail:'#376bca',colors:{b:'#164090',B:'#4d8df0',w:'#e7f5ff',W:'#ffffff'},rows:['....b....','...bBb...','bbBWWBbb.','...bBb...','....b....']},
    lobber:{cell:2,trail:'#96512d',colors:{d:'#492d24',b:'#9c4f29',B:'#e28a3e',w:'#ffd77c'},rows:['...d...','..bBb..','.bBwwB.','bBBwwBb','bBBBBBb','.bBBb..','..b....']},
    rotary:{cell:2,trail:'#b5792b',colors:{d:'#69431f',b:'#c37b26',B:'#f4bf54',w:'#fff0bf'},rows:['....b...','wwbBBb..','wwBBwBb.','wwbBBb..','....b...']},
    flare:{cell:2,trail:'#9d5235',colors:{d:'#542e30',b:'#9a3831',B:'#dc5540',o:'#f38a4c',O:'#ffc36a',w:'#fff0bf',W:'#ffffff','>':'#fff4cf'},rows:['.....w.....','....Bww....','dBBBBBOOOW.','dBBBBBOOW>>','dBBBBBOOOW.','....Bww....','.....w.....']},
    prism:{cell:2,trail:'#3b9964',colors:{d:'#174d35',b:'#267b4d',B:'#58cf79',g:'#b7f37a',G:'#d8ffa0',w:'#efffc9'},rows:['....g....','...bBg...','dBBGwwGBd','...bBg...','....g....']},
    seeker:{cell:2,trail:'#ae803e',colors:{d:'#523a25',b:'#9b6a2d',B:'#e2a33e',o:'#ffcc62',O:'#f0b94e',w:'#fff3cc','>':'#fff3cc'},rows:['......w....','....bbBw...','dBBBBBBBO>>','....bbBw...','......w....']},
    cursor:{cell:2,trail:'#467ba5',colors:{d:'#263e55',b:'#347ab0',B:'#61bde9',o:'#b6e6ff',O:'#a3ddff',w:'#f0fbff','>':'#ffffff'},rows:['......w....','....bbBo...','dBBBBBBBO>>','....bbBo...','......w....']},
    rapid_flare:{cell:2,trail:'#a96342',colors:{d:'#542e30',b:'#9a3831',B:'#dc5540',o:'#f38a4c',O:'#ffc36a',w:'#fff0bf',W:'#ffffff','>':'#fff4cf'},rows:['.....w.....','....Bww....','dBBBBBOOOW.','dBBBBBOOOW>>','dBBBBBOOOW.','....Bww....','.....w.....']},
    rapid_lobber:{cell:2,trail:'#a96c38',colors:{d:'#503327',b:'#9e572e',B:'#df8941',w:'#ffdc91'},rows:['...d...','..bBb..','.bBwwB.','bBBwwBb','bBBBBBb','.bBBb..','..b....']},
    bug:{cell:2,trail:'#8d5276',colors:{d:'#3d2b42',b:'#8e456b',B:'#d06b91',o:'#ffc0a0',w:'#fff0dc'},rows:['.d.b.d...','..bbbbb..','.bBBwBBb.','dBBBoBBBd','.bBBBBBb.','..b.b.b..','d.......d']}
    ,flame:{cell:2,trail:'#b74c2f',colors:{d:'#5a2524',b:'#bc4228',B:'#ef6931',o:'#ff9a3c',O:'#ffd36b',w:'#fff2bd'},rows:['....w....','...oOo...','..bOOOb..','.bBooOBb.','bBBBBBBb.','...bb....']}
    ,scatter:{cell:2,trail:'#aa7939',colors:{d:'#54402c',b:'#b38343',B:'#edc56c',w:'#fff2c7'},rows:['..w..','bBWBb','BBBBB','bBWBb','..w..']}
    ,healing_wave:{cell:2,trail:'#429c75',colors:{d:'#124b3a',g:'#24775a',G:'#58bf8c',w:'#e6ffe9'},rows:['...g...','..gGg..','.gGwwGg','gGwwwwG','.gGwwGg','..gGg..','...g...']}
    ,energy_sniper:{cell:2,trail:'#a9434f',colors:{d:'#56272f',b:'#8e3540',B:'#d45762',w:'#ffd9d5',W:'#ffffff'},rows:['....w....','...bBb...','ddBBWWBdd','...bBb...','....w....']}
  };
  const send=data=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(data))};
  const mapDef=()=>maps[map]||{accent:'#55d7c1',ground:'#10252a',obstacles:[],cover:[]};
  const localPlayer=()=>players.find(p=>p.id===id);
  if(testReconnectMode){
    window.__morrowTestLocalPlayer=()=>{const p=localPlayer();return p?{id:p.id,x:p.x,y:p.y,weapon:p.weapon,owned_weapons:p.owned_weapons,ammo:p.ammo,energy:p.energy,armor:p.armor,state_interval_ms:stateIntervalMs,input_interval_ms:inputIntervalMs,render_target_fps:MAX_RENDER_FPS}:null};
    window.__morrowTestRenderState=()=>({canvas_width:canvas.width,canvas_height:canvas.height,dpr:window.devicePixelRatio,resource_spawns:resourceSpawns.length,resources:resources.length,screen_shake:screenShake,explosion_flash:explosionFlash,rings:rings.length});
    window.__morrowTestTriggerExplosion=({x,y,blast=72}={})=>{
      const xx=Number.isFinite(x)?x:cameraX,yy=Number.isFinite(y)?y:cameraY,seed=Math.floor(Math.random()*32),color='#e2a33e',power=1.5;
      rings.push({x:xx,y:yy,life:660,max:660,color,r:blast*.56*power,kind:'seeker',blast,power,seed,layer:'main'});
      rings.push({x:xx,y:yy,life:820,max:820,color:'#fff0a9',r:blast*.9*power,kind:'seeker',blast,power:power*1.08,seed:seed+7,layer:'outer'});
      rings.push({x:xx,y:yy,life:320,max:320,color:'#ffb653',r:blast*.3*power,kind:'seeker',blast:blast*.45,power,seed:seed+13,layer:'core'});
      burst(xx,yy,color,42,'seeker');
      const shakeScale=triggerExplosionFeedback(xx,yy,blast,15,22);
      triggerExplosionFlash(.72);
      return shakeScale;
    };
  }
  function updateCamera(){
    const own=localPlayer();
    let p=own;
    if(spectatorMode){
      const alive=players.filter(player=>!player.dead&&Number.isFinite(player.x)&&Number.isFinite(player.y));
      p=alive.find(player=>player.id===spectatorId)||alive[0]||null;
      spectatorId=p?.id||null;spectatorTarget=p||null;
    }else if(own?.dead){
      const alive=players.filter(player=>player.id!==own.id&&!player.dead&&Number.isFinite(player.x)&&Number.isFinite(player.y));
      p=alive.find(player=>player.id===spectatorId)||alive.sort((a,b)=>Math.hypot(a.x-cameraX,a.y-cameraY)-Math.hypot(b.x-cameraX,b.y-cameraY))[0]||own;
      spectatorId=p?.id===own.id?null:p?.id||null;spectatorTarget=p?.id===own.id?null:p;
    }else{spectatorTarget=null;spectatorId=null}
    const point=p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?renderPoint(p):{x:WORLD_W/2,y:WORLD_H/2};
    const mouseBiasX=Math.max(-1,Math.min(1,(mouse.x-W/2)/(W*.5)));
    const mouseBiasY=Math.max(-1,Math.min(1,(mouse.y-H/2)/(H*.5)));
    const viewHalfW=W/(2*CAMERA_ZOOM),viewHalfH=H/(2*CAMERA_ZOOM);
    const targetX=Math.max(viewHalfW,Math.min(WORLD_W-viewHalfW,point.x+mouseBiasX*CAMERA_MOUSE_LOOK_AHEAD));
    const targetY=Math.max(viewHalfH,Math.min(WORLD_H-viewHalfH,point.y+mouseBiasY*CAMERA_MOUSE_LOOK_AHEAD));
    if(Math.hypot(point.x-cameraX,point.y-cameraY)>900){cameraX=targetX;cameraY=targetY}
    else{cameraX+=(targetX-cameraX)*.18;cameraY+=(targetY-cameraY)*.18}
  }
  function screenToWorld(x,y){return{x:Math.max(0,Math.min(WORLD_W,cameraX+(x-W/2)/CAMERA_ZOOM)),y:Math.max(0,Math.min(WORLD_H,cameraY+(y-H/2)/CAMERA_ZOOM))}}
  function visibleRect(x,y,w=0,h=0,padding=64){
    const left=cameraX-W/(2*CAMERA_ZOOM)-padding,right=cameraX+W/(2*CAMERA_ZOOM)+padding;
    const top=cameraY-H/(2*CAMERA_ZOOM)-padding,bottom=cameraY+H/(2*CAMERA_ZOOM)+padding;
    return x+w>=left&&x<=right&&y+h>=top&&y<=bottom;
  }
  function toast(message){ui.toast.textContent=message;ui.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),1900)}
  function loadDisplaySettings(){
    for(const key of Object.keys(displaySettings)){
      const stored=localStorage.getItem('morrow-fields-'+key);
      if(stored!==null){
        if(key==='minimapScale'||key==='volume'){const numeric=Number.parseFloat(stored);displaySettings[key]=Number.isFinite(numeric)?numeric:(key==='volume'?.35:1)}
        else displaySettings[key]=stored==='true';
      }
    }
    applyDisplaySettings();
  }
  function applyDisplaySettings(){
    document.body.classList.toggle('low-effects',displaySettings.lowEffects);
    document.body.classList.toggle('hide-minimap',!displaySettings.minimap);
    document.body.classList.toggle('hide-loadout',!displaySettings.weapons);
    document.body.classList.toggle('hide-chat',!displaySettings.chat);
    document.body.classList.toggle('hide-perf',!displaySettings.perf);
    document.documentElement.style.setProperty('--mini-scale',String(displaySettings.minimapScale));
    if(audioContext)audioContext.resume().catch(()=>{});
    for(const [key,value] of Object.entries(displaySettings)){
      const input=document.querySelector('#option-'+key.replace(/[A-Z]/g,match=>'-'+match.toLowerCase()));if(input)input.checked=value;
      if(key==='minimapScale'&&input){input.value=String(value);const output=document.querySelector('#option-minimap-scale-value');if(output)output.textContent=Math.round(value*100)+'%'}
      if(key==='volume'&&input){input.value=String(value);const output=document.querySelector('#option-volume-value');if(output)output.textContent=Math.round(value*100)+'%'}
    }
    if(ui.settings)ui.settings.setAttribute('aria-expanded',String(!ui.optionsPanel?.classList.contains('hidden')));
  }
  function setDisplaySetting(key,value){
    if(!(key in displaySettings))return;
    displaySettings[key]=key==='minimapScale'?Math.max(.75,Math.min(1.4,Number(value)||1)):key==='volume'?Math.max(0,Math.min(1,Number(value)||0)):Boolean(value);
    localStorage.setItem('morrow-fields-'+key,String(displaySettings[key]));applyDisplaySettings();
  }
  function ensureAudio(){
    if(audioContext)return audioContext.resume().catch(()=>{});
    const AudioCtor=window.AudioContext||window.webkitAudioContext;if(!AudioCtor)return;
    try{audioContext=new AudioCtor();audioContext.resume().catch(()=>{})}catch{}
  }
  function playSound(type,kind='pulse'){
    if(!audioContext||displaySettings.volume<=0)return;
    const now=performance.now();
    if(type==='shot'&&now-audioLastShotAt<45)return;
    if(type==='shot')audioLastShotAt=now;
    const start=audioContext.currentTime,osc=audioContext.createOscillator(),gain=audioContext.createGain();
    const missile=MISSILE_KINDS.has(kind),explosion=type==='explosion';
    osc.type=explosion?'sawtooth':missile?'triangle':'square';
    const base=explosion?75:missile?150:260;
    osc.frequency.setValueAtTime(base*(.92+Math.random()*.16),start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(35,base*(explosion?.32:.58)),start+(explosion?.22:.06));
    gain.gain.setValueAtTime(Math.max(.001,displaySettings.volume*(explosion?.22:.055)),start);
    gain.gain.exponentialRampToValueAtTime(.001,start+(explosion?.24:.07));
    osc.connect(gain);gain.connect(audioContext.destination);osc.start(start);osc.stop(start+(explosion?.25:.08));
  }
  function recordReplayState(message){
    if(!started)return;
    replayFrames.push({
      at:Math.round(performance.now()-startedAt),
      players:(message.players||[]).map(player=>({id:player.id,name:player.name,x:player.x,y:player.y,hp:player.hp,score:player.score,kills:player.kills,deaths:player.deaths,weapon:player.weapon,skin:player.skin,team:player.team,is_zombie:player.is_zombie,dead:player.dead})),
      projectiles:(message.projectiles||[]).map(projectile=>({id:projectile.id,owner:projectile.owner,x:projectile.x,y:projectile.y,vx:projectile.vx,vy:projectile.vy,weapon:projectile.weapon,kind:projectile.kind,damage:projectile.damage,blast:projectile.blast})),
    });
    if(replayFrames.length>MAX_REPLAY_FRAMES)replayFrames.splice(0,replayFrames.length-MAX_REPLAY_FRAMES);
  }
  function downloadReplay(){
    if(!replayFrames.length){toast('暂无可保存的战斗片段');return}
    const payload={version:1,game:'Morrow Fields',room,map,mode,created_at:new Date().toISOString(),frames:replayFrames};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='morrow-fields-replay-'+(room||'match')+'.json';link.click();URL.revokeObjectURL(url);toast('短回放已保存');
  }
  function resetLobbyHud(){
    players=[];previousPlayers=new Map();projectiles=[];pickups=[];pickupSpawns=[];resources=[];resourceSpawns=[];flags={};teamScores={'0':0,'1':0};winner=null;spectatorId=null;spectatorTarget=null;spectatorMode=false;privatePlayer=null;privateVotedMap=null;lastStateMessage=null;
    particles=[];rings=[];muzzles=[];damageNumbers=[];projectileTrails.clear();previousProjectileIds.clear();weaponRecoil.clear();cameraShake=0;screenShake=0;explosionFlash=0;damageFlash=0;hitConfirm=0;cameraX=W/2;cameraY=H/2;rackSignature='';
    document.querySelector('#weapon-list')?.replaceChildren();
    ui.health.style.width='100%';ui.healthNumber.textContent='100 / 100';if(ui.armor)ui.armor.style.width='0%';if(ui.energy)ui.energy.style.width='100%';ui.score.textContent='0000';ui.kills.textContent='0';ui.deaths.textContent='0';ui.timer.textContent='00:00';ui.dash.style.width='100%';ui.upgradePoints.textContent='技能点 0 · 每200战绩1点 · Space确认所选升级';ui.confirmUpgrade.disabled=true;ui.weapon.textContent='PULSE NEEDLE';ui.ammo.textContent='∞';ui.info.textContent='BOLT / 28 DMG';ui.reloadStatus?.classList.add('hidden');ui.reloadStatus?.classList.remove('empty');if(ui.reloadFill)ui.reloadFill.style.setProperty('--reload-progress','0%');if(ui.reloadLabel)ui.reloadLabel.textContent='0.0s';ui.pilotCount.textContent='1 / '+roomCapacity;ui.mapName.textContent=(maps[selectedMap]?.name||selectedMap||'MOSSWOOD').split(' ')[0].toUpperCase();ui.deathBanner.classList.add('hidden');ui.matchResult?.classList.add('hidden');ui.copyRoom.classList.add('hidden');
  }
  function formatReplayTime(milliseconds){
    const total=Math.max(0,Math.floor(milliseconds/1000)),minutes=Math.floor(total/60),seconds=String(total%60).padStart(2,'0');
    return minutes+':'+seconds;
  }
  function syncReplayControls(){
    if(!ui.replayControls)return;
    ui.replayControls.classList.toggle('hidden',!replayMode);if(ui.replayToggle)ui.replayToggle.textContent=replayPaused?'继续':'暂停';
    if(ui.replaySeek){ui.replaySeek.max=String(Math.max(1,Math.ceil(replayDuration)));ui.replaySeek.value=String(Math.max(0,Math.min(replayDuration,replayElapsed)))}
    if(ui.replayTime)ui.replayTime.textContent=formatReplayTime(replayElapsed)+' / '+formatReplayTime(replayDuration);
  }
  function seekReplay(milliseconds){
    if(!replayMode||!replayData)return;
    const frames=replayData.frames||[];clearTimeout(replayStopTimer);replayStopTimer=null;replayElapsed=Math.max(0,Math.min(replayDuration,Number(milliseconds)||0));replayFrameIndex=0;
    while(replayFrameIndex+1<frames.length&&frames[replayFrameIndex+1].at<=replayElapsed)replayFrameIndex+=1;
    renderReplayFrame(frames[replayFrameIndex]||frames[0]||{});replayLastAt=performance.now();syncReplayControls();syncHud();draw(Math.min(.04,1/60));
    if(!replayPaused&&!replayLoopActive){replayLoopActive=true;requestAnimationFrame(replayLoop)}
  }
  function toggleReplayPause(){
    if(!replayMode)return;
    replayPaused=!replayPaused;replayLastAt=performance.now();clearTimeout(replayStopTimer);replayStopTimer=null;syncReplayControls();toast(replayPaused?'回放已暂停':'回放继续播放');
  }
  function stopReplay(){
    clearTimeout(replayStopTimer);replayStopTimer=null;replayMode=false;replayData=null;replayElapsed=0;replayLastAt=0;replayFrameIndex=0;replayDuration=0;replayPaused=false;replayLoopActive=false;started=false;clearInterval(inputTimer);clearInterval(pingTimer);resetLobbyHud();map=selectedMap;mode=selectedMode;modeName='Normal Deathmatch';document.body.classList.remove('in-match','replay-mode');ui.replayControls?.classList.add('hidden');ui.start.classList.remove('hidden');ui.state.textContent='WAITING FOR PILOTS';ui.status.textContent='回放已结束';draw();
  }
  function renderReplayFrame(frame){
    previousPlayers=new Map(players.map(player=>[player.id,player]));
    players=frame.players||[];projectiles=frame.projectiles||[];pickups=[];pickupSpawns=[];flags={};teamScores={'0':0,'1':0};winner=null;
    stateAt=performance.now();stateIntervalMs=50;
  }
  function replayLoop(now){
    if(!replayMode||!replayData)return;
    const frames=replayData.frames||[];
    if(!replayPaused)replayElapsed=Math.min(replayDuration,replayElapsed+Math.max(0,Math.min(120,now-replayLastAt)));
    replayLastAt=now;
    while(replayFrameIndex+1<frames.length&&frames[replayFrameIndex+1].at<=replayElapsed)replayFrameIndex+=1;
    renderReplayFrame(frames[replayFrameIndex]||frames[0]||{});updatePerf(now);syncHud();draw(Math.min(.04,1/60));
    syncReplayControls();
    if(!replayPaused&&frames.length&&replayFrameIndex>=frames.length-1&&replayElapsed>=replayDuration){replayLoopActive=false;toast('回放播放完毕');clearTimeout(replayStopTimer);replayStopTimer=setTimeout(()=>{if(replayMode)stopReplay()},900);return}
    requestAnimationFrame(replayLoop);
  }
  async function loadReplayFile(file){
    if(!file)return;
    try{
      if(started&&!replayMode&&socket?.readyState===WebSocket.OPEN){toast('请先返回大厅，再加载本地回放');if(ui.replayFile)ui.replayFile.value='';return}
      if(replayMode)stopReplay();
      const payload=JSON.parse(await file.text());
      if(!Array.isArray(payload.frames)||!payload.frames.length)throw Error('empty replay');
      replayData=payload;replayFrameIndex=0;replayElapsed=0;replayDuration=Math.max(0,...payload.frames.map(frame=>Math.max(0,Number(frame.at)||0)));replayLastAt=performance.now();replayPaused=false;replayLoopActive=true;replayMode=true;started=true;id=payload.frames[0].players?.[0]?.id||null;map=payload.map||'tidal';mode=payload.mode||'normal';modeName='本地短回放';
      ui.start.classList.add('hidden');document.body.classList.add('in-match','replay-mode');ui.state.textContent='LOCAL REPLAY';ui.status.textContent='正在播放本地回放';syncReplayControls();requestAnimationFrame(replayLoop);
    }catch{toast('回放文件无效或格式不支持')}
    if(ui.replayFile)ui.replayFile.value='';
  }
  function showFeed(message){const box=document.querySelector('#feed'),line=document.createElement('div');line.className='feed-item';line.textContent=message;box.prepend(line);setTimeout(()=>line.remove(),4400)}
  function burst(x,y,color,count=8,kind='pulse'){
    if(displaySettings.lowEffects)count=Math.max(1,Math.ceil(count*.28));
    const style=PIXEL_SPRITES[kind]||PIXEL_SPRITES.pulse;
    const palette=Object.values(style.colors);
    for(let i=0;i<count;i++){
      const a=(Math.floor(Math.random()*16)/16)*Math.PI*2,s=24+Math.random()*115;
      particles.push({x:Math.round(x),y:Math.round(y),vx:Math.cos(a)*s,vy:Math.sin(a)*s,
        life:150+Math.random()*180,max:330,color:palette[Math.floor(Math.random()*palette.length)],r:1+Math.floor(Math.random()*2)});
    }
    if(particles.length>MAX_PARTICLES)particles.splice(0,particles.length-MAX_PARTICLES);
  }
  function updateFeed(items=[]){for(const item of items)if(item.id>latestFeedId){latestFeedId=item.id;showFeed(item.content)}}
  function triggerCameraShake(amount){cameraShake=Math.max(cameraShake,displaySettings.lowEffects?amount*.35:amount)}
  function triggerScreenShake(amount){screenShake=Math.max(screenShake,displaySettings.lowEffects?amount*.42:amount)}
  function triggerExplosionFlash(amount){explosionFlash=Math.max(explosionFlash,displaySettings.lowEffects?amount*.5:amount)}
  function explosionShakeScale(x,y,blast){
    const me=localPlayer();
    if(!me||!Number.isFinite(me.x)||!Number.isFinite(me.y)||!Number.isFinite(x)||!Number.isFinite(y))return 1;
    const radius=Math.max(1,Number(blast)||1),distance=Math.hypot(me.x-x,me.y-y);
    const falloffDistance=Math.max(420,radius*6),linear=Math.max(0,1-Math.min(1,distance/falloffDistance));
    return linear*linear;
  }
  function triggerExplosionFeedback(x,y,blast,cameraAmount,screenAmount){
    const scale=explosionShakeScale(x,y,blast);
    triggerCameraShake(cameraAmount*scale);triggerScreenShake(screenAmount*scale);
    return scale;
  }
  function updateWeaponRecoil(dt){
    for(const [owner,kick] of weaponRecoil){
      const next=kick*Math.exp(-dt*22);
      if(next<.08)weaponRecoil.delete(owner);else weaponRecoil.set(owner,next);
    }
  }
  function updateDamageFeedback(dt){damageFlash=Math.max(0,damageFlash-dt*2.8);hitConfirm=Math.max(0,hitConfirm-dt*5);screenShake=Math.max(0,screenShake-dt*52);explosionFlash=Math.max(0,explosionFlash-dt*4.6)}
  function updatePerf(now){
    fpsFrames+=1;
    if(now-fpsWindowAt<500)return;
    fpsValue=Math.round(fpsFrames*1000/(now-fpsWindowAt));fpsFrames=0;fpsWindowAt=now;
    if(ui.perf)ui.perf.textContent='FPS '+fpsValue+' · RTT '+(pingValue?pingValue+'ms':'--')+' · STATE '+Math.round(1000/stateIntervalMs)+'Hz';
  }
  function renderMatchResult(winnerId){
    if(!ui.matchResult||resultShown)return;
    resultShown=true;
    const teamWinner=(mode==='team_dm'||mode==='ctf')&&(winnerId==='0'||winnerId==='1');
    const victor=players.find(p=>p.id===winnerId);
    ui.matchResultTitle.textContent=teamWinner?(winnerId==='0'?'潮汐队获胜':'赤焰队获胜'):(victor?victor.name+' 获胜':'战斗结束');
    ui.matchResultSubtitle.textContent=modeName+' · '+players.length+' 名玩家';
    ui.matchResultRows.replaceChildren();
    [...players].sort((a,b)=>b.score-a.score).slice(0,8).forEach((player,index)=>{
      const row=document.createElement('div');row.className='match-result-row'+(player.id===id?' me':'');
      const rank=document.createElement('b');rank.textContent=String(index+1).padStart(2,'0');
      const name=document.createElement('span');name.textContent=(player.is_bot?'✳ ':'')+player.name;
      const stats=document.createElement('small');stats.textContent=player.score+' 分 · '+player.kills+' 击倒 · '+player.deaths+' 倒下';
      row.append(rank,name,stats);ui.matchResultRows.append(row);
    });
    ui.matchResult.classList.remove('hidden');
  }
  function renderMapVote(message){
    if(!ui.mapVote||!winner)return;
    ui.mapVote.replaceChildren();
    const votes=message.map_votes||{};
    Object.entries(maps).forEach(([mapId,definition])=>{
      const button=document.createElement('button');button.type='button';button.className='map-vote-button'+(message.voted_map===mapId?' selected':'');
      button.textContent=(definition.name||mapId)+' · '+(votes[mapId]||0);
      button.addEventListener('click',()=>{send({type:'vote_map',map:mapId});if(ui.mapVoteStatus)ui.mapVoteStatus.textContent='已投票：'+(definition.name||mapId)+'，等待其他玩家';});
      ui.mapVote.append(button);
    });
    if(ui.mapVoteStatus){
      const timer=Number.isFinite(message.map_vote_in)&&message.map_vote_in>0?' · '+message.map_vote_in.toFixed(1)+'s 后自动开始':'';
      ui.mapVoteStatus.textContent=message.voted_map?'已投票：'+(maps[message.voted_map]?.name||message.voted_map)+timer:'选择下一局地图；所有玩家投票后开始'+timer;
    }
    if(ui.mapVoteProgressFill){const remaining=Number(message.map_vote_in)||0;ui.mapVoteProgressFill.style.width=Math.max(0,Math.min(100,remaining/15*100))+'%'}
  }
  function recoilFor(kind){return MISSILE_KINDS.has(kind)?12:kind==='rail'?9:kind==='scatter'?6:4}
  function damageNumberStyle(weapon, value, own){
    const color=own?'#ff9077':MISSILE_KINDS.has(weapon)?'#ffb45e':weapon==='flame'?'#ff8d58':weapon==='energy_sniper'?'#b9d9ff':weapon==='scatter'?'#ffe58f':'#ffeec0';
    return {color,size:value>=55?13:11};
  }
  function updateScoreboard(){
    const rows=document.querySelector('#score-rows');rows.replaceChildren();
    const ranked=[...players].sort((a,b)=>b.score-a.score);
    ranked.forEach(p=>{
      const row=document.createElement('div');row.className='score-row'+(p.id===id?' me':'');
      const name=document.createElement('span');name.textContent=(p.is_bot?'✳ ':'')+p.name;
      const score=document.createElement('b');score.textContent=p.score;
      const deaths=document.createElement('span');
      deaths.textContent=mode==='duel'?String(p.lives)+' lives':mode==='ctf'?String(p.captures)+' flags':String(p.deaths)+' D';
      row.append(name,score,deaths);rows.append(row);
    });
    const miniRows=document.querySelector('#mini-rows');miniRows.replaceChildren();
    ranked.slice(0,4).forEach(p=>{
      const row=document.createElement('div');row.className='mini-row'+(p.id===id?' me':'');
      const dot=document.createElement('i');dot.style.background=p.hue;
      const name=document.createElement('span');name.textContent=(p.is_bot?'✳ ':'')+p.name;
      const score=document.createElement('b');score.textContent=p.score;
      row.append(dot,name,score);miniRows.append(row);
    });
    const humans=players.filter(p=>!p.is_bot).length;
    ui.pilotCount.textContent=humans+' / '+roomCapacity;
    ui.mapName.textContent=(maps[map]?.name||map||'MOSSWOOD').split(' ')[0].toUpperCase();
  }
  function ownedWeapons(player=localPlayer()){
    const owned=new Set(player?.owned_weapons||['pulse']);
    return WEAPON_KEYS.filter(key=>owned.has(key));
  }
  function updateWeaponRack(player=localPlayer()){
    if(!player)return;
    const owned=ownedWeapons(player),signature=owned.join('|');
    const list=document.querySelector('#weapon-list');
    if(signature!==rackSignature){
      rackSignature=signature;list.replaceChildren();
      owned.forEach((key,index)=>{
        const button=document.createElement('button');button.type='button';button.className='weapon-slot';
        button.dataset.weapon=key;button.title=weapons[key]?.name||key;
        const slot=document.createElement('kbd');slot.className='slot-key';slot.textContent=weapons[key]?.slot||String(index+1);
        const icon=document.createElement('canvas');icon.className='weapon-glyph';icon.width=32;icon.height=24;
        icon.setAttribute('aria-hidden','true');
        drawPickupWeapon(key,weapons[key]?.color||'#d7d99a',icon.getContext('2d'),true);
        const copy=document.createElement('span');copy.className='weapon-copy';
        const name=document.createElement('b');name.textContent=weapons[key]?.name||key;
        const ammo=document.createElement('small');ammo.className='weapon-ammo';
        copy.append(name,ammo);button.append(slot,icon,copy);
        button.addEventListener('click',()=>chooseWeapon(key));list.append(button);
      });
    }
    for(const button of list.querySelectorAll('.weapon-slot')){
      const key=button.dataset.weapon,ammo=player.ammo?.[key];
      const reloadRemaining=Math.max(0,Number(ammo?.reload_remaining)||0),reloadDuration=Math.max(.01,Number(weapons[key]?.reload)||.01);
      button.classList.toggle('active',key===player.weapon);
      button.classList.toggle('reloading',reloadRemaining>.02);
      button.style.setProperty('--reload-progress',Math.max(0,Math.min(1,1-reloadRemaining/reloadDuration)).toFixed(3));
      const ammoLabel=!ammo||ammo.mag<0?'∞':ammo.mag+' / '+ammo.reserve;
      button.querySelector('.weapon-ammo').textContent=ammoLabel;
      button.setAttribute('aria-label',(weapons[key]?.slot||key)+' '+(weapons[key]?.name||key)+' '+ammoLabel);
    }
  }
  function applyState(message){
    lastStateMessage=message;
    if(Object.prototype.hasOwnProperty.call(message,'voted_map'))privateVotedMap=message.voted_map;
    if(message.map&&maps[message.map])map=message.map;room=message.room||room;
    if(message.mode)mode=message.mode;
    if(Number.isFinite(message.capacity))roomCapacity=message.capacity;
    if(Number.isFinite(message.state_interval_ms))stateIntervalMs=message.state_interval_ms;
    modeName=message.mode_name||modeName;flags=message.flags||{};teamScores=message.team_scores||teamScores;
    if(message.winner&&!winner){
      winner=message.winner;
      const victor=players.find(p=>p.id===winner);
      const teamWinner=(mode==='team_dm'||mode==='ctf')?
        (winner==='0'?'TIDE TEAM':winner==='1'?'EMBER TEAM':null):null;
      showFeed('MATCH COMPLETE · '+(teamWinner||(victor?victor.name:winner)));
      ui.state.textContent='MATCH COMPLETE';
    }
    const previousOwned=new Set(localPlayer()?.owned_weapons||[]);
    const previousHealth=new Map(players.map(player=>[player.id,{hp:player.hp,x:player.x,y:player.y,kills:player.kills,score:player.score,weapon:player.weapon}]));
    previousPlayers=new Map(players.map(p=>[p.id,p]));
    const previousById=new Map(players.map(player=>[player.id,player]));
    const wirePlayers=message.players||players;
    const wireMe=wirePlayers.find(player=>player.id===id);
    if(hasOwnerPrivateFields(wireMe))privatePlayer=privatePlayerFields(wireMe);
    const mergedPlayers=message.players_compact
      ? wirePlayers.map(player=>({...previousById.get(player.id),...player}))
      : wirePlayers;
    const incomingPlayers=mergedPlayers.map(player=>player.id===id&&privatePlayer?{...player,...privatePlayer}:player);
    players=incomingPlayers;
    updateInputInterval();
    recordReplayState({...message,players:incomingPlayers});
    if(message.winner){renderMatchResult(message.winner);renderMapVote({...message,voted_map:privateVotedMap})}
    else if(winner){winner=null;resultShown=false;ui.matchResult?.classList.add('hidden')}
    const me=localPlayer();
    const previousMe=previousHealth.get(id);
    if(me&&previousMe&&(me.kills>previousMe.kills||me.score>previousMe.score)){hitConfirm=1;triggerCameraShake(1.4)}
    for(const player of players){
      const old=previousHealth.get(player.id);if(!old||!Number.isFinite(player.hp)||player.hp>=old.hp)continue;
      const x=Number.isFinite(player.x)?player.x:old.x,y=Number.isFinite(player.y)?player.y:old.y;
      const damage=Math.max(0,Math.round(old.hp-player.hp));
      if(Number.isFinite(x)&&Number.isFinite(y)){burst(x,y,'#ff746c',displaySettings.lowEffects?2:5,'energy_sniper');if(damage>0&&!displaySettings.lowEffects){const style=damageNumberStyle(player.weapon||old.weapon||'pulse',damage,player.id===id);damageNumbers.push({x,y,value:damage,life:680,max:680,color:style.color,size:style.size});if(damageNumbers.length>80)damageNumbers.splice(0,damageNumbers.length-80)}}
      if(player.id===id){damageFlash=Math.min(.72,damageFlash+.44);triggerCameraShake(3.2)}
    }
    updateWeaponRack(me);
    if(me)for(const weapon of ownedWeapons(me))if(!previousOwned.has(weapon)&&weapon!=='pulse'){
      toast('拾取了 '+(weapons[weapon]?.name||weapon));
    }
    const nextIds=new Set(),oldBullets=new Map(projectiles.map(b=>[b.id,b])),oldSpawns=new Map(pickupSpawns.map(marker=>[marker.id,marker])),oldResourceSpawns=new Map(resourceSpawns.map(marker=>[marker.id,marker])),now=performance.now();
    for(const bullet of message.projectiles||[]){
      nextIds.add(bullet.id);
      const style=bullet.weapon||bullet.kind||'pulse';
      let trail=projectileTrails.get(bullet.id);
      if(!trail){
        trail={points:[],born:performance.now(),kind:style};
        projectileTrails.set(bullet.id,trail);
        weaponRecoil.set(bullet.owner,Math.max(weaponRecoil.get(bullet.owner)||0,recoilFor(bullet.kind||style)));
        const speed=Math.hypot(bullet.vx,bullet.vy)||1,ux=bullet.vx/speed,uy=bullet.vy/speed;
        const owner=players.find(p=>p.id===bullet.owner);
        const mx=owner&&Number.isFinite(owner.x)?owner.x+ux*19:bullet.x-ux*5;
        const my=owner&&Number.isFinite(owner.y)?owner.y+uy*19:bullet.y-uy*5;
        muzzles.push({x:mx,y:my,vx:bullet.vx,vy:bullet.vy,kind:style,life:90,max:90});
        burst(bullet.x,bullet.y,bullet.color,2,style);
        playSound('shot',bullet.kind||style);
      }
      const old=oldBullets.get(bullet.id);
      const jump=old&&Number.isFinite(old.x)&&Number.isFinite(old.y)
        ?Math.hypot(bullet.x-old.x,bullet.y-old.y):0;
      if(jump>260){
        // A portal jump should never paint a false trail across the whole map.
        trail.points=[];
        const color=map==='ember'?'#d98cff':map==='glass'?'#77e4f0':'#9cf4c2';
        rings.push({x:old.x,y:old.y,life:260,max:260,color,r:18,kind:'prism',blast:0,power:1,seed:bullet.id,layer:'portal'});
        rings.push({x:bullet.x,y:bullet.y,life:360,max:360,color,r:25,kind:'prism',blast:0,power:1,seed:bullet.id+7,layer:'portal'});
        burst(old.x,old.y,color,displaySettings.lowEffects?2:7,'prism');
        burst(bullet.x,bullet.y,color,displaySettings.lowEffects?2:7,'prism');
      }else if(old)trail.points.push({x:old.x,y:old.y,at:now});
      trail.points.push({x:bullet.x,y:bullet.y,at:now});
      if(trail.points.length>9)trail.points.shift();
    }
    for(const old of projectiles)if(!nextIds.has(old.id)){
      const style=old.weapon||old.kind||'pulse';
      const missile=MISSILE_KINDS.has(old.kind)||MISSILE_KINDS.has(style),power=missile?1.5:1;
      const blast=old.blast||0,explosionLife=blast?(missile?660:440):360,seed=Math.floor(Math.random()*32);
      rings.push({x:old.x,y:old.y,life:explosionLife,max:explosionLife,color:old.color,r:blast?blast*.56*power:18,kind:style,blast,power,seed,layer:'main'});
      burst(old.x,old.y,old.color,blast?(missile?42:24):7,style);
      if(missile&&blast){
        const strength=Math.min(28,9+blast*.19);
        triggerExplosionFeedback(old.x,old.y,blast,Math.min(18,strength*.72),strength);triggerExplosionFlash(Math.min(.9,.3+blast/190));
        rings.push({x:old.x,y:old.y,life:820,max:820,color:'#fff0a9',r:blast*.9*power,kind:style,blast,power:power*1.08,seed:seed+7,layer:'outer'});
        rings.push({x:old.x,y:old.y,life:320,max:320,color:'#ffb653',r:blast*.3*power,kind:style,blast:blast*.45,power,seed:seed+13,layer:'core'});
      }
      if(old.blast)playSound('explosion',old.kind||style);
      projectileTrails.delete(old.id);
    }
    const nextSpawns=message.pickup_spawns||[];
    for(const marker of nextSpawns){
      const previous=oldSpawns.get(marker.id);
      if(!previous||previous.available||!marker.available)continue;
      const color=weapons[marker.weapon]?.color||'#d5bd68';
      burst(marker.x,marker.y,color,displaySettings.lowEffects?3:9,marker.weapon);
      rings.push({x:marker.x,y:marker.y,life:420,max:420,color,r:22,kind:marker.weapon,blast:0,power:1,seed:marker.id});
      const me=localPlayer();if(me&&Number.isFinite(me.x)&&Math.hypot(me.x-marker.x,me.y-marker.y)<150)toast((weapons[marker.weapon]?.name||marker.weapon)+' 已补给');
    }
    const nextResourceSpawns=message.resource_spawns||[];
    for(const marker of nextResourceSpawns){
      const previous=oldResourceSpawns.get(marker.id);
      if(!previous||previous.available||!marker.available)continue;
      const color=marker.kind==='health'?'#ef7473':'#73c7e4';
      burst(marker.x,marker.y,color,displaySettings.lowEffects?4:12,marker.kind==='health'?'flare':'prism');
      rings.push({x:marker.x,y:marker.y,life:500,max:500,color,r:26,kind:marker.kind==='health'?'flare':'prism',blast:0,power:1,seed:marker.id});
      const me=localPlayer();if(me&&Number.isFinite(me.x)&&Math.hypot(me.x-marker.x,me.y-marker.y)<150)toast(marker.kind==='health'?'血包已刷新':'护甲已刷新');
    }
    if(rings.length>MAX_RINGS)rings.splice(0,rings.length-MAX_RINGS);
    if(muzzles.length>MAX_MUZZLES)muzzles.splice(0,muzzles.length-MAX_MUZZLES);
    previousProjectileIds=nextIds;projectiles=message.projectiles||[];pickups=message.pickups||[];pickupSpawns=nextSpawns;resources=message.resources||[];resourceSpawns=nextResourceSpawns;stateAt=performance.now();
    updateFeed(message.feed);updateScoreboard();syncHud();
  }
  function applyPrivateState(message){
    if(!message)return;
    if(Array.isArray(message.players)){
      const previousById=new Map(players.map(player=>[player.id,player]));
      players=message.players.map(player=>({...previousById.get(player.id),...player}));
    }
    if(!message.player)return;
    privatePlayer=privatePlayerFields(message.player);
    if(Object.prototype.hasOwnProperty.call(message,'voted_map'))privateVotedMap=message.voted_map;
    const index=players.findIndex(player=>player.id===privatePlayer.id);
    if(index>=0)players[index]={...players[index],...privatePlayer};
    else players.push(privatePlayer);
    if(lastStateMessage?.winner)renderMapVote({...lastStateMessage,voted_map:privateVotedMap});
    updateWeaponRack(localPlayer());syncHud();
  }
  function finishDisconnected(){
    started=false;clearTimeout(reconnectTimer);reconnectTimer=null;clearInterval(inputTimer);clearInterval(pingTimer);resetLobbyHud();document.body.classList.remove('in-match','spectator-mode');ui.start.classList.remove('hidden');ui.startButton.disabled=false;if(ui.watchRoom)ui.watchRoom.disabled=false;ui.status.textContent='连接已断开。可以重新接入房间。';ui.state.textContent='LINK LOST';ui.copyRoom.classList.add('hidden');reconnectAttempts=0;
  }
  function scheduleReconnect(){
    if(intentionalSocketClose||!room){finishDisconnected();return}
    if(testReconnectMode){
      window.__morrowTestReconnects=(window.__morrowTestReconnects||0)+1;
    }
    const attempt=reconnectAttempts++;
    if(attempt>=6){finishDisconnected();ui.status.textContent='重连失败，请检查网络后重新进入房间。';return}
    const delay=Math.min(5000,500*Math.pow(2,attempt));
    ui.status.textContent='连接中断，'+(delay/1000).toFixed(1)+' 秒后重连（'+(attempt+1)+'/6）…';
    clearTimeout(reconnectTimer);reconnectTimer=setTimeout(()=>{reconnectTimer=null;if(started){ui.room.value=room;join(true)}},delay);
  }
  function join(reconnecting=false){
    if(started&&!reconnecting)return;
    if(!reconnecting){clearTimeout(reconnectTimer);reconnectTimer=null;reconnectAttempts=0;intentionalSocketClose=false}
    ensureAudio();
    ui.startButton.disabled=true;if(ui.watchRoom)ui.watchRoom.disabled=true;ui.status.textContent=spectatorMode?'正在接入观战频道…':'正在接入中继网络…';
    if(lobbySocket){const previous=lobbySocket;lobbySocket=null;previous.close()}
    try{socket=new WebSocket(wsUrl())}catch{ui.status.textContent='无法创建连接。请检查网络地址。';ui.startButton.disabled=false;return}
    const currentSocket=socket;
    if(testReconnectMode){
      window.__morrowTestDisconnect=()=>{intentionalSocketClose=false;currentSocket.close()};
    }
    socket.onopen=()=>{reconnectAttempts=0;intentionalSocketClose=false;send({type:'join',name:ui.name.value,room:ui.room.value,map:selectedMap,mode:selectedMode,skin:selectedSkin,spectator:spectatorMode})};
    socket.onmessage=e=>{let message;try{message=JSON.parse(e.data)}catch{return}handle(message)};
    socket.onerror=()=>{if(socket===currentSocket)ui.status.textContent='中继网络暂时不可用。正在重试…'};
    socket.onclose=()=>{
      if(socket!==currentSocket)return;
      if(started&&!intentionalSocketClose){clearInterval(inputTimer);clearInterval(pingTimer);scheduleReconnect();return}
      if(started)finishDisconnected();
      else {ui.startButton.disabled=false;if(ui.watchRoom)ui.watchRoom.disabled=false}
      intentionalSocketClose=false;
    };
  }
  function handle(message){
    if(message.type==='welcome'){
      id=message.id;spectatorMode=Boolean(message.spectator);maps=message.maps||{};weapons=message.weapons||{};map=message.map||'tidal';room=message.room;
      privatePlayer=null;privateVotedMap=Object.prototype.hasOwnProperty.call(message,'voted_map')?message.voted_map:null;lastStateMessage=null;
      winner=null;resultShown=false;pingValue=0;damageFlash=0;hitConfirm=0;spectatorId=null;replayFrames=[];ui.matchResult?.classList.add('hidden');cameraShake=0;screenShake=0;explosionFlash=0;weaponRecoil.clear();projectileTrails.clear();previousProjectileIds.clear();projectiles=[];particles=[];rings=[];muzzles=[];damageNumbers=[];resources=[];resourceSpawns=[];
      privatePlayer=privatePlayerFields((message.players||[]).find(player=>player.id===id));
      started=true;document.body.classList.toggle('spectator-mode',spectatorMode);document.body.classList.add('in-match');startedAt=performance.now();last=startedAt;nextRenderAt=0;latestFeedId=0;applyState(message);
      ui.start.classList.add('hidden');ui.copyRoom.classList.toggle('hidden',spectatorMode);
      history.replaceState(null,'',location.pathname+'?room='+encodeURIComponent(room));
      ui.state.textContent=spectatorMode?'SPECTATING':'LIVE FRONTIER';ui.status.textContent=spectatorMode?'正在观战 '+room:'已接入 '+room;
      ui.copyRoom.querySelector('b').textContent=room;clearInterval(roomTimer);
      clearInterval(inputTimer);inputTimer=null;updateInputInterval();pingTimer=setInterval(sendPing,2000);requestAnimationFrame(loop);toast(spectatorMode?'已进入观战频道 '+room:'已接入房间 '+room);
    }else if(message.type==='state')applyState(message);
    else if(message.type==='private')applyPrivateState(message);
    else if(message.type==='pong'&&Number.isFinite(message.sent))pingValue=Math.max(0,Math.round(performance.now()-message.sent));
    else if(message.type==='error'){ui.status.textContent=message.message;ui.startButton.disabled=false;if(started&&reconnectAttempts>0){reconnectAttempts=6;intentionalSocketClose=true;socket?.close()}}
  }
  function sendInput(){
    if(!started||spectatorMode)return;
    const dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+touch.moveX;
    const dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+touch.moveY;
    const length=Math.hypot(dx,dy),scale=length>1?1/length:1;
    const aim=screenToWorld(mouse.x,mouse.y);
    const secondMode=keys.has('y')&&Boolean(weapons[localPlayer()?.weapon||'']?.alternate);
    send({type:'input',x:dx*scale,y:dy*scale,aim_x:aim.x,aim_y:aim.y,fire:mouse.down||secondMode,aiming:keys.has('f'),alt_fire:secondMode});
  }
  function updateInputInterval(){
    const humans=players.reduce((total,player)=>total+(player.is_bot?0:1),0);
    const nextInterval=humans>=8&&humans<16?11:25;
    if(spectatorMode){clearInterval(inputTimer);inputTimer=null;return}
    if(inputTimer&&inputIntervalMs===nextInterval)return;
    clearInterval(inputTimer);inputIntervalMs=nextInterval;
    if(started)inputTimer=setInterval(sendInput,inputIntervalMs);
  }
  function sendPing(){if(started)send({type:'ping',sent:performance.now()})}
  function cycleSpectator(direction){
    const own=localPlayer();if(!spectatorMode&&!own?.dead)return;
    const alive=players.filter(player=>player.id!==(own?.id||'')&&!player.dead&&Number.isFinite(player.x)&&Number.isFinite(player.y));
    if(!alive.length)return;
    const index=Math.max(0,alive.findIndex(player=>player.id===spectatorId));
    spectatorId=alive[(index+direction+alive.length)%alive.length].id;
  }
  function chooseWeapon(weapon){
    if(!ownedWeapons().includes(weapon)){toast('先在地图上拾取这件武器');return}
    send({type:'weapon',weapon});document.querySelectorAll('.weapon-slot').forEach(b=>b.classList.toggle('active',b.dataset.weapon===weapon));
  }
  function selectUpgrade(upgrade){
    if(!['vitality','velocity','amplify'].includes(upgrade))return;
    selectedUpgrade=upgrade;
    document.querySelectorAll('[data-upgrade]').forEach(button=>{
      const selected=button.dataset.upgrade===upgrade;
      button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
    });
  }
  function buyUpgrade(upgrade=selectedUpgrade){
    selectUpgrade(upgrade);
    if(!started)return;
    if((localPlayer()?.skill_points||0)<1){toast('没有可用技能点');return}
    send({type:'upgrade',upgrade:selectedUpgrade});
  }
  function syncHud(){
    const p=localPlayer();if(!p){if(spectatorMode){ui.deathBanner.classList.add('hidden');ui.pilotCount.textContent=players.filter(v=>!v.is_bot).length+' / '+roomCapacity;ui.mapName.textContent=(maps[map]?.name||map||'MOSSWOOD').split(' ')[0].toUpperCase();ui.weapon.textContent='观战模式';ui.ammo.textContent='—';ui.info.textContent=spectatorTarget?'目标：'+spectatorTarget.name+' · [ ] 切换':'选择观战目标';}return;}
    const maximum=100+(p.upgrades?.vitality||0)*20;
    ui.health.style.width=Math.max(0,Math.min(100,p.hp/maximum*100))+'%';
    ui.healthNumber.textContent=Math.max(0,p.hp)+' / '+maximum;
    if(ui.armor)ui.armor.style.width=Math.max(0,Math.min(100,(p.armor||0)/(p.max_armor||100)*100))+'%';
    if(ui.energy)ui.energy.style.width=Math.max(0,Math.min(100,(p.energy??0)))+'%';
    ui.deathBanner.classList.toggle('hidden',!p.dead);
    if(p.dead)ui.deathStatus.textContent='重启倒计时 '+Math.ceil(p.respawn_in||0)+' 秒'+(spectatorTarget?' · 观战 '+spectatorTarget.name+' · [ ] 切换':'');
    ui.score.textContent=String(p.score||0).padStart(4,'0');ui.kills.textContent=p.kills||0;ui.deaths.textContent=p.deaths||0;
    ui.upgradePoints.textContent='技能点 '+(p.skill_points||0)+' · 每200战绩1点 · Space确认所选升级';
    ui.confirmUpgrade.disabled=(p.skill_points||0)<1;
    ui.pilotCount.textContent=players.filter(v=>!v.is_bot).length+' / '+roomCapacity;
    ui.mapName.textContent=(maps[map]?.name||map||'MOSSWOOD').split(' ')[0].toUpperCase();
    const w=weapons[p.weapon]||weapons.pulse||{};
    updateWeaponRack(p);
    ui.weapon.textContent=(w.name||p.weapon||'PULSE NEEDLE').toUpperCase();
    const ammo=p.ammo?.[p.weapon];ui.ammo.textContent=!ammo||ammo.mag<0||ammo.mag>1000?'∞':ammo.mag+' / '+ammo.reserve;
    const reloadRemaining=Math.max(0,Number(ammo?.reload_remaining)||0),reloadDuration=Math.max(.01,Number(w.reload)||.01),noReserve=Boolean(ammo&&ammo.mag===0&&ammo.reserve===0);
    if(ui.reloadStatus&&ui.reloadFill&&ui.reloadLabel){
      const reloading=reloadRemaining>.02;
      ui.reloadStatus.classList.toggle('hidden',!reloading&&!noReserve);ui.reloadStatus.classList.toggle('empty',!reloading&&noReserve);
      ui.reloadFill.style.setProperty('--reload-progress',(reloading?Math.max(0,Math.min(100,(1-reloadRemaining/reloadDuration)*100)):0)+'%');
      ui.reloadLabel.textContent=reloading?'装填 '+reloadRemaining.toFixed(1)+'s':'无备弹';
    }
    ui.info.textContent=w.kind==='heal_beam'?'HEAL BEAM / '+(w.damage||0)+' HP · SELF '+(w.self_heal||0):
      (w.kind||'pulse').toUpperCase()+' / '+(w.damage||0)+' DMG'+(w.alternate?(p.alternate_fire?' · ENERGY ORB':' · HOLD Y'):'');
    const now=performance.now();ui.dash.style.width=Math.max(0,Math.min(100,100-(dashReadyAt-now)/18))+'%';
    const elapsed=Math.floor((replayMode?replayElapsed:now-startedAt)/1000);
    ui.timer.textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0');
  }
  function groundPatternFor(mapId){
    if(groundPatterns.has(mapId))return groundPatterns.get(mapId);
    const generatedGround=generatedImage('grounds',mapId);
    if(generatedGround){const generatedPattern=ctx.createPattern(generatedGround,'repeat');generatedPattern?.setTransform?.(new DOMMatrix().scale(.55));groundPatterns.set(mapId,generatedPattern);return generatedPattern}
    const tileCanvas=document.createElement('canvas');tileCanvas.width=192;tileCanvas.height=192;
    const tileCtx=tileCanvas.getContext('2d');tileCtx.imageSmoothingEnabled=false;
    const palettes={
      tidal:['#2b5537','#315f3b','#376741','#285033','#3d6c43','#335d3a'],
      glass:['#4f6839','#58733e','#607b42','#496237','#6b8246','#536d3c'],
      ember:['#514039','#5b463c','#624a3f','#493a36','#6b5041','#58423b']
    },palette=palettes[mapId]||palettes.tidal;
    tileCtx.fillStyle=palette[0];tileCtx.fillRect(0,0,192,192);
    // Slay.one uses a dense, low-contrast pixel weave instead of large
    // square floor tiles. Keep the pattern small so the terrain stays quiet
    // behind players, props and projectiles.
    for(let y=0;y<192;y+=4)for(let x=0;x<192;x+=4){
      let n=((x*73856093)^(y*19349663)^(mapId.length*83492791))>>>0;n=(n^(n>>>13))*1274126177>>>0;
      tileCtx.fillStyle=palette[n%palette.length];tileCtx.fillRect(x,y,4,4);
      if(n%4===0){tileCtx.fillStyle=palette[(n>>>5)%palette.length];tileCtx.fillRect(x+1,y+1,1,1)}
      if(n%9===0){tileCtx.fillStyle=mapId==='ember'?'#9b7152':mapId==='glass'?'#9aaa55':'#7ca957';tileCtx.fillRect(x+2,y+1,2,1);tileCtx.fillRect(x+1,y+2,1,2)}
      if(n%23===0){tileCtx.fillStyle=mapId==='ember'?'#c28a60':'#a9c86b';tileCtx.fillRect(x+3,y+3,1,1)}
    }
    const pattern=ctx.createPattern(tileCanvas,'repeat');groundPatterns.set(mapId,pattern);return pattern;
  }
  function drawFloorTiles(){
    const tile=96,left=Math.floor((cameraX-W/(2*CAMERA_ZOOM))/tile)*tile,right=Math.ceil((cameraX+W/(2*CAMERA_ZOOM))/tile)*tile,
      top=Math.floor((cameraY-H/(2*CAMERA_ZOOM))/tile)*tile,bottom=Math.ceil((cameraY+H/(2*CAMERA_ZOOM))/tile)*tile;
    ctx.save();
    // Broad color variation gives the ground depth without the old visible
    // checkerboard. The small marks below read as grass blades at game zoom.
    ctx.globalAlpha=.08;ctx.fillStyle=map==='ember'?'#c28a60':map==='glass'?'#c8d06b':'#9cc56b';
    for(let y=top;y<bottom;y+=tile)for(let x=left;x<right;x+=tile){
      const n=((Math.floor(x/tile)*17+Math.floor(y/tile)*31+map.length*13)|0);
      if((n&3)===0){ctx.fillRect(x+18+(n&15),y+20,28,10);ctx.fillRect(x+42+(n&7),y+38,12,18)}
    }
    ctx.globalAlpha=.34;ctx.fillStyle=map==='ember'?'#9d6e53':map==='glass'?'#8da355':'#7daa56';
    for(let y=top;y<bottom;y+=24)for(let x=left;x<right;x+=24){
      const n=((Math.floor(x/24)*92821)^((Math.floor(y/24)+map.length)*68917))>>>0;
      if(n%7<2){ctx.fillRect(x+4+(n%9),y+7,2,5);ctx.fillRect(x+2+(n%5),y+11,6,2);}
    }
    ctx.restore();
  }
  function drawGrid(){
    ctx.imageSmoothingEnabled=false;
    const tile=8;
    const left=Math.floor((cameraX-W/(2*CAMERA_ZOOM))/tile)*tile;
    const right=Math.ceil((cameraX+W/(2*CAMERA_ZOOM))/tile)*tile;
    const top=Math.floor((cameraY-H/(2*CAMERA_ZOOM))/tile)*tile;
    const bottom=Math.ceil((cameraY+H/(2*CAMERA_ZOOM))/tile)*tile;
    const ground=groundPatternFor(map);
    ctx.fillStyle=mapDef().ground||'#25351f';ctx.fillRect(left,top,right-left,bottom-top);
    if(ground){ctx.save();ctx.globalAlpha=map==='ember'?.12:.10;ctx.fillStyle=ground;ctx.fillRect(left,top,right-left,bottom-top);ctx.restore()}
    drawFloorTiles();
    if(map==='tidal')drawTidalGround();else if(map==='glass')drawGlassGround();else drawEmberGround();
    ctx.fillStyle=map==='ember'?'#514532':'#385531';
    for(let i=0;i<15;i++){
      const x=(i*173+41)%WORLD_W,y=(i*113+29)%WORLD_H;ctx.fillRect(x,y,5+(i%4),2);ctx.fillRect(x+4,y+3,3,2);
    }
    ctx.strokeStyle='#1e301fbb';ctx.lineWidth=8;ctx.strokeRect(17,17,WORLD_W-34,WORLD_H-34);
    ctx.strokeStyle=mapDef().accent;ctx.lineWidth=2;ctx.strokeRect(20,20,WORLD_W-40,WORLD_H-40);
  }
  function drawWater(){
    for(const [x,y,w,h] of mapDef().water||[]){
      if(!visibleRect(x,y,w,h))continue;
      const horizontal=w>=h,flow=Math.floor(performance.now()/180);
      const waterPalette=map==='ember'
        ? {bank:'#534466',bankLight:'#8b7291',base:'#4a3c70',wave:'#67558c',sparkle:'#b9a8d0',outline:'#2d254a'}
        : map==='glass'
          ? {bank:'#5a5662',bankLight:'#8a7783',base:'#2a5674',wave:'#447b93',sparkle:'#92c7c4',outline:'#1c3245'}
          : {bank:'#385f3a',bankLight:'#83a557',base:'#1c6470',wave:'#277f83',sparkle:'#72d0b1',outline:'#123f4b'};
      const bank=waterPalette.bank,bankLight=waterPalette.bankLight;
      const edgePath=(inset=0)=>{
        const step=Math.max(24,Math.round((horizontal?w:h)/24));
        const edgeJitter=index=>((index+flow)%3)*2;
        ctx.beginPath();
        if(horizontal){
          ctx.moveTo(-12,-10+inset);
          let index=0;for(let px=0;px<=w;px+=step,index++)ctx.lineTo(px,-10+inset+edgeJitter(index));
          index=0;for(let px=w;px>=0;px-=step,index++)ctx.lineTo(px,h+10-inset-edgeJitter(index));
        }else{
          ctx.moveTo(-10+inset,-12);
          let index=0;for(let py=0;py<=h;py+=step,index++)ctx.lineTo(-10+inset+edgeJitter(index),py);
          index=0;for(let py=h;py>=0;py-=step,index++)ctx.lineTo(w+10-inset-edgeJitter(index),py);
        }
        ctx.closePath();
      };
      ctx.save();ctx.translate(x,y);
      // A narrow irregular bank makes the river read as part of the terrain
      // instead of a hard rectangle. Collision still uses the water bounds.
      edgePath();ctx.fillStyle=bank;ctx.fill();
      ctx.fillStyle=bankLight;ctx.globalAlpha=.75;
      if(horizontal){
        for(let shore=((x+y)%19)-8;shore<w+8;shore+=31){
          const bump=4+((shore+flow)%9);ctx.fillRect(shore,-5,bump,3);ctx.fillRect(shore+11,h+2,7,3);
        }
      }else{
        for(let shore=((x+y)%17)-7;shore<h+8;shore+=29){
          const bump=4+((shore+flow)%8);ctx.fillRect(-5,shore,3,bump);ctx.fillRect(w+2,shore+9,3,6);
        }
      }
      ctx.globalAlpha=1;edgePath(5);ctx.fillStyle=waterPalette.base;ctx.fill();
      ctx.save();edgePath(5);ctx.clip();ctx.fillStyle=waterPalette.wave;
      for(let wave=8;wave<h;wave+=18){
        for(let stripe=((wave*13+flow)%34)-12;stripe<w;stripe+=38){
          ctx.fillRect(stripe,wave,14,2);ctx.fillRect(stripe+6,wave+4,8,2);
        }
      }
      ctx.fillStyle=waterPalette.sparkle;ctx.globalAlpha=.52;
      for(let sparkle=((x+y+flow)%27)-5;sparkle<w;sparkle+=49){
        ctx.fillRect(sparkle,10+((sparkle+flow)%Math.max(12,h-12)),4,2);
        if(horizontal)ctx.fillRect(sparkle+12,h-12-((sparkle+flow)%7),6,2);
      }
      ctx.restore();ctx.globalAlpha=1;edgePath(5);ctx.strokeStyle=waterPalette.outline;ctx.lineWidth=3;ctx.stroke();ctx.restore();
    }
  }
  function drawPortals(){
    const now=performance.now()/1000;
    const palette=map==='ember'
      ? {outer:'#d98cff',mid:'#9d5ad3',core:'#f2c6ff',spark:'#ffe6ff',floor:'#c17bea',floorDark:'#3d275a'}
      : map==='glass'
        ? {outer:'#77e4f0',mid:'#3da8c5',core:'#c8fbff',spark:'#e8ffff',floor:'#69d6e3',floorDark:'#173f53'}
        : {outer:'#9cf4c2',mid:'#36b58c',core:'#d4ffe2',spark:'#f4fff2',floor:'#7de2aa',floorDark:'#164936'};
    const octagon=(radius)=>{
      ctx.beginPath();
      for(let side=0;side<8;side++){
        const angle=Math.PI/8+side*Math.PI/4,px=Math.round(Math.cos(angle)*radius),py=Math.round(Math.sin(angle)*radius);
        if(side===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
      }
      ctx.closePath();
    };
    for(const [index,portal] of (mapDef().portals||[]).entries()){
      // Keep the visual footprint close to a weapon spawn marker. The portal
      // radius remains the gameplay hitbox; it should not force a giant decal.
      const portalRadius=portal.radius||56,radius=Math.max(10,Math.min(12,portalRadius*.2));
      if(!visibleRect(portal.x-radius,portal.y-radius,radius*2,radius*2,40))continue;
      const pulse=.88+Math.sin(now*4.2+index*.9)*.12,spin=now*.9+index*.7;
      ctx.save();ctx.translate(Math.round(portal.x),Math.round(portal.y));ctx.imageSmoothingEnabled=false;
      // A broad octagonal landing pad makes the portal readable as a ground
      // landmark even when no player is standing directly on it.
      ctx.globalAlpha=.4;ctx.fillStyle='#07140f';octagon(radius*1.68);ctx.fill();
      ctx.globalAlpha=.68;ctx.fillStyle=palette.floorDark;octagon(radius*1.5);ctx.fill();
      ctx.globalAlpha=.9;ctx.strokeStyle=palette.floor;ctx.lineWidth=4;octagon(radius*1.5);ctx.stroke();
      ctx.globalAlpha=.7;ctx.strokeStyle=palette.mid;ctx.lineWidth=2;octagon(radius*1.27);ctx.stroke();
      ctx.save();ctx.globalAlpha=.9;ctx.fillStyle=palette.floor;
      for(let mark=0;mark<8;mark++){
        ctx.save();ctx.rotate(mark*Math.PI/4+spin*.18);ctx.beginPath();ctx.moveTo(radius*1.36,-4);ctx.lineTo(radius*1.12,-10);ctx.lineTo(radius*1.12,10);ctx.closePath();ctx.fill();ctx.restore();
      }
      ctx.restore();
      ctx.globalAlpha=.82;ctx.strokeStyle=palette.floor;ctx.lineWidth=2;
      for(const rotation of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
        ctx.save();ctx.rotate(rotation);ctx.beginPath();ctx.moveTo(-radius*.92,-radius*.18);ctx.lineTo(-radius*.7,-radius*.18);ctx.lineTo(-radius*.7,-radius*.42);ctx.moveTo(radius*.92,radius*.18);ctx.lineTo(radius*.7,radius*.18);ctx.lineTo(radius*.7,radius*.42);ctx.stroke();ctx.restore();
      }
      ctx.globalAlpha=.9;ctx.fillStyle=palette.core;ctx.font='bold 13px "Courier New",monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(index%2?'B':'A',0,radius*.98);
      ctx.globalAlpha=.28;ctx.fillStyle=palette.outer;ctx.beginPath();ctx.arc(0,2,radius*1.22*pulse,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=.8;ctx.fillStyle='#0b211dcc';ctx.beginPath();ctx.arc(0,0,radius*.94,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=.95;ctx.strokeStyle=palette.mid;ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,radius*.76,-spin,Math.PI*1.55-spin);ctx.stroke();
      ctx.strokeStyle=palette.outer;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,radius*.56,Math.PI*.2-spin,Math.PI*1.8-spin);ctx.stroke();
      ctx.globalAlpha=.94;ctx.fillStyle=palette.core;ctx.beginPath();ctx.arc(0,0,radius*.36,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=.8;ctx.fillStyle=palette.spark;ctx.fillRect(-3,-radius*.52,6,5);ctx.fillRect(radius*.42,-3,5,6);ctx.fillRect(-2,radius*.42,5,5);ctx.fillRect(-radius*.52,-2,5,5);
      ctx.globalAlpha=.9;ctx.strokeStyle=palette.core;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-radius*.82,-radius*.16);ctx.lineTo(-radius*.62,0);ctx.lineTo(-radius*.82,radius*.16);ctx.moveTo(radius*.82,-radius*.16);ctx.lineTo(radius*.62,0);ctx.lineTo(radius*.82,radius*.16);ctx.stroke();
      ctx.restore();
    }
  }
  function drawBridges(){
    for(const [x,y,w,h] of mapDef().bridges||[]){
      if(!visibleRect(x,y,w,h))continue;
      ctx.save();ctx.translate(x,y);ctx.fillStyle='#3f2b25';ctx.fillRect(-5,-5,w+10,h+10);
      ctx.fillStyle=map==='ember'?'#95603f':map==='glass'?'#b17a45':'#a97645';ctx.fillRect(4,4,w-8,h-8);
      const horizontal=w>=h;
      ctx.fillStyle=map==='ember'?'#d18a53':'#e0a15b';
      if(horizontal){
        for(let plank=8;plank<w-5;plank+=14){ctx.fillRect(plank,5,5,h-10);ctx.fillStyle='#8b593a';ctx.fillRect(plank+5,6,2,h-12);ctx.fillStyle=map==='ember'?'#d18a53':'#e0a15b'}
        ctx.fillStyle='#4e3428';ctx.fillRect(0,4,w,4);ctx.fillRect(0,h-8,w,4);
      }else{
        for(let plank=8;plank<h-5;plank+=14){ctx.fillRect(5,plank,w-10,5);ctx.fillStyle='#8b593a';ctx.fillRect(6,plank+5,w-12,2);ctx.fillStyle=map==='ember'?'#d18a53':'#e0a15b'}
        ctx.fillStyle='#4e3428';ctx.fillRect(4,0,4,h);ctx.fillRect(w-8,0,4,h);
      }
      ctx.fillStyle='#4e3428';
      if(horizontal){ctx.fillRect(3,0,5,7);ctx.fillRect(w-8,0,5,7);ctx.fillRect(3,h-7,5,7);ctx.fillRect(w-8,h-7,5,7)}
      else{ctx.fillRect(0,3,7,5);ctx.fillRect(w-7,3,7,5);ctx.fillRect(0,h-8,7,5);ctx.fillRect(w-7,h-8,7,5)}
      ctx.strokeStyle='#e9c276';ctx.lineWidth=2;ctx.strokeRect(2,2,w-4,h-4);ctx.restore();
    }
  }
  function drawTidalGround(){
    ctx.save();ctx.scale(WORLD_SCALE,WORLD_SCALE);
    ctx.fillStyle='#796743';ctx.fillRect(24,309,172,24);ctx.fillRect(144,296,22,76);
    ctx.fillStyle='#947d50';ctx.fillRect(34,315,156,12);ctx.fillRect(151,300,10,66);
    for(let i=0;i<24;i++){const x=(i*137+52)%900+30,y=(i*83+74)%560+40;
      ctx.fillStyle=i%2?'#2d4d31':'#365a35';ctx.fillRect(x,y,8+(i%3)*4,4);
      ctx.fillStyle='#b3e85d';ctx.fillRect(x+2,y-3,3,3);ctx.fillRect(x+9,y+4,2,2)}
    ctx.restore();
  }
  function drawGlassGround(){
    ctx.save();ctx.scale(WORLD_SCALE,WORLD_SCALE);
    ctx.fillStyle='#9a8150';ctx.fillRect(27,308,906,20);ctx.fillRect(470,27,18,586);
    ctx.fillStyle='#b1955b';ctx.fillRect(30,313,899,9);ctx.fillRect(475,30,8,579);
    for(let i=0;i<30;i++){const x=(i*151+43)%960,y=(i*97+25)%640;
      ctx.fillStyle=i%2?'#53643b':'#9dbd4d';ctx.fillRect(x,y,12+(i%4)*3,3);
      ctx.fillStyle='#f4df78';ctx.fillRect(x+4,y-2,2,2);ctx.fillRect(x+15,y+4,3,2)}
    ctx.restore();
  }
  function drawEmberGround(){
    ctx.save();ctx.scale(WORLD_SCALE,WORLD_SCALE);
    for(let i=0;i<36;i++){const x=(i*89+42)%960,y=(i*131+35)%640;ctx.fillStyle='#463b31';
      ctx.fillRect(x,y,4,13);ctx.fillStyle=i%2?'#bd7148':'#dc9053';ctx.fillRect(x+2,y+4,3,2);ctx.fillRect(x-3,y+11,2,2)}
    ctx.restore();
  }
  function drawGrassPatch(x,y,w,h,variant=0){
    const colors=map==='ember'
      ? {shadow:'#261f2730',edge:'#4b393d',base:'#62483e',dark:'#564039',mid:'#876149',light:'#b08a59'}
      : map==='glass'
        ? {shadow:'#172a2030',edge:'#3e5739',base:'#536b3d',dark:'#49633a',mid:'#728a48',light:'#b0bd68'}
        : {shadow:'#102c2330',edge:'#31583b',base:'#3b6943',dark:'#35603e',mid:'#4e7d50',light:'#8db45d'};
    const path=()=>{
      const points=[[x+10,y+3],[x+w*.28,y-2],[x+w*.5,y+4],[x+w*.78,y-1],[x+w-9,y+8],
        [x+w+2,y+h*.32],[x+w-5,y+h*.62],[x+w-10,y+h-3],[x+w*.66,y+h+2],
        [x+w*.38,y+h-5],[x+12,y+h+1],[x-2,y+h*.58],[x+3,y+h*.24]];
      ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();
    };
    ctx.save();ctx.translate(3,5);path();ctx.fillStyle=colors.shadow;ctx.fill();ctx.restore();
    path();ctx.globalAlpha=.22;ctx.fillStyle=colors.base;ctx.fill();ctx.strokeStyle=colors.edge;ctx.lineWidth=1.25;ctx.stroke();ctx.globalAlpha=1;
    ctx.save();ctx.globalAlpha=.58;
    const tuftCount=Math.max(14,Math.floor((w*h)/1200));
    for(let i=0;i<tuftCount;i++){
      const px=x+8+((i*37+variant*19)%(Math.max(12,w-16))),py=y+8+((i*23+variant*13)%(Math.max(12,h-16)));
      ctx.fillStyle=i%4===0?colors.light:i%2?colors.mid:colors.dark;
      ctx.fillRect(px,py,3+(i%3),2);ctx.fillRect(px+1,py-4-(i%2),2,4);
      if(i%3===0){ctx.fillRect(px-3,py+3,2,3);ctx.fillRect(px+5,py+2,2,3)}
    }
    ctx.restore();
  }
  function drawCover(){
    for(const [index,[x,y,w,h]] of (mapDef().cover||[]).entries()){
      if(!visibleRect(x,y,w,h))continue;
      drawGrassPatch(x,y,w,h,index);
    }
  }
  function pixelBlob(radius,squash=1,phase=0){
    const points=12;ctx.beginPath();
    for(let i=0;i<points;i++){
      const angle=(i/points)*Math.PI*2,variation=1+((((phase+i*7)%5)-2)*.045);
      const px=Math.round(Math.cos(angle)*radius*variation),py=Math.round(Math.sin(angle)*radius*squash*variation);
      if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.closePath();
  }
  function drawSlayTree(size,variant=0){
    const palette=map==='ember'
      ? {shadow:'#22192399',trunk:'#4b2d27',trunkLight:'#85543b',dark:'#5d382b',base:'#82482f',light:'#ad643a',spark:'#d38d4d'}
      : map==='glass'
        ? {shadow:'#18271c99',trunk:'#4f3427',trunkLight:'#89603b',dark:'#69492d',base:'#875a32',light:'#b37840',spark:'#d9a052'}
        : {shadow:'#10251d99',trunk:'#4a3026',trunkLight:'#815538',dark:'#5d3d2b',base:'#7f522f',light:'#aa6c3b',spark:'#d4934d'};
    const half=size/2;ctx.fillStyle=palette.shadow;ctx.beginPath();ctx.ellipse(3,half*.58,half*.78,half*.22,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=palette.trunk;ctx.fillRect(-half*.13,-half*.03,half*.26,half*.8);ctx.fillRect(-half*.38,half*.64,half*.76,half*.1);
    ctx.fillStyle=palette.trunkLight;ctx.fillRect(-half*.04,half*.02,half*.08,half*.52);
    ctx.save();ctx.translate(0,-half*.16);
    ctx.fillStyle=palette.dark;pixelBlob(half*.78,.86,variant+3);ctx.fill();
    ctx.fillStyle=palette.base;pixelBlob(half*.68,.82,variant+7);ctx.fill();
    ctx.fillStyle=palette.light;ctx.beginPath();ctx.arc(-half*.28,-half*.25,half*.31,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(half*.28,-half*.31,half*.34,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(0,-half*.55,half*.28,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=palette.spark;ctx.fillRect(-half*.36,-half*.54,Math.max(3,Math.round(half*.12)),3);ctx.fillRect(half*.16,-half*.63,Math.max(3,Math.round(half*.12)),3);ctx.fillRect(half*.38,-half*.16,Math.max(3,Math.round(half*.1)),3);
    ctx.restore();
  }
  function drawProps(){
    for(const prop of mapDef().props||[]){
      const size=prop.size||24;if(!visibleRect(prop.x-size/2,prop.y-size/2,size,size))continue;
      const visualSize=prop.kind==='tree'?size*.68:prop.kind==='stump'?size*.9:size;
      const half=visualSize/2;ctx.save();ctx.translate(Math.round(prop.x),Math.round(prop.y));ctx.imageSmoothingEnabled=false;
      ctx.fillStyle='#10251d99';ctx.beginPath();ctx.ellipse(3,half*.48,half*.78,half*.25,0,0,Math.PI*2);ctx.fill();
      const generatedPropKey={stump:'stump',spikes:'spikes'}[prop.kind],generatedProp=generatedPropKey&&generatedImage('obstacles',generatedPropKey);
      if(generatedProp){
        const dimensions={tree:[visualSize*1.08,visualSize*.96],stump:[visualSize*1.22,visualSize*.82],spikes:[visualSize*1.5,visualSize*.72]}[prop.kind]||[visualSize,visualSize];
        const [spriteWidth,spriteHeight]=dimensions;ctx.drawImage(generatedProp,Math.round(-spriteWidth/2),Math.round(-spriteHeight*.74),Math.round(spriteWidth),Math.round(spriteHeight));
      }else if(prop.kind==='tree'){
        drawSlayTree(visualSize,Math.round(prop.x));
      }else if(prop.kind==='reed'){
        ctx.fillStyle=map==='ember'?'#b3794f':map==='glass'?'#8fa354':'#72a956';
        for(let reed=-2;reed<=2;reed++){
          const lean=((reed*7+Math.round(prop.x))%7)-3;
          ctx.fillRect(reed*4+lean,-half*.72,2,half*1.25);ctx.fillRect(reed*4+lean-3,-half*.72+((reed+3)%3)*4,7,2);
        }
        ctx.fillStyle='#d1c878';ctx.fillRect(-half*.5,-half*.78,3,2);ctx.fillRect(half*.25,-half*.62,3,2);
      }else if(prop.kind==='bush'){
        const bush=map==='ember'?['#3f3030','#715044','#a97951']:map==='glass'?['#314b32','#56753d','#899e50']:['#1e4b35','#2f7040','#6f9e50'];
        ctx.fillStyle=bush[0];pixelBlob(half*.8,.55,prop.x);ctx.fill();
        ctx.fillStyle=bush[1];ctx.beginPath();ctx.arc(-half*.35,-half*.15,half*.48,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(half*.32,-half*.2,half*.5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=bush[2];ctx.fillRect(-half*.42,-half*.43,5,4);ctx.fillRect(half*.18,-half*.48,6,4);ctx.fillRect(half*.42,-half*.05,4,3);
      }else if(prop.kind==='tree'){
        ctx.fillStyle='#2b211c';ctx.beginPath();ctx.moveTo(-half*.2,half*.42);ctx.lineTo(-half*.32,-half*.02);ctx.lineTo(-half*.55,-half*.22);ctx.lineTo(-half*.49,-half*.32);ctx.lineTo(-half*.13,-half*.13);ctx.lineTo(half*.06,-half*.58);ctx.lineTo(half*.16,-half*.57);ctx.lineTo(half*.1,half*.48);ctx.closePath();ctx.fill();
        ctx.fillStyle='#79502f';ctx.fillRect(-half*.1,-half*.05,half*.19,half*.58);ctx.fillStyle='#a1713c';ctx.fillRect(-half*.03,half*.02,half*.08,half*.46);
        const leaf=map==='glass'?['#304b2e','#56763a','#8fa451']:map==='ember'?['#4b3030','#775043','#ad7650']:['#1f4f36','#317246','#689b4d'];
        ctx.fillStyle=leaf[0];pixelBlob(half*.79,.68,prop.x);ctx.fill();
        ctx.fillStyle=leaf[1];ctx.beginPath();ctx.arc(-half*.33,-half*.24,half*.42,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(half*.34,-half*.3,half*.46,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(0,-half*.55,half*.4,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=leaf[2];ctx.fillRect(-half*.42,-half*.48,6,4);ctx.fillRect(half*.14,-half*.6,5,4);ctx.fillRect(half*.38,-half*.18,5,4);ctx.fillRect(-half*.04,-half*.12,4,3);
        ctx.fillStyle='#d1c878';ctx.fillRect(-half*.55,-half*.27,3,2);ctx.fillRect(half*.25,-half*.45,3,2);
      }else if(prop.kind==='stump'){
        ctx.fillStyle='#33251e';ctx.beginPath();ctx.moveTo(-half*.55,half*.42);ctx.lineTo(-half*.6,-half*.2);ctx.lineTo(-half*.35,-half*.42);ctx.lineTo(-half*.05,-half*.3);ctx.lineTo(half*.18,-half*.5);ctx.lineTo(half*.53,-half*.3);ctx.lineTo(half*.48,half*.42);ctx.closePath();ctx.fill();
        ctx.fillStyle='#76502f';ctx.beginPath();ctx.moveTo(-half*.42,half*.4);ctx.lineTo(-half*.46,-half*.2);ctx.lineTo(-half*.24,-half*.33);ctx.lineTo(half*.05,-half*.23);ctx.lineTo(half*.27,-half*.38);ctx.lineTo(half*.4,-half*.21);ctx.lineTo(half*.36,half*.4);ctx.closePath();ctx.fill();
        ctx.fillStyle='#b0844a';ctx.beginPath();ctx.ellipse(-half*.05,-half*.3,half*.42,half*.16,-.12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#5b3c29';ctx.beginPath();ctx.ellipse(-half*.05,-half*.3,half*.24,half*.08,-.12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d1a563';ctx.fillRect(-half*.18,-half*.34,3,2);
      }else if(prop.kind==='barrel'){
        ctx.fillStyle='#3a2a22';ctx.fillRect(-half*.48,-half*.5,half*.96,half*1.02);ctx.beginPath();ctx.ellipse(0,-half*.5,half*.48,half*.16,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(0,half*.52,half*.48,half*.16,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#765238';ctx.fillRect(-half*.34,-half*.45,half*.68,half*.9);ctx.fillStyle='#a67843';ctx.beginPath();ctx.ellipse(0,-half*.45,half*.34,half*.11,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#c29a58';ctx.fillRect(-half*.49,-half*.29,half*.98,3);ctx.fillRect(-half*.49,half*.18,half*.98,3);ctx.fillStyle='#4b3428';ctx.fillRect(-2,-half*.39,3,half*.75);
      }else if(prop.kind==='crate'){
        const wood=map==='ember'?['#38262a','#83503d','#b87550']:map==='glass'?['#392c22','#8a6135','#c18b48']:['#352820','#765331','#b27b43'];
        ctx.fillStyle=wood[0];ctx.fillRect(-half*.7,-half*.68,half*1.4,half*1.34);ctx.fillStyle=wood[1];ctx.fillRect(-half*.57,-half*.55,half*1.14,half*1.08);
        ctx.fillStyle=wood[2];ctx.fillRect(-half*.5,-half*.5,half*.96,3);ctx.fillRect(-half*.5,-2,half*.96,3);ctx.fillRect(-half*.5,half*.42,half*.96,3);
        ctx.fillStyle='#4b3024';ctx.fillRect(-half*.55,-half*.53,4,half*1.03);ctx.fillRect(half*.42,-half*.53,4,half*1.03);ctx.fillStyle='#d09a54';ctx.fillRect(-half*.43,-half*.41,3,half*.2);ctx.fillRect(half*.18,half*.2,3,half*.2);
      }else if(prop.kind==='pillar'){
        const stone=map==='ember'?['#30272e','#665052','#a17c68']:map==='glass'?['#35392e','#687154','#9a9f70']:['#263a37','#4f6b5c','#8da16c'];
        ctx.fillStyle=stone[0];ctx.fillRect(-half*.48,-half*.6,half*.96,half*1.24);ctx.fillStyle=stone[1];ctx.fillRect(-half*.36,-half*.53,half*.68,half*1.02);ctx.fillStyle=stone[2];ctx.fillRect(-half*.3,-half*.5,half*.4,3);ctx.fillRect(-half*.55,-half*.7,half*1.1,6);ctx.fillStyle=stone[0];ctx.fillRect(-half*.58,half*.5,half*1.16,6);ctx.fillRect(-half*.58,-half*.76,half*1.16,4);
      }else if(prop.kind==='torch'){
        const flicker=1+Math.sin(performance.now()/130+prop.x)*.12;ctx.fillStyle='#3b2921';ctx.fillRect(-2,-half*.18,4,half*.72);ctx.fillStyle='#805333';ctx.fillRect(-4,-half*.24,8,4);ctx.globalAlpha=.16*flicker;ctx.fillStyle='#ffc65c';ctx.beginPath();ctx.arc(0,-half*.52,half*.72,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle='#e96736';ctx.fillRect(-4,-half*.52,8,9);ctx.fillStyle='#ffe59a';ctx.fillRect(-2,-half*.6,4,6);ctx.fillStyle='#fff5c4';ctx.fillRect(-1,-half*.7,2,4);
      }else if(prop.kind==='banner'){
        ctx.fillStyle='#3c2c26';ctx.fillRect(-2,-half*.78,4,half*1.45);const cloth=map==='ember'?'#c3634c':map==='glass'?'#b69b4e':'#4e9a76';ctx.fillStyle='#392a2b';ctx.fillRect(1,-half*.68,half*.72,half*.58);ctx.fillStyle=cloth;ctx.fillRect(3,-half*.64,half*.54,half*.43);ctx.fillRect(3,-half*.21,half*.36,4);ctx.fillStyle='#e8ca73';ctx.fillRect(5,-half*.54,3,3);ctx.fillRect(half*.25,-half*.38,3,3);
      }else if(prop.kind==='spikes'){
        ctx.fillStyle='#2b2927';ctx.fillRect(-half*.72,half*.34,half*1.44,4);ctx.fillStyle=map==='ember'?'#c28a60':map==='glass'?'#c8b971':'#9bb6a1';for(let spike=-2;spike<=2;spike++){const sx=spike*half*.32;ctx.beginPath();ctx.moveTo(sx-4,half*.32);ctx.lineTo(sx,-half*.5-(Math.abs(spike)%2)*3);ctx.lineTo(sx+4,half*.32);ctx.closePath();ctx.fill();}
      }else{
        ctx.fillStyle='#3a4439';ctx.fillRect(-half*.48,-half*.3,half*.92,half*.7);ctx.fillStyle='#68745a';ctx.fillRect(-half*.3,-half*.45,half*.55,half*.33);ctx.fillStyle='#a5a17a';ctx.fillRect(-half*.16,-half*.4,half*.3,2);
      }
      ctx.restore();
    }
  }
  function drawBlockWall(x,y,w,h,palette,variant=0){
    const cut=Math.max(6,Math.min(18,Math.round(Math.min(w,h)*.2))),jitter=variant%3-1;
    const outlinePath=()=>{ctx.beginPath();ctx.moveTo(x+cut,y);ctx.lineTo(x+w-cut+jitter,y);ctx.lineTo(x+w,y+cut);ctx.lineTo(x+w,y+h-cut+jitter);ctx.lineTo(x+w-cut,y+h);ctx.lineTo(x+cut+jitter,y+h);ctx.lineTo(x,y+h-cut);ctx.lineTo(x,y+cut+jitter);ctx.closePath()};
    ctx.save();ctx.translate(3,6);outlinePath();ctx.fillStyle='#111d1b99';ctx.fill();ctx.restore();
    outlinePath();ctx.fillStyle=palette.base;ctx.fill();ctx.save();outlinePath();ctx.clip();
    const cell=Math.max(22,Math.min(34,Math.round(Math.min(w,h)*.6)));
    for(let row=0;row<Math.ceil(h/cell)+1;row++)for(let col=-1;col<Math.ceil(w/cell)+1;col++){
      const offset=(row%2)*7,bx=x+col*cell-offset,by=y+row*cell,bw=Math.min(cell-4,x+w-bx-2),bh=Math.min(cell-4,y+h-by-2);
      if(bw<12||bh<12)continue;
      ctx.fillStyle=palette.dark;ctx.fillRect(bx,by,bw,bh);ctx.fillStyle=palette.base;ctx.fillRect(bx+3,by+3,bw-6,bh-6);
      ctx.fillStyle=palette.light;ctx.fillRect(bx+4,by+4,Math.max(5,bw-10),3);ctx.fillStyle=palette.line;ctx.fillRect(bx+3,by+bh-6,bw-6,3);
      ctx.fillStyle=palette.dark;ctx.fillRect(bx+bw-5,by+4,3,Math.max(5,bh-8));
      if((row*7+col*11+variant)%5===0){ctx.fillStyle=palette.mark;ctx.fillRect(bx+8,by+9,4,2);ctx.fillRect(bx+13,by+12,2,3)}
    }
    ctx.restore();outlinePath();ctx.strokeStyle=palette.outline;ctx.lineWidth=2.5;ctx.stroke();
  }
  function drawCrateStack(x,y,w,h,variant=0){
    const wood=map==='ember'?['#38292b','#82503c','#b97650']:map==='glass'?['#3e2d22','#8a6137','#c18b4b']:['#362920','#765331','#b47f45'];
    ctx.save();ctx.fillStyle='#14201a99';ctx.fillRect(x+4,y+h-1,w-8,7);
    const cell=Math.max(24,Math.min(42,Math.round(Math.min(w,h)*.82)));
    for(let row=0;row<Math.ceil(h/cell);row++)for(let col=0;col<Math.ceil(w/cell);col++){
      const bx=x+col*cell+(row%2?3:0),by=y+row*cell,bw=Math.min(cell-4,x+w-bx),bh=Math.min(cell-4,y+h-by);
      if(bw<14||bh<14)continue;
      ctx.fillStyle=wood[0];ctx.fillRect(bx,by,bw,bh);ctx.fillStyle=wood[1];ctx.fillRect(bx+3,by+3,bw-6,bh-6);
      ctx.fillStyle=wood[2];ctx.fillRect(bx+5,by+5,bw-10,3);ctx.fillRect(bx+5,by+5,3,bh-10);
      ctx.fillStyle=wood[0];ctx.fillRect(bx+5,by+bh-7,bw-10,3);ctx.fillRect(bx+bw-8,by+5,3,bh-10);
      ctx.strokeStyle='#d39a56';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(bx+7,by+7);ctx.lineTo(bx+bw-8,by+bh-8);ctx.moveTo(bx+bw-8,by+7);ctx.lineTo(bx+7,by+bh-8);ctx.stroke();
      if((row+col+variant)%3===0){ctx.fillStyle='#e4b86e';ctx.fillRect(bx+8,by+8,3,3)}
    }
    ctx.strokeStyle='#241c1b';ctx.lineWidth=2.5;ctx.strokeRect(x+2,y+2,w-4,h-4);ctx.restore();
  }
  function drawPebbleCluster(x,y,w,h,variant=0){
    const shades=map==='ember'?['#493b3a','#69514a','#8b6a58','#ae8966']:['#314d4a','#48685d','#68836a','#9aa773'];
    ctx.save();ctx.fillStyle='#14251f99';ctx.beginPath();ctx.ellipse(x+w/2,y+h*.7,w*.45,h*.25,0,0,Math.PI*2);ctx.fill();
    const count=Math.max(3,Math.ceil(w/30));
    for(let i=0;i<count;i++){
      const px=x+8+((i*23+variant*9)%(Math.max(10,w-18))),py=y+6+((i*13+variant*5)%(Math.max(10,h-14))),radius=8+(i%3)*3;
      ctx.save();ctx.translate(px,py);ctx.fillStyle='#202c2a';pixelBlob(radius,.72,variant+i);ctx.fill();ctx.translate(-1,-2);ctx.fillStyle=shades[i%shades.length];pixelBlob(radius*.82,.68,variant+i+2);ctx.fill();ctx.fillStyle='#c1c58d';ctx.fillRect(-radius*.35,-radius*.45,Math.max(3,radius*.45),2);ctx.restore();
    }
    ctx.restore();
  }
  function drawOrchardObstacle(x,y,w,h,variant=0){
    drawGrassPatch(x,y,w,h,variant+17);ctx.save();
    for(let i=0;i<Math.max(3,Math.ceil(w/38));i++){
      const px=x+12+((i*29+variant*11)%(Math.max(12,w-24))),py=y+10+((i*17+variant*5)%(Math.max(12,h-22)));
      ctx.fillStyle=i%2?'#b9a957':'#d2c46c';ctx.fillRect(px,py,5,4);ctx.fillStyle='#705738';ctx.fillRect(px+1,py+4,3,2);
    }
    ctx.restore();
  }
  function drawRuinObstacle(x,y,w,h,variant=0){
    drawBlockWall(x,y,w,h,{base:'#5b4144',dark:'#302832',light:'#ad7b66',line:'#79545a',mark:'#d0a07a',outline:'#261e28'},variant);
    if(w>50&&h>30){ctx.save();ctx.fillStyle='#30232b';ctx.fillRect(x+w*.58,y+h*.28,Math.max(8,w*.2),Math.max(7,h*.38));ctx.fillStyle='#17171c';ctx.fillRect(x+w*.64,y+h*.33,Math.max(5,w*.1),Math.max(4,h*.23));ctx.restore();}
  }
  function drawObstacles(){
    for(const [index,[x,y,w,h]] of (mapDef().obstacles||[]).entries()){
      if(!visibleRect(x,y,w,h))continue;
      if(map==='tidal'){
        if(index%7===0){if(!drawGeneratedObstacle('crates',x,y,w,h,.78))drawCrateStack(x,y,w,h,index)}
        else drawSlayWall(x,y,w,h,index,{base:'#586266',dark:'#2f3637',mid:'#66706e',light:'#9aa28e',line:'#3e4748',mark:'#c3c390',outline:'#1d2528'});
      }else if(map==='glass'){
        if(index%4===1){if(!drawGeneratedObstacle('crates',x,y,w,h,.78))drawCrateStack(x,y,w,h,index)}
        else drawSlayWall(x,y,w,h,index,{base:'#686e68',dark:'#303936',mid:'#7d8477',light:'#a9ad8f',line:'#4b534d',mark:'#d0c58a',outline:'#272e2b'});
      }else{
        if(index%5===3){if(!drawGeneratedObstacle('crates',x,y,w,h,.78))drawCrateStack(x,y,w,h,index)}
        else drawSlayWall(x,y,w,h,index,{base:'#65565b',dark:'#302b34',mid:'#806b70',light:'#b39a8e',line:'#51424c',mark:'#d2a078',outline:'#282129'});
      }
    }
  }
  function drawPickupSpawns(){
    const me=localPlayer();
    for(const marker of pickupSpawns){
      if(!visibleRect(marker.x-20,marker.y-20,40,40))continue;
      ctx.save();ctx.translate(Math.round(marker.x),Math.round(marker.y));ctx.imageSmoothingEnabled=false;
      const color=weapons[marker.weapon]?.color||'#d5bd68';
      const pulse=.72+Math.sin(performance.now()/260+marker.id)*.16;
      ctx.globalAlpha=marker.available?pulse:.32;ctx.strokeStyle=color;ctx.lineWidth=1;ctx.setLineDash([3,3]);
      ctx.strokeRect(-17,-14,34,28);ctx.setLineDash([]);
      if(!marker.available){const progress=1-Math.max(0,Math.min(1,(marker.respawn_in||0)/PICKUP_RESPAWN_SECONDS));ctx.globalAlpha=.8;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,20,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke()}
      ctx.fillStyle='#172017d9';ctx.fillRect(-10,-8,20,16);ctx.fillStyle=color;
      ctx.fillRect(-2,-8,4,16);ctx.fillRect(-8,-2,16,4);
      ctx.fillStyle='#f3eccd';ctx.font='7px "Courier New",monospace';ctx.textAlign='center';
      ctx.fillText(weapons[marker.weapon]?.slot||'?',0,3);ctx.globalAlpha=1;
      if(me&&Number.isFinite(me.x)&&Math.hypot(me.x-marker.x,me.y-marker.y)<68){
        const slot=weapons[marker.weapon]?.slot||'?';
        const status=marker.available?'补给点':`重生 ${Math.ceil(marker.respawn_in||0)}s`;
        const label=slot+' · '+status;ctx.font='8px "Courier New",monospace';
        const width=ctx.measureText(label).width+10;ctx.fillStyle='#192017e8';ctx.fillRect(-width/2,-29,width,12);
        ctx.strokeStyle=color;ctx.strokeRect(-width/2,-29,width,12);ctx.fillStyle='#f3eccd';ctx.fillText(label,0,-20);
      }
      ctx.restore();
    }
  }
  function resourceMeta(kind){
    return kind==='health'?{label:'血包',color:'#ef7473',glyph:'+'}:{label:'护甲',color:'#73c7e4',glyph:'◇'};
  }
  function drawResourceGlyph(kind){
    const meta=resourceMeta(kind);ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.fillStyle=ART_TOKENS.deepInk;ctx.fillRect(-13,-11,26,23);
    ctx.fillStyle=meta.color;ctx.fillRect(-10,-8,20,17);
    ctx.fillStyle=kind==='health'?'#fff0d0':'#dffaff';
    if(kind==='health'){
      ctx.fillRect(-3,-7,6,15);ctx.fillRect(-7,-3,14,6);ctx.fillStyle='#ffb0a0';ctx.fillRect(-9,-8,18,2);
    }else{
      ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(8,-4);ctx.lineTo(7,4);ctx.lineTo(0,9);ctx.lineTo(-7,4);ctx.lineTo(-8,-4);ctx.closePath();ctx.fill();
      ctx.fillStyle=meta.color;ctx.fillRect(-2,-4,4,9);ctx.fillRect(-5,-1,10,3);
    }
    ctx.restore();
  }
  function drawResourceSpawns(){
    const me=localPlayer();
    for(const marker of resourceSpawns){
      if(!visibleRect(marker.x-24,marker.y-24,48,48))continue;
      const meta=resourceMeta(marker.kind);ctx.save();ctx.translate(Math.round(marker.x),Math.round(marker.y));
      const pulse=.72+Math.sin(performance.now()/300+marker.id)*.16;
      ctx.globalAlpha=marker.available?pulse:.28;ctx.strokeStyle=meta.color;ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.strokeRect(-19,-17,38,34);ctx.setLineDash([]);
      ctx.globalAlpha=marker.available?.2:.08;ctx.fillStyle=meta.color;ctx.fillRect(-14,-12,28,24);
      ctx.globalAlpha=1;ctx.fillStyle=meta.color;ctx.font='bold 13px "Courier New",monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(meta.glyph,0,1);
      if(!marker.available){const progress=1-Math.max(0,Math.min(1,(marker.respawn_in||0)/RESOURCE_RESPAWN_SECONDS));ctx.strokeStyle=meta.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,22,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke()}
      if(me&&Number.isFinite(me.x)&&Math.hypot(me.x-marker.x,me.y-marker.y)<72){
        const label=meta.label+(marker.available?'':' · '+Math.ceil(marker.respawn_in||0)+'s');ctx.font='8px "Courier New",monospace';const width=ctx.measureText(label).width+10;
        ctx.fillStyle='#192017e8';ctx.fillRect(-width/2,-32,width,13);ctx.strokeStyle=meta.color;ctx.strokeRect(-width/2,-32,width,13);ctx.fillStyle='#f3eccd';ctx.fillText(label,0,-23);
      }
      ctx.restore();
    }
  }
  function drawResources(){
    const me=localPlayer();
    for(const item of resources){
      if(!visibleRect(item.x-24,item.y-24,48,48))continue;
      const meta=resourceMeta(item.kind),pulse=.82+Math.sin(performance.now()/220+item.id)*.12;ctx.save();ctx.translate(Math.round(item.x),Math.round(item.y));
      ctx.globalAlpha=.28;ctx.fillStyle=meta.color;ctx.fillRect(-17,-14,34,29);ctx.globalAlpha=pulse;drawResourceGlyph(item.kind);ctx.globalAlpha=1;
      if(me&&Number.isFinite(me.x)&&Math.hypot(me.x-item.x,me.y-item.y)<68){ctx.font='8px "Courier New",monospace';const width=ctx.measureText(meta.label).width+10;ctx.fillStyle='#192017e8';ctx.fillRect(-width/2,-29,width,12);ctx.strokeStyle=meta.color;ctx.strokeRect(-width/2,-29,width,12);ctx.fillStyle='#f3eccd';ctx.textAlign='center';ctx.fillText(meta.label,0,-20)}
      ctx.restore();
    }
  }
  function drawPickups(){
    const me=localPlayer();
    for(const item of pickups){
      if(!visibleRect(item.x-20,item.y-20,40,40))continue;
      ctx.save();ctx.translate(Math.round(item.x),Math.round(item.y));ctx.imageSmoothingEnabled=false;
      const pulse=.72+Math.sin(performance.now()/190+item.id)*.18;
      ctx.globalAlpha=pulse;ctx.strokeStyle=item.color;ctx.lineWidth=1;ctx.strokeRect(-14,-12,28,25);
      ctx.fillStyle='#26301f';ctx.fillRect(-11,-9,22,18);ctx.fillStyle='#7b6841';ctx.fillRect(-9,-7,18,14);
      ctx.fillStyle='#d5bd68';ctx.fillRect(-10,-8,20,2);ctx.fillRect(-10,6,20,2);
      drawPickupWeapon(item.weapon,item.color);
      ctx.fillStyle='#27301f';ctx.fillRect(-13,10,26,3);ctx.fillStyle='#d4d68a';ctx.fillRect(-6,10,12,2);
      ctx.globalAlpha=1;
      if(me&&Number.isFinite(me.x)&&Math.hypot(me.x-item.x,me.y-item.y)<68){
        const label=weapons[item.weapon]?.name||item.weapon;ctx.font='8px "Courier New",monospace';
        const width=ctx.measureText(label).width+10;ctx.fillStyle='#192017e8';ctx.fillRect(-width/2,-27,width,12);
        ctx.strokeStyle='#a7a976';ctx.strokeRect(-width/2,-27,width,12);ctx.fillStyle='#f3eccd';ctx.textAlign='center';ctx.fillText(label,0,-18);
      }
      ctx.restore();
    }
  }
  function drawPickupWeapon(key,color,target=ctx,centered=false){
    const painter=target;painter.save();painter.imageSmoothingEnabled=false;
    if(centered)painter.translate(target.canvas.width/2,target.canvas.height/2);
    const generatedWeapon=generatedImage('weapons',WEAPON_SPRITE_KEYS[key]||'');
    if(generatedWeapon){painter.drawImage(generatedWeapon,-18,-11,36,22);painter.restore();return}
    // Two-pixel keyline + a restrained glow keep every weapon readable at
    // both pickup scale and the small HUD glyph scale.
    painter.globalAlpha=.18;painter.fillStyle=color;painter.fillRect(-13,-7,28,14);painter.globalAlpha=1;
    painter.fillStyle=ART_TOKENS.deepInk;painter.fillRect(-11,-2,22,6);painter.fillStyle=color;
    if(false){
      painter.fillRect(-11,-3,16,4);painter.fillRect(-8,1,7,4);painter.fillRect(3,-2,12,2);painter.fillRect(-4,-5,5,2);
      painter.fillStyle='#fff0b3';painter.fillRect(9,-3,6,1);
    }else if(key==='rotary'){
      painter.fillRect(-8,-4,11,8);painter.fillRect(2,-3,8,2);painter.fillRect(2,0,8,2);painter.fillRect(2,3,8,2);painter.fillRect(-4,4,4,4);
    }else if(key==='flame'){
      painter.fillRect(-8,-4,7,8);painter.fillRect(-10,-3,3,6);painter.fillRect(-1,-2,10,4);painter.fillRect(6,-4,6,2);painter.fillRect(6,2,6,2);
    }else if(key==='scatter'){
      painter.fillRect(-9,-5,15,3);painter.fillRect(-9,2,15,3);painter.fillRect(4,-4,8,2);painter.fillRect(4,2,8,2);painter.fillRect(-4,4,4,4);
    }else if(key==='bug'){
      painter.fillRect(-4,-4,8,8);painter.fillRect(-9,-3,5,2);painter.fillRect(4,-3,5,2);painter.fillRect(-7,3,4,2);painter.fillRect(3,3,4,2);
      painter.fillStyle='#fff0dc';painter.fillRect(-4,-6,2,2);painter.fillRect(3,-6,2,2);
    }else if(key==='prism'){
      painter.fillRect(-10,-2,16,4);painter.fillRect(-5,-5,5,3);painter.fillRect(0,2,6,3);painter.fillRect(5,-1,9,2);
      painter.fillStyle='#f5f2c5';painter.fillRect(10,-3,4,1);
    }else if(key==='lobber'||key==='rapid_lobber'){
      painter.fillRect(-8,-5,12,10);painter.fillRect(2,-3,10,6);painter.fillRect(-4,5,5,3);painter.fillStyle='#ffe49b';painter.fillRect(7,-2,5,2);
      if(key==='rapid_lobber'){painter.fillRect(-8,-7,4,2);painter.fillRect(-8,5,4,2)}
    }else if(key==='flare'||key==='rapid_flare'||key==='seeker'||key==='cursor'){
      painter.fillRect(-9,-4,15,8);painter.fillRect(5,-2,9,4);painter.fillRect(-7,-6,5,2);painter.fillRect(-7,4,5,2);painter.fillRect(-3,4,4,4);
      if(key==='rapid_flare'){painter.fillRect(-5,-7,8,2);painter.fillRect(-5,5,8,2)}
      if(key==='seeker'||key==='cursor'){painter.fillStyle='#f5eeb7';painter.fillRect(11,-1,3,2)}
    }else{
      painter.fillRect(-8,-3,13,6);painter.fillRect(4,-2,10,3);painter.fillRect(-4,3,4,5);painter.fillStyle='#fff0b2';painter.fillRect(10,-3,4,1);
      if(key==='rapid_lobber')painter.fillRect(-7,-5,7,2);
    }
    painter.globalAlpha=.8;painter.fillStyle=ART_TOKENS.cream;painter.fillRect(-8,-5,3,1);painter.globalAlpha=1;
    painter.fillStyle=ART_TOKENS.ink;painter.fillRect(-12,4,5,2);
    painter.restore();
  }
  function drawFlags(){
    for(const flag of Object.values(flags)){
      if(!visibleRect(flag.x-20,flag.y-25,40,45))continue;
      const hue=flag.team===0?'#63c9ff':'#ff8568';
      ctx.save();ctx.translate(flag.x,flag.y);ctx.strokeStyle='#dae3d4';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(0,11);ctx.lineTo(0,-20);ctx.stroke();
      ctx.fillStyle=hue;ctx.beginPath();ctx.moveTo(1,-20);ctx.lineTo(16,-15);ctx.lineTo(1,-9);ctx.closePath();ctx.fill();
      ctx.fillStyle='#1a2820';ctx.beginPath();ctx.ellipse(0,12,10,3,0,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
  }
  function renderPoint(p){
    const old=previousPlayers.get(p.id);if(!old||!Number.isFinite(old.x)||!Number.isFinite(old.y)||!Number.isFinite(p.x)||!Number.isFinite(p.y))return{x:p.x,y:p.y};
    const elapsed=Math.max(0,performance.now()-stateAt),interval=Math.max(16,stateIntervalMs),t=Math.min(1,elapsed/interval);
    // The server remains authoritative. A short local-only lead hides 10Hz
    // crowded-room updates without changing collision, damage, or replay data.
    if(!replayMode&&p.id===id&&!p.dead){
      const seconds=interval/1000,vx=Math.max(-900,Math.min(900,(p.x-old.x)/seconds)),vy=Math.max(-900,Math.min(900,(p.y-old.y)/seconds)),lead=Math.min(.065,elapsed/1000*.8);
      return{x:Math.max(0,Math.min(WORLD_W,p.x+vx*lead)),y:Math.max(0,Math.min(WORLD_H,p.y+vy*lead))};
    }
    return{x:old.x+(p.x-old.x)*t,y:old.y+(p.y-old.y)*t};
  }
  function drawPilot(p){
    if(p.dead|| (p.hidden&&p.id!==id))return;
    const pos=renderPoint(p);if(!visibleRect(pos.x-32,pos.y-42,64,84))return;
    const previous=previousPlayers.get(p.id),moving=previous&&Number.isFinite(previous.x)&&Number.isFinite(previous.y)&&Math.hypot(p.x-previous.x,p.y-previous.y)>.25;
    const step=moving?Math.sin(performance.now()/95+p.id.length)*2:0;
    const aim=screenToWorld(mouse.x,mouse.y),a=p.id===id?Math.atan2(aim.y-pos.y,aim.x-pos.x):(p.angle||0),jumpOffset=p.jumping?-8:0;
    const own=p.id===id,weaponKey=p.weapon||'pulse',weaponColor=weapons[weaponKey]?.color||p.hue||ART_TOKENS.gold;
    ctx.save();if(p.jumping){ctx.fillStyle='rgba(10,23,18,.55)';ctx.fillRect(Math.round(pos.x)-12,Math.round(pos.y)+13,24,4);}
    ctx.translate(Math.round(pos.x),Math.round(pos.y+jumpOffset));ctx.imageSmoothingEnabled=false;
    // A layered ground shadow and a quiet team ring give the pilot a clear
    // silhouette against the dense Slay.one-style terrain texture.
    ctx.fillStyle=ART_TOKENS.shadow;ctx.beginPath();ctx.ellipse(2,16,15,5,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=own ? .26 : .13;ctx.strokeStyle=p.hue||ART_TOKENS.mapGlow[map]||ART_TOKENS.gold;ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(0,7,18,13,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle=ART_TOKENS.deepInk;ctx.fillRect(-12,13,24,4);ctx.fillRect(-8,17,16,2);
    if(p.shielded){
      ctx.globalAlpha=.75;ctx.strokeStyle='#d1b1ff';ctx.lineWidth=2;ctx.setLineDash([4,3]);
      ctx.beginPath();ctx.ellipse(0,1,25,20,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
    }
    if(p.is_zombie){
      ctx.fillStyle='#253b2b';ctx.fillRect(-9,-5,18,16);ctx.fillStyle='#6d8050';ctx.fillRect(-7,-14,14,10);
      ctx.fillStyle='#a1c56c';ctx.fillRect(-5,-12,4,3);ctx.fillRect(3,-12,4,3);
      ctx.fillStyle='#141d18';ctx.fillRect(-7,-3,14,4);ctx.fillStyle='#e8d58d';ctx.fillRect(-5,-2,3,2);ctx.fillRect(3,-2,3,2);
      ctx.fillStyle='#1b241d';ctx.fillRect(-13,-1,4,10);ctx.fillRect(9,-1,4,10);
    }else{
      const generatedPilot=generatedImage('pilots',p.skin||'wayfinder');
      if(generatedPilot){ctx.drawImage(generatedPilot,-18,-24,36,45)}else{
      const style=PILOT_STYLE[p.skin]||PILOT_STYLE.wayfinder;
      ctx.fillStyle=style.pack;ctx.fillRect(-12,-1,5,10);ctx.fillRect(7,0,5,8);
      ctx.fillStyle=style.trousers;ctx.fillRect(-8,-4,16,15);ctx.fillRect(-6,9+step,5,6);ctx.fillRect(2,9-step,5,6);
      ctx.fillStyle=p.hue;ctx.fillRect(-7,-2,14,9);
      ctx.fillStyle=style.detail;ctx.fillRect(-2,-1,4,4);ctx.fillRect(-11,1,3,4);
      ctx.fillStyle='#f0c39a';ctx.fillRect(-6,-13,12,9);
      if(p.skin==='orchard'){
        ctx.fillStyle=style.headgear;ctx.fillRect(-10,-18,20,3);ctx.fillRect(-6,-21,12,4);
        ctx.fillStyle='#e8d995';ctx.fillRect(-4,-18,8,1);ctx.fillStyle=style.detail;ctx.fillRect(-8,-4,16,3);
      }else if(p.skin==='ember'){
        ctx.fillStyle=style.headgear;ctx.fillRect(-9,-17,18,6);ctx.fillRect(-7,-20,14,4);
        ctx.fillStyle=style.detail;ctx.fillRect(-7,-5,14,4);ctx.fillRect(4,-12,3,2);
      }else if(p.skin==='gear'){
        ctx.fillStyle=style.headgear;ctx.fillRect(-9,-18,18,4);ctx.fillRect(-6,-21,12,4);
        ctx.fillStyle='#283b42';ctx.fillRect(-7,-12,14,4);ctx.fillStyle='#f2db87';ctx.fillRect(-5,-12,4,2);ctx.fillRect(2,-12,4,2);
      }else{
        ctx.fillStyle=style.headgear;ctx.fillRect(-7,-16,14,4);ctx.fillRect(-9,-13,4,5);ctx.fillRect(5,-13,4,4);
      }
      ctx.fillStyle='#f8e8bd';ctx.fillRect(3,-10,3,2);ctx.fillStyle='#3b2a2b';ctx.fillRect(-1,-7,5,2);
      ctx.fillStyle=p.hue;ctx.fillRect(9,-5,8,2);ctx.fillRect(-12,-1,5,4);
      ctx.fillStyle='#d5e3d2';ctx.fillRect(-10,10,4,3);ctx.fillRect(5,10,4,3);
      ctx.fillStyle=ART_TOKENS.ink;ctx.fillRect(-7,6,14,3);ctx.fillStyle=style.detail;ctx.fillRect(-3,6,6,2);
      ctx.fillStyle='#f6e9b7';ctx.fillRect(-5,-9,2,2);ctx.fillRect(4,-9,2,2);
      }
    }
    ctx.restore();
    // Keep the pilot sprite upright; only the separate weapon layer follows aim.
    if(!p.is_zombie){
      const kick=weaponRecoil.get(p.id)||0;
      ctx.save();ctx.translate(Math.round(pos.x),Math.round(pos.y+jumpOffset));ctx.rotate(a);ctx.translate(8-kick,-1);
      drawPickupWeapon(weaponKey,weaponColor);
      ctx.restore();
    }
    const barW=40,bx=pos.x-barW/2,by=pos.y+jumpOffset-29,maxHp=p.max_hp||100;
    ctx.fillStyle=ART_TOKENS.deepInk;ctx.fillRect(bx-1,by-1,barW+2,6);ctx.fillStyle='#29382a';ctx.fillRect(bx,by,barW,4);
    ctx.fillStyle=p.hue||ART_TOKENS.gold;ctx.fillRect(bx,by,barW*Math.max(0,p.hp)/maxHp,4);
    ctx.fillStyle=ART_TOKENS.paper;ctx.font='9px "DM Mono",monospace';ctx.textAlign='center';
    const label=(p.is_zombie?'✳ ':'')+p.name;ctx.fillText(label,pos.x,pos.y+jumpOffset+34);
    if(own){const width=ctx.measureText(label).width+8;ctx.fillStyle='rgba(17,29,22,.54)';ctx.fillRect(pos.x-width/2,pos.y+jumpOffset+25,width,12);ctx.strokeStyle='#aebd73';ctx.lineWidth=1;ctx.strokeRect(pos.x-width/2,pos.y+jumpOffset+25,width,12);ctx.fillStyle=ART_TOKENS.paper;ctx.fillText(label,pos.x,pos.y+jumpOffset+34)}
  }
  function drawPixelPattern(sprite){
    if(!sprite)return;
    const cell=sprite.cell||2,rows=sprite.rows||[],palette=sprite.colors||{};
    ctx.imageSmoothingEnabled=false;
    rows.forEach((row,ry)=>{
      for(let rx=0;rx<row.length;rx++){
        const color=palette[row[rx]];
        if(!color||row[rx]==='.')continue;
        ctx.fillStyle=color;
        ctx.fillRect(Math.round((rx-row.length/2)*cell),Math.round((ry-rows.length/2)*cell),cell,cell);
      }
    });
  }
  function drawProjectileTrail(p,x,y){
    const history=projectileTrails.get(p.id)?.points||[];
    if(history.length<2)return;
    const sprite=PIXEL_SPRITES[p.weapon]||PIXEL_SPRITES.pulse;
    const longTail=['flare','seeker','cursor','rapid_flare','bug','flame'].includes(p.weapon);
    const points=history.slice(longTail?-6:-3);
    ctx.save();ctx.globalAlpha=longTail ? .52 : .36;ctx.strokeStyle=sprite.trail;ctx.lineWidth=longTail?2:1.5;ctx.lineCap='square';
    ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
    ctx.lineTo(x,y);ctx.stroke();ctx.restore();
    if(longTail||p.weapon==='lobber'||p.weapon==='rapid_lobber'){
      const smoke=p.weapon==='bug'?'#b96b91':'#aaa99a';
      for(let i=0;i<points.length;i+=2){
        const point=points[i],alpha=(i+1)/points.length*.48;
        ctx.globalAlpha=alpha;ctx.fillStyle=i%4===0?smoke:sprite.trail;
        const size=i%3===0?3:2;ctx.fillRect(Math.round(point.x-size/2),Math.round(point.y-size/2),size,size);
      }
      ctx.globalAlpha=1;
    }
  }
  function drawProjectile(p){
    const extrapolation=Math.min(stateIntervalMs/1000,Math.max(0,(performance.now()-stateAt)/1000));
    const age=(p.age||0)+extrapolation;
    const x=Math.round(p.x+(p.vx||0)*extrapolation);
    const y=Math.round(p.y+(p.vy||0)*extrapolation);
    const a=Math.atan2(p.vy||0,p.vx||0),sprite=PIXEL_SPRITES[p.weapon]||PIXEL_SPRITES.pulse;
    drawProjectileTrail(p,x,y);
    ctx.save();
    if(p.kind==='arc'){
      const flight=Math.max(.01,p.total_life||1),height=Math.max(0,Math.sin(Math.min(1,age/flight)*Math.PI)*12);
      ctx.globalAlpha=.38;ctx.fillStyle='#24271d';ctx.fillRect(x-4,y+3,8,2);ctx.globalAlpha=1;
      ctx.translate(x,Math.round(y-height));
    }else ctx.translate(x,y);
    const spin=(p.kind==='arc'?Math.floor(age*14)*Math.PI/4:0);
    ctx.rotate(a+spin);
    if(p.kind==='heal_beam'){
      ctx.lineCap='square';ctx.strokeStyle=sprite.trail;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-28,0);ctx.lineTo(4,0);ctx.stroke();
      ctx.strokeStyle='#e7ffe8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-25,0);ctx.lineTo(2,0);ctx.stroke();
    }else if(p.kind==='energy_ray'){
      ctx.fillStyle='#7d2436';ctx.fillRect(-34,-3,42,6);ctx.fillStyle=sprite.colors.w;ctx.fillRect(-29,-1,35,2);
    }else if(p.kind==='energy_orb'){
      ctx.globalAlpha=.38;ctx.fillStyle=sprite.trail;ctx.fillRect(-11,-11,22,22);ctx.globalAlpha=1;
      drawPixelPattern(sprite);ctx.fillStyle='#fff';ctx.fillRect(2,-5,4,4);
    }else if(p.kind==='heal_wave'){
      const progress=Math.min(1,age/Math.max(.01,p.total_life||.38)),reach=10+(p.radius||90)*progress;
      ctx.globalAlpha=Math.max(0,1-progress);ctx.strokeStyle=sprite.trail;ctx.lineWidth=2;
      ctx.strokeRect(-reach,-reach*.7,reach*2,reach*1.4);
      ctx.fillStyle=sprite.colors.w;ctx.fillRect(-reach,-2,5,5);ctx.fillRect(reach-4,-2,5,5);
      ctx.fillRect(-reach,reach*.7-3,5,5);ctx.fillRect(reach-4,reach*.7-3,5,5);
    }else if(false){
      ctx.globalAlpha=.45;ctx.fillStyle=sprite.trail;ctx.fillRect(-48,-2,62,4);
      ctx.globalAlpha=.9;ctx.fillStyle='#e7f1ff';ctx.fillRect(-28,-1,43,2);
      ctx.fillStyle='#fff';ctx.fillRect(8,-2,5,4);
    }else drawPixelPattern(sprite);
    ctx.restore();ctx.globalAlpha=1;
  }
  function drawMuzzles(dt){
    for(const flash of muzzles){
      flash.life-=dt*1000;
      const sprite=PIXEL_SPRITES[flash.kind]||PIXEL_SPRITES.pulse;
      const a=Math.atan2(flash.vy||0,flash.vx||1);
      ctx.save();ctx.translate(Math.round(flash.x),Math.round(flash.y));ctx.rotate(a);
      ctx.globalAlpha=Math.max(0,flash.life/flash.max);
      const color=sprite.colors.w||sprite.colors.W||sprite.colors.O||sprite.trail;
      ctx.fillStyle=sprite.trail;ctx.fillRect(0,-2,4,4);
      ctx.fillStyle=color;ctx.fillRect(3,-3,4,6);
      ctx.fillStyle='#fff6d8';ctx.fillRect(5,-1,3,2);
      ctx.fillStyle=sprite.trail;ctx.fillRect(2,-5,2,2);ctx.fillRect(2,3,2,2);
      ctx.restore();
    }
    ctx.globalAlpha=1;muzzles=muzzles.filter(f=>f.life>0);
  }
  function drawDamageNumbers(dt){
    for(const item of damageNumbers){
      item.life-=dt*1000;
      const progress=1-item.life/item.max,x=item.x,y=item.y-18-progress*18;
      if(!visibleRect(x-24,y-16,48,22,40))continue;
      ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,item.life/item.max*1.35));ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='800 '+(item.size||11)+'px "Courier New",monospace';ctx.lineWidth=3;ctx.strokeStyle='#162019';ctx.strokeText('-'+item.value,Math.round(x),Math.round(y));ctx.fillStyle=item.color;ctx.fillText('-'+item.value,Math.round(x),Math.round(y));ctx.restore();
    }
    damageNumbers=damageNumbers.filter(item=>item.life>0);
  }
  function drawPixelExplosion(effect,dt){
    const progress=1-effect.life/effect.max;
    const sprite=PIXEL_SPRITES[effect.kind]||PIXEL_SPRITES.pulse;
    const power=effect.power||1,blast=effect.blast||0,outer=effect.layer==='outer',core=effect.layer==='core';
    const palette=Object.values(sprite.colors),extent=Math.max(8,Math.min(92,blast ? .58*power : 12));
    const count=blast?Math.round((displaySettings.lowEffects?12:26)*power):displaySettings.lowEffects?3:7,phase=Math.floor(progress*5),seed=effect.seed||0;
    ctx.save();ctx.globalAlpha=Math.max(0,1-progress*.88);
    if(blast){
      const expansion=Math.min(1,progress*(outer ? .95 : core ? 2.4 : 1.45));
      const shock=Math.min(190,blast*(outer ? .98 : core ? .46 : .78)*power)*expansion;
      const bright=sprite.colors.w||sprite.colors.W||'#fff1b0',accent=sprite.colors.O||sprite.colors.B||sprite.trail;
      ctx.globalAlpha=Math.max(0,(outer ? .64 : core ? .72 : .58)*(1-progress));ctx.fillStyle=bright;
      const thickness=outer?3:core?5:3,half=Math.max(4,Math.round(shock*.42));
      ctx.fillRect(Math.round(effect.x-half),Math.round(effect.y-shock*.66),half*2,thickness);
      ctx.fillRect(Math.round(effect.x-half),Math.round(effect.y+shock*.66),half*2,thickness);
      ctx.fillRect(Math.round(effect.x-shock*.92),Math.round(effect.y-half*.45),thickness,Math.max(2,Math.round(half*.9)));
      ctx.fillRect(Math.round(effect.x+shock*.92),Math.round(effect.y-half*.45),thickness,Math.max(2,Math.round(half*.9)));
      ctx.globalAlpha=Math.max(0,(outer ? .36 : core ? .52 : .3)*(1-progress));ctx.fillStyle=accent;
      for(let i=0;i<(displaySettings.lowEffects?8:16);i++){
        const angle=(i/16)*Math.PI*2+seed*.02,radius=shock*(1+((i*5+seed)%7)/24),size=i%3===0?4:2;
        ctx.fillRect(Math.round(effect.x+Math.cos(angle)*radius-size/2),Math.round(effect.y+Math.sin(angle)*radius*.72-size/2),size,size);
      }
      ctx.globalAlpha=Math.max(0,(outer ? .18 : core ? .34 : .2)*(1-progress));ctx.fillStyle='#fff9d0';
      ctx.fillRect(Math.round(effect.x-shock*.5),Math.round(effect.y-2),Math.max(3,Math.round(shock)),4);
    }
    ctx.globalAlpha=Math.max(0,1-progress*.92);
    if(progress<(core ? .68 : blast ? .34 : .4)){
      const s=blast?(core?14:progress<.14?18:10):(progress<.18?10:6);
      ctx.fillStyle='#fff2bd';ctx.fillRect(Math.round(effect.x-s/2),Math.round(effect.y-s/2),s,s);
      ctx.fillStyle=sprite.colors.O||sprite.colors.B||sprite.trail;ctx.fillRect(Math.round(effect.x-3),Math.round(effect.y-3),6,6);
    }
    for(let i=0;i<count;i++){
      const angle=(i/count)*Math.PI*2+seed*.03,jitter=((i*7+seed)%7)/10;
      const distance=extent*(.18+progress*.94)*(1+jitter),size=2+((i+phase)%3===0?2:0),color=palette[(i+phase)%palette.length];
      ctx.globalAlpha=Math.max(.08,1-progress*.95);ctx.fillStyle=color;
      ctx.fillRect(Math.round(effect.x+Math.cos(angle)*distance-size/2),Math.round(effect.y+Math.sin(angle)*distance*.72-size/2),size,size);
    }
    if(progress>.2){
      const smokeAlpha=Math.min(.48,(progress-.2)*.62);ctx.globalAlpha=smokeAlpha;ctx.fillStyle=outer?'#9c9b89':core?'#6e4c39':'#77796f';
      for(let i=0;i<(displaySettings.lowEffects?5:10);i++){
        const ox=((i*13+seed)%29)-14,oy=((i*17+seed)%25)-12,size=3+(i%3)*2;
        ctx.fillRect(Math.round(effect.x+ox+progress*6),Math.round(effect.y+oy-progress*10),size,size);
      }
    }
    ctx.restore();ctx.globalAlpha=1;effect.life-=dt*1000;
  }
  function drawParticles(dt){
    for(const p of particles){
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt*1000;
      ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;
      ctx.fillRect(Math.round(p.x),Math.round(p.y),p.r,p.r);
    }
    ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0);
    rings.forEach(effect=>drawPixelExplosion(effect,dt));rings=rings.filter(r=>r.life>0);
  }
  function drawSceneLighting(){
    // A soft Figma-style overlay unifies the pixel layers and keeps the
    // playable centre readable without changing world-space collisions.
    const tint=ART_TOKENS.mapGlow[map]||ART_TOKENS.mapGlow.tidal;
    ctx.save();
    const glow=ctx.createRadialGradient(W*.5,H*.42,Math.min(W,H)*.12,W*.5,H*.5,Math.max(W,H)*.78);
    glow.addColorStop(0,'rgba(255,248,207,0)');
    glow.addColorStop(.62,'rgba(255,248,207,.015)');
    glow.addColorStop(1,'rgba(5,14,11,.25)');
    ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=.06;ctx.fillStyle=tint;ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=.12;ctx.strokeStyle='#f6e7a8';ctx.lineWidth=1;ctx.strokeRect(8.5,8.5,W-17,H-17);
    ctx.restore();
  }
  function ensureMinimapStatic(){
    const mw=miniMap.width,mh=miniMap.height,key=map+'|'+mw+'x'+mh;
    if(minimapStaticCanvas&&minimapStaticKey===key)return minimapStaticCanvas;
    const canvas=document.createElement('canvas');canvas.width=mw;canvas.height=mh;
    const painter=canvas.getContext('2d'),sx=mw/WORLD_W,sy=mh/WORLD_H,def=mapDef();
    painter.imageSmoothingEnabled=false;painter.fillStyle=map==='glass'?'#687747':map==='ember'?'#665740':'#4d713f';painter.fillRect(0,0,mw,mh);
    for(let i=0;i<54;i++){
      const x=(i*37+11)%mw,y=(i*53+19)%mh;painter.fillStyle=i%2?'#849451':'#395f38';painter.fillRect(x,y,2,2);
    }
    for(const [x,y,w,h] of def.water||[]){painter.fillStyle='#1d6873';painter.fillRect(x*sx,y*sy,w*sx,h*sy)}
    for(const [index,portal] of (def.portals||[]).entries()){
      const color=map==='ember'?'#c982e7':map==='glass'?'#70d9e7':'#7ce3a8',px=portal.x*sx,py=portal.y*sy,markRadius=Math.max(3,portal.radius*sx*.48);
      painter.fillStyle='#102319';painter.beginPath();painter.arc(px,py,markRadius+2,0,Math.PI*2);painter.fill();
      painter.fillStyle=color;painter.beginPath();painter.arc(px,py,markRadius,0,Math.PI*2);painter.fill();
      painter.strokeStyle='#ecffe9';painter.lineWidth=1;painter.stroke();
      painter.fillStyle='#102319';painter.font='bold 6px monospace';painter.textAlign='center';painter.textBaseline='middle';painter.fillText(index%2?'B':'A',px,py);
    }
    for(const [x,y,w,h] of def.cover||[]){painter.fillStyle='#78934d';painter.fillRect(x*sx,y*sy,w*sx,h*sy)}
    for(const prop of def.props||[]){
      painter.fillStyle=prop.kind==='tree'?'#284a30':prop.kind==='stump'?'#8f7044':prop.kind==='crate'?'#b47a45':prop.kind==='pillar'?'#9ca27b':prop.kind==='spikes'?'#d6c56d':prop.kind==='torch'?'#ee8c51':'#858260';
      painter.fillRect(prop.x*sx-2,prop.y*sy-2,4,4);
    }
    painter.fillStyle=map==='ember'?'#b18a63':'#aab093';
    for(const [x,y,w,h] of def.obstacles||[])painter.fillRect(x*sx,y*sy,w*sx,h*sy);
    for(const [x,y,w,h] of def.bridges||[]){painter.fillStyle='#b17a45';painter.fillRect(x*sx,y*sy,w*sx,h*sy)}
    painter.strokeStyle='#d4d5a0';painter.lineWidth=1;painter.strokeRect(.5,.5,mw-1,mh-1);
    minimapStaticCanvas=canvas;minimapStaticKey=key;return canvas;
  }
  function drawMinimap(){
    if(!displaySettings.minimap)return;
    const mw=miniMap.width,mh=miniMap.height,sx=mw/WORLD_W,sy=mh/WORLD_H;
    miniCtx.imageSmoothingEnabled=false;miniCtx.clearRect(0,0,mw,mh);miniCtx.drawImage(ensureMinimapStatic(),0,0);
    for(const marker of pickupSpawns){
      miniCtx.globalAlpha=marker.available?.9:.32;miniCtx.fillStyle=weapons[marker.weapon]?.color||'#f0dc83';
      miniCtx.fillRect(marker.x*sx-1,marker.y*sy-1,3,3);
    }
    for(const marker of resourceSpawns){
      miniCtx.globalAlpha=marker.available?.95:.32;miniCtx.fillStyle=resourceMeta(marker.kind).color;
      miniCtx.fillRect(marker.x*sx-2,marker.y*sy-2,4,4);
    }
    miniCtx.globalAlpha=1;
    for(const flag of Object.values(flags)){miniCtx.fillStyle=flag.team===0?'#7fdcff':'#ff9875';miniCtx.fillRect(flag.x*sx-2,flag.y*sy-2,5,5)}
    for(const player of players){
      if(!Number.isFinite(player.x)||!Number.isFinite(player.y))continue;
      miniCtx.fillStyle=player.id===id?'#fff5a6':player.is_zombie?'#d08076':player.hue||'#f0e9bd';
      miniCtx.fillRect(player.x*sx-2,player.y*sy-2,5,5);
      if(player.id===id){miniCtx.strokeStyle='#192019';miniCtx.strokeRect(player.x*sx-3,player.y*sy-3,7,7)}
    }
    const viewW=W/CAMERA_ZOOM*sx,viewH=H/CAMERA_ZOOM*sy;
    miniCtx.fillStyle='#fff7b51c';miniCtx.fillRect((cameraX-W/(2*CAMERA_ZOOM))*sx,(cameraY-H/(2*CAMERA_ZOOM))*sy,viewW,viewH);
    miniCtx.strokeStyle='#f8e9a8';miniCtx.lineWidth=1;
    miniCtx.strokeRect((cameraX-W/(2*CAMERA_ZOOM))*sx+.5,(cameraY-H/(2*CAMERA_ZOOM))*sy+.5,viewW,viewH);
  }
  function draw(dt=1/60){
    updateCamera();
    updateWeaponRecoil(dt);updateDamageFeedback(dt);
    const shake=cameraShake;cameraShake=Math.max(0,cameraShake-dt*34);
    const shakeX=shake?(Math.random()*2-1)*shake:0,shakeY=shake?(Math.random()*2-1)*shake:0;
    const screen=screenShake,screenX=screen?(Math.random()*2-1)*screen:0,screenY=screen?(Math.random()*2-1)*screen:0;
    ctx.save();ctx.translate(screenX,screenY);
    ctx.fillStyle=mapDef().ground||'#25351f';ctx.fillRect(-32,-32,W+64,H+64);
    ctx.save();ctx.translate(W/2-cameraX*CAMERA_ZOOM+shakeX,H/2-cameraY*CAMERA_ZOOM+shakeY);ctx.scale(CAMERA_ZOOM,CAMERA_ZOOM);
    drawGrid();drawWater();drawCover();drawProps();drawObstacles();drawBridges();drawPortals();
    const rawBeacon=map==='tidal'?[480,76]:map==='glass'?[84,424]:[878,386];
    const beacon=rawBeacon.map(value=>value*WORLD_SCALE);
    ctx.save();ctx.translate(beacon[0],beacon[1]);ctx.globalAlpha=.8;ctx.strokeStyle=mapDef().accent;ctx.lineWidth=2;
    for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(0,0,11+i*7,5+i*4,performance.now()/1800+i,0,Math.PI*2);ctx.stroke()}
    ctx.fillStyle='#edf4d5';ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();ctx.restore();
    drawPickupSpawns();drawResourceSpawns();drawFlags();drawPickups();drawResources();if(!displaySettings.lowEffects)drawMuzzles(dt);for(const projectile of projectiles)if(visibleRect(projectile.x-24,projectile.y-24,48,48,100))drawProjectile(projectile);for(const p of players)drawPilot(p);if(!displaySettings.lowEffects)drawDamageNumbers(dt);
    drawParticles(dt);ctx.restore();drawSceneLighting();drawMinimap();
    if(explosionFlash>0){
      ctx.fillStyle='rgba(255,166,74,'+Math.min(.28,explosionFlash*.34)+')';ctx.fillRect(-32,-32,W+64,H+64);
      if(explosionFlash>.46){ctx.fillStyle='rgba(255,244,190,'+Math.min(.14,(explosionFlash-.46)*.24)+')';ctx.fillRect(-32,-32,W+64,H+64)}
    }
    if(damageFlash>0){ctx.fillStyle='rgba(255,64,56,'+Math.min(.32,damageFlash*.42)+')';ctx.fillRect(0,0,W,H);ctx.strokeStyle='rgba(255,176,122,'+Math.min(.8,damageFlash)+')';ctx.lineWidth=8;ctx.strokeRect(4,4,W-8,H-8)}
    if(hitConfirm>0){const cx=mouse.x,cy=mouse.y,size=7+hitConfirm*4;ctx.save();ctx.globalAlpha=Math.min(.95,hitConfirm*1.4);ctx.strokeStyle='#fff2b0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx-size,cy-size);ctx.lineTo(cx-size/2,cy-size/2);ctx.moveTo(cx+size,cy-size);ctx.lineTo(cx+size/2,cy-size/2);ctx.moveTo(cx-size,cy+size);ctx.lineTo(cx-size/2,cy+size/2);ctx.moveTo(cx+size,cy+size);ctx.lineTo(cx+size/2,cy+size/2);ctx.stroke();ctx.restore()}
    ctx.restore();
  }
  function loop(now){
    if(!started)return;
    if(!nextRenderAt||now>=nextRenderAt){
      const dt=Math.min(.04,Math.max(0,(now-last)/1000));last=now;
      const renderInterval=1000/MAX_RENDER_FPS;
      nextRenderAt=nextRenderAt?nextRenderAt+renderInterval:now+renderInterval;
      while(nextRenderAt<=now)nextRenderAt+=renderInterval;
      updatePerf(now);if(now-lastHudAt>=HUD_INTERVAL_MS){syncHud();lastHudAt=now}draw(dt);
    }
    requestAnimationFrame(loop);
  }
  async function refreshRooms(){
    try{
      const response=await fetch('/api/arena/rooms',{cache:'no-store'});if(!response.ok)throw Error();
      const active=await response.json(),list=document.querySelector('#room-list');list.replaceChildren();
      if(!active.length){const empty=document.createElement('span');empty.className='empty-rooms';empty.textContent='暂时没有开放房间';list.append(empty);return}
      for(const item of active){
        const button=document.createElement('button');button.type='button';button.className='room-card';
        const code=document.createElement('b');code.textContent=item.code;const name=document.createElement('small');name.textContent=item.map_name;
        const count=document.createElement('small');count.textContent=item.mode_name+' · '+item.players+'/'+item.capacity;
        button.append(code,name,count);button.onclick=()=>{
          ui.room.value=item.code;selectMode(item.mode);
          selectedMap=item.map;map=item.map;document.querySelectorAll('[data-map]').forEach(card=>card.classList.toggle('active',card.dataset.map===item.map));
          ui.status.textContent='已选择 '+item.code;draw();
        };list.append(button);
      }ui.status.textContent='输入相同房间码，和朋友加入同一战区';
    }catch{ui.status.textContent='当前服务暂不支持公开房间列表'}
  }
  async function loadMapPreviews(){
    try{
      const response=await fetch('/api/arena/maps',{cache:'no-store'});if(!response.ok)throw Error();
      const definitions=await response.json();maps=Object.fromEntries(definitions.map(({id,...definition})=>[id,definition]));minimapStaticCanvas=null;minimapStaticKey='';draw();
    }catch{}
  }
  function selectMode(value){
    selectedMode=value;
    document.querySelectorAll('[data-mode]').forEach(button=>{
      const active=button.dataset.mode===value;
      button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
    });
  }
  function cycleSkin(){
    const index=PILOT_SKINS.findIndex(skin=>skin.id===selectedSkin);
    const skin=PILOT_SKINS[(index+1)%PILOT_SKINS.length];
    selectedSkin=skin.id;ui.skinCycle.dataset.skin=skin.id;ui.skinName.textContent=skin.name;
    ui.skinCycle.setAttribute('aria-label','切换角色外观，当前'+skin.name);
  }
  const params=new URLSearchParams(location.search);if(params.has('room'))ui.room.value=params.get('room').slice(0,8);
  document.querySelectorAll('[data-ability]').forEach(button=>button.addEventListener('click',()=>{
    const ability=button.dataset.ability;send({type:'ability',ability});
    if(ability==='dash')dashReadyAt=performance.now()+1800;
  }));
  document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
    selectMode(button.dataset.mode);winner=null;
  }));
  ui.skinCycle.addEventListener('click',cycleSkin);
  ui.lobbyChatForm.addEventListener('submit',event=>{
    event.preventDefault();const content=ui.lobbyChatInput.value.trim();
    if(content&&lobbySocket?.readyState===WebSocket.OPEN){
      lobbySocket.send(JSON.stringify({type:'chat',name:ui.name.value,content}));
      ui.lobbyChatInput.value='';ui.lobbyChatInput.focus();
    }else if(content)toast('大厅频道暂时未连接');
  });
  document.querySelectorAll('[data-upgrade]').forEach(button=>button.addEventListener('click',()=>{
    selectUpgrade(button.dataset.upgrade);
    if(started&&(localPlayer()?.skill_points||0)>0)toast('已选升级，按 Space 确认');
  }));
  ui.confirmUpgrade.addEventListener('click',()=>buyUpgrade(selectedUpgrade));
  selectUpgrade(selectedUpgrade);
  document.querySelectorAll('[data-map]').forEach(button=>button.addEventListener('click',()=>{selectedMap=button.dataset.map;map=selectedMap;document.querySelectorAll('[data-map]').forEach(item=>item.classList.toggle('active',item===button));draw()}));
  ui.startButton.addEventListener('click',()=>{spectatorMode=false;join()});ui.watchRoom?.addEventListener('click',()=>{if(!ui.room.value.trim()){ui.status.textContent='请输入房间码后再观战';return}spectatorMode=true;join()});ui.restart.addEventListener('click',()=>{intentionalSocketClose=true;clearTimeout(reconnectTimer);socket?.close();location.href='/arena/'});
  ui.matchResultReplay?.addEventListener('click',downloadReplay);
  ui.matchResultAgain?.addEventListener('click',()=>{if(started&&winner)send({type:'vote_map',map:selectedMap});else{intentionalSocketClose=true;clearTimeout(reconnectTimer);socket?.close();location.href='/arena/'}});
  ui.matchResultLobby?.addEventListener('click',()=>{intentionalSocketClose=true;clearTimeout(reconnectTimer);socket?.close();location.href='/arena/'});
  ui.replayToggle?.addEventListener('click',toggleReplayPause);
  ui.replaySeek?.addEventListener('input',event=>seekReplay(event.target.value));
  ui.replayExit?.addEventListener('click',stopReplay);
  ui.settings?.addEventListener('click',()=>{ui.optionsPanel?.classList.toggle('hidden');applyDisplaySettings()});
  ui.replayFile?.addEventListener('change',event=>loadReplayFile(event.target.files?.[0]));
  for(const key of Object.keys(displaySettings)){
    document.querySelector('#option-'+key.replace(/[A-Z]/g,match=>'-'+match.toLowerCase()))?.addEventListener('change',event=>setDisplaySetting(key,event.target.type==='range'?event.target.value:event.target.checked));
  }
  document.querySelector('#refresh-rooms').addEventListener('click',refreshRooms);
  ui.copyRoom.addEventListener('click',async()=>{const invite=new URL(location.href);invite.searchParams.set('room',room||'');try{await navigator.clipboard.writeText(invite.href);toast('房间邀请链接已复制')}catch{toast('房间码：'+room)}});
  document.querySelector('#chat').addEventListener('submit',event=>{event.preventDefault();const input=document.querySelector('#chat-input'),content=input.value.trim();if(content)send({type:'chat',content});input.value='';document.querySelector('#chat').classList.add('hidden');canvas.focus()});
  function pointerMove(event){
    const rect=canvas.getBoundingClientRect(),point={x:(event.clientX-rect.left)*W/rect.width,y:(event.clientY-rect.top)*H/rect.height};
    if(event.pointerType==='touch'&&event.pointerId===touch.moveId){const dx=event.clientX-touch.originX,dy=event.clientY-touch.originY,len=Math.hypot(dx,dy),max=58,s=len>max?max/len:1;touch.moveX=dx*s/max;touch.moveY=dy*s/max}
    else{mouse.x=point.x;mouse.y=point.y}
  }
  canvas.addEventListener('pointerdown',event=>{
    canvas.focus();const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*W/rect.width,y=(event.clientY-rect.top)*H/rect.height;
    if(event.pointerType==='touch'){event.preventDefault();if(x<W*.43&&touch.moveId===null){touch.moveId=event.pointerId;touch.originX=event.clientX;touch.originY=event.clientY;touch.moveX=touch.moveY=0}else{touch.aimId=event.pointerId;mouse.x=x;mouse.y=y;mouse.down=true}canvas.setPointerCapture(event.pointerId)}
    else if(event.button===0){mouse.x=x;mouse.y=y;mouse.down=true}
    else if(event.button===2){mouse.x=x;mouse.y=y;if(started){send({type:'ability',ability:'dash'});dashReadyAt=performance.now()+1800}}
  });
  canvas.addEventListener('pointermove',pointerMove);
  function releasePointer(event){if(event.pointerId===touch.moveId){touch.moveId=null;touch.moveX=touch.moveY=0}if(event.pointerType==='touch'&&event.pointerId===touch.aimId){touch.aimId=null;mouse.down=false}}
  canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',releasePointer);canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',event=>{
    if(!started)return;
    event.preventDefault();const owned=ownedWeapons(),current=owned.indexOf(localPlayer()?.weapon||'pulse');
    const next=(current+(event.deltaY>0?1:-1)+owned.length)%owned.length;chooseWeapon(owned[next]);
  },{passive:false});
  window.addEventListener('mouseup',()=>mouse.down=false);
  window.addEventListener('blur',()=>{
    keys.clear();mouse.down=false;touch.moveId=touch.aimId=null;touch.moveX=touch.moveY=0;
    if(started)sendInput();
  });
  window.addEventListener('keydown',event=>{
    if(event.target instanceof HTMLInputElement)return;const key=event.key.toLowerCase();
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','tab','y'].includes(key)||key in KEY_WEAPONS)event.preventDefault();
    if(key==='enter'&&started&&document.activeElement!==document.querySelector('#chat-input')){event.preventDefault();document.querySelector('#chat').classList.remove('hidden');mouse.down=false;document.querySelector('#chat-input').focus();return}
    if(key==='tab'&&started){document.querySelector('#scoreboard').classList.remove('hidden');return}
    if((key==='['||key===']')&&started&&(spectatorMode||localPlayer()?.dead)){event.preventDefault();cycleSpectator(key===']'?1:-1);return}
    if(event.repeat)return;keys.add(key);
    if(key in KEY_WEAPONS)chooseWeapon(KEY_WEAPONS[key]);
    if(key===' '&&started)buyUpgrade(selectedUpgrade);
    if(key==='q')send({type:'ability',ability:'shield'});if(key==='e')send({type:'ability',ability:'repair'});
    if('vxc'.includes(key))buyUpgrade({v:'vitality',x:'velocity',c:'amplify'}[key]);
    if(key==='r')send({type:'reload'});
  });
  window.addEventListener('keyup',event=>{const key=event.key.toLowerCase();keys.delete(key);if(key==='tab')document.querySelector('#scoreboard').classList.add('hidden')});
  loadDisplaySettings();connectLobbyChat();loadMapPreviews();refreshRooms();roomTimer=setInterval(()=>{if(!started&&!ui.start.classList.contains('hidden'))refreshRooms()},4500);draw();
})();
