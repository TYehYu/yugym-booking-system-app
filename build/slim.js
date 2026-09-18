#!/usr/bin/env node
/* 發佈用的減肥：把註解剝掉，原始碼裡的註解一個都不動。
   用法：node build/slim.js <來源 index.html> <輸出 index.html>

   ── 為什麼要做（2026-09-18）──
   index.html 壓縮後 1.73MB，而實測 GitHub 到台灣只有約 35 KB/s → 整份抓完要 48 秒。
   註解佔原始檔 37.6%、佔 gzip 後的 52%（6015 段區塊註解就有 1.77MB），
   剝掉之後是 23 秒。這是唯一的大槓桿，其餘（壓縮排、拆檔）都只有個位數百分比。

   ⚠ 縮排刻意不動：只再省 2.9%，但樣板字串裡的縮排是會被輸出到畫面上的
     （例如 PDF 那段產生的 HTML），動了就不只是「變小」而已。

   ── 為什麼不能用正則剝 ──
   字串裡的網址（'https://…'）會被當成行註解開頭；正則字面量裡也可能出現註解的起訖序列。
   所以走一次字元狀態機，認得字串、樣板字串（含 ${} 巢狀）與正則字面量。

   ── 這支自己會驗，驗不過就中止（結束碼 1）──
   剝註解最可怕的不是「檔案壞掉」，而是**檔案照樣解析通過、測試照樣全綠，
   但正式環境安靜地少了東西**。寫這支的時候就真的踩到一次：
   全域刪 HTML 註解，把 `<!--ALERTS-->` 這個樣板字串裡的佔位標記吃掉了
   （見 index.html 的 alertBox：先塞標記、之後用 replace 把警示卡片填進去），
   於是首頁的警示卡片會永遠是空的，而 384 支測試沒有一支會紅。
   所以下面比對「剝前剝後的識別字序列與字串序列必須完全一致」—— 那次就是靠這個抓到的。 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

/* ══ 剝 JS 註解 ═══════════════════════════════════════════════════════
   區塊註解用等量換行取代，行號不跑掉（錯誤訊息才對得上，ASI 行為也不變）。 */
function stripJS(s, removed) {
  removed = removed || [];
  let out = '', i = 0;
  const n = s.length;
  let prev = '';                       // 前一個有意義字元：判斷 / 是除號還是正則開頭
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '*') {                       // 區塊註解
      const e = s.indexOf('*/', i + 2);
      if (e < 0) break;
      removed.push(s.slice(i, e + 2));
      out += '\n'.repeat(s.slice(i, e + 2).split('\n').length - 1);
      i = e + 2; continue;
    }
    if (c === '/' && d === '/') {                       // 行註解（換行留著）
      let e = s.indexOf('\n', i); if (e < 0) e = n;
      removed.push(s.slice(i, e));
      i = e; continue;
    }
    if (c === '"' || c === "'") {                       // 字串
      const q = c; out += c; i++;
      while (i < n) {
        if (s[i] === '\\') { out += s[i] + s[i + 1]; i += 2; continue; }
        out += s[i];
        if (s[i] === q) { i++; break; }
        i++;
      }
      prev = q; continue;
    }
    if (c === '`') {                                    // 樣板字串
      out += c; i++;
      while (i < n) {
        if (s[i] === '\\') { out += s[i] + s[i + 1]; i += 2; continue; }
        if (s[i] === '`') { out += s[i]; i++; break; }
        if (s[i] === '$' && s[i + 1] === '{') {
          out += '${'; i += 2;
          let depth = 1, inner = '';
          while (i < n && depth > 0) {                  // ${} 裡是真正的 JS，同一套規則
            if (s[i] === '{') depth++;
            else if (s[i] === '}') { depth--; if (!depth) { i++; break; } }
            inner += s[i]; i++;
          }
          out += stripJS(inner, removed) + '}';
          continue;
        }
        out += s[i]; i++;
      }
      prev = '`'; continue;
    }
    if (c === '/' && !/[\w$)\]]/.test(prev)) {          // 正則字面量
      let j = i + 1, cls = false, isRe = false;
      while (j < n) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === '[') cls = true;
        else if (s[j] === ']') cls = false;
        else if (s[j] === '/' && !cls) { isRe = true; break; }
        else if (s[j] === '\n') break;
        j++;
      }
      if (isRe) { out += s.slice(i, j + 1); i = j + 1; prev = '/'; continue; }
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

