(() => {
  'use strict';
  const canvas = document.getElementById('view'), ctx = canvas.getContext('2d', { alpha: false });
  const ui = Object.fromEntries(['overlay','pauseOverlay','endOverlay','startBtn','resumeBtn','againBtn','pauseBtn','soundBtn','status','objective','progress','items','zone','batteryText','batteryFill','timer','toast','stick','stickKnob','flashBtn','runBtn','endLabel','endTitle','endText'].map(id => [id, document.getElementById(id)]));
  const W=23,H=23, map=Array.from({length:H},()=>Array(W).fill(1));
  // Build a deterministic, looping maze of abandoned office corridors.
  const nodes=11, seen=Array.from({length:nodes},()=>Array(nodes).fill(false));
  const dirs=[[0,-1],[1,0],[0,1],[-1,0]];
  function carve(x,y){seen[y][x]=true;map[y*2+1][x*2+1]=0;const order=dirs.slice().sort(()=>Math.random()-.5);for(const [dx,dy] of order){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<nodes&&ny<nodes&&!seen[ny][nx]){map[y*2+1+dy][x*2+1+dx]=0;carve(nx,ny)}}}
  // Seeded shuffle makes each visit familiar enough to navigate but never identical.
  let seed=812731;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};carve(0,0);
  // A few wider rooms break up the tight passages.
  const rooms=[[3,3],[8,3],[5,7],[9,9],[2,9],[7,5]];
  rooms.forEach(([x,y])=>{for(let yy=y;yy<Math.min(y+2,22);yy++)for(let xx=x;xx<Math.min(x+2,22);xx++)map[yy][xx]=0});
  const start={x:1.5,y:1.5};
  // Open the starting chamber and service exit at the far end of the network.
  for(let y=1;y<=3;y++)for(let x=1;x<=3;x++)map[y][x]=0;
  const distFrom=(sx,sy)=>{const d=Array.from({length:H},()=>Array(W).fill(1e9)),q=[[sx,sy]];d[sy][sx]=0;for(let i=0;i<q.length;i++){const [x,y]=q[i];for(const [dx,dy]of dirs){let nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<W&&ny<H&&!map[ny][nx]&&d[ny][nx]>d[y][x]+1){d[ny][nx]=d[y][x]+1;q.push([nx,ny])}}}return d};
  let distances=distFrom(1,1), candidates=[];for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++)if(!map[y][x]&&distances[y][x]>4)candidates.push({x,y,d:distances[y][x]});
  candidates.sort((a,b)=>a.d-b.d);const tapes=[];for(let i=0;i<3;i++){const target=candidates[Math.floor((i+1)*candidates.length/4)];if(target&&!tapes.some(t=>t.x===target.x&&t.y===target.y))tapes.push({x:target.x+.5,y:target.y+.5,got:false})}
  const exitCell=candidates[candidates.length-1]||{x:21,y:21};map[exitCell.y][exitCell.x]=0;const exit={x:exitCell.x+.5,y:exitCell.y+.5};
  const player={x:start.x,y:start.y,a:0,bob:0,walk:0};let monster={x:exit.x,y:exit.y,active:false,clock:0,alert:0};
  let running=false,paused=false,ended=false,muted=false,light=true,battery=100,elapsed=0,last=0,flash=0,damage=0,moveX=0,moveY=0,runTouch=false,toastTimer=0,stepClock=0;
  const keys={};
  const tex=document.createElement('canvas');tex.width=tex.height=128;const tx=tex.getContext('2d');
  tx.fillStyle='#b9ad70';tx.fillRect(0,0,128,128);
  for(let y=0;y<128;y+=32){tx.fillStyle=y%64===0?'#c9bd7d':'#bcb075';tx.fillRect(0,y,128,32);tx.fillStyle='rgba(78,68,35,.23)';tx.fillRect(0,y,128,1);tx.fillStyle='rgba(247,234,178,.18)';tx.fillRect(0,y+2,128,1)}
  for(let i=0;i<4400;i++){const v=Math.random();tx.fillStyle=v>.5?`rgba(65,55,32,${Math.random()*.1})`:`rgba(255,244,198,${Math.random()*.08})`;tx.fillRect(Math.random()*128,Math.random()*128,1+Math.random()*2,1+Math.random()*2)}
  // Ceiling tiles and floor flecks are made once to keep rendering lightweight.
  const floorTex=document.createElement('canvas');floorTex.width=floorTex.height=128;const ft=floorTex.getContext('2d');ft.fillStyle='#77745c';ft.fillRect(0,0,128,128);ft.strokeStyle='rgba(23,24,17,.22)';ft.lineWidth=2;for(let k=0;k<=128;k+=32){ft.beginPath();ft.moveTo(k,0);ft.lineTo(k,128);ft.stroke();ft.beginPath();ft.moveTo(0,k);ft.lineTo(128,k);ft.stroke()}for(let i=0;i<500;i++){ft.fillStyle=`rgba(26,25,17,${Math.random()*.14})`;ft.fillRect(Math.random()*128,Math.random()*128,1+Math.random()*3,1+Math.random()*3)}
  let cw=0,ch=0,zBuffer=[],lowCanvas=document.createElement('canvas'),lc=lowCanvas.getContext('2d');
  function resize(){const dpr=Math.min(devicePixelRatio||1,1.3);cw=Math.max(300,Math.floor(innerWidth*.72));ch=Math.max(180,Math.floor(innerHeight*.68));cw=Math.min(cw,640);ch=Math.min(ch,400);lowCanvas.width=cw;lowCanvas.height=ch;canvas.width=Math.floor(innerWidth*dpr);canvas.height=Math.floor(innerHeight*dpr);canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';ctx.imageSmoothingEnabled=false}
  addEventListener('resize',resize);resize();
  function solid(x,y){return x<0||y<0||x>=W||y>=H||map[Math.floor(y)][Math.floor(x)]!==0}
  function canMove(x,y,r=.2){return !solid(x-r,y-r)&&!solid(x+r,y-r)&&!solid(x-r,y+r)&&!solid(x+r,y+r)}
  function showToast(s){ui.toast.textContent=s;ui.toast.classList.add('show');toastTimer=2.2}
  function updateHud(){const got=tapes.filter(t=>t.got).length;ui.items.textContent=`${got} / 3 RECORDINGS`;ui.progress.style.width=(got/3*100)+'%';ui.objective.textContent=got<3?'Find the missing recordings':'Find the service exit';ui.zone.textContent=got<3?'ZONE 0 · THE LOBBY':'ZONE 1 · SERVICE ACCESS';ui.batteryText.textContent=Math.ceil(battery)+'%';ui.batteryFill.style.width=battery+'%';ui.batteryFill.style.background=battery<20?'#c66d52':'#d6c17c';ui.status.innerHTML=monster.active?'<i style="background:#d64e3c;box-shadow:0 0 9px #d64e3c"></i> PROXIMITY ALERT':'<i></i> SIGNAL LOST'}
  function startGame(){running=true;paused=false;ended=false;elapsed=0;battery=100;light=true;player.x=start.x;player.y=start.y;player.a=0;monster={x:exit.x,y:exit.y,active:false,clock:0,alert:0};tapes.forEach(t=>t.got=false);ui.overlay.classList.add('hidden');ui.pauseOverlay.classList.add('hidden');ui.endOverlay.classList.add('hidden');updateHud();if(innerWidth>700)canvas.requestPointerLock?.();}
  function pauseGame(){if(!running||ended)return;paused=true;ui.pauseOverlay.classList.remove('hidden');document.exitPointerLock?.()}
  function resumeGame(){paused=false;ui.pauseOverlay.classList.add('hidden');if(innerWidth>700)canvas.requestPointerLock?.()}
  function finish(win){ended=true;running=false;document.exitPointerLock?.();ui.endLabel.textContent=win?'TRANSMISSION RECOVERED':'FIELD RECORDING ENDED';ui.endTitle.textContent=win?'You made it out.':'It found you.';ui.endText.textContent=win?'The fluorescent hum fades behind you. You kept all three recordings.':'The halls swallowed the last of your signal. The recordings are still somewhere inside.';ui.endOverlay.classList.remove('hidden')}
  ui.startBtn.onclick=startGame;ui.againBtn.onclick=startGame;ui.pauseBtn.onclick=()=>paused?resumeGame():pauseGame();ui.resumeBtn.onclick=resumeGame;ui.soundBtn.onclick=()=>{muted=!muted;ui.soundBtn.textContent=muted?'♫̸':'♫';if(!muted)ensureAudio()};
  function toggleLight(){if(battery>0){light=!light;showToast(light?'FLASHLIGHT ON':'FLASHLIGHT OFF')}else showToast('BATTERY EMPTY')}
  ui.flashBtn.onclick=toggleLight;ui.runBtn.onpointerdown=e=>{e.preventDefault();runTouch=true};['pointerup','pointercancel','pointerleave'].forEach(ev=>ui.runBtn.addEventListener(ev,()=>runTouch=false));
  addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Escape'){if(paused)resumeGame();else pauseGame()}if(e.code==='KeyF'&&!e.repeat)toggleLight()});addEventListener('keyup',e=>keys[e.code]=false);
  canvas.addEventListener('click',()=>{if(running&&!paused&&innerWidth>700)canvas.requestPointerLock?.()});document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&running&&!paused)player.a+=e.movementX*.0022});
  let stickId=null,lookId=null,lastLookX=0,lastLookY=0;const stickEl=ui.stick;
  stickEl.addEventListener('pointerdown',e=>{e.preventDefault();stickId=e.pointerId;stickEl.setPointerCapture(stickId);updateStick(e)});
  stickEl.addEventListener('pointermove',e=>{if(e.pointerId===stickId){e.preventDefault();updateStick(e)}});
  ['pointerup','pointercancel'].forEach(ev=>stickEl.addEventListener(ev,e=>{if(e.pointerId===stickId){stickId=null;moveX=moveY=0;ui.stickKnob.style.transform='translate(-50%,-50%)'}}));
  function updateStick(e){const r=stickEl.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),lim=r.width*.34,d=Math.hypot(dx,dy)||1;moveX=dx/Math.max(lim,d);moveY=dy/Math.max(lim,d);ui.stickKnob.style.transform=`translate(calc(-50% + ${Math.max(-lim,Math.min(lim,dx))}px),calc(-50% + ${Math.max(-lim,Math.min(lim,dy))}px))`}
  canvas.addEventListener('pointerdown',e=>{if(innerWidth<=700&&running&&!paused){lookId=e.pointerId;lastLookX=e.clientX;lastLookY=e.clientY;canvas.setPointerCapture(e.pointerId)}});canvas.addEventListener('pointermove',e=>{if(e.pointerId===lookId){player.a+=(e.clientX-lastLookX)*.006;lastLookX=e.clientX;lastLookY=e.clientY}});canvas.addEventListener('pointerup',e=>{if(e.pointerId===lookId)lookId=null});

  let audioCtx=null;
  function ensureAudio(){if(muted)return;try{if(!audioCtx){audioCtx=new (window.AudioContext||window.webkitAudioContext)();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),filter=audioCtx.createBiquadFilter();osc.type='sawtooth';osc.frequency.value=54;filter.type='lowpass';filter.frequency.value=115;gain.gain.value=.025;osc.connect(filter).connect(gain).connect(audioCtx.destination);osc.start()}audioCtx.resume()}catch(_){}}
  function beep(freq=440,dur=.12,type='sine',vol=.05){if(muted)return;ensureAudio();if(!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur)}
  function drawWorld(){
    const w=lowCanvas.width,h=lowCanvas.height,horizon=h*.49+Math.sin(player.bob)*2,fov=.72,dirX=Math.cos(player.a),dirY=Math.sin(player.a),planeX=-dirY*Math.tan(fov/2),planeY=dirX*Math.tan(fov/2);
    const sky=lc.createLinearGradient(0,0,0,horizon);sky.addColorStop(0,'#26261d');sky.addColorStop(1,'#64604a');lc.fillStyle=sky;lc.fillRect(0,0,w,horizon);
    const floor=lc.createLinearGradient(0,horizon,0,h);floor.addColorStop(0,'#77735b');floor.addColorStop(.22,'#615e4b');floor.addColorStop(1,'#25241c');lc.fillStyle=floor;lc.fillRect(0,horizon,w,h-horizon);
    lc.globalAlpha=.24;lc.fillStyle=lc.createPattern(floorTex,'repeat');lc.fillRect(0,horizon,w,h-horizon);lc.globalAlpha=1;
    for(let i=1;i<=8;i++){const y=horizon-i*i*1.25;if(y>1){lc.fillStyle=`rgba(11,12,9,${.1+i*.012})`;lc.fillRect(0,y,w,1)}}
    const flicker=.88+Math.sin(elapsed*17)*.025+(Math.random()<.008?-.22:0);
    for(let x=0;x<w;x++){
      const cameraX=2*x/w-1,rayX=dirX+planeX*cameraX,rayY=dirY+planeY*cameraX;let mx=Math.floor(player.x),my=Math.floor(player.y),side=0,hit=0;
      const ddx=Math.abs(1/(rayX||1e-8)),ddy=Math.abs(1/(rayY||1e-8));let sx=rayX<0?-1:1,sy=rayY<0?-1:1,sdx=(rayX<0?player.x-mx:mx+1-player.x)*ddx,sdy=(rayY<0?player.y-my:my+1-player.y)*ddy;
      for(let n=0;n<40&&!hit;n++){if(sdx<sdy){sdx+=ddx;mx+=sx;side=0}else{sdy+=ddy;my+=sy;side=1}if(mx<0||my<0||mx>=W||my>=H||map[my][mx])hit=1}
      let distance=side===0?sdx-ddx:sdy-ddy;distance=Math.max(.08,distance);const line=Math.min(h*2,h/distance),top=Math.max(0,Math.floor(horizon-line/2)),bottom=Math.min(h,Math.ceil(horizon+line/2));
      zBuffer[x]=distance;
      if(hit){let wallX=side===0?player.y+distance*rayY:player.x+distance*rayX;wallX-=Math.floor(wallX);let txp=Math.floor(wallX*128);if(side===0&&rayX>0||side===1&&rayY<0)txp=127-txp;
        let angle=Math.atan2(rayY,rayX)-player.a,cone=Math.max(.2,1-Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))/1.8),torch=light?(.54+cone*.7)*Math.max(.22,1-distance*.085):.25,shade=Math.max(.08,Math.min(.9,torch*flicker*(side===1?.78:1)/(1+distance*.055)));
        lc.drawImage(tex,txp,0,1,128,x,top,1,bottom-top);lc.fillStyle=`rgba(10,11,8,${1-shade})`;lc.fillRect(x,top,1,bottom-top);
        if(distance<3.8){const glow=Math.max(0,1-distance/3.8)*.16;lc.fillStyle=`rgba(255,227,142,${glow*cone})`;lc.fillRect(x,top,1,bottom-top)}
      }
    }
    drawBillboards(dirX,dirY,planeX,planeY,horizon,w,h);
    const vign=lc.createRadialGradient(w/2,horizon,w*.08,w/2,horizon,w*.7);vign.addColorStop(0,'rgba(0,0,0,0)');vign.addColorStop(1,`rgba(0,0,0,${light?.28:.65})`);lc.fillStyle=vign;lc.fillRect(0,0,w,h);
    if(light){const g=lc.createRadialGradient(w/2,horizon,w*.02,w/2,horizon,w*.4);g.addColorStop(0,'rgba(255,240,184,.07)');g.addColorStop(1,'rgba(255,235,170,0)');lc.fillStyle=g;lc.fillRect(0,horizon,w,h-horizon)}
    ctx.imageSmoothingEnabled=false;ctx.drawImage(lowCanvas,0,0,canvas.width,canvas.height);if(flash>0){ctx.fillStyle=`rgba(230,216,173,${flash*.35})`;ctx.fillRect(0,0,canvas.width,canvas.height)}
  }
  function drawBillboards(dx,dy,px,py,horizon,w,h){
    const objects=[];tapes.forEach(t=>{if(!t.got)objects.push({x:t.x,y:t.y,type:'tape',d:(t.x-player.x)**2+(t.y-player.y)**2})});objects.push({x:exit.x,y:exit.y,type:'exit',d:(exit.x-player.x)**2+(exit.y-player.y)**2});if(monster.active)objects.push({x:monster.x,y:monster.y,type:'monster',d:(monster.x-player.x)**2+(monster.y-player.y)**2});objects.sort((a,b)=>b.d-a.d);
    for(const o of objects){const sx=o.x-player.x,sy=o.y-player.y,inv=1/(px*dy-dx*py),tx=inv*(dy*sx-dx*sy),depth=inv*(-py*sx+px*sy);if(depth<=.15)continue;const screenX=Math.floor(w/2*(1+tx/depth));if(screenX>=0&&screenX<w&&depth>zBuffer[screenX])continue;const size=Math.min(h*2,Math.abs(h/depth)),center=horizon+size*.05;
      if(o.type==='tape'){if(size<3)continue;const ww=Math.max(4,size*.22),hh=Math.max(3,size*.12),y=center-size*.11;lc.fillStyle='rgba(255,207,92,.14)';lc.beginPath();lc.ellipse(screenX,center,ww*1.5,hh*2,0,0,Math.PI*2);lc.fill();lc.fillStyle='#242219';lc.fillRect(screenX-ww/2,y,ww,hh);lc.strokeStyle='#d5bc71';lc.lineWidth=Math.max(1,size*.012);lc.strokeRect(screenX-ww/2,y,ww,hh);lc.fillStyle='#d8c477';lc.beginPath();lc.arc(screenX-ww*.2,y+hh/2,hh*.2,0,7);lc.arc(screenX+ww*.2,y+hh/2,hh*.2,0,7);lc.fill();lc.fillStyle='#e7d28c';lc.fillRect(screenX-ww*.38,y-hh*.2,ww*.76,hh*.13)}
      else if(o.type==='exit'){const ww=size*.45,hh=size*.78,x=screenX-ww/2,y=center-hh;lc.fillStyle='rgba(0,0,0,.8)';lc.fillRect(x-4,y-4,ww+8,hh+6);lc.fillStyle='#24251d';lc.fillRect(x,y,ww,hh);lc.strokeStyle='#b8a96d';lc.lineWidth=Math.max(1,size*.018);lc.strokeRect(x,y,ww,hh);lc.fillStyle='#c8ba7a';lc.fillRect(screenX-ww*.28,y+hh*.18,ww*.56,hh*.015);lc.fillStyle='#d7bd64';lc.beginPath();lc.arc(x+ww*.82,y+hh*.56,Math.max(1,size*.018),0,7);lc.fill()}
      else{const ww=size*.48,hh=size*1.35,x=screenX-ww/2,y=center-hh*.75;lc.fillStyle='rgba(0,0,0,.35)';lc.beginPath();lc.ellipse(screenX,center+hh*.05,ww*.8,hh*.09,0,0,7);lc.fill();lc.fillStyle='#080908';lc.beginPath();lc.ellipse(screenX,y+hh*.14,ww*.21,hh*.14,0,0,7);lc.fill();lc.beginPath();lc.moveTo(screenX-ww*.17,y+hh*.2);lc.lineTo(screenX+ww*.17,y+hh*.2);lc.lineTo(screenX+ww*.42,y+hh);lc.lineTo(screenX+ww*.28,y+hh);lc.lineTo(screenX+ww*.12,y+hh*.53);lc.lineTo(screenX+ww*.07,y+hh*1.04);lc.lineTo(screenX-ww*.1,y+hh*1.04);lc.lineTo(screenX-ww*.16,y+hh*.52);lc.lineTo(screenX-ww*.37,y+hh);lc.lineTo(screenX-ww*.49,y+hh);lc.closePath();lc.fill();if(depth<4){lc.fillStyle=`rgba(188,37,29,${.55+Math.sin(elapsed*13)*.25})`;lc.fillRect(screenX-ww*.11,y+hh*.13,Math.max(1,ww*.07),Math.max(1,hh*.012));lc.fillRect(screenX+ww*.06,y+hh*.13,Math.max(1,ww*.07),Math.max(1,hh*.012))}}
    }
  }
  function update(dt){
    if(!running||paused||ended)return;elapsed+=dt;ui.timer.textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`;if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.remove('show')}
    const forward=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)-moveY,strafe=(keys.KeyD?1:0)-(keys.KeyA?1:0)+moveX,turn=(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0);if(document.pointerLockElement!==canvas)player.a+=turn*dt*1.8;
    const mag=Math.hypot(forward,strafe),isRunning=(keys.ShiftLeft||keys.ShiftRight||runTouch)&&mag>.1,speed=isRunning?3.15:1.75;if(mag>.05){const f=forward/mag*speed*dt,s=strafe/mag*speed*dt,nx=player.x+Math.cos(player.a)*f-Math.sin(player.a)*s,ny=player.y+Math.sin(player.a)*f+Math.cos(player.a)*s;if(canMove(nx,player.y))player.x=nx;if(canMove(player.x,ny))player.y=ny;player.bob+=dt*(isRunning?15:9);stepClock-=dt;if(stepClock<=0){stepClock=isRunning?.3:.52;if(isRunning&&monster.active)monster.alert=Math.max(monster.alert,4);if(Math.random()<.48)beep(isRunning?64:78,.045,'triangle',.012)}}else player.bob*=.88;
    if(light){battery=Math.max(0,battery-dt*(isRunning?1.05:.48));if(battery===0){light=false;showToast('FLASHLIGHT BATTERY DEPLETED')}}
    const got=tapes.filter(t=>t.got).length;for(const t of tapes){if(!t.got&&Math.hypot(player.x-t.x,player.y-t.y)<.62){t.got=true;const count=tapes.filter(q=>q.got).length;showToast(`RECORDING ${count} / 3 RECOVERED`);beep(540,.3,'sine',.075);if(count===1){monster.active=true;monster.x=exit.x;monster.y=exit.y;showToast('SOMETHING HEARD THAT. KEEP MOVING.')}updateHud()}}
    if(monster.active){monster.clock-=dt;if(monster.clock<=0){monster.clock=.52;const sx=Math.floor(monster.x),sy=Math.floor(monster.y),tx=Math.floor(player.x),ty=Math.floor(player.y),d=Array.from({length:H},()=>Array(W).fill(Infinity)),prev=Array.from({length:H},()=>Array(W).fill(null)),q=[[sx,sy]];d[sy][sx]=0;for(let i=0;i<q.length;i++){const [x,y]=q[i];if(x===tx&&y===ty)break;for(const [ax,ay]of dirs){const nx=x+ax,ny=y+ay;if(nx>0&&ny>0&&nx<W-1&&ny<H-1&&!map[ny][nx]&&d[ny][nx]===Infinity){d[ny][nx]=d[y][x]+1;prev[ny][nx]=[x,y];q.push([nx,ny])}}}if(prev[ty]?.[tx]){let step=[tx,ty];while(prev[step[1]][step[0]]&&!(prev[step[1]][step[0]][0]===sx&&prev[step[1]][step[0]][1]===sy))step=prev[step[1]][step[0]];const targetX=step[0]+.5,targetY=step[1]+.5,ang=Math.atan2(targetY-monster.y,targetX-monster.x),sp=monster.alert>0?1.7:1.13,dist=Math.hypot(targetX-monster.x,targetY-monster.y),amt=Math.min(dist,sp*.52);monster.x+=Math.cos(ang)*amt;monster.y+=Math.sin(ang)*amt;monster.alert=Math.max(0,monster.alert-dt)} }
      const md=Math.hypot(player.x-monster.x,player.y-monster.y);if(md<5&&Math.random()<dt*.55)beep(42+Math.random()*18,.18,'sawtooth',.025);if(md<.58){damage+=dt;if(damage>.6)finish(false)}else damage=Math.max(0,damage-dt*.3);if(md<2.6){flash=Math.max(flash,Math.random()*.2);if(md<1.6&&Math.random()<dt*.25)showToast('RUN.');}
    }
    const exitDistance=Math.hypot(player.x-exit.x,player.y-exit.y);if(exitDistance<.9){if(got>=3){beep(760,.5,'sine',.09);finish(true)}else if(exitDistance<.75&&Math.random()<dt*.35)showToast('LOCKED — THREE RECORDINGS REQUIRED')}
    flash=Math.max(0,flash-dt*1.7);if(Math.floor(elapsed*3)!==Math.floor((elapsed-dt)*3))updateHud();
  }
  function frame(now){const dt=Math.min(.045,(now-last)/1000||0);last=now;update(dt);drawWorld();requestAnimationFrame(frame)}
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)pauseGame()});
  updateHud();requestAnimationFrame(frame);
})();

