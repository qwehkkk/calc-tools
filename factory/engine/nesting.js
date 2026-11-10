/* ------------------------------------------------------------------
 * nesting.js — 2D 排版内核（单尺寸解析解 + 多尺寸 MaxRects）
 * 输出统一为 placements: [{x,y,w,h,rot,part}]
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  /* 单尺寸：网格排布取优。
     kerf = 刀缝/锯缝（块与块之间），边缘不留缝。 */
  function gridPack(sw, sh, pw, ph, kerf, allowRotate) {
    var best = { count: 0 };

    function attempt(w, h, rot) {
      if (w <= 0 || h <= 0) return;
      var cols = Math.floor((sw + kerf) / (w + kerf));
      var rows = Math.floor((sh + kerf) / (h + kerf));
      if (cols < 1 || rows < 1) return;
      var count = cols * rows;
      var pl = [], r, c;
      for (r = 0; r < rows; r++) {
        for (c = 0; c < cols; c++) {
          pl.push({ x: c * (w + kerf), y: r * (h + kerf), w: w, h: h, rot: rot, part: 0 });
        }
      }
      if (count > best.count) {
        best = { count: count, cols: cols, rows: rows, rot: rot, w: w, h: h, placements: pl };
      }
    }

    attempt(pw, ph, false);
    if (allowRotate && pw !== ph) attempt(ph, pw, true);
    return best;
  }

  /* 多尺寸：MaxRects + Best Short Side Fit */
  function maxRects(sheets, bins, kerf) {
    // bins: [{w,h,free:[{x,y,w,h}],placements:[]}]
    bins.forEach(function (b) {
      b.free = [{ x: 0, y: 0, w: b.w, h: b.h }];
      b.placements = [];
    });

    function score(fr, w, h) {
      if (w <= fr.w && h <= fr.h) {
        return { short: Math.min(fr.w - w, fr.h - h), long: Math.max(fr.w - w, fr.h - h) };
      }
      return null;
    }

    function splitFree(b, placed) {
      var next = [];
      b.free.forEach(function (fr) {
        var overlaps = !(placed.x >= fr.x + fr.w || placed.x + placed.w <= fr.x ||
                         placed.y >= fr.y + fr.h || placed.y + placed.h <= fr.y);
        if (!overlaps) { next.push(fr); return; }
        // 切成最多 4 块
        if (placed.x > fr.x) next.push({ x: fr.x, y: fr.y, w: placed.x - fr.x, h: fr.h });
        if (placed.x + placed.w < fr.x + fr.w)
          next.push({ x: placed.x + placed.w, y: fr.y, w: fr.x + fr.w - (placed.x + placed.w), h: fr.h });
        if (placed.y > fr.y) next.push({ x: fr.x, y: fr.y, w: fr.w, h: placed.y - fr.y });
        if (placed.y + placed.h < fr.y + fr.h)
          next.push({ x: fr.x, y: placed.y + placed.h, w: fr.w, h: fr.y + fr.h - (placed.y + placed.h) });
      });
      // 剪掉被包含的小块，减少碎片
      b.free = next.filter(function (a, i) {
        for (var j = 0; j < next.length; j++) {
          if (i === j) continue;
          var o = next[j];
          if (a.x >= o.x && a.y >= o.y && a.x + a.w <= o.x + o.w && a.y + a.h <= o.y + o.h) return false;
        }
        return true;
      });
    }

    var pending = [];
    sheets.forEach(function (s, si) {
      for (var i = 0; i < s.qty; i++) pending.push({ w: s.w, h: s.h, part: s.idx });
    });
    // 大件优先
    pending.sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });

    var unplaced = [];

    pending.forEach(function (p) {
      var best = null;
      // 优先用已开板的余料，再开新板
      for (var bi = 0; bi < bins.length; bi++) {
        var b = bins[bi];
        for (var fi = 0; fi < b.free.length; fi++) {
          var fr = b.free[fi];
          [[p.w, p.h, false], [p.h, p.w, true]].forEach(function (o) {
            if (o[2] && p.w === p.h) return;
            if (!b.allowRotate && o[2]) return;
            var s = score(fr, o[0], o[1]);
            if (!s) return;
            var cand = { bin: bi, free: fi, w: o[0], h: o[1], rot: o[2], x: fr.x, y: fr.y,
                         short: s.short, long: s.long };
            if (!best || cand.short < best.short ||
                (cand.short === best.short && cand.long < best.long)) best = cand;
          });
        }
      }
      if (!best) { unplaced.push(p); return; }
      var bin = bins[best.bin];
      var fr = bin.free[best.free];
      var placed = { x: fr.x, y: fr.y, w: best.w + kerf, h: best.h + kerf, part: p.part,
                     rot: best.rot, dw: best.w, dh: best.h };
      // 记录真实尺寸（不含 kerf）用于绘制
      placed.w = best.w; placed.h = best.h;
      bin.placements.push(placed);
      splitFree(bin, { x: best.x, y: best.y, w: best.w + kerf, h: best.h + kerf });
      bin.free = bin.free.filter(function (f) { return f.w > 0.5 && f.h > 0.5; });
    });

    return { bins: bins, unplaced: unplaced };
  }

  function areaOf(pl) { return pl.reduce(function (s, p) { return s + p.w * p.h; }, 0); }

  /* 顶层入口：决定用哪个算法 */
  function solve(cfg) {
    var sheets = cfg.sheets, parts = cfg.parts, kerf = cfg.kerf || 0, rot = cfg.allowRotate !== false;
    var totalPartArea = parts.reduce(function (s, p) { return s + (p.w * p.h * p.qty || 0); }, 0);

    // 单尺寸特例：只有一个零件类型且需求量大，直接用解析网格解（更快更准）
    if (parts.length === 1 && parts[0].qty > 1) {
      var p = parts[0], sheet = sheets[0];
      var g = gridPack(sheet.w, sheet.h, p.w, p.h, kerf, rot);
      return {
        mode: 'grid',
        bins: [{
          w: sheet.w, h: sheet.h, label: sheet.label,
          placements: g.placements, perSheet: g.count,
          cols: g.cols, rows: g.rows, rotated: g.rot
        }],
        perSheet: g.count,
        unplaced: [],
        efficiency: sheet.w * sheet.h > 0 ? (g.count * p.w * p.h) / (sheet.w * sheet.h) : 0,
        totalPartArea: totalPartArea
      };
    }

    // 多尺寸：先估算需要几张板，再多开一张做余量
    var sheetArea = sheets[0].w * sheets[0].h;
    var est = Math.max(1, Math.ceil(totalPartArea / (sheetArea * 0.72)) + 1);
    var bins = [];
    for (var i = 0; i < est; i++) {
      bins.push({ w: sheets[0].w, h: sheets[0].h, allowRotate: rot, label: sheets[0].label });
    }
    var res = maxRects(parts.map(function (p, i) { return { w: p.w, h: p.h, qty: p.qty, idx: i }; }), bins, kerf);
    var used = res.bins.filter(function (b) { return b.placements.length > 0; });
    return {
      mode: 'maxrects',
      bins: used.length ? used : [res.bins[0]],
      perSheet: null,
      unplaced: res.unplaced,
      efficiency: used.length
        ? areaOf(used.reduce(function (a, b) { return a.concat(b.placements); }, [])) /
          (used.length * sheetArea)
        : 0,
      totalPartArea: totalPartArea
    };
  }

  root.Nest = { solve: solve, gridPack: gridPack, maxRects: maxRects, areaOf: areaOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);
