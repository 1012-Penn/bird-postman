(() => {
  const canvas = document.querySelector('#game'), ctx = canvas.getContext('2d');
  const scoreEl = document.querySelector('#score'), comboEl = document.querySelector('#combo');
  const start = document.querySelector('#start'), play = document.querySelector('#play'), sound = document.querySelector('#sound');
  let W,H,dpr,held=false,released=false,running=false,muted=false,last=0,distance=0,speed=175,grounded=true,charge=0,combo=1,comboTimer=0,flash=0,particles=[],rings=[];
  const player={x:0,y:0,vy:0,angle:0};
  function resize(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)} addEventListener('resize',resize);resize();
  const hill=x=>H*.69+Math.sin(x*.007)*64+Math.sin(x*.015+1.4)*21+Math.sin(x*.0032+2)*47;
  const slope=x=>(hill(x+2)-hill(x-2))/4;
  let audio; function initAudio(){if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();audio.resume()}
  function tone(freq,d=.12,type='sine',vol=.035){if(muted||!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+d);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+d)}
  const worldX=x=>distance+x;
  function cloud(x,y,s){ctx.save();ctx.globalAlpha=.32;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,18*s,0,7);ctx.arc(x+24*s,y-8*s,25*s,0,7);ctx.arc(x+54*s,y,19*s,0,7);ctx.arc(x+26*s,y+9*s,27*s,0,7);ctx.fill();ctx.restore()}
  function drawBackground(){const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#73cfe2');sky.addColorStop(.58,'#b6e7d4');sky.addColorStop(1,'#f7dea8');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff1bc';ctx.beginPath();ctx.arc(W*.78,H*.16,42,0,7);ctx.fill();for(let i=-1;i<6;i++)cloud((i*260-distance*.12)%1500-120,80+(i%3)*57,.7+(i%2)*.34);ctx.fillStyle='#8abf9f';ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W;x+=12)ctx.lineTo(x,H*.63+Math.sin(worldX(x)*.002)*36);ctx.lineTo(W,H);ctx.fill()}
  function drawGround(){ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W+8;x+=8)ctx.lineTo(x,hill(worldX(x)));ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle='#5d9a79';ctx.fill();ctx.beginPath();for(let x=0;x<=W+8;x+=7)ctx.lineTo(x,hill(worldX(x)));ctx.strokeStyle='#d7eeaa';ctx.lineWidth=7;ctx.stroke();ctx.beginPath();for(let x=0;x<=W+8;x+=7)ctx.lineTo(x,hill(worldX(x))-2);ctx.strokeStyle='#77b582';ctx.lineWidth=2;ctx.stroke()}
  function drawBird(){const {x,y,angle}=player;ctx.save();ctx.translate(x,y);ctx.rotate(angle);if(grounded&&held){ctx.globalAlpha=.17+charge/1100;ctx.fillStyle='#fff4a8';ctx.beginPath();ctx.arc(0,4,25+charge*.035,0,7);ctx.fill();ctx.globalAlpha=1}ctx.fillStyle='#f28c73';ctx.beginPath();ctx.ellipse(0,0,19,16,0,0,7);ctx.fill();ctx.fillStyle='#f7b28e';ctx.beginPath();ctx.ellipse(4,7,11,6,0,0,7);ctx.fill();ctx.fillStyle='#e96f68';ctx.beginPath();ctx.ellipse(-6,3,11,7,-.55,0,7);ctx.fill();ctx.fillStyle='#f3c760';ctx.beginPath();ctx.moveTo(16,-1);ctx.lineTo(27,4);ctx.lineTo(16,7);ctx.closePath();ctx.fill();ctx.fillStyle='#344d5b';ctx.beginPath();ctx.arc(8,-6,2.7,0,7);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(9,-7,1,0,7);ctx.fill();ctx.restore()}
  function spawnDust(){for(let i=0;i<4;i++)particles.push({x:player.x-10,y:player.y+12,vx:-20-Math.random()*70,vy:-15-Math.random()*35,life:.6+Math.random()*.3,c:'#f8eab3'})}
  function drawParticles(dt){particles=particles.filter(p=>(p.life-=dt)>0);for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=50*dt;ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,7);ctx.fill()}ctx.globalAlpha=1}
  function seedRings(){rings=[];for(let i=1;i<22;i++){const x=i*540+220;rings.push({x,y:hill(x)-120-Math.random()*95,got:false})}}
  function drawRings(){for(const r of rings){const x=r.x-distance;if(x<-30||x>W+30||r.got)continue;ctx.save();ctx.translate(x,r.y);ctx.rotate(Math.sin((distance+r.x)*.008)*.14);ctx.strokeStyle='#fff0a6';ctx.lineWidth=6;ctx.shadowColor='#fff8b6';ctx.shadowBlur=11;ctx.beginPath();ctx.arc(0,0,17,0,7);ctx.stroke();ctx.restore()}}
  function update(dt){
    distance+=speed*dt; speed=Math.min(390,speed+dt*2); player.x=W*.29;
    const ground=hill(distance+player.x)-15, sl=slope(distance+player.x);
    if(grounded){
      player.y=ground;
      if(held){charge=Math.min(260,charge+(88+Math.max(0,sl)*260+speed*.13)*dt);speed=Math.min(430,speed+(8+Math.max(0,sl)*45)*dt);player.vy=sl*speed;if(Math.random()<dt*18)spawnDust()}
      else if(released&&charge>8){const impulse=105+charge*1.38+Math.max(0,-sl)*speed*.42;player.vy=-impulse;grounded=false;flash=.15;tone(470+Math.min(220,charge),.16,'triangle',.055);charge=0}
      else {player.vy=sl*speed;charge=Math.max(0,charge-dt*80)}
    } else {player.vy+=(held?1450:760)*dt;player.y+=player.vy*dt;if(player.y>=ground){if(Math.abs(player.vy)<230){combo++;comboTimer=1.3;flash=.23;tone(390+combo*55,.11,'triangle',.045)}grounded=true;player.y=ground;player.vy=0;speed=Math.min(430,speed+12*combo);spawnDust()}}
    released=false;player.angle=Math.atan2(player.vy,Math.max(speed,1))*.68;
    for(const r of rings)if(!r.got&&Math.abs((r.x-distance)-player.x)<27&&Math.abs(r.y-player.y)<29){r.got=true;combo++;comboTimer=1.5;speed+=18;flash=.2;tone(660,.13,'sine',.05)}
    comboTimer-=dt;if(comboTimer<=0)combo=Math.max(1,combo-1);scoreEl.textContent=String(Math.floor(distance/8)).padStart(4,'0');comboEl.textContent=`×${combo}`;
  }
  function frame(t){const dt=Math.min(.033,(t-last)/1000||0);last=t;drawBackground();if(running)update(dt);drawRings();drawGround();drawParticles(dt);drawBird();if(flash>0){ctx.fillStyle=`rgba(255,255,225,${flash})`;ctx.fillRect(0,0,W,H);flash-=dt}requestAnimationFrame(frame)}
  function begin(){initAudio();running=true;start.style.opacity='0';setTimeout(()=>start.style.display='none',500);distance=0;speed=175;combo=1;charge=0;grounded=true;player.y=hill(player.x)-15;player.vy=0;seedRings();tone(440,.15,'triangle',.04);tone(660,.22,'sine',.025)}
  const down=e=>{if(e.target===sound)return;held=true;e.preventDefault()},up=e=>{if(held)released=true;held=false;e.preventDefault()};addEventListener('keydown',e=>{if(e.code==='Space')down(e)});addEventListener('keyup',e=>{if(e.code==='Space')up(e)});canvas.addEventListener('pointerdown',down);addEventListener('pointerup',up);play.addEventListener('click',begin);sound.addEventListener('click',()=>{muted=!muted;sound.textContent=muted?'×':'♪';if(!muted)initAudio()});seedRings();player.x=W*.29;player.y=hill(player.x)-15;requestAnimationFrame(frame);
})();