/* script 區塊的切法與 tests/syntaxtest.js 一致：「行首、獨佔一行」。
   ⚠ 不要用 /<script>[\s\S]*?<\/script>/ —— 檔案字串裡有假標籤（產生 PDF 那段），
     那種切法只會抓到其中幾段，而且看起來還「成功」了。 */
function scriptRanges(s) {
  const starts = [...s.matchAll(/^<script(?:\s[^>]*)?>[ \t]*$/gm)].map(m => m.index + m[0].length);
  const ends = [...s.matchAll(/^<\/script>[ \t]*$/gm)].map(m => m.index);
  const out = [];
  for (const a of starts) { const b = ends.find(x => x > a); if (b != null) out.push([a, b]); }
  return out;
}

// 抽出「識別字」與「字串字面量」序列 —— 驗證用的指紋（吃的是 JS 原始碼陣列）
function fingerprint(codes) {
  const ids = [], strs = [];
  for (const code of codes) {
    for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g))
      strs.push(m[1] !== undefined ? m[1] : m[2]);
    for (const m of code.matchAll(/\b[A-Za-z_$][\w$]*\b/g)) ids.push(m[0]);
  }
  return { ids, strs };
}

function build(src, bag) {
  const ranges = scriptRanges(src);
  if (ranges.length < 2) throw new Error(`只切到 ${ranges.length} 段 script，切法可能壞了`);

  // ① 剝 JS 註解
  let out = '', last = 0;
  const newRanges = [];
  for (const [a, b] of ranges) {
    const stripped = stripJS(src.slice(a, b), bag.removed);
    new vm.Script(stripped);                      // 解析不過就直接拋
    out += src.slice(last, a);
    newRanges.push([out.length, out.length + stripped.length]);
    bag.jsAfter.push(stripped);                   // 驗證用：剝完的 JS（尚未做後續處理）
    out += stripped;
    last = b;
  }
  out += src.slice(last);

  /* 換成等量換行，而不是整段刪掉 —— 行號才會與原始檔對齊（見下面第 ④ 點）。 */
  const nl = m => '\n'.repeat(m.split('\n').length - 1);

  /* ② HTML 註解只能剝在 script 區塊「之外」。
     區塊之內是 JS，樣板字串裡的 <!--ALERTS--> 是佔位標記，剝掉會靜默壞掉。 */
  let html = '', prev = 0;
  for (const [a, b] of newRanges) {
    html += out.slice(prev, a).replace(/<!--[\s\S]*?-->/g, nl) + out.slice(a, b);
    prev = b;
  }
  out = html + out.slice(prev).replace(/<!--[\s\S]*?-->/g, nl);

  // ③ 樣式表區塊裡的註解（純 CSS，安全）
  const i = out.indexOf('\n<style>') + 1, j = out.indexOf('\n</style>') + 1;
  if (i > 0 && j > i) out = out.slice(0, i) + out.slice(i, j).replace(/\/\*[\s\S]*?\*\//g, nl) + out.slice(j);

  /* ④ 刻意**不**收合剝完留下的空行。量過三個面向都是「不收」比較好：
       ・更小：821KB vs 827KB —— 整片純換行的重複性極高，gzip 壓得比夾雜內容更好
       ・更安全：收空行會動到樣板字串裡的空白，那些是會輸出到畫面上的
       ・行號對齊：線上檔案的第 N 行就是原始檔的第 N 行，線上出事直接對得上，
         而且「後續處理沒有動到 JS」那一關可以嚴格逐位元組比對 */
  return out;
}

function verify(src, out, bag) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  /* ① 最重要的一關：每一段被移除的東西，本身必須真的是一段註解。
     這一關獨立於剝註解器的邏輯 —— 只要它哪次吃掉了字串、正則或程式碼，
     那段東西就不會長得像註解，這裡就會紅。
     （用「拿剝過的原始碼去比對輸出」驗不到這件事：那等於拿它驗自己。） */
  const bad = bag.removed.filter(r =>
    !((r.startsWith('/*') && r.endsWith('*/') && r.length >= 4) ||
      (r.startsWith('//') && !r.includes('\n'))));
  add(`移除的 ${bag.removed.length} 段全都是註解`, bad.length === 0,
    bad.length ? `例如：${JSON.stringify(bad[0].slice(0, 60))}` : '');

  /* ② 剝完 JS 之後的後續處理（剝 HTML 註解、CSS 註解、收空行）不可以動到 JS。
     歷史事故：全域剝 HTML 註解，把樣板字串裡的 <!--ALERTS--> 佔位標記吃掉了。 */
  const after = scriptRanges(out).map(([a, b]) => out.slice(a, b));
  const jsIntact = bag.jsAfter.length === after.length
    && bag.jsAfter.every((v, k) => v === after[k]);
  add(`後續處理沒有動到 ${bag.jsAfter.length} 段 JS`, jsIntact);

  /* ③ 指紋比對：剝過的原始碼 vs 最終輸出。與 ② 部分重疊，
     但它會直接指出「差在哪一個識別字」，出事時好查。 */
  const A = fingerprint(bag.jsAfter), B = fingerprint(after);
  const same = (x, y) => x.length === y.length && x.every((v, k) => v === y[k]);
  let firstDiff = '';
  if (!same(A.ids, B.ids)) {
    for (let k = 0; k < Math.max(A.ids.length, B.ids.length); k++)
      if (A.ids[k] !== B.ids[k]) { firstDiff = `第一個差異 @${k}：${A.ids[k]} → ${B.ids[k]}`; break; }
  }
  add(`識別字序列一致（${A.ids.length} 個）`, same(A.ids, B.ids), firstDiff);
  add(`字串序列一致（${A.strs.length} 個）`, same(A.strs, B.strs));

  // 已知陷阱：JS 裡的 HTML 註解是佔位標記，不可以被剝掉
  const inJs = s => scriptRanges(s).reduce((n, [a, b]) => n + (s.slice(a, b).match(/<!--/g) || []).length, 0);
  add('JS 裡的 HTML 佔位標記還在', inJs(src) === inJs(out), `${inJs(src)} → ${inJs(out)}`);

  /* 「有的話必須保留」—— 來源根本沒有版本號時略過（合成測資會這樣）。
     真的少了 APP_VERSION 是另一個層級的問題，syntaxtest 那邊本來就守著。 */
  const ver = s => (s.match(/const APP_VERSION\s*=\s*'([\d.]+)'/) || [])[1] || '';
  add(`版本號保留（${ver(src) || '來源沒有，略過'}）`, !ver(src) || ver(src) === ver(out));

  let parsed = true;
  for (const [a, b] of scriptRanges(out)) { try { new vm.Script(out.slice(a, b)); } catch (_) { parsed = false; } }
  add('每段 script 都解析得過', parsed);
  add('樣式表仍然只有一個', (out.match(/^<style>[ \t]*$/gm) || []).length === 1);

  return checks;
}

module.exports = { stripJS, build, verify, scriptRanges, fingerprint };

// ── 主程序（被 require 時不執行，tests/slimbuildtest.js 要拿它做單元測試）──
if (require.main === module) {
  const srcPath = process.argv[2] || 'index.html';
  const outPath = process.argv[3] || '_site/index.html';
  const src = fs.readFileSync(srcPath, 'utf8');
  const bag = { removed: [], jsAfter: [] };
  const out = build(src, bag);

  let bad = 0;
  for (const c of verify(src, out, bag)) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? '  → ' + c.detail : ''}`);
    if (!c.ok) bad++;
  }
  if (bad) {
    console.error(`\n✗ 驗證未通過（${bad} 項），不產生輸出 —— 寧可發舊版，也不要發一個安靜壞掉的版本`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out);
  const kb = n => (n / 1024).toFixed(0) + ' KB';
  console.log(`\n  ${kb(Buffer.byteLength(src))} → ${kb(Buffer.byteLength(out))}`
    + `（少 ${((1 - Buffer.byteLength(out) / Buffer.byteLength(src)) * 100).toFixed(1)}%）　→ ${outPath}`);
}
