/* Rendering only. Gameplay physics remains in game.js. */
(() => {
  const THEME = {
    groundTop: '#79c96f', groundBottom: '#3c925e', grass: '#d7f38a', grassShade: '#8cce69',
    uiFill: 'rgba(255,255,245,.72)', uiInk: '#276d72', uiAccent: '#ff8a61', ring: '#ffec6d', wind: 'rgba(255,255,255,.7)'
  };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  class BackgroundRenderer {
    constructor() { this.scene = new Image(); this.scene.src = 'assets/scene-sky.png'; }
    draw(ctx, state) {
      const { width:w, height:h, camera } = state;
      if (!this.scene.complete || !this.scene.naturalWidth) {
        const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#62cae5'); sky.addColorStop(1, '#ffebb0'); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h); return;
      }
      const scale = Math.max(w / this.scene.naturalWidth, h / this.scene.naturalHeight);
      const imageW = this.scene.naturalWidth * scale, imageH = this.scene.naturalHeight * scale;
      const parallax = Math.sin(camera.x * .00022) * 18;
      ctx.drawImage(this.scene, (w - imageW) * .5 + parallax, (h - imageH) * .5, imageW, imageH);
    }
  }

  class TerrainRenderer {
    draw(ctx, state) {
      const { camera, width:w, height:h, terrainAt } = state;
      const left = camera.x - 10, right = camera.x + w / camera.zoom + 10, bottom = camera.y + h / camera.zoom + 20;
      const fill = ctx.createLinearGradient(0, camera.y, 0, bottom); fill.addColorStop(0, THEME.groundTop); fill.addColorStop(.45, '#59ad64'); fill.addColorStop(1, THEME.groundBottom);
      ctx.beginPath(); ctx.moveTo(left, bottom); for (let x = left; x <= right; x += 5) ctx.lineTo(x, terrainAt(x).y); ctx.lineTo(right, bottom); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      ctx.beginPath(); for (let x = left; x <= right; x += 5) ctx.lineTo(x, terrainAt(x).y); ctx.strokeStyle = THEME.grass; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); for (let x = left; x <= right; x += 5) ctx.lineTo(x, terrainAt(x).y + 2); ctx.strokeStyle = THEME.grassShade; ctx.lineWidth = 2; ctx.stroke();
    }
    drawRings(ctx, state) {
      const { camera, width:w, rings, time } = state;
      for (const ring of rings) {
        if (ring.got || ring.x < camera.x - 35 || ring.x > camera.x + w / camera.zoom + 35) continue;
        ctx.save(); ctx.translate(ring.x, ring.y); ctx.rotate(Math.sin(time * 2 + ring.x * .008) * .08);
        ctx.strokeStyle = THEME.ring; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#fff9ad'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
  }

  class CharacterRenderer {
    constructor() {
      this.frames = {};
      for (const name of ['rest', 'glide', 'flap', 'dive']) { const image = new Image(); image.src = `assets/bird-${name}.png`; this.frames[name] = image; }
    }
    selectFrame(state) {
      if (state.held) return this.frames.dive;
      if (state.body.state === 'Grounded') return this.frames.rest;
      return Math.floor(state.flapTime * 7) % 2 ? this.frames.flap : this.frames.glide;
    }
    drawFallback(ctx) { ctx.fillStyle = '#ffbc37'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); }
    draw(ctx, state) {
      const { body, terrainAt, held, impactTimer } = state, speed = Math.hypot(body.velocity.x, body.velocity.y);
      const angle = body.state === 'Grounded' ? terrainAt(body.position.x).slopeAngle : Math.atan2(body.velocity.y, body.velocity.x) * .62;
      const image = this.selectFrame(state), width = 94 + clamp(speed / 950, 0, 1) * 12;
      ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(angle + (held ? .18 : 0)); ctx.scale(1 + impactTimer * .22, 1 - impactTimer * .18);
      if (image.complete && image.naturalWidth) { const height = width * image.naturalHeight / image.naturalWidth; ctx.drawImage(image, -width * .5, -height * .5, width, height); } else this.drawFallback(ctx);
      ctx.restore();
    }
  }

  class EffectsRenderer {
    spawnDust(particles, position, speed, kind = 'land') {
      const count = kind === 'launch' ? 6 : 4;
      for (let i = 0; i < count; i++) particles.push({ x: position.x - 8, y: position.y + 10, vx: -30 - Math.random() * (kind === 'launch' ? 85 : 50), vy: -12 - Math.random() * 32, life: .35 + Math.random() * .28, size: 2 + Math.random() * 2, kind });
    }
    update(particles, trail, body, dt) {
      for (const particle of particles) { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 48 * dt; particle.life -= dt; }
      for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
      trail.unshift({ x: body.position.x, y: body.position.y, life: .30 }); if (trail.length > 11) trail.pop(); for (const point of trail) point.life -= dt;
      while (trail.length && trail[trail.length - 1].life <= 0) trail.pop();
    }
    draw(ctx, state) {
      const { particles, trail, body } = state, speed = Math.hypot(body.velocity.x, body.velocity.y);
      if (speed > 340) { ctx.save(); ctx.lineCap = 'round'; for (let i = trail.length - 1; i > 0; i--) { const a = trail[i], b = trail[i - 1]; ctx.globalAlpha = a.life * .45; ctx.strokeStyle = THEME.wind; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } ctx.restore(); }
      for (const particle of particles) { ctx.save(); ctx.globalAlpha = clamp(particle.life * 2.5, 0, 1); ctx.fillStyle = particle.kind === 'launch' ? '#ffffff' : '#e8f6a5'; ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    }
  }

  class UIRenderer {
    pill(ctx, x, y, w, h) { ctx.fillStyle = THEME.uiFill; ctx.beginPath(); ctx.roundRect(x, y, w, h, h * .5); ctx.fill(); }
    draw(ctx, state) {
      const { width:w, height:h, score, combo, body } = state, speed = Math.round(Math.hypot(body.velocity.x, body.velocity.y));
      ctx.save(); ctx.fillStyle = THEME.uiInk; this.pill(ctx, 22, 20, 126, 32); ctx.font = '700 13px system-ui, sans-serif'; ctx.fillText('风筝邮差', 38, 41);
      this.pill(ctx, w - 164, 20, 142, 34); ctx.font = '700 12px system-ui, sans-serif'; ctx.fillText(`${String(score).padStart(4, '0')}  ×${combo}`, w - 145, 42);
      this.pill(ctx, 22, h - 48, 154, 27); ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText(`${body.state === 'Airborne' ? '滑翔中' : '贴坡滑行'} · ${speed} px/s`, 37, h - 30); ctx.restore();
    }
    drawDebug(ctx, state) {
      if (!state.debug) return; const { body, terrainAt, camera, height:h, landingQuality, landingAngle } = state, p = { x: (body.position.x - camera.x) * camera.zoom, y: (body.position.y - camera.y) * camera.zoom }, s = terrainAt(body.position.x);
      ctx.save(); ctx.font = '12px ui-monospace, monospace'; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + body.velocity.x * .16 * camera.zoom, p.y + body.velocity.y * .16 * camera.zoom); ctx.stroke();
      ctx.strokeStyle = '#65f0df'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + s.tangent.x * 46 * camera.zoom, p.y + s.tangent.y * 46 * camera.zoom); ctx.stroke();
      ctx.strokeStyle = '#ff8fab'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + s.normal.x * 46 * camera.zoom, p.y + s.normal.y * 46 * camera.zoom); ctx.stroke();
      ctx.fillStyle = '#185a61'; this.pill(ctx, 22, h - 142, 216, 74); ctx.fillStyle = '#185a61'; ctx.fillText(`STATE ${body.state}`, 37, h - 118); ctx.fillText(`quality ${(landingQuality * 100).toFixed(0)}%`, 37, h - 96); ctx.fillText(`impact ${landingAngle.toFixed(0)}° · D debug`, 37, h - 74); ctx.restore();
    }
  }

  class Renderer {
    constructor(ctx) { this.ctx = ctx; this.background = new BackgroundRenderer(); this.terrain = new TerrainRenderer(); this.character = new CharacterRenderer(); this.effects = new EffectsRenderer(); this.ui = new UIRenderer(); }
    render(state) {
      const ctx = this.ctx, { width:w, height:h, body, camera, impactTimer } = state; ctx.clearRect(0, 0, w, h); this.background.draw(ctx, state);
      const shake = impactTimer > .02 ? impactTimer * 1.4 : 0; ctx.save(); ctx.translate(w * .30 + (Math.random() - .5) * shake, h * .54 + (Math.random() - .5) * shake); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-body.position.x, -body.position.y);
      this.terrain.draw(ctx, state); this.terrain.drawRings(ctx, state); this.effects.draw(ctx, state); this.character.draw(ctx, state); ctx.restore(); this.ui.draw(ctx, state); this.ui.drawDebug(ctx, state);
      if (state.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${state.flash})`; ctx.fillRect(0, 0, w, h); }
    }
  }
  window.GameRenderer = Renderer;
})();
