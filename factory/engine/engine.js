/* ------------------------------------------------------------------
 * engine.js — 运行时通用辅助（被 Formula 命名空间扩展）
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  var F = root.Formula;
  if (!F) return;

  // 行业常用取整：向上取整到 step 的倍数
  F.FUNCS.stepUp = function (x, step) { return step > 0 ? Math.ceil(x / step) * step : x; };
  F.FUNCS.stepDown = function (x, step) { return step > 0 ? Math.floor(x / step) * step : x; };

  // 单位换算
  F.FUNCS.mm2 = function (x) { return x / 1000; };            // mm → m
  F.FUNCS.m2 = function (x) { return x * 1000; };             // m → mm
  F.FUNCS.mm2m2 = function (x) { return x / 1000000; };       // mm² → m²

  // 三档取整（报价常用：进位到 0.5 / 5 / 10）
  F.FUNCS.q05 = function (x) { return Math.ceil(x * 2) / 2; };
  F.FUNCS.q5 = function (x) { return Math.ceil(x / 5) * 5; };
  F.FUNCS.q10 = function (x) { return Math.ceil(x / 10) * 10; };
})(typeof globalThis !== 'undefined' ? globalThis : this);
