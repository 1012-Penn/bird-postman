/* Visual layer only: it reads game state but never changes physics. */
(() => {
  const THEME = {
    skyTop: '#77c6de', skyMid: '#c8e7d8', skyBottom: '#f8e4bd',
    sun: '#ffe4a1', cloud: '#fffaf0',
    hills: [
      { color: '#c9e6d5', line: '#e5f3dd', speed: .10, base: .66, amp: 42, wave: 510 },
      { color: '#a9d5bd', line: '#d6ead2', speed: .20, base: .73, amp: 58, wave: 420 },
      { color: '#83bd9d', line: '#bfe0b6', speed: .34, base: .81, amp: 46, wave: 330 }
    ],
    groundTop: '#afd98a', groundBottom: '#4b947a', grassLight: '#edf7b6', grassShade: '#6cae79',
    birdBody: '#ef8876', birdBelly: '#ffcf9b', birdWing: '#ca6772', birdWingLight: '#f29a84', birdBeak: '#efb95f', ink: '#334d59',
    panel: 'rgba(255,255,250,.74)', panelInk: '#467274', panelAccent: '#ef9271', ring: '#fff2a4'
  };

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  class BackgroundRenderer {
    cloud(ctx, x, y, s, alpha = .78) {
      ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = THEME.cloud;
      ctx.beginPath(); ctx.arc(x, y, 18 * s, 0, Math.PI * 2); ctx.arc(x + 25 * s, y - 10 * s, 27 * s, 0, Math.PI * 2);
      ctx.arc(x + 58 * s, y, 21 * s, 0, Math.PI * 2); ctx.arc(x + 31 * s, y + 11 * s, 29 * s, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    hillPath(ctx, w, h, cameraX, layer) {
      const left = -80, right = w + 80, offset = cameraX * layer.speed;
      ctx.beginPath(); ctx.moveTo(left, h);
      for (let x = left; x <= right; x += 8) {
        const v = (x + offset) / layer.wave;
        const y = h * layer.base + Math.sin(v) * layer.amp + Math.sin(v * 2.17 + 1.4) * layer.amp * .22;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(right, h); ctx.closePath();
    }
    draw(ctx, state) {
      const { width:w, height:h, camera } = state;
      const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, THEME.skyTop); sky.addColorStop(.58, THEME.skyMid); sky.addColorStop(1, THEME.skyBottom);
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.globalAlpha = .09; ctx.fillStyle = '#fffaf0';
      for (let y = 10; y < h; y += 19) for (let x = (y * 7) % 23; x < w; x += 29) ctx.fillRect(x, y, 1, 1);
      ctx.restore();
      ctx.save(); ctx.globalAlpha = .35; ctx.fillStyle = '#fff8d1'; ctx.beginPath(); ctx.arc(w * .78, h * .17, 64, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = THEME.sun; ctx.beginPath(); ctx.arc(w * .78, h * .17, 40, 0, Math.PI * 2); ctx.fill();
      for (let i = -1; i < 7; i++) this.cloud(ctx, ((i * 230 - camera.x * .07) % 1550 + 1550) % 1550 - 150, 78 + (i % 3) * 56, .62 + (i % 2) * .32, .54);
      for (const layer of THEME.hills) { this.hillPath(ctx, w, h, camera.x, layer); ctx.fillStyle = layer.color; ctx.fill(); ctx.save(); ctx.globalAlpha = .54; ctx.strokeStyle = layer.line; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
      ctx.save(); ctx.globalAlpha = .48; ctx.strokeStyle = '#fff9dd'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const x = ((w * .17 + i * 96 - camera.x * .05) % (w + 140)) - 30; const y = h * .27 + i * 16; ctx.beginPath(); ctx.arc(x, y, 5, Math.PI * 1.18, Math.PI * 1.8); ctx.arc(x + 11, y - 2, 4, Math.PI * 1.15, Math.PI * 1.8); ctx.stroke(); }
      ctx.restore();
    }
  }

  class TerrainRenderer {
    draw(ctx, state) {
      const { camera, width:w, height:h, terrainAt } = state;
      const left = camera.x - 12, right = camera.x + w / camera.zoom + 12, bottom = camera.y + h / camera.zoom + 24;
      const fill = ctx.createLinearGradient(0, camera.y, 0, bottom); fill.addColorStop(0, THEME.groundTop); fill.addColorStop(.55, '#79ba7f'); fill.addColorStop(1, THEME.groundBottom);
      ctx.beginPath(); ctx.moveTo(left, bottom);
      for (let x = left; x <= right; x += 6) ctx.lineTo(x, terrainAt(x).y);
      ctx.lineTo(right, bottom); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      ctx.beginPath(); for (let x = left; x <= right; x += 6) ctx.lineTo(x, terrainAt(x).y); ctx.strokeStyle = THEME.grassLight; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); for (let x = left; x <= right; x += 6) ctx.lineTo(x, terrainAt(x).y + 2); ctx.strokeStyle = THEME.grassShade; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.globalAlpha = .22; ctx.strokeStyle = '#f7ffd0'; ctx.lineWidth = 2;
      for (let x = Math.ceil(left / 62) * 62; x < right; x += 62) { const y = terrainAt(x).y + 17; ctx.beginPath(); ctx.arc(x, y, 14, Math.PI * 1.12, Math.PI * 1.82); ctx.stroke(); }
      ctx.restore();
    }
    drawRings(ctx, state) {
      const { camera, width:w, rings, time } = state;
      for (const r of rings) {
        if (r.got || r.x < camera.x - 40 || r.x > camera.x + w / camera.zoom + 40) continue;
        ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(Math.sin(time * 2 + r.x * .008) * .13); ctx.shadowColor = '#fff7a9'; ctx.shadowBlur = 13;
        ctx.strokeStyle = THEME.ring; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = .4; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
  }

  class CharacterRenderer {
    draw(ctx, state) {
      const { body, terrainAt, held, flapTime, impactTimer } = state, speed = Math.hypot(body.velocity.x, body.velocity.y);
      const gliding = body.state === 'Airborne' && !held;
      const baseAngle = body.state === 'Grounded' ? terrainAt(body.position.x).slopeAngle : Math.atan2(body.velocity.y, body.velocity.x) * .62;
      const pose = held ? .24 : (gliding ? -.1 : 0); const squash = 1 - impactTimer * .18;
      ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(baseAngle + pose); ctx.scale(1 + impactTimer * .2, squash);
      if (held && body.state === 'Grounded') { ctx.globalAlpha = .18; ctx.fillStyle = '#fff5a8'; ctx.beginPath(); ctx.arc(0, 5, 24 + Math.min(20, speed * .02), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.fillStyle = '#bd5f69'; ctx.beginPath(); ctx.moveTo(-17, 3); ctx.lineTo(-31, -4); ctx.lineTo(-23, 10); ctx.lineTo(-34, 13); ctx.lineTo(-16, 14); ctx.closePath(); ctx.fill();
      const wingAngle = gliding ? -.72 + Math.sin(flapTime * 14) * .78 : (held ? .67 : .26);
      ctx.save(); ctx.rotate(wingAngle); ctx.fillStyle = THEME.birdWing; ctx.beginPath(); ctx.moveTo(-7, 1); ctx.bezierCurveTo(-27, -15, -35, -3, -28, 9); ctx.bezierCurveTo(-18, 16, -6, 10, -3, 5); ctx.closePath(); ctx.fill(); ctx.fillStyle = THEME.birdWingLight; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.bezierCurveTo(-22, -8, -27, -2, -20, 6); ctx.bezierCurveTo(-14, 9, -8, 6, -5, 4); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.fillStyle = THEME.birdBody; ctx.beginPath(); ctx.ellipse(-3, 2, 19, 15, -.04, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f59b82'; ctx.beginPath(); ctx.arc(8, -7, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = THEME.birdBelly; ctx.beginPath(); ctx.ellipse(4, 8, 11, 6, .08, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#687a90'; ctx.beginPath(); ctx.roundRect(-8, 8, 13, 8, 3); ctx.fill(); ctx.strokeStyle = '#f6dd9c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-3, 7); ctx.lineTo(2, 15); ctx.stroke();
      ctx.fillStyle = THEME.birdBeak; ctx.beginPath(); ctx.moveTo(19, -7); ctx.lineTo(31, -2); ctx.lineTo(19, 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = THEME.ink; ctx.beginPath(); ctx.arc(12, -11, 2.8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(13, -12, 1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e98780'; ctx.beginPath(); ctx.arc(14, -4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  class EffectsRenderer {
    spawnDust(particles, position, speed, kind = 'land') {
      const count = kind === 'launch' ? 8 : 5;
      for (let i = 0; i < count; i++) particles.push({ x: position.x - 8, y: position.y + 12, vx: -20 - Math.random() * (kind === 'launch' ? 105 : 65), vy: -12 - Math.random() * 42, life: .45 + Math.random() * .38, size: 2 + Math.random() * 3, kind, color: kind === 'launch' ? '#f9f2c7' : '#ecf0af' });
    }
    update(particles, trail, body, dt) {
      for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 42 * dt; p.life -= dt; }
      for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
      trail.unshift({ x: body.position.x, y: body.position.y, life: .42 }); if (trail.length > 18) trail.pop();
      for (const t of trail) t.life -= dt; while (trail.length && trail[trail.length - 1].life <= 0) trail.pop();
    }
    draw(ctx, state) {
      const { particles, trail, body } = state, speed = Math.hypot(body.velocity.x, body.velocity.y);
      if (speed > 280 && trail.length > 2) { ctx.save(); ctx.lineCap = 'round'; for (let i = trail.length - 1; i >= 1; i--) { const a = trail[i], b = trail[i - 1], alpha = a.life * .2 * clamp(speed / 950, .2, 1); ctx.strokeStyle = `rgba(255,255,238,${alpha})`; ctx.lineWidth = 2 + i * .12; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } ctx.restore(); }
      for (const p of particles) { ctx.save(); ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * .62, .2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    }
  }

  class UIRenderer {
    panel(ctx, x, y, w, h) { ctx.save(); ctx.fillStyle = THEME.panel; ctx.shadowColor = 'rgba(61,111,104,.15)'; ctx.shadowBlur = 15; ctx.beginPath(); ctx.roundRect(x, y, w, h, 16); ctx.fill(); ctx.restore(); }
    draw(ctx, state) {
      const { width:w, score, combo, body } = state, speed = Math.round(Math.hypot(body.velocity.x, body.velocity.y));
      this.panel(ctx, 22, 20, 152, 56); ctx.fillStyle = THEME.panelInk; ctx.font = '700 15px system-ui, sans-serif'; ctx.fillText('风筝邮差', 38, 43); ctx.font = '600 10px system-ui, sans-serif'; ctx.globalAlpha = .72; ctx.fillText('PASTEL FLIGHT', 39, 60); ctx.globalAlpha = 1;
      this.panel(ctx, w - 184, 20, 142, 56); ctx.fillStyle = THEME.panelInk; ctx.font = '600 10px system-ui, sans-serif'; ctx.fillText('今日里程', w - 166, 40); ctx.font = '800 23px system-ui, sans-serif'; ctx.fillText(String(score).padStart(4, '0'), w - 166, 63); ctx.fillStyle = THEME.panelAccent; ctx.font = '800 16px system-ui, sans-serif'; ctx.fillText(`×${combo}`, w - 91, 62);
      this.panel(ctx, 22, state.height - 66, 168, 38); ctx.fillStyle = THEME.panelInk; ctx.font = '600 12px system-ui, sans-serif'; ctx.fillText(`${body.state === 'Airborne' ? '滑翔中' : '贴坡滑行'}  ·  ${speed} px/s`, 38, state.height - 42);
    }
    drawDebug(ctx, state) {
      if (!state.debug) return; const { body, terrainAt, camera, width:w, height:h, landingQuality, landingAngle } = state, p = { x: (body.position.x - camera.x) * camera.zoom, y: (body.position.y - camera.y) * camera.zoom }, s = terrainAt(body.position.x), v = body.velocity;
      const line = (vec, color, label) => { ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + vec.x, p.y + vec.y); ctx.stroke(); ctx.fillText(label, p.x + vec.x + 4, p.y + vec.y + 4); };
      ctx.save(); ctx.font = '12px ui-monospace, monospace'; line({ x: v.x * .16 * camera.zoom, y: v.y * .16 * camera.zoom }, '#fff', 'v'); line({ x: s.tangent.x * 48 * camera.zoom, y: s.tangent.y * 48 * camera.zoom }, '#65f0df', 't'); line({ x: s.normal.x * 48 * camera.zoom, y: s.normal.y * 48 * camera.zoom }, '#ff8fab', 'n');
      this.panel(ctx, 22, h - 180, 220, 96); ctx.fillStyle = THEME.panelInk; ctx.fillText(`STATE  ${body.state}`, 38, h - 156); ctx.fillText(`quality  ${(landingQuality * 100).toFixed(0)}%`, 38, h - 135); ctx.fillText(`impact  ${landingAngle.toFixed(0)}°`, 38, h - 114); ctx.fillText(`zoom  ${camera.zoom.toFixed(2)}  ·  D debug`, 38, h - 93); ctx.restore();
    }
  }

  class Renderer {
    constructor(ctx) { this.ctx = ctx; this.background = new BackgroundRenderer(); this.terrain = new TerrainRenderer(); this.character = new CharacterRenderer(); this.effects = new EffectsRenderer(); this.ui = new UIRenderer(); }
    render(state) {
      const ctx = this.ctx, { width:w, height:h, body, camera, impactTimer } = state; ctx.clearRect(0, 0, w, h); this.background.draw(ctx, state);
      const shake = impactTimer > .02 ? impactTimer * 2.2 : 0; ctx.save(); ctx.translate(w * .3 + (Math.random() - .5) * shake, h * .54 + (Math.random() - .5) * shake); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-body.position.x, -body.position.y);
      this.terrain.draw(ctx, state); this.terrain.drawRings(ctx, state); this.effects.draw(ctx, state); this.character.draw(ctx, state); ctx.restore(); this.ui.draw(ctx, state); this.ui.drawDebug(ctx, state);
      if (state.flash > 0) { ctx.fillStyle = `rgba(255,255,243,${state.flash})`; ctx.fillRect(0, 0, w, h); }
    }
  }
  window.GameRenderer = Renderer; window.GameTheme = THEME;
})();
