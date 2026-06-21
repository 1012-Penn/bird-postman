(() => {
  const canvas = document.querySelector('#game'), ctx = canvas.getContext('2d');
  const scoreEl = document.querySelector('#score'), comboEl = document.querySelector('#combo');
  const start = document.querySelector('#start'), play = document.querySelector('#play'), sound = document.querySelector('#sound');

  // All game-feel tuning lives here. Values are in pixels, seconds, and pixels/second.
  const CFG = {
    gravity: 1180, diveGravityMultiplier: 2.7, glideLift: 215,
    groundFriction: .075, airDrag: .025, maxSpeed: 900,
    landingSpeedRetention: .97, badLandingPenalty: .42,
    slopeAccelerationMultiplier: 1.12, takeoffThreshold: .82,
    terrainAmplitude: 155, terrainWavelength: 400, terrainDownhillRatio: .72, characterRadius: 16,
    groundDiveMultiplier: 2.15, groundGlideMultiplier: .9,
    groundAdhesion: 1.25, diveAdhesion: 2.8, landingBonus: .12
  };
  let W,H,dpr,last=0,running=false,held=false,muted=false,debug=true,flash=0,combo=1,comboTimer=0,landingQuality=0,particles=[],rings=[];
  const body={position:{x:160,y:0},velocity:{x:160,y:0},state:'Grounded'};
  let cameraX=0, audio;

  function resize(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}
  addEventListener('resize',resize); resize();
  const dot=(a,b)=>a.x*b.x+a.y*b.y;
  const mag=v=>Math.hypot(v.x,v.y);
  const mul=(v,n)=>({x:v.x*n,y:v.y*n});
  const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y});
  const norm=v=>{const m=mag(v)||1;return{x:v.x/m,y:v.y/m}};
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const lerp=(a,b,t)=>a+(b-a)*t;

  // Infinite cubic-Bezier terrain. Each period has a long downhill and a short uphill.
  // The cubic easing has horizontal tangent at both control points, so adjacent hills join smoothly.
  const cubicEase=t=>t*t*(3-2*t);
  function terrainY(x){
    const p=((x%CFG.terrainWavelength)+CFG.terrainWavelength)%CFG.terrainWavelength/CFG.terrainWavelength;
    const down=CFG.terrainDownhillRatio, base=H*.65, a=CFG.terrainAmplitude;
    if(p<down)return base-a+2*a*cubicEase(p/down);
    return base+a-2*a*cubicEase((p-down)/(1-down));
  }
  function terrainAt(x){
    const y=terrainY(x), eps=2;
    const dydx=(terrainY(x+eps)-terrainY(x-eps))/(2*eps);
    const tangent=norm({x:1,y:dydx}), normal={x:tangent.y,y:-tangent.x};
    const second=(terrainY(x+eps)-2*y+terrainY(x-eps))/(eps*eps), curvature=second/Math.pow(1+dydx*dydx,1.5);
    return {y,tangent,normal,slopeAngle:Math.atan2(dydx,1),curvature};
  }
  function startingX(){return CFG.terrainWavelength*.30}

  function initAudio(){if(!audio)audio=new(window.AudioContext||window.webkitAudioContext)();audio.resume()}
  function tone(freq,d=.12,type='sine',vol=.035){if(muted||!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+d);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+d)}
  function cloud(x,y,s){ctx.save();ctx.globalAlpha=.3;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,18*s,0,7);ctx.arc(x+24*s,y-8*s,25*s,0,7);ctx.arc(x+54*s,y,19*s,0,7);ctx.arc(x+26*s,y+9*s,27*s,0,7);ctx.fill();ctx.restore()}
  function drawBackground(){const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#73cfe2');sky.addColorStop(.58,'#b6e7d4');sky.addColorStop(1,'#f7dea8');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff1bc';ctx.beginPath();ctx.arc(W*.78,H*.16,42,0,7);ctx.fill();for(let i=-1;i<6;i++)cloud((i*260-cameraX*.12)%1500-120,80+(i%3)*57,.7+(i%2)*.34)}
  function drawGround(){ctx.beginPath();ctx.moveTo(0,H);for(let sx=0;sx<=W+8;sx+=7)ctx.lineTo(sx,terrainAt(cameraX+sx).y);ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle='#5d9a79';ctx.fill();ctx.beginPath();for(let sx=0;sx<=W+8;sx+=7)ctx.lineTo(sx,terrainAt(cameraX+sx).y);ctx.strokeStyle='#d7eeaa';ctx.lineWidth=7;ctx.stroke();ctx.beginPath();for(let sx=0;sx<=W+8;sx+=7)ctx.lineTo(sx,terrainAt(cameraX+sx).y-2);ctx.strokeStyle='#77b582';ctx.lineWidth=2;ctx.stroke()}
  function screenBody(){return{x:body.position.x-cameraX,y:body.position.y}}
  function drawBird(){const p=screenBody(), speed=mag(body.velocity);const ang=body.state==='Grounded'?terrainAt(body.position.x).slopeAngle:Math.atan2(body.velocity.y,body.velocity.x)*.68;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(ang);if(held&&body.state==='Grounded'){ctx.globalAlpha=.18;ctx.fillStyle='#fff4a8';ctx.beginPath();ctx.arc(0,5,25+Math.min(20,speed*.025),0,7);ctx.fill();ctx.globalAlpha=1}ctx.fillStyle='#f28c73';ctx.beginPath();ctx.ellipse(0,0,19,16,0,0,7);ctx.fill();ctx.fillStyle='#f7b28e';ctx.beginPath();ctx.ellipse(4,7,11,6,0,0,7);ctx.fill();ctx.fillStyle='#e96f68';ctx.beginPath();ctx.ellipse(-6,3,11,7,-.55,0,7);ctx.fill();ctx.fillStyle='#f3c760';ctx.beginPath();ctx.moveTo(16,-1);ctx.lineTo(27,4);ctx.lineTo(16,7);ctx.closePath();ctx.fill();ctx.fillStyle='#344d5b';ctx.beginPath();ctx.arc(8,-6,2.7,0,7);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(9,-7,1,0,7);ctx.fill();ctx.restore()}
  function spawnDust(){const p=screenBody();for(let i=0;i<3;i++)particles.push({x:p.x-10,y:p.y+12,vx:-20-Math.random()*70,vy:-15-Math.random()*35,life:.5+Math.random()*.25,c:'#f8eab3'})}
  function drawParticles(dt){particles=particles.filter(p=>(p.life-=dt)>0);for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=50*dt;ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,7);ctx.fill()}ctx.globalAlpha=1}
  function seedRings(origin=body.position.x){rings=[];for(let i=1;i<30;i++){const x=origin+160+i*430;rings.push({x,y:terrainAt(x).y-110-Math.random()*100,got:false})}}
  function drawRings(){for(const r of rings){const x=r.x-cameraX;if(x<-30||x>W+30||r.got)continue;ctx.save();ctx.translate(x,r.y);ctx.rotate(Math.sin((cameraX+r.x)*.008)*.14);ctx.strokeStyle='#fff0a6';ctx.lineWidth=6;ctx.shadowColor='#fff8b6';ctx.shadowBlur=11;ctx.beginPath();ctx.arc(0,0,17,0,7);ctx.stroke();ctx.restore()}}

  function land(surface){
    const arrival=body.velocity, arrivalSpeed=mag(arrival), tangent=surface.tangent;
    const alignment=arrivalSpeed?clamp(dot(norm(arrival),tangent),-1,1):0;
    landingQuality=clamp((alignment-.05)/.95,0,1);
    const tangentSpeed=Math.max(0,dot(arrival,tangent));
    const retention=lerp(CFG.badLandingPenalty,CFG.landingSpeedRetention,landingQuality);
    const bonus=landingQuality>.82?1+CFG.landingBonus*(landingQuality-.82)/.18:1;
    body.velocity=mul(tangent,Math.min(CFG.maxSpeed,tangentSpeed*retention*bonus));
    body.position.y=surface.y-CFG.characterRadius; body.state='Grounded';
    if(landingQuality>.68){combo++;comboTimer=1.25;flash=.16;tone(370+landingQuality*260,.1,'triangle',.045)}else{combo=1;tone(180,.08,'sine',.025)}
    spawnDust();
  }
  function updateGround(dt,surface){
    let v=Math.max(0,dot(body.velocity,surface.tangent));
    const gravityTangent=CFG.gravity*surface.tangent.y*CFG.slopeAccelerationMultiplier;
    const posture=held?CFG.groundDiveMultiplier:CFG.groundGlideMultiplier;
    v+=(gravityTangent*posture-CFG.groundFriction*v)*dt;v=clamp(v,25,CFG.maxSpeed);
    // At a convex crest the required downward curvature can exceed gravity; the ground cannot pull the bird down.
    const requiredDown=v*v*Math.max(0,surface.curvature), availableDown=CFG.gravity*(-surface.normal.y)*(held?CFG.diveAdhesion:CFG.groundAdhesion);
    if(surface.curvature>0&&requiredDown>availableDown/CFG.takeoffThreshold){body.velocity=mul(surface.tangent,v);body.state='Airborne';return}
    body.position.x+=surface.tangent.x*v*dt;const next=terrainAt(body.position.x);body.position.y=next.y-CFG.characterRadius;body.velocity=mul(next.tangent,v);
    if(held&&Math.random()<dt*17)spawnDust();
  }
  function updateAir(dt){
    const accel={x:-body.velocity.x*CFG.airDrag,y:CFG.gravity-body.velocity.y*CFG.airDrag};
    if(held)accel.y+=CFG.gravity*(CFG.diveGravityMultiplier-1);else if(body.velocity.y>0)accel.y-=CFG.glideLift;
    body.velocity=add(body.velocity,mul(accel,dt));const s=mag(body.velocity);if(s>CFG.maxSpeed)body.velocity=mul(norm(body.velocity),CFG.maxSpeed);
    body.position=add(body.position,mul(body.velocity,dt));const surface=terrainAt(body.position.x);
    if(body.position.y+CFG.characterRadius>=surface.y&&body.velocity.y>0)land(surface);
  }
  function update(dt){const surface=terrainAt(body.position.x);if(body.state==='Grounded')updateGround(dt,surface);else updateAir(dt);cameraX=body.position.x-W*.3;for(const r of rings)if(!r.got&&Math.abs(r.x-body.position.x)<27&&Math.abs(r.y-body.position.y)<30){r.got=true;combo++;comboTimer=1.5;flash=.18;tone(660,.13,'sine',.05)}comboTimer-=dt;if(comboTimer<=0)combo=Math.max(1,combo-1);scoreEl.textContent=String(Math.floor(body.position.x/8)).padStart(4,'0');comboEl.textContent=`×${combo}`}
  function line(p,v,color,label){ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+v.x,p.y+v.y);ctx.stroke();ctx.fillText(label,p.x+v.x+4,p.y+v.y+4)}
  function drawDebug(){if(!debug)return;const p=screenBody(),s=terrainAt(body.position.x),spd=mag(body.velocity);ctx.save();ctx.font='12px monospace';ctx.textBaseline='middle';line(p,mul(body.velocity,.16),'#fff','v');line(p,mul(s.tangent,48),'#65f0df','t');line(p,mul(s.normal,48),'#ff8fab','n');ctx.fillStyle='#ffffffdd';ctx.fillText(`STATE  ${body.state}`,18,H-105);ctx.fillText(`speed  ${spd.toFixed(1)} px/s`,18,H-84);ctx.fillText(`landing quality  ${(landingQuality*100).toFixed(0)}%`,18,H-63);ctx.fillText(`slope  ${(s.slopeAngle*180/Math.PI).toFixed(1)}°  |  D: debug`,18,H-42);ctx.restore()}
  function frame(t){const dt=Math.min(.025,(t-last)/1000||0);last=t;drawBackground();if(running)update(dt);drawRings();drawGround();drawParticles(dt);drawBird();drawDebug();if(flash>0){ctx.fillStyle=`rgba(255,255,225,${flash})`;ctx.fillRect(0,0,W,H);flash-=dt}requestAnimationFrame(frame)}
  function begin(){initAudio();running=true;start.style.opacity='0';setTimeout(()=>start.style.display='none',500);const x=startingX(),surface=terrainAt(x);body.position={x,y:surface.y-CFG.characterRadius};body.velocity=mul(surface.tangent,285);body.state='Grounded';combo=1;landingQuality=0;seedRings(x);tone(440,.15,'triangle',.04);tone(660,.22,'sine',.025)}
  const down=e=>{if(e.target===sound)return;held=true;e.preventDefault()},up=e=>{held=false;e.preventDefault()};addEventListener('keydown',e=>{if(e.code==='Space')down(e);if(e.code==='KeyD'&&!e.repeat)debug=!debug});addEventListener('keyup',e=>{if(e.code==='Space')up(e)});canvas.addEventListener('pointerdown',down);addEventListener('pointerup',up);play.addEventListener('click',begin);sound.addEventListener('click',()=>{muted=!muted;sound.textContent=muted?'×':'♪';if(!muted)initAudio()});body.position.x=startingX();body.position.y=terrainAt(body.position.x).y-CFG.characterRadius;seedRings(body.position.x);requestAnimationFrame(frame);
})();
