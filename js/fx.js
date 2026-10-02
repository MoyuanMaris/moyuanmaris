/* =========================================================
 *  fx.js —— 背景动态效果（Canvas，无任何外部依赖）
 *    1) 动态光晕：几团缓慢游动的柔和光斑
 *    2) 鼠标光晕：跟随指针的柔光
 *    3) 几何尾随：鼠标划过时散出的圆 / 方 / 三角
 *    4) 漂浮几何：背景里慢慢飘的线框图形，靠近指针会被推开
 *  开关都在 js/config.js 的 effects 里；手机上自动只保留背景部分。
 * ========================================================= */
(function () {
  'use strict';

  var CFG = window.SITE_CONFIG || {};
  var EFF = CFG.effects || {};
  if (EFF.enabled === false) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var canvas = document.getElementById('fx');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var K = typeof EFF.intensity === 'number' ? EFF.intensity : 1;   // 整体浓度
  var fine = window.matchMedia ? window.matchMedia('(pointer: fine)').matches : true;

  var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  var blobs = [], floaters = [], particles = [];
  var mouse = { x: 0, y: 0, seen: false, moved: false, lastSpawn: 0, lastMove: 0 };
  var glow = { x: 0, y: 0, a: 0 };
  var last = 0, raf = null, running = false;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }

  /* ---------------- 尺寸 ---------------- */
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildBlobs();
    buildFloaters();
  }

  /* ---------------- 动态光晕（缓慢游动的大光斑） ---------------- */
  function buildBlobs() {
    if (EFF.glow === false) { blobs = []; return; }
    var n = W < 700 ? 2 : 3;
    blobs = [];
    for (var i = 0; i < n; i++) {
      blobs.push({
        r: rand(220, 420),
        ax: rand(0.12, 0.3), ay: rand(0.1, 0.26),   // 横向 / 纵向摆动半径（相对屏幕）
        bx: rand(0.16, 0.34), by: rand(0.14, 0.3),   // 摆动频率
        px: rand(0, Math.PI * 2), py: rand(0, Math.PI * 2),
        t: rand(0, 100),
        a: rand(0.10, 0.18) * K
      });
    }
  }

  /* ---------------- 漂浮的几何线框 ---------------- */
  function buildFloaters() {
    if (EFF.ambient === false) { floaters = []; return; }
    var n = Math.round(Math.min(14, Math.max(5, W / 130)));
    floaters = [];
    for (var i = 0; i < n; i++) floaters.push(newFloater(true));
  }

  function newFloater(spread) {
    var size = rand(14, 40);
    return {
      x: rand(0, W), y: spread ? rand(0, H) : rand(-60, H + 60),
      vx: rand(-0.16, 0.16), vy: rand(-0.14, 0.14),
      size: size, rot: rand(0, Math.PI * 2), vrot: rand(-0.0035, 0.0035),
      shape: pick(['circle', 'square', 'triangle']),
      a: rand(0.10, 0.20) * K,
      pushed: 0
    };
  }

  /* ---------------- 鼠标尾随的几何粒子 ---------------- */
  var SHAPES = ['circle', 'square', 'triangle'];

  function spawn(x, y) {
    var size = rand(3.5, 11);
    particles.push({
      x: x + rand(-6, 6), y: y + rand(-6, 6),
      vx: rand(-0.35, 0.35), vy: rand(-0.35, 0.35),
      size: size, rot: rand(0, Math.PI * 2), vrot: rand(-0.05, 0.05),
      life: 0, max: rand(0.75, 1.45),
      shape: pick(SHAPES),
      a: rand(0.30, 0.55) * K
    });
    if (particles.length > 110) particles.splice(0, particles.length - 110);
  }

  /* ---------------- 绘制工具 ---------------- */
  function shapePath(s, x, y, size) {
    ctx.beginPath();
    if (s === 'circle') {
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    } else if (s === 'square') {
      ctx.rect(-size / 2, -size / 2, size, size);
    } else {
      var r = size / 2;
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.95, r * 0.7);
      ctx.lineTo(-r * 0.95, r * 0.7);
      ctx.closePath();
    }
  }

  /* ---------------- 主循环 ---------------- */
  function frame(now) {
    if (!running) return;
    var dt = Math.min(48, now - last) / 1000;
    last = now;
    var dark = isDark();

    ctx.clearRect(0, 0, W, H);

    /* 1. 背景光斑 */
    var blobColor = dark ? '86,150,92' : '150,205,134';
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      b.t += dt;
      var cx = W * 0.5 + Math.sin(b.t * b.bx + b.px) * W * b.ax;
      var cy = H * 0.45 + Math.cos(b.t * b.by + b.py) * H * b.ay;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.r);
      g.addColorStop(0, 'rgba(' + blobColor + ',' + b.a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + blobColor + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    /* 2. 跟随鼠标的光晕 */
    if (EFF.glow !== false && fine) {
      var target = mouse.seen ? 1 : 0;
      var idle = now - mouse.lastMove > 900;
      glow.a += ((mouse.seen ? (idle ? 0.55 : 1) : 0) - glow.a) * Math.min(1, dt * 3);
      if (mouse.seen) {
        glow.x += (mouse.x - glow.x) * Math.min(1, dt * 7);
        glow.y += (mouse.y - glow.y) * Math.min(1, dt * 7);
      }
      if (glow.a > 0.01) {
        var R = 190;
        var gg = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, R);
        if (dark) {
          gg.addColorStop(0, 'rgba(150,220,142,' + (0.18 * glow.a * K).toFixed(3) + ')');
          gg.addColorStop(0.55, 'rgba(110,185,115,' + (0.07 * glow.a * K).toFixed(3) + ')');
        } else {
          gg.addColorStop(0, 'rgba(255,255,255,' + (0.62 * glow.a * K).toFixed(3) + ')');
          gg.addColorStop(0.5, 'rgba(226,244,210,' + (0.34 * glow.a * K).toFixed(3) + ')');
        }
        gg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(glow.x, glow.y, R, 0, Math.PI * 2);
        ctx.fill();
      }
      void target;
    }

    /* 3. 漂浮几何（被鼠标推开） */
    var stroke = dark ? '150,215,140' : '84,150,74';
    ctx.lineWidth = 1.1;
    for (var f = 0; f < floaters.length; f++) {
      var o = floaters[f];
      o.x += o.vx; o.y += o.vy; o.rot += o.vrot;

      if (mouse.seen) {
        var dx = o.x - mouse.x, dy = o.y - mouse.y;
        var d2 = dx * dx + dy * dy;
        var RANGE = 150;
        if (d2 < RANGE * RANGE && d2 > 0.01) {
          var d = Math.sqrt(d2);
          var push = (1 - d / RANGE) * 0.9;
          o.x += (dx / d) * push;
          o.y += (dy / d) * push;
          o.pushed = 1;
        }
      }
      o.pushed *= 0.94;

      // 出界回绕
      if (o.x < -60) o.x = W + 60; else if (o.x > W + 60) o.x = -60;
      if (o.y < -60) o.y = H + 60; else if (o.y > H + 60) o.y = -60;

      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rot);
      ctx.strokeStyle = 'rgba(' + stroke + ',' + (o.a + o.pushed * 0.18 * K).toFixed(3) + ')';
      shapePath(o.shape, 0, 0, o.size);
      ctx.stroke();
      ctx.restore();
    }

    /* 4. 鼠标尾随的粒子 */
    for (var p = particles.length - 1; p >= 0; p--) {
      var q = particles[p];
      q.life += dt;
      if (q.life >= q.max) { particles.splice(p, 1); continue; }
      var k = 1 - q.life / q.max;
      q.x += q.vx; q.y += q.vy;
      q.vx *= 0.985; q.vy = q.vy * 0.985 + 0.012;   // 轻微下坠
      q.rot += q.vrot;
      var size = q.size * (0.35 + k * 0.65);
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.rot);
      ctx.strokeStyle = 'rgba(' + stroke + ',' + (q.a * k * k).toFixed(3) + ')';
      ctx.lineWidth = 1.2;
      shapePath(q.shape, 0, 0, size);
      ctx.stroke();
      ctx.restore();
    }

    raf = requestAnimationFrame(frame);
  }

  /* ---------------- 启动 / 停止 ---------------- */
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function onMove(e) {
    var x = e.clientX, y = e.clientY;
    if (!mouse.seen) { glow.x = x; glow.y = y; }
    mouse.x = x; mouse.y = y; mouse.seen = true;
    mouse.lastMove = performance.now();

    if (EFF.trail === false) return;
    var dx = x - (mouse.sx || x), dy = y - (mouse.sy || y);
    if (dx * dx + dy * dy > 90) {          // 每移动约 9px 撒一个
      mouse.sx = x; mouse.sy = y;
      spawn(x, y);
    }
  }

  function init() {
    resize();
    window.addEventListener('resize', function () {
      clearTimeout(init._t);
      init._t = setTimeout(resize, 180);
    });
    if (fine) window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('visibilitychange', function () {
      document.hidden ? stop() : start();
    });
    // 主题切换时让光斑颜色立即跟上
    start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
