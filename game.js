(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const start = document.querySelector('#start');
  const play = document.querySelector('#play');
  const sound = document.querySelector('#sound');
  const restart = document.querySelector('#restart');

  // Physics tuning remains separate from the visual theme in renderer.js.
  const CFG = {
    gravity: 826, diveGravityMultiplier: 4.2, glideLift: 245, glideSpeedLiftFactor: .34, glideSpeedLiftMax: 450, flapLift: 70,
    groundFriction: .085, airDrag: .16, maxSpeed: 950,
    slopeAccelerationMultiplier: 1.12, takeoffThreshold: .82,
    terrainAmplitude: 62.5, terrainWavelength: 620, characterRadius: 16,
    groundDiveMultiplier: 2.8, groundGlideMultiplier: .9, uphillResistanceMultiplier: .70, minGroundSpeed: 37.5, diveSoftCap: 1150, diveMinimumMultiplier: 1.1,
    groundAdhesion: 1.25, diveAdhesion: 2.8, landingBonus: .12,
    takeoffSpeed: 430, crestLookAhead: .13, launchVelocityFactor: .12, minCameraZoom: .62, zoomAltitude: 1050
  };

  let W, H, dpr, last = 0, time = 0, running = false, held = false, muted = false, debug = false;
  let flash = 0, combo = 1, comboTimer = 0, landingQuality = 0, landingAngle = 0, momentumFloor = 285;
  let airborneTime = 0, flapTime = 0, chirped = false, impactTimer = 0, audio;
  const particles = [], trail = [], rings = [];
  const body = { position: { x: 160, y: 0 }, velocity: { x: 160, y: 0 }, state: 'Grounded' };
  const camera = { x: 0, y: 0, zoom: 1 };
  let renderer;

  // Original 93 BPM 6/8 acoustic-style score. It is generated from a new motif and can
  // later be replaced by an optional project-local assets/music/original-loop.ogg file.
  class MusicDirector {
    constructor() { this.context = null; this.timer = null; this.master = null; this.nextTime = 0; this.step = 0; this.intensity = 0; this.airborne = false; this.combo = 1; this.muted = false; this.loopTrack = null; this.usingLoop = false; }
    start(context) {
      if (this.timer) return;
      this.context = context; this.master = context.createGain(); this.master.gain.value = .72; this.master.connect(context.destination); this.nextTime = context.currentTime + .12;
      this.timer = setInterval(() => this.schedule(), 70); this.tryLoadOriginalLoop();
    }
    tryLoadOriginalLoop() {
      fetch('assets/music/original-loop.ogg', { method: 'HEAD' }).then(response => {
        if (!response.ok) return;
        const track = new Audio('assets/music/original-loop.ogg'); track.loop = true; track.volume = .38; track.muted = this.muted;
        track.play().then(() => { this.loopTrack = track; this.usingLoop = true; }).catch(() => {});
      }).catch(() => {});
    }
    setMuted(value) { this.muted = value; if (this.master && this.context) this.master.gain.setTargetAtTime(value ? .0001 : .72, this.context.currentTime, .03); if (this.loopTrack) this.loopTrack.muted = value; }
    update(speed, airborne, combo) { const target = clamp((speed - 140) / 730, 0, 1); this.intensity += (target - this.intensity) * .08; this.airborne = airborne; this.combo = combo; }
    voice(freq, when, duration, volume, tone = 'triangle') {
      if (this.muted || !this.context || !this.master) return;
      const oscillator = this.context.createOscillator(), gain = this.context.createGain(), filter = this.context.createBiquadFilter();
      oscillator.type = tone; oscillator.frequency.setValueAtTime(freq, when); filter.type = 'lowpass'; filter.frequency.value = tone === 'sine' ? 2500 : 1800;
      gain.gain.setValueAtTime(.0001, when); gain.gain.exponentialRampToValueAtTime(volume, when + .012); gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
      oscillator.connect(filter).connect(gain).connect(this.master); oscillator.start(when); oscillator.stop(when + duration + .04);
    }
    pluck(freq, when, duration, volume) {
      this.voice(freq, when, duration, volume, 'triangle'); this.voice(freq * 2, when, duration * .42, volume * .18, 'sine');
    }
    shaker(when, volume) {
      if (this.muted || !this.context || !this.master) return;
      const buffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * .04), this.context.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain(); source.buffer = buffer; filter.type = 'highpass'; filter.frequency.value = 4200; gain.gain.setValueAtTime(volume, when); gain.gain.exponentialRampToValueAtTime(.0001, when + .05); source.connect(filter).connect(gain).connect(this.master); source.start(when);
    }
    schedule() {
      if (!this.context || this.usingLoop) return;
      const interval = 60 / 93 / 3, scale = [196.0, 220.0, 246.94, 293.66, 329.63, 392.0], motif = [0, 2, 3, 2, 1, 4, 3, 1, 2, 5, 3, 2, 0, 1, 4, 2, 3, 1];
      while (this.nextTime < this.context.currentTime + .18) {
        const index = this.step % motif.length, note = scale[motif[index]];
        this.pluck(note, this.nextTime, interval * .9, .013 + this.intensity * .012);
        if (index % 3 === 0) this.pluck(scale[Math.max(0, motif[index] - 1)] * .5, this.nextTime, interval * 2.5, .012);
        if (this.intensity > .28 && index % 3 === 1) this.shaker(this.nextTime, .006 + this.intensity * .009);
        if (this.intensity > .52 && index % 6 === 4) this.voice(note * (this.airborne ? 2 : 1.5), this.nextTime + .02, interval * .55, .006 + this.combo * .0015, 'sine');
        this.step++; this.nextTime += interval;
      }
    }
  }
  const soundtrack = new MusicDirector();

  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const mag = v => Math.hypot(v.x, v.y);
  const mul = (v, n) => ({ x: v.x * n, y: v.y * n });
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const norm = v => { const m = mag(v) || 1; return { x: v.x / m, y: v.y / m }; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize); resize(); renderer = new GameRenderer(ctx);

  function terrainY(x) {
    const p = ((x % CFG.terrainWavelength) + CFG.terrainWavelength) % CFG.terrainWavelength / CFG.terrainWavelength;
    return H * .65 - CFG.terrainAmplitude * Math.cos(p * Math.PI * 2);
  }
  function terrainAt(x) {
    const y = terrainY(x), eps = 2;
    const dydx = (terrainY(x + eps) - terrainY(x - eps)) / (eps * 2);
    const tangent = norm({ x: 1, y: dydx });
    const normal = { x: tangent.y, y: -tangent.x };
    const second = (terrainY(x + eps) - 2 * y + terrainY(x - eps)) / (eps * eps);
    return { y, tangent, normal, slopeAngle: Math.atan2(dydx, 1), curvature: second / Math.pow(1 + dydx * dydx, 1.5) };
  }
  const startingX = () => CFG.terrainWavelength * .30;

  function initAudio() { if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); soundtrack.start(audio); }
  function tone(freq, duration = .12, type = 'sine', volume = .035) {
    if (muted || !audio) return;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = type; oscillator.frequency.value = freq; gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration);
  }
  function cuteChirp() {
    if (muted || !audio) return;
    const patterns = [[820, 1250], [1050, 760], [670, 1090], [1320, 980], [910, 1510]];
    const [a, b] = patterns[Math.floor(Math.random() * patterns.length)], now = audio.currentTime;
    const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(a, now); oscillator.frequency.exponentialRampToValueAtTime(b, now + .13); oscillator.frequency.exponentialRampToValueAtTime(a * 1.08, now + .25);
    gain.gain.setValueAtTime(.055, now); gain.gain.exponentialRampToValueAtTime(.001, now + .31); oscillator.connect(gain).connect(audio.destination); oscillator.start(now); oscillator.stop(now + .32);
  }

  function seedRings(origin = body.position.x) {
    rings.length = 0;
    for (let i = 1; i < 30; i++) { const x = origin + 160 + i * 430; rings.push({ x, y: terrainAt(x).y - 110 - Math.random() * 100, got: false }); }
  }
  function emit(kind) { renderer.effects.spawnDust(particles, body.position, mag(body.velocity), kind); }

  function land(surface) {
    const arrival = body.velocity, arrivalSpeed = mag(arrival), tangent = surface.tangent;
    const forwardAlignment = clamp(arrivalSpeed ? dot(norm(arrival), tangent) : 0, 0, 1);
    landingAngle = Math.acos(forwardAlignment) * 180 / Math.PI; landingQuality = forwardAlignment;
    const baseRetention = Math.pow(forwardAlignment, 1.15);
    const retention = surface.tangent.y > 0 ? 1 - (1 - baseRetention) * .25 : baseRetention;
    const tangentSpeed = Math.max(0, dot(arrival, tangent));
    const bonus = landingQuality > .82 ? 1 + CFG.landingBonus * (landingQuality - .82) / .18 : 1;
    const keptSpeed = Math.min(CFG.maxSpeed, Math.max(momentumFloor, tangentSpeed) * retention * bonus);
    body.velocity = mul(tangent, keptSpeed); momentumFloor = keptSpeed; body.position.y = surface.y - CFG.characterRadius; body.state = 'Grounded'; emit('land');
    if (landingQuality < .12) { combo = 1; flash = .18; impactTimer = .34; tone(120, .13, 'sine', .045); }
    else if (landingQuality > .68) { combo++; comboTimer = 1.25; flash = .10; impactTimer = .08; tone(370 + landingQuality * 260, .1, 'triangle', .045); }
    else { combo = 1; impactTimer = .16; tone(180, .08, 'sine', .025); }
  }
  function updateGround(dt, surface) {
    let speed = Math.max(0, dot(body.velocity, surface.tangent));
    const gravityTangent = CFG.gravity * surface.tangent.y * CFG.slopeAccelerationMultiplier;
    const posture = held ? lerp(CFG.groundDiveMultiplier, CFG.diveMinimumMultiplier, clamp(speed / CFG.diveSoftCap, 0, 1)) : CFG.groundGlideMultiplier;
    const slopeForce = surface.tangent.y < 0 ? gravityTangent * CFG.uphillResistanceMultiplier : gravityTangent * posture;
    speed = clamp(speed + (slopeForce - CFG.groundFriction * speed) * dt, CFG.minGroundSpeed, CFG.maxSpeed);
    const requiredDown = speed * speed * Math.max(0, surface.curvature);
    const availableDown = CFG.gravity * (-surface.normal.y) * (held ? CFG.diveAdhesion : CFG.groundAdhesion);
    const ahead = terrainAt(body.position.x + Math.max(35, speed * CFG.crestLookAhead));
    const approachingCrest = surface.tangent.y < -.04 && ahead.tangent.y >= 0;
    const forcedLaunch = approachingCrest && speed >= CFG.takeoffSpeed;
    if ((surface.curvature > 0 && requiredDown > availableDown / CFG.takeoffThreshold) || forcedLaunch) {
      body.velocity = mul(surface.tangent, speed); if (forcedLaunch) body.velocity.y -= 70 + (speed - CFG.takeoffSpeed) * CFG.launchVelocityFactor;
      momentumFloor = speed; body.state = 'Airborne'; return;
    }
    body.position.x += surface.tangent.x * speed * dt; const next = terrainAt(body.position.x); body.position.y = next.y - CFG.characterRadius; body.velocity = mul(next.tangent, speed);
    if (held && Math.random() < dt * 17) emit('slide');
  }
  function updateAir(dt) {
    const acceleration = { x: -body.velocity.x * CFG.airDrag, y: CFG.gravity - body.velocity.y * CFG.airDrag };
    if (held) acceleration.y += CFG.gravity * (CFG.diveGravityMultiplier - 1);
    else { const speed = mag(body.velocity), pulse = (Math.sin(flapTime * 15) + 1) * .5; acceleration.y -= CFG.glideLift + Math.min(CFG.glideSpeedLiftMax, speed * CFG.glideSpeedLiftFactor) + CFG.flapLift * pulse; }
    body.velocity = add(body.velocity, mul(acceleration, dt)); const speed = mag(body.velocity); if (speed > CFG.maxSpeed) body.velocity = mul(norm(body.velocity), CFG.maxSpeed);
    body.position = add(body.position, mul(body.velocity, dt)); const surface = terrainAt(body.position.x);
    if (body.position.y + CFG.characterRadius >= surface.y && body.velocity.y > 0) land(surface);
  }
  function update(dt) {
    const priorState = body.state, surface = terrainAt(body.position.x);
    if (body.state === 'Grounded') updateGround(dt, surface); else updateAir(dt);
    if (priorState === 'Grounded' && body.state === 'Airborne') emit('launch');
    if (body.state === 'Airborne') { airborneTime += dt; if (!held) flapTime += dt; if (airborneTime >= 1 && !chirped) { chirped = true; cuteChirp(); } }
    else { airborneTime = 0; chirped = false; }
    soundtrack.update(mag(body.velocity), body.state === 'Airborne', combo);
    impactTimer = Math.max(0, impactTimer - dt); flash = Math.max(0, flash - dt); comboTimer -= dt; if (comboTimer <= 0) combo = Math.max(1, combo - 1);
    const altitude = Math.max(0, terrainAt(body.position.x).y - (body.position.y + CFG.characterRadius));
    const targetZoom = body.state === 'Airborne' ? clamp(1 - altitude / CFG.zoomAltitude * (1 - CFG.minCameraZoom), CFG.minCameraZoom, 1) : 1;
    camera.zoom += Math.min(1, dt * 3) * (targetZoom - camera.zoom); camera.x = body.position.x - W * .30 / camera.zoom; camera.y = body.position.y - H * .54 / camera.zoom;
    for (const ring of rings) if (!ring.got && Math.abs(ring.x - body.position.x) < 27 && Math.abs(ring.y - body.position.y) < 30) { ring.got = true; combo++; comboTimer = 1.5; flash = .12; tone(660, .13, 'sine', .05); }
  }

  function render(dt) {
    renderer.effects.update(particles, trail, body, dt);
    renderer.render({ width: W, height: H, camera, body, held, flapTime, impactTimer, particles, trail, rings, terrainAt, time, flash, debug, score: Math.floor(body.position.x / 8), combo, landingQuality, landingAngle });
  }
  function frame(now) { const dt = Math.min(.025, (now - last) / 1000 || 0); last = now; time += dt; if (running) update(dt); render(dt); requestAnimationFrame(frame); }

  function resetGame() {
    const x = startingX(), surface = terrainAt(x); body.position = { x, y: surface.y - CFG.characterRadius }; body.velocity = mul(surface.tangent, 285); body.state = 'Grounded';
    momentumFloor = 285; combo = 1; landingQuality = 0; landingAngle = 0; airborneTime = 0; flapTime = 0; chirped = false; impactTimer = 0; particles.length = 0; trail.length = 0; seedRings(x); tone(440, .15, 'triangle', .04); tone(660, .22, 'sine', .025);
  }
  function begin() { initAudio(); running = true; start.classList.add('is-hidden'); resetGame(); }
  const down = event => { if (event.target === sound || event.target === restart) return; held = true; event.preventDefault(); };
  const up = event => { held = false; event.preventDefault(); };
  addEventListener('keydown', event => { if (event.code === 'Space') down(event); if (event.code === 'KeyD' && !event.repeat) debug = !debug; });
  addEventListener('keyup', event => { if (event.code === 'Space') up(event); });
  canvas.addEventListener('pointerdown', down); addEventListener('pointerup', up); addEventListener('pointerleave', up);
  play.addEventListener('click', begin); restart.addEventListener('click', () => { initAudio(); running = true; resetGame(); });
  sound.addEventListener('click', () => { muted = !muted; soundtrack.setMuted(muted); sound.textContent = muted ? '×' : '♪'; if (!muted) initAudio(); });
  body.position.x = startingX(); body.position.y = terrainAt(body.position.x).y - CFG.characterRadius; camera.x = body.position.x - W * .3; camera.y = body.position.y - H * .54; seedRings(body.position.x); requestAnimationFrame(frame);
})();
