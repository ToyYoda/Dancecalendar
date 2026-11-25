// The ink couple in the night band at the top of the calendar: a dancing couple traced in a few thousand
// particles from a silhouette (couple.png), swaying slightly and lit by an apricot lamp that follows the pointer
// or finger. With reduced motion it is drawn once and stays still; it pauses while the band is off screen or the
// tab is hidden. data-ink-x and data-ink-h (shares of the canvas) place it in a frame other than the band.
(() => {
  const canvas = document.querySelector("canvas[data-ink]");
  if (!canvas || !canvas.getContext) return;
  const host = canvas.parentElement;
  const ctx = canvas.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COLS = ["rgba(122,30,58,.55)", "rgba(190,120,150,.6)", "rgba(242,228,232,.8)", "rgba(255,246,240,.95)", "rgba(242,166,90,.95)"];
  const BINS = COLS.map(() => []);
  let MP, MW, MH, W, H, sc, ox, oy, N, X, Y, VX, VY, K, S;
  const pointer = { x: 0, y: 0, t: -1e9 };
  const lamp = { x: 0, y: 0 };
  let visible = true, running = false, prev = 0, st = 0;

  // Points inside the silhouette, each with the direction out of the shape and how near the outline it lies.
  function read(img) {
    MW = img.naturalWidth; MH = img.naturalHeight;
    const c = document.createElement("canvas"); c.width = MW; c.height = MH;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, MW, MH).data, m = new Uint8Array(MW * MH);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4] > 127 ? 1 : 0;
    const xs = [], ys = [], nx = [], ny = [], ed = [], step = 2.2;
    for (let y = 4; y < MH - 4; y += step) for (let x2 = 4; x2 < MW - 4; x2 += step) {
      const jx = x2 + (Math.random() - .5) * step, jy = y + (Math.random() - .5) * step;
      const ix = Math.round(jx), iy = Math.round(jy);
      if (!m[iy * MW + ix]) continue;
      let gx = 0, gy = 0, empty = 0;
      for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) if (!m[(iy + dy) * MW + ix + dx]) { empty++; gx += dx; gy += dy; }
      const gl = Math.hypot(gx, gy) || 1;
      xs.push(jx); ys.push(jy); nx.push(gx / gl); ny.push(gy / gl); ed.push(Math.min(1, empty / 8));
    }
    MP = { n: xs.length, x: xs, y: ys, nx, ny, ed };
  }

  // On a phone the couple stands in the corner above the "add an Event" bar, on a wide screen it fills the band.
  function size() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const add = host.querySelector(".add"), narrow = W < 700;
    let h, cx, bottom;
    const fx = parseFloat(canvas.dataset.inkX), fh = parseFloat(canvas.dataset.inkH);
    if (fx && fh) { h = H * fh; cx = W * fx; bottom = H - H * (1 - fh) / 2; } // a frame that says where the couple stands
    else if (narrow && add) { h = Math.max(60, add.offsetTop - 14); cx = W * .84; bottom = add.offsetTop - 8; }
    else {
      // on a wide screen the band's content is centred, so the couple stands just left of the links on the right
      h = H * .96; bottom = H - 2;
      const meta = host.querySelector(".meta"), half = MW * (h / MH) / 2;
      cx = meta ? Math.min(W * .74, meta.offsetLeft - half - 24) : W * .74;
    }
    sc = h / MH; ox = cx - MW * sc / 2; oy = bottom - h;
    N = Math.min(MP.n, narrow ? 3500 : 7000, Math.round(MW * sc * h / 2.6));
    X = new Float32Array(N); Y = new Float32Array(N); VX = new Float32Array(N); VY = new Float32Array(N);
    K = new Uint32Array(N); S = new Float32Array(N);
    const stride = MP.n / N, scatter = still ? 0 : 50;
    for (let i = 0; i < N; i++) {
      const k = (K[i] = Math.min(MP.n - 1, Math.floor(i * stride + Math.random() * stride)));
      S[i] = Math.random() * 6.28;
      X[i] = ox + MP.x[k] * sc + (Math.random() - .5) * scatter;
      Y[i] = oy + MP.y[k] * sc + (Math.random() - .5) * scatter;
    }
    lamp.x = ox + MW * sc * .1; lamp.y = oy + h * .05;
  }

  function draw(now) {
    const t = now / 1000, dt = Math.min(.05, (now - (prev || now)) / 1000);
    prev = now; st += dt;
    const h = MH * sc, pivX = ox + MW * sc / 2, pivY = oy + h;
    const ang = still ? 0 : Math.sin(st * 1.1) * .03;
    const follow = !still && performance.now() - pointer.t < 2500;
    let lx, ly;
    if (follow) { lx = pointer.x; ly = pointer.y; }
    else if (still) { lx = ox + MW * sc * .1; ly = oy + h * .05; }
    else { const a = t * .3; lx = pivX + Math.cos(a) * h * .7; ly = oy + h * .15 + Math.sin(a * 1.7) * h * .15; }
    lamp.x += (lx - lamp.x) * (still ? 1 : .12); lamp.y += (ly - lamp.y) * (still ? 1 : .12);

    ctx.clearRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, h * .8);
    glow.addColorStop(0, "rgba(255,210,160,.22)"); glow.addColorStop(.3, "rgba(242,166,90,.06)"); glow.addColorStop(1, "rgba(242,166,90,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

    BINS.forEach((b) => (b.length = 0));
    const R = h * .25, R2 = R * R, F2 = (h * .55) ** 2;
    for (let i = 0; i < N; i++) {
      const k = K[i], mx = MP.x[k], my = MP.y[k];
      let tx = ox + mx * sc, ty = oy + my * sc, x = X[i], y = Y[i];
      if (!still) {
        // sway around the feet, more towards the heads
        const a = ang * (.4 + .6 * (1 - my / MH)), c = Math.cos(a), s = Math.sin(a), bx = tx - pivX, by = ty - pivY;
        tx = pivX + bx * c - by * s; ty = pivY + bx * s + by * c;
        let vx = VX[i], vy = VY[i];
        vx += (tx - x) * .03; vy += (ty - y) * .03;
        const f = (Math.sin(x * .006 + t * .35 + S[i]) + Math.cos(y * .007 - t * .3)) * 3.14;
        vx += Math.cos(f) * .02; vy += Math.sin(f) * .02;
        if (follow) {
          const qx = x - pointer.x, qy = y - pointer.y, d2 = qx * qx + qy * qy;
          if (d2 < R2) { const d = Math.sqrt(d2) || 1, p = (1 - d / R) * .8; vx += (qx / d) * p - (qy / d) * p * .9; vy += (qy / d) * p + (qx / d) * p * .9; }
        }
        vx *= .9; vy *= .9; x += vx; y += vy;
        X[i] = x; Y[i] = y; VX[i] = vx; VY[i] = vy;
      }
      const lxv = lamp.x - x, lyv = lamp.y - y, d2 = lxv * lxv + lyv * lyv, d = Math.sqrt(d2) || 1, fall = 1 / (1 + d2 / F2);
      const rim = Math.max(0, (MP.nx[k] * lxv + MP.ny[k] * lyv) / d) * MP.ed[k] * fall;
      let b;
      if (rim > .28) b = 4;
      else { const l = .15 + fall * .9 + MP.ed[k] * .3; b = l > .85 ? 3 : l > .6 ? 2 : l > .38 ? 1 : 0; }
      BINS[b].push(i);
    }
    const dot = W < 700 ? 1.3 : 1.5;
    ctx.globalCompositeOperation = "lighter";
    for (let b = 0; b < BINS.length; b++) {
      ctx.fillStyle = COLS[b];
      const s = b === 4 ? dot + .3 : dot;
      for (const i of BINS[b]) ctx.fillRect(X[i], Y[i], s, s);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function loop(now) {
    if (!visible || document.hidden) { running = false; return; }
    draw(now);
    requestAnimationFrame(loop);
  }
  function wake() { if (still || running || !visible || document.hidden) return; running = true; prev = 0; requestAnimationFrame(loop); }

  const img = new Image();
  img.onload = () => {
    read(img); size();
    if (still) draw(0); else wake();
    let rt;
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { size(); if (still) draw(0); }, 150); });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }).observe(host);
    document.addEventListener("visibilitychange", wake);
  };
  img.src = canvas.dataset.ink;

  if (!still) {
    const at = (e) => { const r = canvas.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.t = performance.now(); };
    host.addEventListener("pointermove", at, { passive: true });
    host.addEventListener("pointerdown", at, { passive: true });
    host.addEventListener("pointerleave", () => (pointer.t = -1e9));
  }
})();
