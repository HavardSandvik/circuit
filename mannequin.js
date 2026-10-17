/* Mannequin: renders keyframed exercise motions as an animated figure on a canvas.
   Motion files are plain JSON (see moves/*.json). World units are metres, y points up, ground is y = 0.
   Side view: the figure faces +x; limbs are "near" and "far". Front view: limbs are "left" and "right" (screen sides).
   Hands and feet are placed by target (inverse kinematics); elbows and knees are solved each frame. */
(function (global) {
  'use strict';

  const SEG = {
    thigh: 0.44, shin: 0.44, upper: 0.30, fore: 0.27, torso: 0.50, neck: 0.08,
    head: 0.11, hand: 0.08, foot: 0.17, heel: 0.05, shoulderW: 0.18, hipW: 0.09
  };
  const WIDTH = { thigh: 0.12, shin: 0.09, upper: 0.085, fore: 0.07, torsoSide: 0.19, torsoFront: 0.09, neck: 0.07, foot: 0.06 };
  const DEG = Math.PI / 180;

  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const ease = t => t * t * (3 - 2 * t);

  function sides(move) { return move.view === 'front' ? ['left', 'right'] : ['far', 'near']; }

  /* Base skeleton (no limbs) from pelvis position and torso lean. */
  function base(pelvis, torsoDeg, headDeg, view) {
    const a = torsoDeg * DEG, h = (torsoDeg + headDeg) * DEG;
    const top = add(pelvis, [SEG.torso * Math.sin(a), SEG.torso * Math.cos(a)]);
    const headC = add(top, [(SEG.neck + SEG.head) * Math.sin(h), (SEG.neck + SEG.head) * Math.cos(h)]);
    const neck = add(top, [SEG.neck * Math.sin(h), SEG.neck * Math.cos(h)]);
    const p = { pelvis, top, neck, headC, hip: {}, shoulder: {} };
    if (view === 'front') {
      p.hip.left = add(pelvis, [-SEG.hipW, 0]); p.hip.right = add(pelvis, [SEG.hipW, 0]);
      p.shoulder.left = add(top, [-SEG.shoulderW, -0.03]); p.shoulder.right = add(top, [SEG.shoulderW, -0.03]);
    } else {
      p.hip.near = p.hip.far = pelvis;
      p.shoulder.near = p.shoulder.far = add(top, [0, -0.03]);
    }
    return p;
  }

  /* A target is [x, y] in world space, or { from: "hip" | "shoulder" | "pelvis", d: [dx, dy] } relative to the body. */
  function resolve(spec, p, side) {
    if (Array.isArray(spec)) return spec;
    const o = spec.from === 'pelvis' ? p.pelvis : p[spec.from][side];
    return add(o, spec.d);
  }

  function blendTarget(s0, s1, u, p0, p1, p, side) {
    if (!Array.isArray(s0) && !Array.isArray(s1) && s0.from === s1.from) {
      return resolve({ from: s0.from, d: lerp2(s0.d, s1.d, u) }, p, side);
    }
    return lerp2(resolve(s0, p0, side), resolve(s1, p1, side), u);
  }

  /* Two-bone IK. bend = +1 places the middle joint counter-clockwise from the root→target line. */
  function ik(root, target, l1, l2, bend) {
    const dx = target[0] - root[0], dy = target[1] - root[1];
    let d = Math.hypot(dx, dy);
    const th = Math.atan2(dy, dx);
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
    const ca = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const al = Math.acos(Math.min(1, Math.max(-1, ca)));
    const mid = add(root, [l1 * Math.cos(th + bend * al), l1 * Math.sin(th + bend * al)]);
    const end = add(root, [d * Math.cos(th), d * Math.sin(th)]);
    return { mid, end, reach: Math.hypot(dx, dy) / (l1 + l2) };
  }

  const DEFAULT_BEND = {
    side: { arm: { near: -1, far: -1 }, leg: { near: 1, far: 1 } },
    front: { arm: { left: 1, right: -1 }, leg: { left: -1, right: 1 } }
  };

  /* Full pose at time t (seconds). */
  function pose(move, t) {
    const keys = move.keys;
    const T = move.duration;
    let time = ((t % T) + T) % T;
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].t <= time) i++;
    const k0 = keys[i];
    const k1 = i + 1 < keys.length ? keys[i + 1] : Object.assign({}, keys[0], { t: T });
    const span = k1.t - k0.t;
    const u = span > 0 ? ease((time - k0.t) / span) : 0;

    const view = move.view;
    const p0 = base(k0.pelvis, k0.torso || 0, k0.head || 0, view);
    const p1 = base(k1.pelvis, k1.torso || 0, k1.head || 0, view);
    const p = base(lerp2(k0.pelvis, k1.pelvis, u), lerp(k0.torso || 0, k1.torso || 0, u), lerp(k0.head || 0, k1.head || 0, u), view);
    const bend = Object.assign({}, DEFAULT_BEND[view === 'front' ? 'front' : 'side'], move.bend || {});

    p.arms = {}; p.legs = {};
    for (const s of sides(move)) {
      const hT = blendTarget(k0.hands[s], k1.hands[s], u, p0, p1, p, s);
      const a = ik(p.shoulder[s], hT, SEG.upper, SEG.fore, bend.arm[s]);
      const fdir = [a.end[0] - a.mid[0], a.end[1] - a.mid[1]], fl = Math.hypot(fdir[0], fdir[1]) || 1;
      p.arms[s] = { shoulder: p.shoulder[s], elbow: a.mid, wrist: a.end, hand: add(a.end, [fdir[0] / fl * SEG.hand, fdir[1] / fl * SEG.hand]), reach: a.reach };

      const f0 = k0.feet[s], f1 = k1.feet[s];
      const fT = blendTarget(f0.at, f1.at, u, p0, p1, p, s);
      const g = ik(p.hip[s], fT, SEG.thigh, SEG.shin, bend.leg[s]);
      const fa = lerp(f0.f || 0, f1.f || 0, u) * DEG;
      const dir = view === 'front' ? (s === 'left' ? -1 : 1) : 1;
      // the sole sits 5.5 cm below the ankle joint, offset along the foot's own normal
      const n = [Math.sin(fa) * dir * 0.055, -Math.cos(fa) * 0.055];
      const toeLen = view === 'front' ? SEG.foot * 0.45 : SEG.foot, heelLen = view === 'front' ? 0 : SEG.heel;
      const toe = add(g.end, [Math.cos(fa) * toeLen * dir + n[0], Math.sin(fa) * toeLen + n[1]]);
      const heel = add(g.end, [-Math.cos(fa) * heelLen * dir + n[0], -Math.sin(fa) * heelLen + n[1]]);
      p.legs[s] = { hip: p.hip[s], knee: g.mid, ankle: g.end, toe, heel, reach: g.reach };
    }
    return p;
  }

  function pointsOf(p) {
    const pts = [p.pelvis, p.top, [p.headC[0] - SEG.head, p.headC[1] - SEG.head], [p.headC[0] + SEG.head, p.headC[1] + SEG.head]];
    for (const s in p.arms) { const a = p.arms[s]; pts.push(a.elbow, a.hand); }
    for (const s in p.legs) { const l = p.legs[s]; pts.push(l.knee, l.toe, l.heel); }
    return pts;
  }

  /* World-space box covering the whole cycle, props and a strip of ground. */
  function bounds(move) {
    let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i <= 48; i++) {
      for (const q of pointsOf(pose(move, move.duration * i / 48))) {
        x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
      }
    }
    if (move.props && move.props.bar) { const b = move.props.bar; x0 = Math.min(x0, b[0] - 0.1); x1 = Math.max(x1, b[0] + 0.1); y1 = Math.max(y1, b[1] + 0.25); }
    return { x0: x0 - 0.12, x1: x1 + 0.12, y0: -0.06, y1: y1 + 0.08 };
  }

  function seg(ctx, a, b, w) { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }

  function draw(ctx, move, p, box, W, H, colors) {
    ctx.clearRect(0, 0, W, H);
    const s = Math.min(W / (box.x1 - box.x0), H / (box.y1 - box.y0));
    const ox = (W - (box.x1 - box.x0) * s) / 2, oy = (H - (box.y1 - box.y0) * s) / 2;
    const X = q => [ox + (q[0] - box.x0) * s, H - oy - (q[1] - box.y0) * s];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // ground
    ctx.strokeStyle = colors.line; seg(ctx, [0, X([0, 0])[1] + 1.5], [W, X([0, 0])[1] + 1.5], 2);
    // bar (side view shows its cross-section)
    if (move.props && move.props.bar) {
      const b = X(move.props.bar);
      ctx.strokeStyle = colors.line; seg(ctx, [b[0], 0], [b[0], b[1] - 0.04 * s], 3);
      ctx.fillStyle = colors.prop; ctx.beginPath(); ctx.arc(b[0], b[1], 0.035 * s, 0, Math.PI * 2); ctx.fill();
    }

    const limb = (side, col) => {
      ctx.strokeStyle = col;
      const l = p.legs[side];
      seg(ctx, X(l.hip), X(l.knee), WIDTH.thigh * s);
      seg(ctx, X(l.knee), X(l.ankle), WIDTH.shin * s);
      seg(ctx, X(l.heel), X(l.toe), WIDTH.foot * s);
    };
    const arm = (side, col) => {
      ctx.strokeStyle = col;
      const a = p.arms[side];
      seg(ctx, X(a.shoulder), X(a.elbow), WIDTH.upper * s);
      seg(ctx, X(a.elbow), X(a.wrist), WIDTH.fore * s);
      seg(ctx, X(a.wrist), X(a.hand), WIDTH.fore * 1.1 * s);
    };
    const body = col => {
      ctx.strokeStyle = col; ctx.fillStyle = col;
      if (move.view === 'front') {
        const q = [p.hip.left, p.hip.right, p.shoulder.right, p.shoulder.left].map(X);
        ctx.lineWidth = WIDTH.torsoFront * s; ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]);
        for (const r of q.slice(1)) ctx.lineTo(r[0], r[1]);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {
        seg(ctx, X(p.pelvis), X(p.top), WIDTH.torsoSide * s);
      }
      seg(ctx, X(p.top), X(p.neck), WIDTH.neck * s);
      const h = X(p.headC); ctx.beginPath(); ctx.arc(h[0], h[1], SEG.head * s, 0, Math.PI * 2); ctx.fill();
    };

    if (move.view === 'front') {
      limb('left', colors.fg); limb('right', colors.fg); body(colors.fg); arm('left', colors.fg); arm('right', colors.fg);
    } else {
      arm('far', colors.far); limb('far', colors.far); body(colors.fg); limb('near', colors.fg); arm('near', colors.fg);
    }
  }

  function readColors(el) {
    const cs = getComputedStyle(el);
    const v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    return { fg: v('--fig', '#14202b'), far: v('--fig-far', '#8a969c'), line: v('--line', '#c9cfc9'), prop: v('--muted', '#5d6a72') };
  }

  /* Player bound to a canvas. Resizes to its CSS box; honours reduced motion by showing a mid-cycle still. */
  function Player(canvas, move) {
    const ctx = canvas.getContext('2d');
    let raf = 0, t0 = 0, box = null, colors = readColors(canvas), frame = 0;
    const reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function size() {
      const r = canvas.getBoundingClientRect(), dpr = global.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    function render(ts) {
      if (!move) return;
      size();
      if (frame++ % 30 === 0) colors = readColors(canvas);
      const t = reduced ? move.duration * 0.5 : (ts - t0) / 1000;
      draw(ctx, move, pose(move, t), box, canvas.width, canvas.height, colors);
      if (!reduced) raf = requestAnimationFrame(render);
    }
    const api = {
      set(m) { move = m; box = bounds(m); t0 = performance.now(); frame = 0; return api; },
      play() { cancelAnimationFrame(raf); t0 = performance.now(); raf = requestAnimationFrame(render); return api; },
      stop() { cancelAnimationFrame(raf); raf = 0; return api; },
      drawAt(t) { size(); colors = readColors(canvas); draw(ctx, move, pose(move, t), box, canvas.width, canvas.height, colors); return api; }
    };
    if (move) api.set(move);
    return api;
  }

  global.Mannequin = { pose, bounds, Player, SEG };
})(typeof window !== 'undefined' ? window : globalThis);
