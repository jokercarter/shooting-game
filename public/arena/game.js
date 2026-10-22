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
  // How long the camera keeps looking at the body after the local pilot dies,
  // so the topple is actually readable before the view hands over.
  const CORPSE_LINGER_MS = 1400;
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
    levelBadge: document.querySelector('#level-badge'),
    xpFill: document.querySelector('#xp-fill'), xpLabel: document.querySelector('#xp-label'),
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
  // Flat geometric visual kit. Every restyled drawer pulls colours and shape
  // helpers from here so the whole scene shares one crisp, bright look.
  const FLAT = {
    outline:'#1b2438', ink:'#111a2c', paper:'#fdf6dd',
    shadow:'rgba(27,36,56,0.22)', softShadow:'rgba(27,36,56,0.10)',
    map:{
      tidal:{base:'#6fbf5d',mid:'#7fce6b',light:'#94dd7c',dark:'#4f9c46',accent:'#a8ef8c',deep:'#2f7d45',soil:'#b57a3f',path:'#d9bd83',stone:{base:'#d5dde8',mid:'#a9b4c5',dark:'#727f94'}},
      glass:{base:'#a8cf63',mid:'#b8da72',light:'#d3e88c',dark:'#82a944',accent:'#e8f29a',deep:'#4c8b3a',soil:'#b87c42',path:'#efd9a4',stone:{base:'#e2ddc9',mid:'#bdb7a0',dark:'#8a846c'}},
      ember:{base:'#cf9468',mid:'#dda377',light:'#efc196',dark:'#ab7248',accent:'#ffd0a0',deep:'#b4552f',soil:'#ad7440',path:'#f0cfa0',stone:{base:'#ded4cb',mid:'#b7a99c',dark:'#84766a'}},
    },
    stone:{base:'#d5dde8',mid:'#a9b4c5',dark:'#727f94',light:'#eef3f9',outline:'#1b2438'},
    stoneWarm:{base:'#e0cdb4',mid:'#bfa588',dark:'#8a6f52',light:'#f4e6d2',outline:'#1b2438'},
    stoneCool:{base:'#ccd4e2',mid:'#a3adc0',dark:'#6b768c',light:'#eaf1fa',outline:'#1b2438'},
    wood:{base:'#d9a05f',mid:'#b57a3f',dark:'#7d4f27',light:'#f0c68c',outline:'#1b2438'},
    crate:{base:'#e0a463',mid:'#b87c42',dark:'#7a4a22',light:'#f4cd94',trim:'#5a3a18',outline:'#1b2438'},
    metal:{base:'#c3ccd9',mid:'#909db1',dark:'#5a6577',light:'#eaf0f8',outline:'#1b2438'},
    barrel:{base:'#d98a3f',mid:'#a85a22',dark:'#6b3410',band:'#3a2410',outline:'#1b2438'},
    leaf:{tidal:{base:'#3f9b55',mid:'#54b169',light:'#7fd38a',dark:'#2f7d45'},glass:{base:'#63a747',mid:'#7cc257',light:'#a8dd7c',dark:'#4c8b3a'},ember:{base:'#cf6b3c',mid:'#e2874e',light:'#f2ad78',dark:'#b4552f'}},
    water:{tidal:{base:'#4ab7d5',mid:'#7fd8ea',light:'#d4f6ff',dark:'#2a86a9',bank:'#e0c48c',bankLight:'#f2dcae'},glass:{base:'#4fb2d4',mid:'#8adcec',light:'#dcfaff',dark:'#2a7fa8',bank:'#e8cf9b',bankLight:'#f6e2b8'},ember:{base:'#7a68c4',mid:'#b3a3ee',light:'#e6ddff',dark:'#4a3d8c',bank:'#e0b184',bankLight:'#f4d3ad'}},
    portal:{tidal:{outer:'#a8f0c4',mid:'#39c79a',core:'#e8fff2',spark:'#ffffff',floor:'#8ce8b8',floorDark:'#1f6b52'},glass:{outer:'#8ee8f4',mid:'#3fb6d4',core:'#e0fcff',spark:'#ffffff',floor:'#7adcea',floorDark:'#1f6288'},ember:{outer:'#d6a8ff',mid:'#9a63d8',core:'#f6e6ff',spark:'#ffffff',floor:'#c48ef0',floorDark:'#4a3a7a'}}
  };
  function mapFlat(){return FLAT.map[map]||FLAT.map.tidal}
  function leafFlat(){return FLAT.leaf[map]||FLAT.leaf.tidal}
  function waterFlat(){return FLAT.water[map]||FLAT.water.tidal}
  function portalFlat(){return FLAT.portal[map]||FLAT.portal.tidal}
  // Workhorse shape helpers: flat fills + bold outlines in one call.
  function flatRoundRect(x,y,w,h,r,fill,stroke,lineWidth=2){
    if(w<0||h<0)return;
    const rr=Math.max(0,Math.min(r,Math.min(w,h)/2));
    ctx.beginPath();
    ctx.moveTo(x+rr,y);ctx.lineTo(x+w-rr,y);ctx.quadraticCurveTo(x+w,y,x+w,y+rr);
    ctx.lineTo(x+w,y+h-rr);ctx.quadraticCurveTo(x+w,y+h,x+w-rr,y+h);
    ctx.lineTo(x+rr,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-rr);
    ctx.lineTo(x,y+rr);ctx.quadraticCurveTo(x,y,x+rr,y);
    ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill()}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke()}
  }
  function flatCircle(cx,cy,r,fill,stroke,lineWidth=2){
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill()}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.lineJoin='round';ctx.stroke()}
  }
  function flatRing(cx,cy,r,stroke,lineWidth=2){ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.lineCap='round';ctx.stroke()}
  function flatOctagon(cx,cy,r,fill,stroke,lineWidth=2){
    ctx.beginPath();
    for(let i=0;i<8;i++){const a=Math.PI/8+i*Math.PI/4,px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r;i===0?ctx.moveTo(px,py):ctx.lineTo(px,py)}
    ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill()}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.lineJoin='round';ctx.stroke()}
  }
  function flatTri(x,y,w,h,dir,fill,stroke,lineWidth=2){
    ctx.beginPath();
    if(dir==='up'){ctx.moveTo(x,y+h);ctx.lineTo(x+w/2,y);ctx.lineTo(x+w,y+h)}
    else if(dir==='down'){ctx.moveTo(x,y);ctx.lineTo(x+w/2,y+h);ctx.lineTo(x+w,y)}
    else if(dir==='left'){ctx.moveTo(x+w,y);ctx.lineTo(x,y+h/2);ctx.lineTo(x+w,y+h)}
    else {ctx.moveTo(x,y);ctx.lineTo(x+w,y+h/2);ctx.lineTo(x,y+h)}
    ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill()}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.lineJoin='round';ctx.stroke()}
  }
  function flatSoftShadow(x,y,w,h,r=6,offset=3,fill=FLAT.shadow){
    ctx.save();ctx.translate(offset,offset);flatRoundRect(x,y,w,h,r,fill,null);ctx.restore();
  }
  const keys = new Set(), mouse = {x:W/2,y:H/2,down:false};
  const touch = {moveId:null,aimId:null,moveX:0,moveY:0,originX:0,originY:0};
  let socket, lobbySocket, lobbyReconnectTimer, id, room, roomCapacity=20, map='tidal', mode='normal', modeName='Normal Deathmatch', maps={}, weapons={}, players=[], previousPlayers=new Map(), spectatorMode=false, privatePlayer=null, privateVotedMap=null, lastStateMessage=null;
  let cameraX=W/2,cameraY=H/2,spectatorTarget=null,spectatorId=null;
  let cameraShake=0, screenShake=0, explosionFlash=0, damageFlash=0, hitConfirm=0, weaponRecoil=new Map(), cameraKickX=0, cameraKickY=0, ownDeathAt=0;
  let debugProjectiles=[], projectiles=[], pickups=[], pickupSpawns=[], resources=[], resourceSpawns=[], previousProjectileIds=new Set(), projectileTrails=new Map(), particles=[], rings=[], muzzles=[], damageNumbers=[], started=false;
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
  // The atlas was generated as 200 complete, isolated cells.  The 32 selected
  // cells below are exported as tight standalone sprites; every map rectangle
  // receives one whole sprite instead of a clipped slice of a large wall.
  const ATLAS_OBSTACLE_KEYS=Array.from({length:32},(_,index)=>'atlas'+String(index+1).padStart(2,'0'));
  for(const key of ATLAS_OBSTACLE_KEYS)GENERATED_ASSET_SOURCES.obstacles[key]='/arena/generated/obstacle-atlas-'+key.slice(5)+'.png';
  const generatedAssets={pilots:new Map(),weapons:new Map(),obstacles:new Map(),grounds:new Map()};
  const WEAPON_SPRITE_KEYS={pulse:'pulse',flame:'flame',lobber:'lobber',rapid_lobber:'lobber',prism:'prism',flare:'prism',rapid_flare:'prism',healing_wave:'heal'};
  function loadGeneratedAssets(){
    for(const [group,entries] of Object.entries(GENERATED_ASSET_SOURCES))for(const [key,src] of Object.entries(entries)){
      const image=new Image();image.decoding='async';image.onload=()=>{if(group==='grounds')groundPatterns.delete(key)};image.src=src;generatedAssets[group].set(key,image);
    }
  }
  function generatedImage(group,key){const image=generatedAssets[group]?.get(key);return image&&image.complete&&image.naturalWidth>0?image:null}
  function obstacleSpriteKey(index){return ATLAS_OBSTACLE_KEYS[index%ATLAS_OBSTACLE_KEYS.length]}
  function drawGeneratedObstacle(key,x,y,w,h){
    const image=generatedImage('obstacles',key);if(!image)return false;
    // The server rectangle is the authoritative obstacle footprint.  Each
    // selected atlas cell is a complete standalone sprite.  Long map chunks
    // are filled with two or three complete sprites along their long axis so
    // a square source cell is never stretched into a thin, clipped-looking
    // wall or rock.
    const rotate=h>w*1.35;
    const span=rotate?h:w,thickness=rotate?w:h;
    const tileCount=Math.max(1,Math.min(4,Math.round(span/Math.max(1,thickness))));
    const tileSpan=span/tileCount;
    const sourceWidth=image.naturalWidth||1,sourceHeight=image.naturalHeight||1;
    const fit=Math.min(tileSpan/sourceWidth,thickness/sourceHeight);
    const drawWidth=Math.max(1,Math.round(sourceWidth*fit));
    const drawHeight=Math.max(1,Math.round(sourceHeight*fit));
    ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(Math.round(x+w/2),Math.round(y+h/2));
    if(rotate)ctx.rotate(Math.PI/2);
    for(let tile=0;tile<tileCount;tile++){
      const tileCenter=-span/2+(tile+.5)*tileSpan;
      ctx.drawImage(image,Math.round(tileCenter-drawWidth/2),Math.round(-drawHeight/2),drawWidth,drawHeight);
    }
    ctx.restore();return true;
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
  const PRIVATE_PLAYER_FIELDS=['id','energy','owned_weapons','upgrades','ammo','level','xp','xp_to_next','stat_points'];
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
    window.__morrowTestLocalPlayer=()=>{const p=localPlayer();return p?{id:p.id,x:p.x,y:p.y,weapon:p.weapon,owned_weapons:p.owned_weapons,ammo:p.ammo,energy:p.energy,armor:p.armor,hp:p.hp,max_hp:p.max_hp,dead:p.dead,knocked:p.knocked,jumping:p.jumping,state_interval_ms:stateIntervalMs,input_interval_ms:inputIntervalMs,render_target_fps:MAX_RENDER_FPS,camera_x:cameraX,camera_y:cameraY,own_death_at:ownDeathAt,now:performance.now()}:null};
    window.__morrowTestSetLocal=(patch={})=>{const p=localPlayer();if(!p)return null;for(const k in patch){if(k==='x'||k==='y')continue;p[k]=patch[k];}return {hp:p.hp,armor:p.armor,max_armor:p.max_armor,max_hp:p.max_hp};};
    window.__morrowTestSpawnProjectile=(opts={})=>{
      // Dev-only: draw any weapon's projectile without waiting for a pickup.
      const me=localPlayer(),key=opts.weapon||'pulse',w=weapons[key]||{};
      const speed=Number.isFinite(opts.speed)?opts.speed:(w.speed||300);
      const range=Number.isFinite(w.range)?w.range:420;
      const life=Number.isFinite(opts.life)?opts.life:(speed>1?Math.max(.08,range/speed):4);
      const x=Number.isFinite(opts.x)?opts.x:(me?me.x:cameraX);
      const y=Number.isFinite(opts.y)?opts.y:(me?me.y:cameraY);
      const dir=Number.isFinite(opts.dir)?opts.dir:0;
      const shot={id:'dev-shot-'+Math.random().toString(36).slice(2),owner:me?me.id:'dev',
        weapon:key,kind:opts.kind||w.kind||'bolt',age:Number.isFinite(opts.age)?opts.age:0,
        x,y,vx:Math.cos(dir)*speed,vy:Math.sin(dir)*speed,total_life:life,
        blast:Number.isFinite(opts.blast)?opts.blast:(w.blast||0),
        color:opts.color||w.color||'#ffffff',
        target_x:x+Math.cos(dir)*range,target_y:y+Math.sin(dir)*range};
      debugProjectiles.push(shot);
      return shot;
    };
    window.__morrowTestSpawnArc=opts=>window.__morrowTestSpawnProjectile({weapon:'rapid_lobber',...opts,kind:'arc'});

    window.__morrowTestClear=()=>{debugProjectiles.length=0;muzzles.length=0;rings.length=0;particles.length=0};
    window.__morrowTestClear=()=>{debugProjectiles.length=0;muzzles.length=0;rings.length=0;particles.length=0};
    window.__morrowTestProject=(x,y)=>{
      // Normalised viewport position of a world point, for labelling captures.
      const nx=((x-cameraX)*CAMERA_ZOOM+W/2)/W,ny=((y-cameraY)*CAMERA_ZOOM+H/2)/H;
      const c=document.querySelector('#arena'),r=c.getBoundingClientRect();
      return {x:r.left+nx*r.width,y:r.top+ny*r.height,inside:nx>=0&&nx<=1&&ny>=0&&ny<=1};
    };
    window.__morrowTestProject=(x,y)=>{
      // Normalised viewport position of a world point, for labelling captures.
      const nx=((x-cameraX)*CAMERA_ZOOM+W/2)/W,ny=((y-cameraY)*CAMERA_ZOOM+H/2)/H;
      const c=document.querySelector('#arena'),r=c.getBoundingClientRect();
      return {x:r.left+nx*r.width,y:r.top+ny*r.height,inside:nx>=0&&nx<=1&&ny>=0&&ny<=1};
    };
    window.__morrowTestImpact=(opts={})=>{
      const key=opts.weapon||'pulse',w=weapons[key]||{};
      spawnImpact({weapon:key,kind:opts.kind||w.kind||'bolt',
        x:Number.isFinite(opts.x)?opts.x:cameraX,y:Number.isFinite(opts.y)?opts.y:cameraY,
        color:w.color||opts.color,blast:Number.isFinite(opts.blast)?opts.blast:(w.blast||0)});
    };
    window.__morrowTestMuzzle=(opts={})=>{
      const key=opts.weapon||'pulse',w=weapons[key]||{},dir=Number.isFinite(opts.dir)?opts.dir:0;
      const life=Number.isFinite(opts.life)?opts.life:900;
      muzzles.push({x:Number.isFinite(opts.x)?opts.x:cameraX,y:Number.isFinite(opts.y)?opts.y:cameraY,
        vx:Math.cos(dir)*120,vy:Math.sin(dir)*120,kind:key,life,max:life,color:w.color||opts.color});
    };

    window.__morrowTestImpact=(opts={})=>{
      const key=opts.weapon||'pulse',w=weapons[key]||{};
      spawnImpact({weapon:key,kind:opts.kind||w.kind||'bolt',
        x:Number.isFinite(opts.x)?opts.x:cameraX,y:Number.isFinite(opts.y)?opts.y:cameraY,
        color:w.color||opts.color,blast:Number.isFinite(opts.blast)?opts.blast:(w.blast||0)});
    };
    window.__morrowTestMuzzle=(opts={})=>{
      const key=opts.weapon||'pulse',w=weapons[key]||{},dir=Number.isFinite(opts.dir)?opts.dir:0;
      const life=Number.isFinite(opts.life)?opts.life:900;
      muzzles.push({x:Number.isFinite(opts.x)?opts.x:cameraX,y:Number.isFinite(opts.y)?opts.y:cameraY,
        vx:Math.cos(dir)*120,vy:Math.sin(dir)*120,kind:key,life,max:life,color:w.color||opts.color});
    };
    window.__morrowTestRenderState=()=>({canvas_width:canvas.width,canvas_height:canvas.height,dpr:window.devicePixelRatio,resource_spawns:resourceSpawns.length,resources:resources.length,screen_shake:screenShake,camera_shake:cameraShake,camera_kick:[Math.round(cameraKickX),Math.round(cameraKickY)],explosion_flash:explosionFlash,rings:rings.length,particles:particles.length,smoke:particles.filter(p=>p.smoke).length,low_effects:displaySettings.lowEffects});
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
    window.__morrowTestMinimapShown = player => minimapShouldShow(player);
    window.__morrowTestPlayers = () => players.map(p => ({id:p.id,x:p.x,y:p.y,dead:!!p.dead,dead_for:p.dead_for}));
    window.__morrowTestPlayers = () => players.map(p => ({id:p.id,x:p.x,y:p.y,dead:!!p.dead,dead_for:p.dead_for}));
    // Dev-only: inject a synthetic pilot so the progression HUD can be
    // inspected without having to stage a real fight.
    window.__morrowTestInjectPlayer=(patch={})=>{
      const injected={id:'test-pilot',name:'TestPilot',hue:ART_TOKENS.gold,skin:'wayfinder',
        x:cameraX+120,y:cameraY,angle:0,hp:100,max_hp:100,armor:0,max_armor:100,score:0,
        kills:0,deaths:0,level:1,xp:0,xp_to_next:60,xp_start:0,stat_points:0,upgrades:{},
        dead:false,dead_for:0,corpse_angle:0,hidden:false,...patch};
      players=[...players.filter(p=>p.id!==injected.id),injected];
      return injected.id;
    };
    window.__morrowTestRemovePlayer=(playerId='test-pilot')=>{
      players=players.filter(p=>p.id!==playerId);
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
      // The body stays where it fell, so the camera holds on it briefly before
      // switching to a living pilot.
      if(performance.now()-ownDeathAt<CORPSE_LINGER_MS){
        p=own;spectatorTarget=null;spectatorId=null;
      }else{
        const alive=players.filter(player=>player.id!==own.id&&!player.dead&&Number.isFinite(player.x)&&Number.isFinite(player.y));
        p=alive.find(player=>player.id===spectatorId)||alive.sort((a,b)=>Math.hypot(a.x-cameraX,a.y-cameraY)-Math.hypot(b.x-cameraX,b.y-cameraY))[0]||own;
        spectatorId=p?.id===own.id?null:p?.id||null;spectatorTarget=p?.id===own.id?null:p;
      }
    }else{spectatorTarget=null;spectatorId=null;ownDeathAt=0}
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
    particles=[];rings=[];muzzles=[];damageNumbers=[];projectileTrails.clear();previousProjectileIds.clear();weaponRecoil.clear();cameraShake=0;screenShake=0;explosionFlash=0;damageFlash=0;hitConfirm=0;cameraKickX=0;cameraKickY=0;cameraX=W/2;cameraY=H/2;rackSignature='';
    document.querySelector('#weapon-list')?.replaceChildren();
    ui.health.style.width='100%';ui.healthNumber.textContent='100 / 100';if(ui.armor)ui.armor.style.width='0%';if(ui.energy)ui.energy.style.width='100%';ui.score.textContent='0000';ui.kills.textContent='0';ui.deaths.textContent='0';ui.timer.textContent='00:00';ui.dash.style.width='100%';ui.upgradePoints.textContent='属性点 0 · 每级 +2 点 · Space确认所选升级';ui.confirmUpgrade.disabled=true;ui.weapon.textContent='PULSE NEEDLE';ui.ammo.textContent='∞';ui.info.textContent='BOLT / 28 DMG';ui.reloadStatus?.classList.add('hidden');ui.reloadStatus?.classList.remove('empty');if(ui.reloadFill)ui.reloadFill.style.setProperty('--reload-progress','0%');if(ui.reloadLabel)ui.reloadLabel.textContent='0.0s';ui.pilotCount.textContent='1 / '+roomCapacity;ui.mapName.textContent=(maps[selectedMap]?.name||selectedMap||'MOSSWOOD').split(' ')[0].toUpperCase();ui.deathBanner.classList.add('hidden');ui.matchResult?.classList.add('hidden');ui.copyRoom.classList.add('hidden');if(ui.levelBadge)ui.levelBadge.textContent='LV 1';if(ui.xpFill)ui.xpFill.style.width='0%';if(ui.xpLabel)ui.xpLabel.textContent='0 / 60 XP';
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
    const base=color||'#ffffff';
    const palette=[base,tone(base,.42),tone(base,-.28),'#fff3c9'];
    for(let i=0;i<count;i++){
      const a=(Math.floor(Math.random()*16)/16)*Math.PI*2,s=24+Math.random()*115;
      particles.push({x:Math.round(x),y:Math.round(y),vx:Math.cos(a)*s,vy:Math.sin(a)*s,
        life:150+Math.random()*180,max:330,color:palette[Math.floor(Math.random()*palette.length)],r:1+Math.floor(Math.random()*2)});
    }
    if(particles.length>MAX_PARTICLES)particles.splice(0,particles.length-MAX_PARTICLES);
  }
  function spawnImpact(old){
    const style=old.weapon||old.kind||'pulse';
    const look=lookFor(old),tint=projectileTint(old);
    const missile=MISSILE_KINDS.has(old.kind)||MISSILE_KINDS.has(style),power=missile?1.5:1;
    const blast=old.blast||0,explosionLife=blast?(missile?660:440):360,seed=Math.floor(Math.random()*32);
    // Every weapon pops with its own footprint: needles flash a tight ring,
    // shards barely mark the ground, rockets hand over to the blast effect.
    // Lobbed blasts have no missile shockwave, so their single ring has to
    // carry the visible radius on its own.
    const ringR=blast?(missile?blast*.56*power:blast*.82):(look.ring||8);
    if(ringR>0)rings.push({x:old.x,y:old.y,life:explosionLife,max:explosionLife,color:tint,r:ringR,kind:style,blast,power,seed,layer:'main'});
    burst(old.x,old.y,tint,blast?(missile?42:24):(look.hit||7),style);
    if(blast&&!missile){
      const strength=Math.min(30,11+blast*.28);
      triggerExplosionFeedback(old.x,old.y,blast,Math.min(24,strength),Math.min(30,strength*1.2));
      spawnSmoke(old.x,old.y,blast);
    }
    if(missile&&blast){
      const strength=Math.min(46,16+blast*.34);
      const shakeScale=triggerExplosionFeedback(old.x,old.y,blast,Math.min(34,strength),Math.min(46,strength*1.25));
      // The white-out used to ignore distance, so a rocket on the far side of
      // the map blinded you as hard as one in your face.
      triggerExplosionFlash(Math.min(.9,.3+blast/190)*shakeScale);
      spawnSmoke(old.x,old.y,blast);
      rings.push({x:old.x,y:old.y,life:820,max:820,color:tone(tint,.55),r:blast*.9*power,kind:style,blast,power:power*1.08,seed:seed+7,layer:'outer'});
      rings.push({x:old.x,y:old.y,life:320,max:320,color:tone(tint,.12),r:blast*.3*power,kind:style,blast:blast*.45,power,seed:seed+13,layer:'core'});
    }
  }
  function updateFeed(items=[]){for(const item of items)if(item.id>latestFeedId){latestFeedId=item.id;showFeed(item.content)}}
  // Peak-based so one close blast always dominates, but a second blast stacks
  // on top instead of being discarded: overlapping fights read as a continuous
  // rumble rather than a single twitch.
  function triggerCameraShake(amount){
    const scaled=displaySettings.lowEffects?amount*.35:amount;
    cameraShake=Math.min(46,Math.max(cameraShake,scaled)+scaled*.22);
  }
  function triggerScreenShake(amount){
    const scaled=displaySettings.lowEffects?amount*.42:amount;
    screenShake=Math.min(60,Math.max(screenShake,scaled)+scaled*.22);
  }
  function triggerExplosionFlash(amount){explosionFlash=Math.max(explosionFlash,displaySettings.lowEffects?amount*.5:amount)}
  // Tremor model. Two rules:
  //   1. Only what you can see shakes you. A blast off-screen is silent no
  //      matter how big it is -- the camera is your eardrum.
  //   2. Inside the view the shake falls off with distance from the camera, so
  //      a rocket in your face hits far harder than one at the screen edge.
  // Distance is measured from the camera rather than the pilot so the rule also
  // holds while spectating.
  function explosionShakeScale(x,y,blast){
    if(!Number.isFinite(x)||!Number.isFinite(y))return 0;
    if(!visibleRect(x,y,0,0,140))return 0;
    const radius=Math.max(1,Number(blast)||1);
    // Distance from the view, but the camera clamps at the map edge while the
    // pilot keeps walking into the corner, so a point-blank rocket would read
    // as "half a screen away". Take whichever is nearer.
    const subject=spectatorTarget||localPlayer();
    let distance=Math.hypot(cameraX-x,cameraY-y);
    if(subject&&Number.isFinite(subject.x)&&Number.isFinite(subject.y)){
      distance=Math.min(distance,Math.hypot(subject.x-x,subject.y-y));
    }
    const reach=Math.max(620,radius*8);
    const t=Math.min(1,distance/reach);
    // Pure falloff: once the blast is beyond the reach the shake is exactly
    // zero, so a distant explosion never leaves a residual tremor behind.
    return Math.pow(1-t,1.8);
  }
  function triggerExplosionFeedback(x,y,blast,cameraAmount,screenAmount){
    const scale=explosionShakeScale(x,y,blast);
    triggerCameraShake(cameraAmount*scale);triggerScreenShake(screenAmount*scale);
    // The shockwave also shoves the view away from the blast, which reads as
    // "I got launched" even though the camera itself never leaves the pilot.
    const me=localPlayer();
    if(me&&Number.isFinite(me.x)&&Number.isFinite(me.y)){
      const dx=me.x-x,dy=me.y-y,d=Math.hypot(dx,dy)||1;
      const push=Math.min(30,10+blast*.09)*scale;
      cameraKickX+=dx/d*push;cameraKickY+=dy/d*push;
    }
    return scale;
  }
  // Rising smoke left behind by a blast: slow, expanding, low-contrast puffs.
  function spawnSmoke(x,y,blast){
    if(displaySettings.lowEffects)return;
    // Off-screen smoke is invisible but still burns a particle slot for 1.5s.
    if(!visibleRect(x,y,blast*2,blast*2,90))return;
    const count=Math.max(7,Math.round(blast*.24));
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2,r=Math.random()*blast*.45;
      particles.push({
        x:Math.round(x+Math.cos(a)*r),y:Math.round(y+Math.sin(a)*r*.72),
        vx:(Math.random()-.5)*30,vy:-16-Math.random()*34,
        life:620+Math.random()*900,max:1520,
        color:i%3===0?'#bab4a3':'#9a9586',r:3+Math.round(Math.random()*3),
        grow:.035,smoke:true
      });
    }
  }
  function updateWeaponRecoil(dt){
    for(const [owner,kick] of weaponRecoil){
      const next=kick*Math.exp(-dt*22);
      if(next<.08)weaponRecoil.delete(owner);else weaponRecoil.set(owner,next);
    }
  }
  function updateDamageFeedback(dt){damageFlash=Math.max(0,damageFlash-dt*2.8);hitConfirm=Math.max(0,hitConfirm-dt*5);screenShake=Math.max(0,screenShake-dt*38);explosionFlash=Math.max(0,explosionFlash-dt*4.6);cameraKickX*=Math.exp(-dt*9);cameraKickY*=Math.exp(-dt*9)}
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
      const switchRemaining=Math.max(0,Number(player.switch_remaining)||0);
      button.classList.toggle('active',key===player.weapon);
      button.classList.toggle('switching',key===player.weapon&&switchRemaining>.02);
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
    const previousHealth=new Map(players.map(player=>[player.id,{hp:player.hp,x:player.x,y:player.y,kills:player.kills,score:player.score,weapon:player.weapon,dead:player.dead}]));
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
    if(me?.dead&&!previousMe?.dead)ownDeathAt=performance.now();
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
        muzzles.push({x:mx,y:my,vx:bullet.vx,vy:bullet.vy,kind:style,life:90,max:90,color:bullet.color});
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
      spawnImpact(old);
      if(old.blast)playSound('explosion',old.kind||old.weapon||'pulse');
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
      winner=null;resultShown=false;pingValue=0;damageFlash=0;hitConfirm=0;cameraKickX=0;cameraKickY=0;spectatorId=null;replayFrames=[];ui.matchResult?.classList.add('hidden');cameraShake=0;screenShake=0;explosionFlash=0;weaponRecoil.clear();projectileTrails.clear();previousProjectileIds.clear();projectiles=[];particles=[];rings=[];muzzles=[];damageNumbers=[];resources=[];resourceSpawns=[];
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
    if(localPlayer()?.weapon===weapon)return;
    send({type:'weapon',weapon});document.querySelectorAll('.weapon-slot').forEach(b=>b.classList.toggle('active',b.dataset.weapon===weapon));
  }
  const UPGRADE_KEYS=['vitality','velocity','amplify','regeneration','tenacity','rapid','swift','penetration'];
  const MAX_UPGRADE_TIER=8;
  const UPGRADE_META={
    vitality:{label:'加固外壳',hint:'最大生命 +20',key:'V'},
    velocity:{label:'推进器',hint:'移动速度 +16',key:'X'},
    amplify:{label:'弹药增幅',hint:'子弹伤害 +12%',key:'C'},
    regeneration:{label:'再生舱',hint:'每秒回复 0.6',key:'B'},
    tenacity:{label:'韧性装甲',hint:'受到伤害 -4%',key:'G'},
    rapid:{label:'快速装填',hint:'射速 +6% / 装填 -8%',key:'T'},
    swift:{label:'疾风冲刺',hint:'冲刺冷却 -0.18s',key:'F'},
    penetration:{label:'穿透弹芯',hint:'子弹穿透 +1',key:'P'},
  };
  function selectUpgrade(upgrade){
    if(!UPGRADE_KEYS.includes(upgrade))return;
    selectedUpgrade=upgrade;
    document.querySelectorAll('[data-upgrade]').forEach(button=>{
      const selected=button.dataset.upgrade===upgrade;
      button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
    });
  }
  function buyUpgrade(upgrade=selectedUpgrade){
    selectUpgrade(upgrade);
    if(!started)return;
    if((localPlayer()?.stat_points??localPlayer()?.skill_points??0)<1){toast('没有可用属性点');return}
    send({type:'upgrade',upgrade:selectedUpgrade});
  }
  function syncHud(){
    const p=localPlayer();if(!p){if(spectatorMode){ui.deathBanner.classList.add('hidden');ui.pilotCount.textContent=players.filter(v=>!v.is_bot).length+' / '+roomCapacity;ui.mapName.textContent=(maps[map]?.name||map||'MOSSWOOD').split(' ')[0].toUpperCase();ui.weapon.textContent='观战模式';ui.ammo.textContent='—';ui.info.textContent=spectatorTarget?'目标：'+spectatorTarget.name+' · [ ] 切换':'选择观战目标';}return;}
    const maximum=Math.max(1,Number(p.max_hp)||(100+(p.upgrades?.vitality||0)*20));
    ui.health.style.width=Math.max(0,Math.min(100,p.hp/maximum*100))+'%';
    ui.healthNumber.textContent=Math.max(0,p.hp)+' / '+maximum;
    if(ui.armor)ui.armor.style.width=Math.max(0,Math.min(100,(p.armor||0)/(p.max_armor||100)*100))+'%';
    if(ui.energy)ui.energy.style.width=Math.max(0,Math.min(100,(p.energy??0)))+'%';
    ui.deathBanner.classList.toggle('hidden',!p.dead);
    if(p.dead)ui.deathStatus.textContent='重启倒计时 '+Math.ceil(p.respawn_in||0)+' 秒'+(spectatorTarget?' · 观战 '+spectatorTarget.name+' · [ ] 切换':'');
    ui.score.textContent=String(p.score||0).padStart(4,'0');ui.kills.textContent=p.kills||0;ui.deaths.textContent=p.deaths||0;
    // ---- progression HUD: level, XP bar and unspent stat points -----------
    const level=Math.max(1,Number(p.level)||1);
    const xp=Math.max(0,Number(p.xp)||0);
    const xpToNext=Math.max(1,Number(p.xp_to_next)||1);
    const levelStart=Number.isFinite(p.xp_start)?Number(p.xp_start):Math.max(0,xp-(xp%xpToNext));
    const statPoints=Math.max(0,Number(p.stat_points??p.skill_points??0));
    if(ui.levelBadge)ui.levelBadge.textContent='LV '+level;
    if(ui.xpFill){
      const ratio=Math.max(0,Math.min(1,(xp-levelStart)/xpToNext));
      ui.xpFill.style.width=(ratio*100)+'%';
      ui.xpLabel.textContent=Math.max(0,Math.round(xp-levelStart))+' / '+xpToNext+' XP';
    }
    ui.upgradePoints.textContent='属性点 '+statPoints+' · 每级 +2 点 · Space确认所选升级';
    ui.confirmUpgrade.disabled=statPoints<1;
    document.querySelectorAll('[data-upgrade]').forEach(button=>{
      const key=button.dataset.upgrade;
      const tier=Number(p.upgrades?.[key]||0);
      const badge=button.querySelector('.upgrade-tier');
      if(badge)badge.textContent=tier+'/8';
      button.classList.toggle('maxed',tier>=8);
      const meta=UPGRADE_META[key];
      if(meta)button.title=meta.label+' · '+meta.hint+'（每级 1 点，当前 '+tier+'/'+MAX_UPGRADE_TIER+'）';
    });
    ui.pilotCount.textContent=players.filter(v=>!v.is_bot).length+' / '+roomCapacity;
    ui.mapName.textContent=(maps[map]?.name||map||'MOSSWOOD').split(' ')[0].toUpperCase();
    const w=weapons[p.weapon]||weapons.pulse||{};
    updateWeaponRack(p);
    const switchRemaining=Math.max(0,Number(p.switch_remaining)||0);
    ui.weapon.classList.toggle('switching',switchRemaining>.02);
    ui.weapon.textContent=(w.name||p.weapon||'PULSE NEEDLE').toUpperCase();
    const ammo=p.ammo?.[p.weapon];ui.ammo.textContent=!ammo||ammo.mag<0||ammo.mag>1000?'∞':ammo.mag+' / '+ammo.reserve;
    const reloadRemaining=Math.max(0,Number(ammo?.reload_remaining)||0),reloadDuration=Math.max(.01,Number(w.reload)||.01),noReserve=Boolean(ammo&&ammo.mag===0&&ammo.reserve===0);
    if(ui.reloadStatus&&ui.reloadFill&&ui.reloadLabel){
      const reloading=reloadRemaining>.02;
      ui.reloadStatus.classList.toggle('hidden',!reloading&&!noReserve);ui.reloadStatus.classList.toggle('empty',!reloading&&noReserve);
      ui.reloadFill.style.setProperty('--reload-progress',(reloading?Math.max(0,Math.min(100,(1-reloadRemaining/reloadDuration)*100)):0)+'%');
      ui.reloadLabel.textContent=reloading?'装填 '+reloadRemaining.toFixed(1)+'s':'无备弹';
    }
    const weaponInfo=w.kind==='heal_beam'?'HEAL BEAM / '+(w.damage||0)+' HP · SELF '+(w.self_heal||0):
      (w.kind||'pulse').toUpperCase()+' / '+(w.damage||0)+' DMG'+(w.alternate?(p.alternate_fire?' · ENERGY ORB':' · HOLD Y'):'');
    ui.info.textContent=switchRemaining>.02?'切换中 '+switchRemaining.toFixed(1)+'s · '+weaponInfo:weaponInfo;

    const now=performance.now();ui.dash.style.width=Math.max(0,Math.min(100,100-(dashReadyAt-now)/18))+'%';
    const elapsed=Math.floor((replayMode?replayElapsed:now-startedAt)/1000);
    ui.timer.textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0');
  }
  // ===== Scene art system ==================================================
  // A grounded, Slay.one-inspired terrain pass. The goal is a readable field:
  // desaturated base ground, organic low-frequency texture, a stone embankment
  // boundary, and solid-looking obstacles whose *visible* footprint matches the
  // server collision rectangle. Nothing here changes simulation data.
  const BORDER_WIDTH = 34;
  const SCENE = {
    // Slay.one reads instantly because every material owns one hue family:
    // foliage green, timber orange, masonry blue-grey, water teal. We keep that
    // grammar and push the key much brighter, so the field looks sunny and the
    // pilots (saturated jackets) still pop as the only warm-red accents.
    tidal:{
      seed:1337, void:'#1b2a24',
      base:'#6fbf5d', mid:'#7fce6b', light:'#94dd7c', dark:'#4f9c46',
      path:'#d9bd83', pathLight:'#eed7a4',
      edge:{face:'#d3dce6', top:'#eef4fa', side:'#9caac0', dirt:'#c8a878', line:'#1b2438', moss:'#5aa04f'},
      stone:{top:'#d5dde8', face:'#a9b4c5', side:'#727f94', line:'#1b2438', moss:'#5aa04f', crack:'#8d99ae'},
      leaf:{dark:'#2f7d45', base:'#3f9b55', mid:'#54b169', light:'#7fd38a'},
      water:{deep:'#2a86a9', mid:'#4ab7d5', shallow:'#7fd8ea', foam:'#eafcff', bank:'#e0c48c'},
      wood:{base:'#d9a05f', mid:'#b57a3f', dark:'#7d4f27', light:'#f0c68c'}
    },
    glass:{
      seed:2087, void:'#222a1e',
      base:'#a8cf63', mid:'#b8da72', light:'#d3e88c', dark:'#82a944',
      path:'#efd9a4', pathLight:'#f7e6bd',
      edge:{face:'#dcd8c4', top:'#f4f0de', side:'#a9a48c', dirt:'#c9a86a', line:'#1b2438', moss:'#7fae55'},
      stone:{top:'#e2ddc9', face:'#bdb7a0', side:'#8a846c', line:'#1b2438', moss:'#7fae55', crack:'#a09a82'},
      leaf:{dark:'#4c8b3a', base:'#63a747', mid:'#7cc257', light:'#a8dd7c'},
      water:{deep:'#2a7fa8', mid:'#4fb2d4', shallow:'#8adcec', foam:'#eefcff', bank:'#e8cf9b'},
      wood:{base:'#dda666', mid:'#b87c42', dark:'#7d4f27', light:'#f4cd94'}
    },
    ember:{
      seed:4211, void:'#2a211c',
      base:'#cf9468', mid:'#dda377', light:'#efc196', dark:'#ab7248',
      path:'#f0cfa0', pathLight:'#fae1bc',
      edge:{face:'#d8cdc4', top:'#f2eae2', side:'#a89a8e', dirt:'#c08d5f', line:'#1b2438', moss:'#8a9a52'},
      stone:{top:'#ded4cb', face:'#b7a99c', side:'#84766a', line:'#1b2438', moss:'#8a9a52', crack:'#9c8d80'},
      leaf:{dark:'#b4552f', base:'#cf6b3c', mid:'#e2874e', light:'#f2ad78'},
      water:{deep:'#4a3d8c', mid:'#7a68c4', shallow:'#b3a3ee', foam:'#f2ecff', bank:'#e0b184'},
      wood:{base:'#d59d5e', mid:'#ad7440', dark:'#744a26', light:'#efc48c'}
    }
  };
  function scenePal(){return SCENE[map]||SCENE.tidal}
  function makeRng(seed){
    let s=seed>>>0;
    return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296};
  }
  // Mobile and "low effects" both downgrade texture density instead of
  // resolution, so the field keeps the same silhouette on every device.
  function compactScene(){return displaySettings.lowEffects||window.innerWidth<=760}
  function wrapped(size,draw){
    for(let ox=-size;ox<=size;ox+=size)for(let oy=-size;oy<=size;oy+=size)draw(ox,oy);
  }
  // --- tile ground --------------------------------------------------------
  // One world tile is 32 design px * MAP_SCALE = 100 px. Walls, cover, water
  // and bridges are all authored as whole tiles, so the ground pass works in
  // the same 100px lattice and never fights the obstacle edges.
  const TILE_PX = 100;
  function tileHash(col,row,seed=0){
    let h=(col*73856093)^(row*19349663)^((seed+1)*83492791);
    h=(h^(h>>>13))>>>0;
    return h;
  }
  function drawArenaLip(pal){
    // The one-tile wall ring casts a soft shadow into the arena. Kept as a
    // screen-space gradient so it never draws outside the wall band.
    const B=TILE_PX, depth=70;
    const viewL=cameraX-W/(2*CAMERA_ZOOM), viewR=cameraX+W/(2*CAMERA_ZOOM);
    const viewT=cameraY-H/(2*CAMERA_ZOOM), viewB=cameraY+H/(2*CAMERA_ZOOM);
    const shade=(x0,y0,x1,y1)=>{
      const grad=ctx.createLinearGradient(x0,y0,x1,y1);
      grad.addColorStop(0,'rgba(6,12,8,.5)');
      grad.addColorStop(1,'rgba(6,12,8,0)');
      return grad;
    };
    if(viewT<B+depth){ctx.fillStyle=shade(0,B,0,B+depth);ctx.fillRect(B,B,WORLD_W-B*2,depth)}
    if(viewB>WORLD_H-B-depth){ctx.fillStyle=shade(0,WORLD_H-B,0,WORLD_H-B-depth);ctx.fillRect(B,WORLD_H-B-depth,WORLD_W-B*2,depth)}
    if(viewL<B+depth){ctx.fillStyle=shade(B,0,B+depth,0);ctx.fillRect(B,B,depth,WORLD_H-B*2)}
    if(viewR>WORLD_W-B-depth){ctx.fillStyle=shade(WORLD_W-B,0,WORLD_W-B-depth,0);ctx.fillRect(WORLD_W-B-depth,B,depth,WORLD_H-B*2)}
    // A single light kerb line makes the playable edge crisp.
    ctx.globalAlpha=.35;ctx.strokeStyle=pal.edge.top;ctx.lineWidth=2;
    ctx.strokeRect(B+1,B+1,WORLD_W-B*2-2,WORLD_H-B*2-2);
    ctx.globalAlpha=1;
  }
  function drawGrid(){
    const pal=scenePal(), low=compactScene();
    const viewL=cameraX-W/(2*CAMERA_ZOOM), viewR=cameraX+W/(2*CAMERA_ZOOM);
    const viewT=cameraY-H/(2*CAMERA_ZOOM), viewB=cameraY+H/(2*CAMERA_ZOOM);
    const c0=Math.floor(viewL/TILE_PX), c1=Math.ceil(viewR/TILE_PX);
    const r0=Math.floor(viewT/TILE_PX), r1=Math.ceil(viewB/TILE_PX);
    ctx.fillStyle=pal.base;
    ctx.fillRect(c0*TILE_PX,r0*TILE_PX,(c1-c0)*TILE_PX,(r1-r0)*TILE_PX);
    // One stone slab per grid cell: flat fill, a light top/left bevel, a dark
    // bottom/right seam, then sparse moss. This is the Slay.one floor read.
    // Grass field: no visible grid. Slabs are replaced by soft tonal patches,
    // blade marks and the odd flower, so the ground has texture without ever
    // competing with the pilots for attention.
    // Grass field: no visible grid. Slabs are replaced by soft tonal patches,
    // blade marks and the odd flower, so the ground has texture without ever
    // competing with the pilots for attention.
    for(let row=r0;row<r1;row++)for(let col=c0;col<c1;col++){
      const x=col*TILE_PX, y=row*TILE_PX, h=tileHash(col,row,map.length);
      const roll=h%9;
      // A very quiet checker keeps the 100px lattice readable without lines.
      ctx.globalAlpha=(col+row)%2?.055:.015;
      ctx.fillStyle=(col+row)%2?pal.dark:pal.light;
      ctx.fillRect(x,y,TILE_PX,TILE_PX);
      ctx.globalAlpha=1;
      if(roll<3){
        ctx.globalAlpha=roll===0?.13:.08;
        ctx.fillStyle=roll===1?pal.mid:pal.light;
        ctx.fillRect(x,y,TILE_PX,TILE_PX);
        ctx.globalAlpha=1;
      }
      if(roll===4){
        // A slightly darker clump breaks up large empty fields.
        ctx.globalAlpha=.16;ctx.fillStyle=pal.dark;
        ctx.beginPath();ctx.ellipse(x+28+((h>>>3)%40),y+32+((h>>>7)%36),26+((h>>>5)%14),18+((h>>>9)%10),((h%9)/9)*3,0,Math.PI*2);ctx.fill();
        ctx.globalAlpha=1;
      }
      const blades=low?2:3;
      for(let i=0;i<blades;i++){
        const r=(h>>>(i*7))&2047;
        const px=x+8+((r*37)%(TILE_PX-16)), py=y+20+((r*53)%(TILE_PX-26));
        const len=6+(r%6), lean=((r>>3)%7)-3;
        ctx.strokeStyle=i%2?pal.dark:pal.light;
        ctx.globalAlpha=.42+(r%3)*.10;ctx.lineWidth=2.4;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(px,py);
        ctx.quadraticCurveTo(px+lean*.4,py-len*.62,px+lean,py-len);ctx.stroke();
      }
      // Fine speckle: slay.one's grass reads "textured" mostly because of a
      // dense 2px dot field, not because of big shapes. Keep it low contrast
      // so it never turns into noise under the pilots.
      const dots=low?5:9;
      for(let i=0;i<dots;i++){
        const r=(h>>>(i*5+3))&4095;
        const px=x+4+((r*29)%(TILE_PX-8)), py=y+4+((r*61)%(TILE_PX-8));
        ctx.globalAlpha=.16+(r%4)*.05;
        ctx.fillStyle=i%3===0?pal.light:pal.dark;
        ctx.fillRect(px,py,2,2);
      }
      ctx.globalAlpha=1;
      if(h%13===0){
        // Sparse flowers: one warm dot and one pale dot.
        const fx=x+14+((h>>>4)%(TILE_PX-28)), fy=y+16+((h>>>8)%(TILE_PX-32));
        ctx.globalAlpha=.85;ctx.fillStyle='#fdf6dd';
        ctx.beginPath();ctx.arc(fx,fy,2.1,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#ffd45e';ctx.beginPath();ctx.arc(fx,fy,1,0,Math.PI*2);ctx.fill();
        ctx.globalAlpha=1;
      }
    }
    drawArenaLip(pal);
  }
  function drawWater(){
    const w=scenePal().water, now=performance.now()/1000, low=compactScene();
    for(const [x,y,ww,h] of mapDef().water||[]){
      if(!visibleRect(x,y,ww,h,40))continue;
      const horizontal=ww>=h;
      ctx.save();
      // Square, tile-aligned body: no rounded corners, no off-grid bank ring.
      const grad=horizontal
        ?ctx.createLinearGradient(0,y,0,y+h)
        :ctx.createLinearGradient(x,y,x+ww*.6,y+h);
      grad.addColorStop(0,w.shallow);grad.addColorStop(.3,w.mid);grad.addColorStop(1,w.deep);
      ctx.fillStyle=grad;ctx.fillRect(x,y,ww,h);
      ctx.save();ctx.beginPath();ctx.rect(x,y,ww,h);ctx.clip();
      ctx.strokeStyle=w.mid;ctx.globalAlpha=.4;ctx.lineWidth=3;
      ctx.setLineDash([24,32]);ctx.lineDashOffset=-now*14;
      if(horizontal){
        for(const ly of [h*.32,h*.66]){ctx.beginPath();ctx.moveTo(x,y+ly);ctx.lineTo(x+ww,y+ly);ctx.stroke()}
      }else{
        for(const lx of [ww*.32,ww*.66]){ctx.beginPath();ctx.moveTo(x+lx,y);ctx.lineTo(x+lx,y+h);ctx.stroke()}
      }
      ctx.setLineDash([]);
      ctx.fillStyle=w.foam;
      const sparks=low?3:6;
      for(let i=0;i<sparks;i++){
        const sx=x+((i*173+97)%Math.max(1,ww-24))+12;
        const sy=y+((i*131+61)%Math.max(1,h-24))+12;
        ctx.globalAlpha=.14+.1*Math.sin(now*1.6+i);
        ctx.fillRect(sx,sy,6,2);
      }
      ctx.restore();
      // Foam sits inside the tile edge so the shoreline stays on the grid.
      ctx.globalAlpha=.42;ctx.strokeStyle=w.foam;ctx.lineWidth=3;
      ctx.strokeRect(x+1.5,y+1.5,ww-3,h-3);
      ctx.globalAlpha=1;ctx.strokeStyle=w.deep;ctx.lineWidth=2;
      ctx.strokeRect(x+1,y+1,ww-2,h-2);
      ctx.restore();
    }
  }
  function drawPortals(){
    const now=performance.now()/1000;
    const p=portalFlat();
    const octagon=(radius)=>{
      ctx.beginPath();
      for(let side=0;side<8;side++){
        const angle=Math.PI/8+side*Math.PI/4,px=Math.round(Math.cos(angle)*radius),py=Math.round(Math.sin(angle)*radius);
        if(side===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
      }
      ctx.closePath();
    };
    for(const [index,portal] of (mapDef().portals||[]).entries()){
      const portalRadius=portal.radius||56,radius=Math.max(18,Math.min(22,portalRadius*.34));
      if(!visibleRect(portal.x-radius,portal.y-radius,radius*2,radius*2,40))continue;
      const pulse=.9+Math.sin(now*4.2+index*.9)*.1;
      ctx.save();ctx.translate(Math.round(portal.x),Math.round(portal.y));ctx.imageSmoothingEnabled=false;
      ctx.globalAlpha=.22;octagon(radius*1.7);ctx.fillStyle=FLAT.ink;ctx.fill();
      ctx.globalAlpha=1;octagon(radius*1.55);ctx.fillStyle=p.floorDark;ctx.fill();
      ctx.lineWidth=4;ctx.strokeStyle=p.floor;octagon(radius*1.55);ctx.stroke();
      ctx.fillStyle=p.mid;flatCircle(0,0,radius,p.mid,p.outer,4);
      ctx.fillStyle=p.core;flatCircle(0,0,radius*0.58,p.core,null);
      ctx.fillStyle=FLAT.ink;ctx.font='bold 14px "Courier New",monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(index%2?'B':'A',0,1);
      ctx.globalAlpha=.22;ctx.fillStyle=p.outer;ctx.beginPath();ctx.arc(0,0,radius*1.3*pulse,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
  }
  function drawBridges(){
    const wood=scenePal().wood;
    for(const [x,y,ww,h] of mapDef().bridges||[]){
      if(!visibleRect(x,y,ww,h,40))continue;
      const horizontal=ww>=h;
      ctx.save();
      ctx.fillStyle=wood.base;ctx.fillRect(x,y,ww,h);
      // Planks run across the crossing direction.
      ctx.strokeStyle=wood.dark;ctx.globalAlpha=.45;ctx.lineWidth=2;
      if(horizontal){
        for(let px=x+22;px<x+ww-6;px+=22){ctx.beginPath();ctx.moveTo(px,y+3);ctx.lineTo(px,y+h-3);ctx.stroke()}
      }else{
        for(let py=y+22;py<y+h-6;py+=22){ctx.beginPath();ctx.moveTo(x+3,py);ctx.lineTo(x+ww-3,py);ctx.stroke()}
      }
      ctx.globalAlpha=1;
      // Rails live inside the deck rect, so the walkable strip stays exact.
      if(horizontal){
        ctx.fillStyle=wood.dark;ctx.fillRect(x,y,ww,5);ctx.fillRect(x,y+h-5,ww,5);
        ctx.fillStyle=wood.light;ctx.fillRect(x,y+1,ww,2);ctx.fillRect(x,y+h-3,ww,2);
        for(let post=x+18;post<x+ww-10;post+=36){
          ctx.fillStyle=wood.dark;ctx.fillRect(post,y,4,7);ctx.fillRect(post,y+h-7,4,7);
        }
      }else{
        ctx.fillStyle=wood.dark;ctx.fillRect(x,y,5,h);ctx.fillRect(x+ww-5,y,5,h);
        ctx.fillStyle=wood.light;ctx.fillRect(x+1,y,2,h);ctx.fillRect(x+ww-3,y,2,h);
        for(let post=y+18;post<y+h-10;post+=36){
          ctx.fillStyle=wood.dark;ctx.fillRect(x,post,7,4);ctx.fillRect(x+ww-7,post,7,4);
        }
      }
      ctx.strokeStyle=wood.dark;ctx.lineWidth=2;
      ctx.strokeRect(x+1,y+1,ww-2,h-2);
      ctx.restore();
    }
  }
  // --- organic helpers ----------------------------------------------------
  function blobPath(cx,cy,rx,ry,seed,painter=ctx){
    const points=16;
    painter.beginPath();
    for(let i=0;i<points;i++){
      const angle=(i/points)*Math.PI*2;
      const wobble=1+.055*Math.sin(seed+i*2.3)+.035*Math.cos(seed*1.7+i*1.3);
      const px=cx+Math.cos(angle)*rx*wobble, py=cy+Math.sin(angle)*ry*wobble;
      if(i===0)painter.moveTo(px,py);else painter.lineTo(px,py);
    }
    painter.closePath();
  }
  // Cover is drawn exactly on its tile rectangles: no organic blob, no
  // overhang. The thicket texture comes from clipped blades, so the patch
  // edge always matches the grid (and the concealment rectangle).
  const coverSprites=new Map();
  function coverSprite(x,y,w,h,variant){
    const key=map+'|'+Math.round(x)+'|'+Math.round(y)+'|'+Math.round(w)+'x'+Math.round(h);
    const cached=coverSprites.get(key);if(cached)return cached;
    const lf=scenePal().leaf;
    const ratio=Math.max(1,Math.min(2,window.devicePixelRatio||1));
    const sprite=document.createElement('canvas');
    sprite.width=Math.max(1,Math.round(w*ratio));sprite.height=Math.max(1,Math.round(h*ratio));
    const g=sprite.getContext('2d');g.scale(ratio,ratio);g.imageSmoothingEnabled=false;
    const rng=makeRng(tileHash(Math.round(x/TILE_PX),Math.round(y/TILE_PX),variant));
    // Bush body: a soft rounded mass, then leaf clusters that spill past it so
    // the silhouette reads as vegetation rather than a painted rectangle.
    g.fillStyle=lf.base;
    g.beginPath();
    if(g.roundRect)g.roundRect(2,2,w-4,h-4,Math.min(18,Math.min(w,h)*.22));else g.rect(2,2,w-4,h-4);
    g.fill();
    const cols=Math.max(1,Math.round(w/TILE_PX)), rows=Math.max(1,Math.round(h/TILE_PX));
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const cx=(col+.5)*(w/cols), cy=(row+.5)*(h/rows);
      const radius=Math.min(w/cols,h/rows)*.3;
      for(let i=0;i<5;i++){
        const angle=rng()*Math.PI*2, dist=radius*(.25+rng()*.65);
        const rx=radius*(.55+rng()*.5), ry=rx*(.7+rng()*.35);
        g.fillStyle=rng()<.45?lf.mid:lf.dark;
        g.beginPath();
        g.ellipse(cx+Math.cos(angle)*dist,cy+Math.sin(angle)*dist*.82,rx,ry,rng(),0,Math.PI*2);
        g.fill();
      }
      g.globalAlpha=.95;g.fillStyle=lf.light;
      g.beginPath();g.ellipse(cx-radius*.08,cy-radius*.12,radius*.52,radius*.4,0,0,Math.PI*2);g.fill();
      g.globalAlpha=.55;g.fillStyle='#ffffff';
      g.beginPath();g.ellipse(cx-radius*.22,cy-radius*.3,radius*.24,radius*.14,-.5,0,Math.PI*2);g.fill();
      g.globalAlpha=1;
    }
    // Pixel dabs: the leaf-noise that gives Slay.one bushes their texture.
    const dabs=Math.round(w*h/170);
    for(let i=0;i<dabs;i++){
      const px=Math.floor(rng()*w), py=Math.floor(rng()*h), size=rng()<.5?2:3;
      const roll=rng();
      g.fillStyle=roll<.16?lf.light:(roll<.5?lf.mid:lf.base);
      g.globalAlpha=.55+rng()*.4;
      g.fillRect(px,py,size,size);
    }
    g.globalAlpha=1;
    // A few taller blades poke above the mass, kept short and chunky.
    g.lineCap='butt';
    for(let i=0;i<Math.round(w*h/2600);i++){
      const px=rng()*w, py=4+rng()*(h-8), len=5+rng()*5;
      g.strokeStyle=rng()<.4?lf.light:lf.mid;g.globalAlpha=.8;g.lineWidth=2;
      g.beginPath();g.moveTo(px,py);g.lineTo(px+(rng()-.5)*3,py-len);g.stroke();
    }
    g.globalAlpha=1;
    // Rim: a slightly darker leaf tone keeps the concealment block legible
    // without turning it back into a hard rectangle.
    g.strokeStyle='rgba(24,42,30,.55)';g.lineWidth=3;
    g.beginPath();
    if(g.roundRect)g.roundRect(3,3,w-6,h-6,Math.min(18,Math.min(w,h)*.22));else g.rect(3,3,w-6,h-6);
    g.stroke();
    coverSprites.set(key,sprite);
    return sprite;
  }
  function drawGrassPatch(x,y,w,h,variant=0){
    const sprite=coverSprite(x,y,w,h,variant);
    ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.drawImage(sprite,x,y,w,h);
    ctx.restore();
  }
  function drawCover(){
    for(const [index,[x,y,w,h]] of (mapDef().cover||[]).entries()){
      if(!visibleRect(x,y,w,h))continue;
      drawGrassPatch(x,y,w,h,index);
    }
  }
  // --- props --------------------------------------------------------------
  function propShadow(half,alpha=.32){
    ctx.globalAlpha=alpha;ctx.fillStyle='rgba(7,14,8,1)';
    ctx.beginPath();ctx.ellipse(3,half*.55,half*.82,half*.26,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;
  }
  function drawProps(){
    const lf=scenePal().leaf, pal=scenePal();
    const now=performance.now()/1000;
    for(const prop of mapDef().props||[]){
      const size=prop.size||24;
      if(!visibleRect(prop.x-size/2,prop.y-size/2,size,size))continue;
      const visualSize=prop.kind==='tree'?size*.68:prop.kind==='stump'?size*.9:size;
      const half=visualSize/2;
      ctx.save();ctx.translate(Math.round(prop.x),Math.round(prop.y));ctx.imageSmoothingEnabled=false;
      if(prop.kind==='torch'){
        const flicker=1+Math.sin(now*7.5+prop.x)*.12;
        propShadow(half*.7,.22);
        ctx.fillStyle=pal.wood.dark;flatRoundRect(-3,-half*.18,6,half*.72,2,pal.wood.dark,pal.edge.line,2);
        ctx.fillStyle=pal.wood.base;flatRoundRect(-5,-half*.28,10,5,2,pal.wood.base,null);
        const glow=ctx.createRadialGradient(0,-half*.52,1,0,-half*.52,half*1.15);
        glow.addColorStop(0,'rgba(255,206,110,'+(.3*flicker)+')');
        glow.addColorStop(.5,'rgba(255,178,80,'+(.11*flicker)+')');
        glow.addColorStop(1,'rgba(255,178,80,0)');
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,-half*.52,half*1.15,0,Math.PI*2);ctx.fill();
        flatTri(-5,-half*.52,10,13,'up','#e96736',pal.edge.line,2);
        flatTri(-3,-half*.64,6,8,'up','#ffe59a',null);
      }else if(prop.kind==='spikes'){
        propShadow(half*.7,.26);
        ctx.fillStyle=pal.stone.line;flatRoundRect(-half*.74,half*.3,half*1.48,6,2,pal.stone.line,pal.edge.line,2);
        for(let spike=-2;spike<=2;spike++){
          const sx=spike*half*.32;
          flatTri(sx-5,half*.3,10,half*.5+(Math.abs(spike)%2)*2,'up',pal.stone.side,pal.edge.line,2);
          ctx.fillStyle='rgba(255,255,255,.16)';ctx.fillRect(sx-1,half*.42,2,half*.16);
        }
      }else if(prop.kind==='banner'){
        propShadow(half*.5,.22);
        ctx.fillStyle=pal.wood.dark;ctx.fillRect(-2,-half*.8,4,half*1.5);
        const cloth=map==='ember'?'#a5523d':map==='glass'?'#a08a42':'#3f8064';
        const wave=Math.sin(now*3+prop.x)*2;
        ctx.beginPath();ctx.moveTo(1,-half*.72);ctx.quadraticCurveTo(half*.5,-half*.74+wave,half*.78,-half*.6);
        ctx.lineTo(half*.78,-half*.3);ctx.quadraticCurveTo(half*.5,-half*.26+wave,1,-half*.28);ctx.closePath();
        ctx.fillStyle=cloth;ctx.fill();ctx.strokeStyle=pal.edge.line;ctx.lineWidth=2;ctx.stroke();
        ctx.fillStyle='rgba(255,247,205,.55)';ctx.fillRect(4,-half*.6,3,3);
      }else if(prop.kind==='tree'){
        propShadow(half,.34);
        ctx.fillStyle=pal.wood.dark;flatRoundRect(-half*.18,half*.04,half*.36,half*.76,4,pal.wood.dark,pal.edge.line,2);
        ctx.fillStyle=pal.wood.base;flatRoundRect(-half*.12,half*.1,half*.2,half*.5,3,pal.wood.base,null);
        // Roots make the trunk sit on the ground instead of floating.
        ctx.fillStyle=pal.wood.dark;ctx.fillRect(-half*.34,half*.74,half*.2,4);ctx.fillRect(half*.16,half*.74,half*.2,4);
        ctx.save();ctx.translate(0,-half*.22);
        const R=half*.78;
        // Rim -> body -> lobes -> two asymmetric light dabs. The old symmetric
        // pair of highlights read as a face at gameplay distance.
        ctx.fillStyle=lf.dark;flatCircle(0,0,R,lf.dark,pal.edge.line,2.5);
        ctx.fillStyle=lf.base;flatCircle(-half*.05,-half*.05,R*.86,lf.base,null);
        ctx.fillStyle=lf.mid;flatCircle(-half*.16,-half*.14,R*.58,lf.mid,null);
        ctx.fillStyle=lf.mid;flatCircle(half*.3,-half*.02,R*.34,lf.mid,null);
        // One elongated highlight instead of two round dabs: two dots read
        // as a face on small trees.
        ctx.fillStyle=lf.light;ctx.beginPath();ctx.ellipse(-half*.2,-half*.28,R*.36,R*.2,-.5,0,Math.PI*2);ctx.fill();
        ctx.globalAlpha=.3;ctx.fillStyle=lf.dark;
        flatCircle(half*.42,half*.2,R*.2,lf.dark,null);flatCircle(-half*.44,half*.16,R*.16,lf.dark,null);
        ctx.globalAlpha=1;ctx.restore();
      }else if(prop.kind==='bush'){
        propShadow(half*.9,.28);
        ctx.fillStyle=lf.dark;flatCircle(-half*.3,half*.06,half*.54,lf.dark,pal.edge.line,2);
        ctx.fillStyle=lf.base;flatCircle(half*.3,half*.02,half*.56,lf.base,pal.edge.line,2);
        ctx.fillStyle=lf.mid;flatCircle(0,half*.08,half*.46,lf.mid,null);
        ctx.fillStyle=lf.light;ctx.beginPath();ctx.ellipse(-half*.12,-half*.24,half*.28,half*.16,-.5,0,Math.PI*2);ctx.fill();
      }else if(prop.kind==='reed'){
        propShadow(half*.7,.18);
        for(let reed=-3;reed<=3;reed++){
          const lean=((reed*7+Math.round(prop.x))%7)-3+Math.sin(now*1.8+reed)*2;
          ctx.strokeStyle=reed%2?lf.mid:lf.base;ctx.lineWidth=3;ctx.lineCap='round';
          ctx.beginPath();ctx.moveTo(reed*5,half*.5);
          ctx.quadraticCurveTo(reed*5+lean*.4,-half*.2,reed*5+lean,-half*.78);ctx.stroke();
        }
        ctx.fillStyle=lf.light;ctx.fillRect(-half*.5,-half*.8,3,3);ctx.fillRect(half*.28,-half*.64,3,3);
      }else if(prop.kind==='stump'){
        propShadow(half*.9,.3);
        ctx.fillStyle=pal.wood.dark;flatRoundRect(-half*.5,-half*.38,half,half*.92,7,pal.wood.dark,pal.edge.line,2);
        ctx.fillStyle=pal.wood.base;ctx.beginPath();ctx.ellipse(0,-half*.3,half*.5,half*.24,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=pal.wood.light;ctx.beginPath();ctx.ellipse(0,-half*.3,half*.3,half*.14,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=pal.wood.mid;ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,-half*.3,half*.4,half*.19,0,0,Math.PI*2);ctx.stroke();
      }else if(prop.kind==='barrel'){
        propShadow(half*.8,.3);
        ctx.fillStyle=pal.wood.dark;flatRoundRect(-half*.5,-half*.5,half,half*1.02,8,pal.wood.dark,pal.edge.line,2);
        ctx.fillStyle='#b0692f';flatRoundRect(-half*.4,-half*.42,half*.8,half*.86,6,'#b0692f',null);
        ctx.fillStyle='#8d4f22';flatRoundRect(-half*.4,-half*.28,half*.8,5,2,'#8d4f22',null);
        ctx.fillStyle='#8d4f22';flatRoundRect(-half*.4,half*.2,half*.8,5,2,'#8d4f22',null);
        ctx.fillStyle='#2b1c10';flatRoundRect(-half*.42,-half*.04,half*.84,3,1,'#2b1c10',null);
        ctx.fillStyle='rgba(255,231,190,.18)';flatRoundRect(-half*.3,-half*.38,half*.2,half*.6,3,'rgba(255,231,190,.18)',null);
      }else if(prop.kind==='crate'){
        propShadow(half*.95,.3);
        ctx.fillStyle='#5a3a1b';flatRoundRect(-half*.68,-half*.64,half*1.36,half*1.3,5,'#5a3a1b',pal.edge.line,2);
        ctx.fillStyle='#b8804a';flatRoundRect(-half*.56,-half*.52,half*1.12,half*1.06,4,'#b8804a',null);
        ctx.strokeStyle='#5a3a1b';ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(-half*.4,-half*.38);ctx.lineTo(half*.4,half*.38);ctx.moveTo(half*.4,-half*.38);ctx.lineTo(-half*.4,half*.38);ctx.stroke();
        ctx.fillStyle='rgba(255,226,180,.3)';ctx.fillRect(-half*.4,-half*.42,half*.24,half*.14);
      }else if(prop.kind==='pillar'){
        propShadow(half*.7,.32);
        ctx.fillStyle=pal.stone.side;flatRoundRect(-half*.5,-half*.6,half,half*1.24,5,pal.stone.side,pal.edge.line,2);
        ctx.fillStyle=pal.stone.face;flatRoundRect(-half*.34,-half*.52,half*.68,half*1.02,4,pal.stone.face,null);
        ctx.fillStyle='rgba(255,255,255,.16)';flatRoundRect(-half*.24,-half*.48,half*.14,half*.9,3,'rgba(255,255,255,.16)',null);
        ctx.fillStyle=pal.stone.top;flatRoundRect(-half*.54,-half*.68,half*1.08,7,3,pal.stone.top,pal.edge.line,1.5);
        ctx.fillStyle=pal.stone.side;flatRoundRect(-half*.54,half*.5,half*1.08,7,3,pal.stone.side,pal.edge.line,1.5);
      }else{
        // Faceted boulder: the default stone prop.
        propShadow(half*.95,.3);
        ctx.fillStyle=pal.stone.side;flatCircle(0,half*.14,half*.62,pal.stone.side,pal.edge.line,2);
        ctx.fillStyle=pal.stone.face;flatCircle(-half*.1,half*.02,half*.44,pal.stone.face,null);
        ctx.fillStyle=pal.stone.top;flatCircle(-half*.18,-half*.12,half*.24,pal.stone.top,null);
        ctx.fillStyle='rgba(255,255,255,.16)';ctx.beginPath();ctx.ellipse(-half*.2,-half*.14,half*.14,half*.08,-.5,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }
  }
  // --- obstacles: a compact Slay.one-style kit ----------------------------
  // Seven readable types share one construction rule: the collision rect is
  // the visible footprint, depth comes from a single side face plus a hard
  // offset shadow, and every outline stays in the same dark ink.
  const OBSTACLE_KINDS = new Set(['block','slab','column','pillar','crate','barrel','rubble']);
  function inferObstacleKind(w,h,index){
    if(Math.min(w,h)<80)return 'rubble';
    if(index%9===4&&Math.min(w,h)>=90)return 'crate';
    return 'block';
  }
  function obstacleShadow(x,y,w,h,r){
    ctx.globalAlpha=.17;ctx.fillStyle='rgba(5,11,7,1)';
    flatRoundRect(x+9,y+15,w-9,h-8,r,'rgba(5,11,7,1)',null);
    ctx.globalAlpha=.38;
    flatRoundRect(x+3,y+6,w-4,h-3,r,'rgba(5,11,7,1)',null);
    ctx.globalAlpha=1;
  }
  function concreteBody(x,y,w,h,r,stone,side){
    flatRoundRect(x,y+side*.55,w,h,r,stone.side,null);
    flatRoundRect(x,y,w,h-side,r,stone.face,null);
    ctx.strokeStyle='rgba(255,255,255,.24)';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(x+r,y+2);ctx.lineTo(x+w-r,y+2);ctx.stroke();
    ctx.fillStyle='rgba(0,0,0,.2)';flatRoundRect(x+2,y+h-5,w-4,5,2,'rgba(0,0,0,.2)',null);
  }
  function concreteGrain(x,y,w,h,seed){
    const rng=makeRng(seed), stone=scenePal().stone;
    ctx.fillStyle=stone.crack;
    const count=Math.max(2,Math.round(w*h/9000));
    for(let i=0;i<count;i++){
      const px=x+6+rng()*(Math.max(4,w-12)), py=y+6+rng()*(Math.max(4,h-14));
      ctx.globalAlpha=.24+rng()*.2;ctx.fillRect(px,py,2+rng()*3,1.5);
    }
    ctx.globalAlpha=1;
  }
  // Stone masonry face: 100px modules anchored to the world grid, so seams
  // continue across neighbouring blocks. Each module gets its own bevel, a
  // dark mortar gap, one course line and seeded wear.
  function stoneModules(x,y,w,h,stone,seedBase){
    // Staggered brickwork on a world-anchored grid: rows and joints continue
    // across neighbouring blocks, so a long wall reads as one built structure.
    const rowH=33, brickW=50;
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
    ctx.fillStyle='#2f342f';ctx.fillRect(x,y,w,h);
    const firstRow=Math.floor(y/rowH), lastRow=Math.ceil((y+h)/rowH);
    for(let row=firstRow;row<lastRow;row++){
      const by=row*rowH, offset=(row%2)?-brickW/2:0;
      const firstCol=Math.floor((x-offset)/brickW), lastCol=Math.ceil((x+w-offset)/brickW);
      for(let col=firstCol;col<lastCol;col++){
        const bx=col*brickW+offset;
        const a=Math.max(bx+2,x), b=Math.max(by+2,y);
        const c=Math.min(bx+brickW-2,x+w), d=Math.min(by+rowH-2,y+h);
        if(c<=a||d<=b)continue;
        const rng=makeRng(tileHash(col,row,seedBase));
        const tone=rng();
        ctx.fillStyle=tone<.5?stone.face:(tone<.9?stone.top:stone.side);
        ctx.globalAlpha=.92;
        ctx.fillRect(a,b,c-a,d-b);
        ctx.globalAlpha=1;
        // brick bevel
        ctx.fillStyle='rgba(255,255,255,.1)';ctx.fillRect(a,b,c-a,2);
        ctx.fillStyle='rgba(5,9,7,.22)';ctx.fillRect(a,d-2,c-a,2);
        // worn brick / missing corner
        if(rng()<.14){
          ctx.globalAlpha=.5;ctx.fillStyle=stone.crack;
          ctx.fillRect(a+4+((c-a)*.3|0),b+4,4,3);ctx.globalAlpha=1;
        }
        if(rng()<.06){
          ctx.fillStyle='#262b26';ctx.fillRect(a,b,Math.min(14,c-a),Math.min(10,d-b));
        }
      }
    }
    ctx.restore();
  }
  function drawObstacleBlock(x,y,w,h,index){
    const pal=scenePal(), stone=pal.stone;
    const r=Math.min(8,Math.min(w,h)*.12), side=Math.max(14,Math.min(22,h*.2));
    const rng=makeRng(Math.round(x*7+y*13+index*17));
    obstacleShadow(x,y,w,h,r);
    // Front face (thickness) with vertical tool marks.
    ctx.fillStyle=stone.side;flatRoundRect(x,y+side*.6,w,h,r,stone.side,null);
    ctx.save();ctx.beginPath();ctx.rect(x,y+h-side,w,side);ctx.clip();
    ctx.strokeStyle='rgba(0,0,0,.2)';ctx.lineWidth=2;
    for(let rx=x+16;rx<x+w;rx+=26){
      ctx.beginPath();ctx.moveTo(rx,y+h-side);ctx.lineTo(rx,y+h);ctx.stroke();
    }
    ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(x,y+h-3,w,3);
    ctx.restore();
    // Slab face.
    stoneModules(x,y,w,h-side,stone,index);
    // Whole-block bevel and contact shade.
    ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(x+3,y+3,w-6,2);
    ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(x+2,y+h-6,w-4,4);
    // Chipped top-right corner.
    if(w>90&&h>90){
      const chip=8+rng()*7;
      ctx.globalAlpha=.5;ctx.fillStyle=stone.side;
      ctx.beginPath();ctx.moveTo(x+w-4,y+4);ctx.lineTo(x+w-4,y+chip);ctx.lineTo(x+w-chip,y+4);ctx.closePath();ctx.fill();
      ctx.globalAlpha=1;
    }
    // Moss creeping along the base on the green maps.
    if(map!=='ember'){
      ctx.globalAlpha=.55;ctx.fillStyle=stone.moss;
      const patches=2+Math.round(rng()*3);
      for(let i=0;i<patches;i++){
        const mx=x+14+rng()*(Math.max(8,w-28)), my=y+h-side-8+rng()*7;
        ctx.fillRect(mx,my,7+rng()*6,3);
        ctx.fillRect(mx+3,my-3,3,3);
      }
      ctx.globalAlpha=1;
    }
    flatRoundRect(x,y,w,h,r,null,stone.line,4);
  }
  function drawObstacleSlab(x,y,w,h,index){
    const stone=scenePal().stone;
    const r=4, side=Math.max(6,Math.min(10,h*.34));
    obstacleShadow(x,y,w,h,r);
    concreteBody(x,y,w,h,r,stone,side);
    concreteGrain(x,y,w,h-side,index+5);
    ctx.strokeStyle=stone.crack;ctx.globalAlpha=.42;ctx.lineWidth=2;
    for(let sx=x+96;sx<x+w-30;sx+=96){
      ctx.beginPath();ctx.moveTo(sx,y+4);ctx.lineTo(sx,y+h-side-2);ctx.stroke();
    }
    ctx.globalAlpha=.28;ctx.fillStyle='#e9e6d8';
    for(let i=0;i<Math.round(w/90);i++)ctx.fillRect(x+18+i*86,y+6,10,2);
    // End caps give the run a built edge instead of a floating strip.
    ctx.globalAlpha=.5;ctx.fillStyle=stone.side;
    ctx.fillRect(x+2,y+2,6,h-side-4);ctx.fillRect(x+w-8,y+2,6,h-side-4);
    ctx.globalAlpha=1;
    flatRoundRect(x,y,w,h,r,null,stone.line,3);
  }
  function drawObstacleColumn(x,y,w,h,index){
    const stone=scenePal().stone;
    const r=4, side=Math.max(6,Math.min(10,w*.3));
    obstacleShadow(x,y,w,h,r);
    concreteBody(x,y,w,h,r,stone,side);
    ctx.strokeStyle=stone.crack;ctx.globalAlpha=.4;ctx.lineWidth=2;
    for(let k=1;k<=2;k++){
      const sy=y+h*k/3;
      ctx.beginPath();ctx.moveTo(x+4,sy);ctx.lineTo(x+w-4,sy);ctx.stroke();
    }
    ctx.globalAlpha=1;
    concreteGrain(x,y,w,h-side,index+9);
    flatRoundRect(x,y,w,h,r,null,stone.line,3);
  }
  function drawObstaclePillar(x,y,w,h,index){
    const stone=scenePal().stone;
    obstacleShadow(x,y,w,h,3);
    // Plinth, brick shaft, cap: same masonry language as the long walls.
    flatRoundRect(x-2,y+h-11,w+4,13,2,stone.side,stone.line,2.5);
    ctx.fillStyle='rgba(0,0,0,.22)';ctx.fillRect(x+1,y+h-10,w-2,3);
    stoneModules(x+4,y+9,w-8,h-22,stone,index+3);
    ctx.fillStyle='rgba(255,255,255,.16)';ctx.fillRect(x+4,y+9,w-8,2);
    flatRoundRect(x-1,y-2,w+2,10,2,stone.top,stone.line,2.5);
    ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(x+1,y+7,w-2,2);
    ctx.strokeStyle=stone.line;ctx.lineWidth=2.5;
    ctx.strokeRect(x+4,y+9,w-8,h-22);
  }
  function crateCell(x,y,size,seed){
    const side=Math.max(4,Math.min(7,size*.14));
    ctx.globalAlpha=.3;ctx.fillStyle='rgba(5,11,7,1)';
    flatRoundRect(x+3,y+5,size-3,size-3,3,'rgba(5,11,7,1)',null);ctx.globalAlpha=1;
    flatRoundRect(x,y+side,size,size-side,3,'#4a2f16',null);
    flatRoundRect(x,y,size,size-side-1,3,'#b9814a',null);
    ctx.strokeStyle='#7c4a22';ctx.lineWidth=2;
    const planks=Math.max(2,Math.round(size/22));
    for(let i=1;i<planks;i++){
      const px=x+size*i/planks;
      ctx.beginPath();ctx.moveTo(px,y+2);ctx.lineTo(px,y+size-side-2);ctx.stroke();
    }
    ctx.strokeStyle='#6b3f1c';ctx.lineWidth=Math.max(3,size*.09);ctx.globalAlpha=.65;
    ctx.beginPath();ctx.moveTo(x+4,y+5);ctx.lineTo(x+size-4,y+size-side-5);
    ctx.moveTo(x+size-4,y+5);ctx.lineTo(x+4,y+size-side-5);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle='#3a3327';
    const c=Math.max(4,size*.2);
    ctx.fillRect(x,y,c,2);ctx.fillRect(x,y,2,c);
    ctx.fillRect(x+size-c,y,c,2);ctx.fillRect(x+size-2,y,2,c);
    ctx.fillStyle='rgba(255,230,186,.22)';ctx.fillRect(x+3,y+2,Math.max(4,size*.2),2);
    flatRoundRect(x,y,size,size,3,null,'#2a1a0c',2.5);
  }
  function drawObstacleCrate(x,y,w,h,index){
    // A stack of small crates fills the collision rect; one giant box read
    // out of scale next to a pilot.
    const gap=5, cols=w>h*1.45?3:2, rows=h>w*1.45?3:2;
    const cw=(w-gap*(cols-1))/cols, ch=(h-gap*(rows-1))/rows;
    const size=Math.min(cw,ch);
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const ox=x+col*(cw+gap)+(cw-size)/2, oy=y+row*(ch+gap)+(ch-size)/2;
      crateCell(ox,oy,size,index*31+row*7+col*13);
    }
  }
  function barrelAt(cx,cy,r,index){
    ctx.globalAlpha=.3;ctx.fillStyle='rgba(5,11,7,1)';
    ctx.beginPath();ctx.ellipse(cx+3,cy+r*.66,r*.92,r*.34,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    ctx.fillStyle='#8f4a22';flatCircle(cx,cy+1,r,'#8f4a22','#2a160b',2.5);
    ctx.fillStyle='#b0652f';flatCircle(cx,cy,r*.94,'#b0652f',null);
    ctx.strokeStyle='#5e3316';ctx.lineWidth=2.5;
    for(const t of [-.4,.04,.42]){
      ctx.beginPath();ctx.ellipse(cx,cy+r*t,r*.94,r*.26,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.fillStyle='#c47a3f';ctx.beginPath();ctx.ellipse(cx,cy-r*.34,r*.68,r*.28,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#5e3316';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#8f4a22';ctx.beginPath();ctx.ellipse(cx,cy-r*.34,r*.2,r*.07,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(255,220,170,.3)';ctx.lineWidth=2.5;
    ctx.beginPath();ctx.arc(cx,cy,r*.75,Math.PI*1.06,Math.PI*1.5);ctx.stroke();
  }
  function drawObstacleBarrel(x,y,w,h,index){
    // Two or three drums inside the footprint keeps the barrel readable at
    // pilot scale instead of a single oversized tank.
    const r=Math.min(w,h)*(w>h*1.35?0.22:0.24);
    if(w>h*1.35){
      barrelAt(x+w*.28,y+h*.5,r,index);
      barrelAt(x+w*.72,y+h*.5,r,index+1);
    }else if(h>w*1.35){
      barrelAt(x+w*.5,y+h*.28,r,index);
      barrelAt(x+w*.5,y+h*.72,r,index+1);
    }else if(w>=200&&h>=200){
      barrelAt(x+w*.32,y+h*.34,r,index);
      barrelAt(x+w*.68,y+h*.34,r,index+1);
      barrelAt(x+w*.5,y+h*.72,r,index+2);
    }else{
      barrelAt(x+w*.33,y+h*.52,r,index);
      barrelAt(x+w*.68,y+h*.52,r,index+1);
    }
  }
  function drawObstacleTree(x,y,w,h,index){
    // A tree fills its tile; the canopy overhangs slightly but the collision
    // square is the tile itself, so the trunk sits dead centre.
    const pal=scenePal(), lf=pal.leaf;
    const cx=x+w/2, cy=y+h/2, R=Math.min(w,h)*.46;
    const rng=makeRng(Math.round(x*3+y*11+index*7));
    ctx.save();
    ctx.globalAlpha=.32;ctx.fillStyle='rgba(5,11,7,1)';
    ctx.beginPath();ctx.ellipse(cx+5,cy+R*.72,R*.82,R*.3,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    // trunk
    ctx.fillStyle=pal.wood.dark;
    flatRoundRect(cx-R*.14,cy+R*.1,R*.28,R*.72,3,pal.wood.dark,pal.edge.line,2);
    ctx.fillStyle=pal.wood.base;
    flatRoundRect(cx-R*.09,cy+R*.16,R*.16,R*.5,2,pal.wood.base,null);
    // canopy: three offset lobes + one light sweep
    ctx.fillStyle=lf.dark;flatCircle(cx,cy-R*.05,R,lf.dark,pal.edge.line,2.5);
    ctx.fillStyle=lf.base;flatCircle(cx-R*.06,cy-R*.08,R*.86,lf.base,null);
    ctx.fillStyle=lf.mid;flatCircle(cx-R*.2,cy-R*.16,R*.54,lf.mid,null);
    ctx.fillStyle=lf.mid;flatCircle(cx+R*.26,cy-R*.04,R*.34,lf.mid,null);
    ctx.fillStyle=lf.light;
    ctx.beginPath();ctx.ellipse(cx-R*.24,cy-R*.3,R*.34,R*.18,-.5,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=.3;ctx.fillStyle=lf.dark;
    flatCircle(cx+R*.42,cy+R*.22,R*.2,lf.dark,null);
    flatCircle(cx-R*.44,cy+R*.16,R*.16,lf.dark,null);
    ctx.globalAlpha=1;
    ctx.restore();
  }
  function drawObstacleTree(x,y,w,h,index){
    // A tree fills its tile; the canopy overhangs slightly but the collision
    // square is the tile itself, so the trunk sits dead centre.
    const pal=scenePal(), lf=pal.leaf;
    const cx=x+w/2, cy=y+h/2, R=Math.min(w,h)*.46;
    const rng=makeRng(Math.round(x*3+y*11+index*7));
    ctx.save();
    ctx.globalAlpha=.32;ctx.fillStyle='rgba(5,11,7,1)';
    ctx.beginPath();ctx.ellipse(cx+5,cy+R*.72,R*.82,R*.3,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    // trunk
    ctx.fillStyle=pal.wood.dark;
    flatRoundRect(cx-R*.14,cy+R*.1,R*.28,R*.72,3,pal.wood.dark,pal.edge.line,2);
    ctx.fillStyle=pal.wood.base;
    flatRoundRect(cx-R*.09,cy+R*.16,R*.16,R*.5,2,pal.wood.base,null);
    // canopy: three offset lobes + one light sweep
    ctx.fillStyle=lf.dark;flatCircle(cx,cy-R*.05,R,lf.dark,pal.edge.line,2.5);
    ctx.fillStyle=lf.base;flatCircle(cx-R*.06,cy-R*.08,R*.86,lf.base,null);
    ctx.fillStyle=lf.mid;flatCircle(cx-R*.2,cy-R*.16,R*.54,lf.mid,null);
    ctx.fillStyle=lf.mid;flatCircle(cx+R*.26,cy-R*.04,R*.34,lf.mid,null);
    ctx.fillStyle=lf.light;
    ctx.beginPath();ctx.ellipse(cx-R*.24,cy-R*.3,R*.34,R*.18,-.5,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=.3;ctx.fillStyle=lf.dark;
    flatCircle(cx+R*.42,cy+R*.22,R*.2,lf.dark,null);
    flatCircle(cx-R*.44,cy+R*.16,R*.16,lf.dark,null);
    ctx.globalAlpha=1;
    ctx.restore();
  }
  function drawRubble(x,y,w,h,index){
    // Broken stones: low, irregular and still fully blocking. Each rock has
    // its own contact shadow; a single slab shadow read as a hole.
    const pal=scenePal(), stone=pal.stone;
    const rng=makeRng(Math.round(x*3+y*7+index*23));
    const cx=x+w/2, cy=y+h/2, base=Math.min(w,h);
    ctx.save();
    ctx.globalAlpha=.22;blobPath(cx,cy+3,w*.42,h*.34,index);ctx.fillStyle='rgba(5,11,7,1)';ctx.fill();
    ctx.globalAlpha=1;
    const cols=Math.max(2,Math.round(w/(base*1.1))), rows=Math.max(1,Math.round(h/(base*1.1)));
    let rock=0;
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const px=x+w*(col+.5)/cols+(rng()-.5)*base*.18;
      const py=y+h*(row+.5)/rows+(rng()-.5)*base*.16;
      const rx=base*(.22+rng()*.1), ry=rx*(.7+rng()*.16);
      rock++;
      ctx.globalAlpha=.38;ctx.fillStyle='rgba(5,11,7,1)';
      ctx.beginPath();ctx.ellipse(px+2,py+ry*.58,rx*.98,ry*.52,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
      ctx.fillStyle=stone.side;blobPath(px,py,rx,ry,rock*7+index,ctx);ctx.fill();
      ctx.fillStyle=stone.face;blobPath(px-rx*.08,py-ry*.1,rx*.82,ry*.74,rock*7+index+2,ctx);ctx.fill();
      ctx.fillStyle=stone.top;
      ctx.beginPath();ctx.ellipse(px-rx*.22,py-ry*.3,rx*.36,ry*.23,-.4,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=stone.line;ctx.lineWidth=2.2;blobPath(px,py,rx,ry,rock*7+index,ctx);ctx.stroke();
    }
    ctx.restore();
  }
  function drawObstacles(){
    for(const [index,obstacle] of (mapDef().obstacles||[]).entries()){
      const x=obstacle[0], y=obstacle[1], w=obstacle[2], h=obstacle[3];
      if(!visibleRect(x,y,w,h))continue;
      const kind=OBSTACLE_KINDS.has(obstacle[4])?obstacle[4]:inferObstacleKind(w,h,index);
      if(kind==='rubble')drawRubble(x,y,w,h,index);
      else if(kind==='tree')drawObstacleTree(x,y,w,h,index);
      else if(kind==='tree')drawObstacleTree(x,y,w,h,index);
      else if(kind==='crate')drawObstacleCrate(x,y,w,h,index);
      else if(kind==='barrel')drawObstacleBarrel(x,y,w,h,index);
      else if(kind==='pillar')drawObstaclePillar(x,y,w,h,index);
      else if(kind==='column')drawObstacleColumn(x,y,w,h,index);
      else if(kind==='slab')drawObstacleSlab(x,y,w,h,index);
      else drawObstacleBlock(x,y,w,h,index);
    }
  }
  function drawPickupSpawns(){
    const me=localPlayer();
    for(const marker of pickupSpawns){
      if(!visibleRect(marker.x-20,marker.y-20,40,40))continue;
      ctx.save();ctx.translate(Math.round(marker.x),Math.round(marker.y));ctx.imageSmoothingEnabled=false;
      const color=weapons[marker.weapon]?.color||'#d5bd68';
      const pulse=.72+Math.sin(performance.now()/260+marker.id)*.16;
      // Pulse ring.
      ctx.globalAlpha=marker.available?pulse:.32;ctx.strokeStyle=color;ctx.lineWidth=1;ctx.setLineDash([3,3]);
      ctx.strokeRect(-17,-14,34,28);ctx.setLineDash([]);
      if(!marker.available){const progress=1-Math.max(0,Math.min(1,(marker.respawn_in||0)/PICKUP_RESPAWN_SECONDS));ctx.globalAlpha=.8;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,20,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke()}
      // Flat badge.
      flatRoundRect(-11,-9,22,18,4,ART_TOKENS.deepInk,FLAT.outline,2);
      ctx.fillStyle=color;flatRoundRect(-9,-7,18,14,3,color,null);
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
    // Flat badge: bold rounded panel with the resource glyph.
    flatRoundRect(-13,-11,26,23,5,ART_TOKENS.deepInk,FLAT.outline,2);
    ctx.fillStyle=meta.color;flatRoundRect(-10,-8,20,17,4,meta.color,null);
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
      if(!marker.available){const progress=1-Math.max(0,Math.min(1,(marker.respawn_in||0)/RESOURCE_RESPAWN_SECONDS));ctx.strokeStyle=meta.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,22,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke()}
      // Flat badge.
      flatRoundRect(-14,-12,28,24,5,ART_TOKENS.deepInk,FLAT.outline,2);
      ctx.fillStyle=meta.color;flatRoundRect(-11,-9,22,18,4,meta.color,null);
      ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.font='bold 13px "Courier New",monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(meta.glyph,0,1);
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
      // Flat ground shadow + crate card.
      ctx.fillStyle=FLAT.shadow;ctx.fillRect(-13,10,26,4);
      ctx.globalAlpha=pulse;ctx.strokeStyle=item.color;ctx.lineWidth=1;ctx.strokeRect(-14,-12,28,25);
      flatRoundRect(-11,-9,22,18,4,'#26301f',item.color,2);
      drawPickupWeapon(item.weapon,item.color);
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
    // Flat weapon glyph: a bold rounded body, barrel and grip with a crisp
    // outline. The weapon colour comes from the weapon definition so every
    // pickup stays recognisable while matching the unified flat palette.
    painter.globalAlpha=.18;painter.fillStyle=color;painter.fillRect(-13,-7,28,14);painter.globalAlpha=1;
    const body=color,dark=FLAT.outline,light=FLAT.paper;
    const rr=(x,y,w,h,r)=>{painter.beginPath();const rr2=Math.max(0,Math.min(r,Math.min(w,h)/2));
      painter.moveTo(x+rr2,y);painter.lineTo(x+w-rr2,y);painter.quadraticCurveTo(x+w,y,x+w,y+rr2);
      painter.lineTo(x+w,y+h-rr2);painter.quadraticCurveTo(x+w,y+h,x+w-rr2,y+h);
      painter.lineTo(x+rr2,y+h);painter.quadraticCurveTo(x,y+h,x,y+h-rr2);
      painter.lineTo(x,y+rr2);painter.quadraticCurveTo(x,y,x+rr2,y);painter.closePath();};
    painter.fillStyle=body;rr(-9,1,6,8,2);painter.fill();painter.lineWidth=2;painter.strokeStyle=dark;painter.stroke();
    painter.fillStyle=body;rr(-11,-4,20,9,3);painter.fill();painter.lineWidth=2;painter.strokeStyle=dark;painter.stroke();
    painter.fillStyle=body;rr(5,-2,13,5,2);painter.fill();painter.lineWidth=2;painter.strokeStyle=dark;painter.stroke();
    painter.fillStyle=light;painter.globalAlpha=.8;painter.fillRect(-8,-3,5,2);painter.globalAlpha=1;
    painter.restore();
  }
  function drawFlags(){
    for(const flag of Object.values(flags)){
      if(!visibleRect(flag.x-20,flag.y-25,40,45))continue;
      const hue=flag.team===0?FLAT.flag.a:FLAT.flag.b;
      ctx.save();ctx.translate(flag.x,flag.y);
      // Flat ground shadow.
      ctx.fillStyle=FLAT.shadow;ctx.beginPath();ctx.ellipse(0,12,10,3,0,0,Math.PI*2);ctx.fill();
      // Pole.
      ctx.fillStyle=FLAT.outline;ctx.fillRect(-1.5,-20,3,32);
      // Flat flag.
      ctx.fillStyle=hue;flatRoundRect(1,-20,16,11,3,hue,FLAT.outline,2);
      ctx.restore();
    }
  }
  function renderPoint(p){
    const old=previousPlayers.get(p.id);if(!old||!Number.isFinite(old.x)||!Number.isFinite(old.y)||!Number.isFinite(p.x)||!Number.isFinite(p.y))return{x:p.x,y:p.y};
    // A respawn teleports the pilot to a fresh legal spot, so the dead -> alive
    // transition must never interpolate across the map.
    if(old.dead&&!p.dead)return{x:p.x,y:p.y};
    const elapsed=Math.max(0,performance.now()-stateAt),interval=Math.max(16,stateIntervalMs),t=Math.min(1,elapsed/interval);
    // The server remains authoritative. A short local-only lead hides 10Hz
    // crowded-room updates without changing collision, damage, or replay data.
    if(!replayMode&&p.id===id&&!p.dead){
      const seconds=interval/1000,vx=Math.max(-900,Math.min(900,(p.x-old.x)/seconds)),vy=Math.max(-900,Math.min(900,(p.y-old.y)/seconds)),lead=Math.min(.065,elapsed/1000*.8);
      return{x:Math.max(0,Math.min(WORLD_W,p.x+vx*lead)),y:Math.max(0,Math.min(WORLD_H,p.y+vy*lead))};
    }
    return{x:old.x+(p.x-old.x)*t,y:old.y+(p.y-old.y)*t};
  }
  // A downed pilot holds the exact spot where they fell. ``dead_for`` is the
  // server-authoritative age of the death, so the topple plays once and lands
  // identically on every client.
  function drawCorpse(p){
    const pos=renderPoint(p);
    if(!Number.isFinite(pos.x)||!Number.isFinite(pos.y))return;
    if(!visibleRect(pos.x-56,pos.y-56,112,112))return;
    const age=Math.max(0,Number(p.dead_for)||0);
    const fall=Math.min(1,age/.42);
    const eased=1-Math.pow(1-fall,3);
    const angle=Number(p.corpse_angle)||0;
    const hue=p.hue||ART_TOKENS.gold;
    const style=PILOT_STYLE[p.skin]||PILOT_STYLE.wayfinder;
    ctx.save();
    ctx.translate(Math.round(pos.x),Math.round(pos.y));
    // A dark stain grounds the body and separates it from the grass.
    ctx.globalAlpha=.30;
    ctx.fillStyle='#2a1a18';
    ctx.beginPath();ctx.ellipse(2,5,24,8,angle,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;
    // The body pivots from an upright pose onto its back, so the fall reads as
    // a topple rather than a fade-in.
    ctx.rotate(angle+(1-eased)*1.15);
    ctx.translate(0,(1-eased)*9);
    ctx.scale(1,1-.16*eased);
    // Legs trail behind, torso in the middle, head at the front.
    flatRoundRect(-22,-4.5,15,9,4,style.trousers,FLAT.outline,2);
    flatRoundRect(-9,-6.5,21,13,6,hue,FLAT.outline,2);
    // One arm flung across the chest keeps the silhouette human.
    flatRoundRect(-6,-8.5,12,4.5,2,style.detail,FLAT.outline,1.6);
    // Head with the helmet still on: skin face, hull-coloured cap above it.
    flatCircle(15,0,6.8,'#e6c3a1',FLAT.outline,2);
    ctx.fillStyle=hue;
    ctx.beginPath();ctx.arc(15,-1.2,6.8,Math.PI*1.02,Math.PI*1.98);ctx.closePath();ctx.fill();
    ctx.strokeStyle=FLAT.outline;ctx.lineWidth=1.4;
    ctx.beginPath();ctx.arc(15,-1.2,6.8,Math.PI*1.02,Math.PI*1.98);ctx.stroke();
    ctx.restore();
    // Dim name tag so a body can be attributed at a glance.
    ctx.save();
    ctx.fillStyle='rgba(232,238,214,.5)';ctx.font='9px "DM Mono",monospace';ctx.textAlign='center';
    ctx.fillText(p.name||'',pos.x,pos.y+27);
    ctx.restore();
  }
  function drawPilot(p){
    if(p.dead){drawCorpse(p);return;}
    if(p.hidden&&p.id!==id)return;
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
    // Blast launch: dust kicked up behind the pilot plus a tumbling body.
    const blown=p.knocked&&!p.dead;
    if(blown){
      const mvx=previous&&Number.isFinite(previous.x)?p.x-previous.x:0;
      const mvy=previous&&Number.isFinite(previous.y)?p.y-previous.y:0;
      const ml=Math.hypot(mvx,mvy)||1,power=previous?Math.min(1,ml/30):1;
      ctx.globalAlpha=.32*power;ctx.fillStyle='#d6cfb6';
      for(let i=1;i<=3;i++){
        const t=i*8;
        ctx.fillRect(Math.round(-mvx/ml*t)-3,Math.round(-mvy/ml*t*.62)-2,7,4);
      }
      ctx.globalAlpha=1;
      ctx.save();
      ctx.rotate(Math.sin(performance.now()/78+p.id.length*3)*.46*power);
      ctx.scale(1+.26*power,.82);
    }
    if(p.shielded){
      ctx.globalAlpha=.8;ctx.strokeStyle='#9fe8ff';ctx.lineWidth=2;ctx.setLineDash([4,3]);
      ctx.beginPath();ctx.ellipse(0,1,25,20,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
    }
    if(p.is_zombie){
      // Flat zombie: rounded body with simple glowing eyes.
      ctx.fillStyle='#2b3b2b';flatRoundRect(-9,-5,18,18,5,'#2b3b2b',FLAT.outline,2);
      ctx.fillStyle='#6d8050';flatRoundRect(-7,-15,14,11,4,'#6d8050',FLAT.outline,2);
      ctx.fillStyle='#a1c56c';ctx.fillRect(-5,-13,4,3);ctx.fillRect(3,-13,4,3);
      ctx.fillStyle='#141d18';flatRoundRect(-7,-3,14,5,2,'#141d18',null);
      ctx.fillStyle='#e8d58d';ctx.fillRect(-5,-2,3,2);ctx.fillRect(3,-2,3,2);
    }else{
      const style=PILOT_STYLE[p.skin]||PILOT_STYLE.wayfinder,skin='#f0c39a',bob=step;
      // Slay.one-style figure: a clean rounded body, a head, and a forward-
      // facing visor. The team hue carries identity; the gun already aims.
      flatRoundRect(-9,-5+bob,18,15,7,p.hue,FLAT.outline,2);                       // shoulders / torso
      ctx.fillStyle=style.detail;flatRoundRect(-5,-2+bob,10,4,2,style.detail,null);// chest accent
      flatCircle(0,-13+bob,6.5,skin,FLAT.outline,2);                              // head
      ctx.fillStyle=p.hue;ctx.beginPath();ctx.arc(0,-13+bob,6.5,Math.PI,0);ctx.closePath();ctx.fill(); // team helmet cap
      ctx.save();ctx.translate(0,-13+bob);ctx.rotate(a);                          // visor faces aim
      ctx.fillStyle='#241f2b';ctx.fillRect(2.4,-3,2.6,2);ctx.fillRect(2.4,1,2.6,2);
      ctx.restore();
    }
    if(blown)ctx.restore();
    ctx.restore();
    // Keep the pilot sprite upright; only the separate weapon layer follows aim.
    if(!p.is_zombie){
      const kick=weaponRecoil.get(p.id)||0;
      ctx.save();ctx.translate(Math.round(pos.x),Math.round(pos.y+jumpOffset));ctx.rotate(a);ctx.translate(10-kick*.8,-1);ctx.scale(.68,.68);
      drawPickupWeapon(weaponKey,weaponColor);
      ctx.restore();
    }
    // --- health + shield bar (shield shown on the bar, slay.one style) ---
    const barW=46, hpBarH=5, shBarH=3, gap=1;
    const maxHp=p.max_hp||100, maxArmor=p.max_armor||100;
    const hpFrac=Math.max(0,Math.min(1,p.hp/maxHp));
    const armorFrac=Math.max(0,Math.min(1,(p.armor||0)/maxArmor));
    const hasShield=armorFrac>0.01;
    const plateH=hpBarH+(hasShield?shBarH+gap:0);
    const bx=pos.x-barW/2, bottomY=pos.y+jumpOffset-22, by=bottomY-plateH;
    // backing plate
    flatRoundRect(bx-2,by-2,barW+4,plateH+4,3,'rgba(7,13,9,.78)',own?'#e7f0a0':'rgba(238,242,224,.55)',1);
    let yy=by;
    if(hasShield){
      ctx.fillStyle='#142d34';ctx.fillRect(bx,yy,barW,shBarH);
      ctx.fillStyle='#67d4ee';flatRoundRect(bx,yy,barW*armorFrac,shBarH,1.5,'#67d4ee',null);
      ctx.fillStyle='rgba(208,245,255,.9)';ctx.fillRect(bx,yy,Math.max(0,barW*armorFrac),1);
      yy+=shBarH+gap;
    }
    const hpColor=hpFrac>0.5?'#76dc8c':hpFrac>0.25?'#e9c64a':'#ec6240';
    ctx.fillStyle='#283a2a';ctx.fillRect(bx,yy,barW,hpBarH);
    ctx.fillStyle=hpColor;flatRoundRect(bx,yy,barW*hpFrac,hpBarH,2,hpColor,null);
    // name label
    ctx.fillStyle=ART_TOKENS.paper;ctx.font='9px "DM Mono",monospace';ctx.textAlign='center';
    const label=(p.is_zombie?'✳ ':'')+p.name;ctx.fillText(label,pos.x,pos.y+jumpOffset+34);
    if(own){const width=ctx.measureText(label).width+8;ctx.fillStyle='rgba(17,29,22,.54)';ctx.fillRect(pos.x-width/2,pos.y+jumpOffset+25,width,12);ctx.strokeStyle='#aebd73';ctx.lineWidth=1;ctx.strokeRect(pos.x-width/2,pos.y+jumpOffset+25,width,12);ctx.fillStyle=ART_TOKENS.paper;ctx.fillText(label,pos.x,pos.y+jumpOffset+34)}
  }
  // --- lobbed (arc) weapons ------------------------------------------------
  // A lob is a real 2D problem: the projectile travels a flat ground path while
  // the eye expects it to rise and fall. The body is drawn along the parabola,
  // the shadow stays on the ground track, and the trail follows the same curve
  // so the three never read as one detached object.
  const ARC_PEAK = 26;
  const ARC_SHADOW = '#10140e';
  function arcLiftAt(u){
    const t=Math.max(0,Math.min(1,u));
    return 4*t*(1-t);
  }
  function arcPeak(p){
    // A tap throw should not balloon like a full-range lob.
    const reach=(p.total_life||0)*Math.hypot(p.vx||0,p.vy||0);
    return Math.max(10,Math.min(ARC_PEAK,reach*.16));
  }
  function arcPeak(p){
    // A tap throw should not balloon like a full-range lob.
    const reach=(p.total_life||0)*Math.hypot(p.vx||0,p.vy||0);
    return Math.max(10,Math.min(ARC_PEAK,reach*.16));
  }
  // --- projectile identity -------------------------------------------------
  // Every weapon gets its own silhouette, palette, trail, muzzle flash and hit
  // spark. Colours are derived from the server-sent tint, so the body, the
  // trail, the muzzle and the explosion always agree with each other.
  const LOOK={
    pulse:{shape:'needle',len:17,width:5,trail:'line',trailWidth:2,impact:'spark',hit:7,ring:9,muzzle:'spike'},
    rotary:{shape:'pellet',size:3.6,ticks:true,trail:'short',trailWidth:1.4,impact:'spark',hit:5,ring:6,muzzle:'spark'},
    scatter:{shape:'shard',size:5.2,trail:'short',trailWidth:1.1,impact:'shard',hit:4,ring:5,muzzle:'shards'},
    prism:{shape:'facet',size:7,trail:'dotted',trailWidth:1.8,impact:'glass',hit:6,ring:13,muzzle:'glint'},
    flare:{shape:'rocket',trail:'smoke',trailWidth:2.2,impact:'blast',hit:22,ring:14,muzzle:'cone'},
    rapid_flare:{shape:'rocket',twin:true,trail:'smoke',trailWidth:2,impact:'blast',hit:16,ring:11,muzzle:'cone'},
    seeker:{shape:'missile',trail:'smoke',trailWidth:2,impact:'blast',hit:20,ring:14,muzzle:'cone'},
    cursor:{shape:'orb',trail:'smoke',trailWidth:2,impact:'blast',hit:18,ring:13,muzzle:'orb'},
    bug:{shape:'bug',trail:'dotted',trailWidth:1.6,impact:'bug',hit:6,ring:6,muzzle:'dots'},
    flame:{shape:'flame',trail:'none',impact:'ember',hit:3,ring:4,muzzle:'puff'},
    healing_wave:{shape:'beam',trail:'none',impact:'heal',hit:0,ring:0,muzzle:'cross'},
    energy_sniper:{shape:'lance',trail:'short',trailWidth:2.4,impact:'spark',hit:8,ring:10,muzzle:'cross'},
    lobber:{shape:'bomb',impact:'blast'},rapid_lobber:{shape:'bomb',impact:'blast'}
  };
  const COLOR_CACHE=new Map();
  function tone(hex,amount){
    const key=hex+'|'+amount;
    const cached=COLOR_CACHE.get(key);
    if(cached)return cached;
    const n=parseInt(String(hex).replace('#',''),16);
    let r=(n>>16)&255,g=(n>>8)&255,b=n&255;
    if(!Number.isFinite(n)){r=255;g=255;b=255}
    const t=Math.min(1,Math.abs(amount)),target=amount>0?255:12;
    r=Math.round(r+(target-r)*t);g=Math.round(g+(target-g)*t);b=Math.round(b+(target-b)*t);
    const out='#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
    COLOR_CACHE.set(key,out);return out;
  }
  function lookFor(p){return LOOK[p.weapon]||LOOK[p.kind]||LOOK.pulse}
  function projectileTint(p){const sprite=PIXEL_SPRITES[p.weapon]||PIXEL_SPRITES.pulse;return p.color||sprite.trail}
  function drawProjectileTrail(p,x,y,age){
    if(p.kind==='arc'){drawArcTrail(p,x,y,age);return;}
    const look=lookFor(p);
    if(look.trail==='none')return;
    const history=projectileTrails.get(p.id)?.points||[];
    if(history.length<2)return;
    const base=projectileTint(p),smoke=look.trail==='smoke';
    const points=history.slice(smoke?-6:look.trail==='short'?-2:-3);
    ctx.save();
    if(look.trail==='dotted'){
      // A dotted thread reads as ricochet glass / a bug swarm; a solid line
      // would read as a laser.
      ctx.fillStyle=tone(base,.12);
      for(let i=0;i<points.length;i+=2){
        ctx.globalAlpha=.32;ctx.fillRect(Math.round(points[i].x)-1,Math.round(points[i].y)-1,2,2);
      }
      ctx.globalAlpha=.4;ctx.fillRect(x-1,y-1,2,2);
      ctx.restore();ctx.globalAlpha=1;return;
    }
    ctx.globalAlpha=smoke?.5:.34;
    ctx.strokeStyle=base;ctx.lineWidth=look.trailWidth||1.6;ctx.lineCap='square';
    ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
    ctx.lineTo(x,y);ctx.stroke();
    ctx.restore();
    if(smoke){
      for(let i=0;i<points.length;i+=2){
        const point=points[i],alpha=(i+1)/points.length*.46;
        ctx.globalAlpha=alpha;ctx.fillStyle=i%4===0?'#9d9a8c':tone(base,.28);
        const size=i%3===0?3:2;ctx.fillRect(Math.round(point.x-size/2),Math.round(point.y-size/2),size,size);
      }
      ctx.globalAlpha=1;
    }
  }
  function drawProjectileBody(p,age,base){
    const look=lookFor(p);
    if(p.kind==='energy_orb'){
      const s=5+Math.sin(age*12)*.7;
      ctx.globalAlpha=.28;ctx.fillStyle=base;ctx.fillRect(-s*1.6,-s*1.6,s*3.2,s*3.2);ctx.globalAlpha=1;
      ctx.fillStyle=tone(base,-.5);flatRoundRect(-s,-s,s*2,s*2,3,tone(base,-.5),null);
      ctx.fillStyle=base;flatRoundRect(-s*.7,-s*.7,s*1.4,s*1.4,2,base,null);
      ctx.fillStyle='#ffffff';ctx.fillRect(-s*.22,-s*.22,s*.44,s*.44);
      ctx.fillStyle=tone(base,.55);
      for(let i=0;i<4;i++){
        const ang=age*3.2+i*Math.PI/2;
        ctx.fillRect(Math.cos(ang)*(s+4)-1.5,Math.sin(ang)*(s+3)-1.5,3,3);
      }
      return;
    }
    switch(look.shape){
      case 'needle':{
        // A cold needle: slim tapered body, bright filament, two tail fins.
        const L=look.len,Wd=look.width;
        ctx.globalAlpha=.2;flatCircle(0,0,Wd*1.4,base,null);ctx.globalAlpha=1;
        ctx.fillStyle=tone(base,-.55);
        ctx.beginPath();
        ctx.moveTo(L*.58,0);ctx.lineTo(L*.1,-Wd*.62);ctx.lineTo(-L*.46,-Wd*.5);
        ctx.lineTo(-L*.56,0);ctx.lineTo(-L*.46,Wd*.5);ctx.lineTo(L*.1,Wd*.62);
        ctx.closePath();ctx.fill();
        ctx.fillStyle=base;
        ctx.beginPath();
        ctx.moveTo(L*.42,0);ctx.lineTo(L*.06,-Wd*.32);ctx.lineTo(-L*.4,-Wd*.26);
        ctx.lineTo(-L*.48,0);ctx.lineTo(-L*.4,Wd*.26);ctx.lineTo(L*.06,Wd*.32);
        ctx.closePath();ctx.fill();
        ctx.fillStyle=tone(base,.82);ctx.fillRect(-L*.3,-1.4,L*.55,2.8);
        ctx.fillStyle='#ffffff';ctx.fillRect(L*.16,-1,L*.2,2);
        ctx.fillStyle=tone(base,-.6);
        ctx.fillRect(-L*.46,-Wd*.62,3.2,1.8);ctx.fillRect(-L*.46,Wd*.62-1.8,3.2,1.8);
        break;
      }
      case 'pellet':{
        const r=look.size||3.6;
        ctx.fillStyle=tone(base,-.5);flatCircle(0,0,r+1.4,tone(base,-.5),null);
        ctx.fillStyle=base;flatCircle(0,0,r,base,null);
        ctx.fillStyle=tone(base,.82);flatCircle(-r*.3,-r*.3,r*.46,tone(base,.82),null);
        if(look.ticks){
          ctx.strokeStyle=tone(base,.5);ctx.lineWidth=1.5;
          const a0=age*24;
          for(let i=0;i<4;i++){
            const ang=a0+i*Math.PI/2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(ang)*(r+1),Math.sin(ang)*(r+1));
            ctx.lineTo(Math.cos(ang)*(r+4),Math.sin(ang)*(r+4));
            ctx.stroke();
          }
        }
        break;
      }
      case 'shard':{
        // Shotgun pellets are tumbling shards, not round balls.
        const s=look.size||4.6;
        ctx.save();ctx.rotate(age*19);
        flatTri(-s,-s,s*2,s*2,'up',tone(base,-.45),null);
        flatTri(-s*.68,-s*.68,s*1.36,s*1.36,'up',base,null);
        flatTri(-s*.26,-s*.26,s*.52,s*.52,'up',tone(base,.9),null);
        ctx.restore();
        break;
      }
      case 'facet':{
        // Prism thread: a slowly spinning glass rhombus with a bright core.
        const s=look.size||7;
        ctx.save();ctx.rotate(age*7);
        ctx.globalAlpha=.26;flatCircle(0,0,s*1.2,base,null);ctx.globalAlpha=1;
        ctx.beginPath();
        ctx.moveTo(0,-s);ctx.lineTo(s*.72,0);ctx.lineTo(0,s);ctx.lineTo(-s*.72,0);ctx.closePath();
        ctx.fillStyle=tone(base,-.3);ctx.fill();
        ctx.strokeStyle=tone(base,.55);ctx.lineWidth=1.6;ctx.stroke();
        ctx.fillStyle=tone(base,.25);
        ctx.beginPath();
        ctx.moveTo(0,-s*.62);ctx.lineTo(s*.4,0);ctx.lineTo(0,s*.62);ctx.lineTo(-s*.4,0);ctx.closePath();ctx.fill();
        ctx.fillStyle='#ffffff';ctx.fillRect(-1.2,-1.2,2.4,2.4);
        ctx.restore();
        break;
      }
      case 'rocket':
      case 'missile':{
        const ex=1+(Math.sin(age*42)*.2);
        // Exhaust plumes first, so the body overlaps them.
        const plume=(oy,scale)=>{
          ctx.fillStyle=tone(base,.3);ctx.globalAlpha=.85;
          ctx.beginPath();ctx.moveTo(-7,oy-3.4*scale);ctx.lineTo(-17*ex,oy);ctx.lineTo(-7,oy+3.4*scale);ctx.closePath();ctx.fill();
          ctx.fillStyle='#fff3c9';
          ctx.beginPath();ctx.moveTo(-7,oy-1.6*scale);ctx.lineTo(-11.5*ex,oy);ctx.lineTo(-7,oy+1.6*scale);ctx.closePath();ctx.fill();
          ctx.globalAlpha=1;
        };
        if(look.twin){plume(-2.1,.62);plume(2.1,.62)}else plume(0,1);
        // Fins.
        ctx.fillStyle=tone(base,-.68);
        ctx.beginPath();ctx.moveTo(-8,-3);ctx.lineTo(-3.4,-7.6);ctx.lineTo(-2.6,-3);ctx.closePath();ctx.fill();
        ctx.beginPath();ctx.moveTo(-8,3);ctx.lineTo(-3.4,7.6);ctx.lineTo(-2.6,3);ctx.closePath();ctx.fill();
        // Body + nose: dark hull, coloured shell, then a bright nose cone.
        flatRoundRect(-9.6,-4.2,16.6,8.4,2.6,tone(base,-.6),null);
        flatRoundRect(-8.8,-3,14.4,6,2,base,null);
        flatRoundRect(-8.4,-2.2,10,4,1.6,tone(base,.22),null);
        ctx.fillStyle=tone(base,.5);
        ctx.beginPath();ctx.moveTo(5.4,-2.9);ctx.lineTo(9.6,0);ctx.lineTo(5.4,2.9);ctx.closePath();ctx.fill();
        ctx.fillStyle='#fff6d8';ctx.fillRect(.6,-1.4,2.8,2.8);
        if(look.shape==='missile'){
          // Seeker lock ring: a rotating arc that makes homing shots obvious.
          ctx.strokeStyle=tone(base,.4);ctx.lineWidth=1.6;
          ctx.beginPath();ctx.arc(0,0,10+Math.sin(age*12)*1.3,age*5,age*5+2.1);ctx.stroke();
        }
        break;
      }
      case 'orb':{
        const r=4.6;
        ctx.globalAlpha=.28;flatCircle(0,0,r*2,base,null);ctx.globalAlpha=1;
        flatCircle(0,0,r+1.2,tone(base,-.5),null);
        flatCircle(0,0,r,base,null);
        flatCircle(-r*.28,-r*.28,r*.5,tone(base,.85),null);
        ctx.strokeStyle=tone(base,.35);ctx.lineWidth=1.2;
        ctx.globalAlpha=.5;ctx.beginPath();ctx.arc(0,0,9.6,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
        ctx.fillStyle=tone(base,.6);
        for(let i=0;i<3;i++){
          const ang=age*9+i*Math.PI*2/3;
          ctx.fillRect(Math.cos(ang)*9.6-1.8,Math.sin(ang)*9.6-1.8,3.6,3.6);
        }
        break;
      }
      case 'bug':{
        const flap=Math.sin(age*34)*1.6;
        ctx.fillStyle=tone(base,-.62);
        ctx.beginPath();ctx.ellipse(0,0,6.3,4,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=tone(base,-.25);
        ctx.beginPath();ctx.ellipse(0,0,4.6,2.7,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=base;
        ctx.beginPath();ctx.ellipse(-1.1,-2.6-flap*.4,3.9,1.7,-.5,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.ellipse(-1.1,2.6+flap*.4,3.9,1.7,.5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=tone(base,.55);
        ctx.fillRect(3.4,-1,3,2);
        break;
      }
      case 'flame':{
        // A tapered teardrop stretched behind the travel direction, so a
        // stream reads as fire instead of a row of dots.
        const f=Math.sin(age*26)*.5+.5,tail=7+f*3.4;
        ctx.globalAlpha=.3;ctx.fillStyle=base;
        ctx.beginPath();
        ctx.moveTo(7,0);
        ctx.quadraticCurveTo(2,-5.6,-tail,-2.4);
        ctx.quadraticCurveTo(-tail*.4,0,-tail,2.4);
        ctx.quadraticCurveTo(2,5.6,7,0);
        ctx.fill();
        ctx.globalAlpha=.94;ctx.fillStyle=tone(base,.22);
        ctx.beginPath();
        ctx.moveTo(5.6,0);
        ctx.quadraticCurveTo(1,-3.7,-tail*.76,-1.5);
        ctx.quadraticCurveTo(-tail*.3,0,-tail*.76,1.5);
        ctx.quadraticCurveTo(1,3.7,5.6,0);
        ctx.fill();
        ctx.fillStyle='#fff2bd';
        ctx.beginPath();ctx.ellipse(1.3,0,2.7,1.5,0,0,Math.PI*2);ctx.fill();
        ctx.globalAlpha=1;
        break;
      }
      case 'beam':{
        const pulse=.85+Math.sin(age*40)*.15;
        ctx.globalAlpha=.35;ctx.strokeStyle=tone(base,.4);ctx.lineWidth=9*pulse;
        ctx.beginPath();ctx.moveTo(-30,0);ctx.lineTo(4,0);ctx.stroke();ctx.globalAlpha=1;
        ctx.strokeStyle=base;ctx.lineWidth=5;
        ctx.beginPath();ctx.moveTo(-28,0);ctx.lineTo(3,0);ctx.stroke();
        ctx.strokeStyle='#e7ffe8';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(-25,0);ctx.lineTo(2,0);ctx.stroke();
        break;
      }
      case 'lance':{
        ctx.globalAlpha=.4;ctx.fillStyle=base;ctx.fillRect(-36,-5,44,10);ctx.globalAlpha=1;
        ctx.fillStyle=tone(base,-.45);ctx.fillRect(-34,-3.4,42,6.8);
        ctx.fillStyle=tone(base,.55);ctx.fillRect(-29,-1.4,35,2.8);
        ctx.fillStyle='#ffffff';ctx.fillRect(2,-1,4,2);
        break;
      }
      default:{
        const r=look.size||4;
        ctx.fillStyle=tone(base,-.5);flatCircle(0,0,r+1.4,tone(base,-.5),null);
        ctx.fillStyle=base;flatCircle(0,0,r,base,null);
        ctx.fillStyle=tone(base,.85);flatCircle(-r*.3,-r*.3,r*.45,tone(base,.85),null);
      }
    }
  }
  function drawArcTrail(p,x,y,age){
    // The puffs are derived from the throw itself (velocity + flight time)
    // instead of the state history, so the trail stays continuous no matter
    // how often snapshots arrive.
    const flight=Math.max(.01,p.total_life||1);
    const speed=Math.max(1,Math.hypot(p.vx||0,p.vy||0));
    const u=Math.max(0,Math.min(1,age/flight));
    const ux=(p.vx||0)/speed, uy=(p.vy||0)/speed;
    const sprite=PIXEL_SPRITES[p.weapon]||PIXEL_SPRITES.lobber;
    ctx.save();
    for(let i=1;i<=6;i++){
      const back=i*11, pu=u-back/(speed*flight);
      if(pu<=.02)break;
      const lift=arcLiftAt(pu)*arcPeak(p);
      const size=i<4?3:2;
      ctx.globalAlpha=.1+.32*(1-(i-1)/6);
      ctx.fillStyle=i<=2?(sprite.colors.o||sprite.colors.O||sprite.trail):'#b3a184';
      ctx.fillRect(Math.round(x-ux*back-size/2),Math.round(y-uy*back-lift*.86),size,size);
    }
    ctx.restore();
    ctx.globalAlpha=1;
  }
  function drawArcBody(x,y,age,spinRate){
    const r=6.4;
    const spin=age*spinRate;
    ctx.save();
    ctx.translate(x,y);
    // Dark shell with a cinder core; the bands spin under a circular clip so
    // the bomb tumbles without ever losing its silhouette.
    flatCircle(0,0,r+1.8,'#20160f',null);
    flatCircle(0,0,r,'#8f4526',null);
    flatCircle(-r*.22,-r*.24,r*.74,'#c9743a',null);
    ctx.save();
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();
    ctx.rotate(spin);
    ctx.fillStyle='rgba(32,22,15,.62)';
    ctx.fillRect(-r,-r*.66,r*2,r*.26);
    ctx.fillRect(-r,r*.4,r*2,r*.2);
    ctx.fillStyle='rgba(255,214,150,.3)';
    ctx.fillRect(-r,-r*.4,r*2,r*.11);
    ctx.restore();
    // fuse + spark, kept in view space so it always points up-left
    ctx.strokeStyle='#3b2a1c';ctx.lineWidth=2;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-r*.5,-r*.6);ctx.lineTo(-r*.86,-r*1.42);ctx.stroke();
    const flick=Math.sin(age*24)*.5+.5;
    ctx.globalAlpha=.55+.45*flick;
    ctx.fillStyle='#ffb028';
    ctx.fillRect(Math.round(-r*.86)-2,Math.round(-r*1.42)-2,4,4);
    ctx.fillStyle='#fff6c4';
    ctx.fillRect(Math.round(-r*.86)-1,Math.round(-r*1.42)-1,2,2);
    ctx.globalAlpha=1;
    ctx.restore();
  }
  function drawArcProjectile(p,x,y,age){
    const flight=Math.max(.01,p.total_life||1);
    const u=Math.max(0,Math.min(1,age/flight));
    const lift=arcLiftAt(u);
    const height=lift*arcPeak(p);
    const sprite=PIXEL_SPRITES[p.weapon]||PIXEL_SPRITES.lobber;
    const blast=p.blast||0;
    const tint=p.color||sprite.colors.B||'#ffb45e';
    // Landing zone: fades in as the grenade comes down. Without it a top-down
    // lob gives no depth cue at all and players cannot aim the throw.
    if(blast>0&&Number.isFinite(p.target_x)&&Number.isFinite(p.target_y)){
      const appear=Math.max(0,Math.min(1,(u-.22)/.45));
      if(appear>0){
        ctx.save();
        ctx.globalAlpha=.18*appear;
        ctx.strokeStyle=tint;ctx.lineWidth=2;ctx.setLineDash([6,7]);
        ctx.beginPath();
        // Radius matches the server blast radius, so the marked zone is the
        // zone that actually hurts.
        ctx.ellipse(p.target_x,p.target_y,blast,blast*.74,0,0,Math.PI*2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha=.3*appear;
        ctx.fillStyle=tint;
        ctx.fillRect(Math.round(p.target_x)-3,Math.round(p.target_y)-1,6,2);
        ctx.fillRect(Math.round(p.target_x)-1,Math.round(p.target_y)-3,2,6);
        ctx.restore();
      }
    }
    // Ground shadow: stays on the travel line, shrinks and softens with height.
    // Two stacked ellipses give a soft edge without a blur filter.
    const shrink=1-lift*.42;
    ctx.save();
    ctx.fillStyle='#0c100b';
    ctx.globalAlpha=.2*(1-lift*.28);
    ctx.beginPath();ctx.ellipse(x+1,y+3,9.6*shrink,5.6*shrink,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=.46*(1-lift*.38);
    ctx.beginPath();ctx.ellipse(x+1,y+2,6.2*shrink,3.6*shrink,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
    ctx.globalAlpha=1;
    drawArcBody(x,Math.round(y-height),age,p.weapon==='rapid_lobber'?11:9);
  }
  function drawProjectile(p){
    const extrapolation=Math.min(stateIntervalMs/1000,Math.max(0,(performance.now()-stateAt)/1000));
    const age=(p.age||0)+extrapolation;
    const x=Math.round(p.x+(p.vx||0)*extrapolation);
    const y=Math.round(p.y+(p.vy||0)*extrapolation);
    const a=Math.atan2(p.vy||0,p.vx||0);
    drawProjectileTrail(p,x,y,age);
    if(p.kind==='arc'){drawArcProjectile(p,x,y,age);return;}
    ctx.save();ctx.translate(x,y);ctx.rotate(a);
    drawProjectileBody(p,age,projectileTint(p));
    ctx.restore();ctx.globalAlpha=1;
  }
  function drawMuzzles(dt){
    for(const flash of muzzles){
      flash.life-=dt*1000;
      const look=LOOK[flash.kind]||LOOK.pulse,base=flash.color||'#e9f2ff';
      const a=Math.atan2(flash.vy||0,flash.vx||1),k=Math.max(0,flash.life/flash.max);
      ctx.save();ctx.translate(Math.round(flash.x),Math.round(flash.y));ctx.rotate(a);
      ctx.globalAlpha=k;
      switch(look.muzzle){
        case 'cone':
          ctx.fillStyle=tone(base,.25);flatTri(-15,-7,17,14,'right',tone(base,.25),null);
          ctx.fillStyle='#fff3c9';flatTri(-8,-3,10,6,'right','#fff3c9',null);
          break;
        case 'spark':
          ctx.fillStyle=base;
          for(let i=0;i<3;i++)ctx.fillRect(-i*3-1,-3+i*3,4,2);
          ctx.fillStyle=tone(base,.8);flatCircle(0,0,2.6,tone(base,.8),null);
          break;
        case 'shards':
          for(const lean of [-1,0,1]){
            const dx=lean*2.4,dy=lean*4.4;
            ctx.fillStyle=lean?tone(base,-.15):base;
            flatTri(-2+dx,-2+dy,10,4,'right',ctx.fillStyle,null);
          }
          break;
        case 'puff':
          ctx.globalAlpha=k*.8;
          ctx.fillStyle=base;flatCircle(3,0,6,base,null);
          ctx.fillStyle=tone(base,.5);flatCircle(2,-1,3.4,tone(base,.5),null);
          break;
        case 'dots':
          ctx.fillStyle=base;
          for(let i=0;i<3;i++)ctx.fillRect(2+i*3,-3+((i*5)%7),3,3);
          break;
        case 'glint':
          ctx.fillStyle=tone(base,.5);flatOctagon(2,0,5,tone(base,.5),null);
          ctx.fillStyle='#ffffff';ctx.fillRect(0,-1,5,2);ctx.fillRect(1,-2,2,4);
          break;
        case 'orb':
          ctx.fillStyle=base;flatCircle(2,0,4,base,null);
          ctx.fillStyle='#ffffff';ctx.fillRect(1,-1,3,2);
          break;
        case 'cross':
          ctx.fillStyle=base;ctx.fillRect(0,-1.6,10,3.2);ctx.fillRect(2,-4.4,3.2,8.8);
          ctx.fillStyle='#ffffff';ctx.fillRect(2,-1,3,2);
          break;
        case 'spike':
        default:
          ctx.fillStyle=tone(base,.18);flatTri(0,-4,14,8,'right',tone(base,.18),null);
          ctx.fillStyle=tone(base,.85);flatCircle(3,0,3.4,tone(base,.85),null);
      }
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
    if(!visibleRect(effect.x-92,effect.y-92,184,184))return;
    const progress=1-effect.life/effect.max;
    const sprite=PIXEL_SPRITES[effect.kind]||PIXEL_SPRITES.pulse;
    const power=effect.power||1,blast=effect.blast||0,outer=effect.layer==='outer',core=effect.layer==='core';
    const palette=[effect.color||sprite.trail,tone(effect.color||sprite.trail,.45),tone(effect.color||sprite.trail,-.3),'#fff3c9'],extent=Math.max(8,Math.min(92,blast ? .58*power : 12));
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
      if(p.grow)p.r=Math.min(26,p.r+p.grow*dt*60);
      const fade=p.life/p.max;
      ctx.globalAlpha=p.smoke?Math.max(0,fade*.6):Math.max(0,fade);
      ctx.fillStyle=p.color;
      ctx.fillRect(Math.round(p.x-p.r/2),Math.round(p.y-p.r/2),p.r,p.r);
    }
    ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0);
    rings.forEach(effect=>drawPixelExplosion(effect,dt));rings=rings.filter(r=>r.life>0);
  }
  function drawSceneLighting(){
    // Screen-space grade: a warm key light from the upper left, a cool edge
    // falloff, and a soft vignette. It unifies terrain and props without
    // touching world-space colours or collision.
    ctx.save();
    const key=ctx.createLinearGradient(0,0,W*.85,H);
    key.addColorStop(0,'rgba(255,250,214,.06)');
    key.addColorStop(.45,'rgba(255,246,196,.012)');
    key.addColorStop(1,'rgba(10,22,18,.05)');
    ctx.fillStyle=key;ctx.fillRect(0,0,W,H);
    const vignette=ctx.createRadialGradient(W*.5,H*.46,Math.min(W,H)*.18,W*.5,H*.5,Math.max(W,H)*.8);
    vignette.addColorStop(0,'rgba(10,20,14,0)');
    vignette.addColorStop(.75,'rgba(10,20,14,.05)');
    vignette.addColorStop(1,'rgba(10,20,14,.18)');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=.12;ctx.strokeStyle='#f6e7a8';ctx.lineWidth=1;ctx.strokeRect(8.5,8.5,W-17,H-17);
    ctx.restore();
  }
  function ensureMinimapStatic(){
    const mw=miniMap.width,mh=miniMap.height,key=map+'|'+mw+'x'+mh;
    if(minimapStaticCanvas&&minimapStaticKey===key)return minimapStaticCanvas;
    const canvas=document.createElement('canvas');canvas.width=mw;canvas.height=mh;
    const painter=canvas.getContext('2d'),sx=mw/WORLD_W,sy=mh/WORLD_H,def=mapDef();
    const pal=mapFlat(),wf=waterFlat(),p=portalFlat(),lf=leafFlat();
    painter.imageSmoothingEnabled=false;painter.fillStyle=pal.base;painter.fillRect(0,0,mw,mh);
    for(let i=0;i<54;i++){
      const x=(i*37+11)%mw,y=(i*53+19)%mh;painter.fillStyle=i%2?pal.mid:pal.dark;painter.fillRect(x,y,2,2);
    }
    for(const [x,y,w,h] of def.water||[]){painter.fillStyle=wf.base;painter.fillRect(x*sx,y*sy,Math.max(1,w*sx),Math.max(1,h*sy))}
    for(const [index,portal] of (def.portals||[]).entries()){
      const px=portal.x*sx,py=portal.y*sy,markRadius=Math.max(3,portal.radius*sx*.48);
      painter.fillStyle=FLAT.ink;painter.beginPath();painter.arc(px,py,markRadius+2,0,Math.PI*2);painter.fill();
      painter.fillStyle=p.floor;painter.beginPath();painter.arc(px,py,markRadius,0,Math.PI*2);painter.fill();
      painter.strokeStyle=p.core;painter.lineWidth=1;painter.stroke();
      painter.fillStyle=FLAT.ink;painter.font='bold 6px monospace';painter.textAlign='center';painter.textBaseline='middle';painter.fillText(index%2?'B':'A',px,py);
    }
    for(const [x,y,w,h] of def.cover||[]){painter.fillStyle=lf.base;painter.fillRect(x*sx,y*sy,Math.max(1,w*sx),Math.max(1,h*sy))}
    for(const prop of def.props||[]){
      painter.fillStyle=prop.kind==='tree'?lf.dark:prop.kind==='stump'?FLAT.wood.base:prop.kind==='crate'?FLAT.crate.base:prop.kind==='pillar'?FLAT.stoneCool.base:prop.kind==='spikes'?FLAT.spike.base:prop.kind==='torch'?FLAT.wood.light:'#858260';
      painter.fillRect(prop.x*sx-2,prop.y*sy-2,4,4);
    }
    for(const [x,y,w,h,kind] of def.obstacles||[]){
      painter.fillStyle=(kind==='crate'||kind==='barrel')?'#9a6a36':'#767b6f';
      painter.fillRect(x*sx,y*sy,Math.max(1,w*sx),Math.max(1,h*sy));
    }
    for(const [x,y,w,h] of def.bridges||[]){painter.fillStyle=FLAT.wood.base;painter.fillRect(x*sx,y*sy,Math.max(1,w*sx),Math.max(1,h*sy))}
    painter.strokeStyle=pal.accent;painter.lineWidth=1;painter.strokeRect(.5,.5,mw-1,mh-1);
    minimapStaticCanvas=canvas;minimapStaticKey=key;return canvas;
  }
  // A pilot is drawn on the minimap only when you could actually see them.
  // Grass-concealed enemies arrive from the server with x/y = null, and
  // anyone outside the camera view is invisible on the map regardless of
  // distance. Reveal rules -- sharing a grass patch, firing, or being fired
  // upon -- clear the concealment server-side, but the enemy still has to be
  // inside the view box to appear.
  function minimapShouldShow(player){
    if(player.id===id)return true;
    if(!Number.isFinite(player.x)||!Number.isFinite(player.y))return false;
    return visibleRect(player.x,player.y,0,0,0);
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
      if(!minimapShouldShow(player))continue;
      miniCtx.fillStyle=player.id===id?'#fff5a6':player.is_zombie?'#d08076':player.hue||'#f0e9bd';
      miniCtx.fillRect(player.x*sx-2,player.y*sy-2,5,5);
      if(player.id===id){miniCtx.strokeStyle='#192019';miniCtx.strokeRect(player.x*sx-3,player.y*sy-3,7,7)}
    }
    // The outlined rectangle is "your view" -- only pilots inside it ever show
    // up on the map (see minimapShouldShow). A warm outline keeps it readable
    // against the terrain texture.
    const viewW=W/CAMERA_ZOOM*sx,viewH=H/CAMERA_ZOOM*sy;
    const viewX=(cameraX-W/(2*CAMERA_ZOOM))*sx,viewY=(cameraY-H/(2*CAMERA_ZOOM))*sy;
    miniCtx.fillStyle='#fff7b524';miniCtx.fillRect(viewX,viewY,viewW,viewH);
    miniCtx.strokeStyle='#ffd86b';miniCtx.lineWidth=1.5;
    miniCtx.strokeRect(viewX+.5,viewY+.5,viewW,viewH);
  }
  function draw(dt=1/60){
    updateCamera();
    updateWeaponRecoil(dt);updateDamageFeedback(dt);
    const shake=cameraShake;cameraShake=Math.max(0,cameraShake-dt*26);
    const shakeX=shake?(Math.random()*2-1)*shake:0,shakeY=shake?(Math.random()*2-1)*shake:0;
    const screen=screenShake,screenX=screen?(Math.random()*2-1)*screen:0,screenY=screen?(Math.random()*2-1)*screen:0;
    ctx.save();ctx.translate(screenX,screenY);
    ctx.fillStyle=scenePal().void;ctx.fillRect(-32,-32,W+64,H+64);
    ctx.save();ctx.translate(W/2-cameraX*CAMERA_ZOOM+shakeX+cameraKickX,H/2-cameraY*CAMERA_ZOOM+shakeY+cameraKickY);ctx.scale(CAMERA_ZOOM,CAMERA_ZOOM);
    drawGrid();drawWater();drawCover();drawProps();drawObstacles();drawBridges();drawPortals();
    const rawBeacon=map==='tidal'?[480,76]:map==='glass'?[84,424]:[878,386];
    const beacon=rawBeacon.map(value=>value*WORLD_SCALE);
    ctx.save();ctx.translate(beacon[0],beacon[1]);ctx.globalAlpha=.8;ctx.strokeStyle=mapDef().accent;ctx.lineWidth=2;
    for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(0,0,11+i*7,5+i*4,performance.now()/1800+i,0,Math.PI*2);ctx.stroke()}
    ctx.fillStyle='#edf4d5';ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();ctx.restore();
    drawPickupSpawns();drawResourceSpawns();drawFlags();drawPickups();drawResources();if(!displaySettings.lowEffects)drawMuzzles(dt);for(const projectile of projectiles)if(visibleRect(projectile.x-24,projectile.y-24,48,48,100))drawProjectile(projectile);for(const projectile of debugProjectiles){projectile.age+=dt;projectile.x+=projectile.vx*dt;projectile.y+=projectile.vy*dt;drawProjectile(projectile);}debugProjectiles=debugProjectiles.filter(projectile=>projectile.age<projectile.total_life);for(const p of players)drawPilot(p);if(!displaySettings.lowEffects)drawDamageNumbers(dt);
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
    if(started&&(localPlayer()?.stat_points??localPlayer()?.skill_points??0)>0)toast('已选升级，按 Space 确认');
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
    if(key==='b')buyUpgrade('regeneration');
    if(key==='g')buyUpgrade('tenacity');
    if(key==='t')buyUpgrade('rapid');
    if(key==='f')buyUpgrade('swift');
    if(key==='p')buyUpgrade('penetration');
    if(key==='r')send({type:'reload'});
  });
  window.addEventListener('keyup',event=>{const key=event.key.toLowerCase();keys.delete(key);if(key==='tab')document.querySelector('#scoreboard').classList.add('hidden')});
  loadDisplaySettings();connectLobbyChat();loadMapPreviews();refreshRooms();roomTimer=setInterval(()=>{if(!started&&!ui.start.classList.contains('hidden'))refreshRooms()},4500);draw();
})();
