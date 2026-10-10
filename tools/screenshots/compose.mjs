/* Compose the raw captures into the README images: browser frames, side-by-side grids and phone mock-ups.
   Needs `cwebp` (libwebp) on the PATH. Output goes to docs/screenshots/. */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { SHOTS, DOCS } from './lib.mjs';

const uri = f => 'data:image/png;base64,' + readFileSync(path.join(SHOTS, f + '.png')).toString('base64');
const LIGHT = 'radial-gradient(1100px 700px at 10% 0%, #c9ecec 0%, rgba(201,236,236,0) 60%), radial-gradient(900px 600px at 100% 100%, #f6d9c8 0%, rgba(246,217,200,0) 60%), #eef3f1';
const css = `*{box-sizing:border-box}body{margin:0;font:600 15px -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif}
.stage{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}
.win{border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 40px 90px rgba(5,15,25,.45),0 8px 24px rgba(5,15,25,.3),0 0 0 1px rgba(255,255,255,.12)}
.bar{height:38px;display:flex;align-items:center;gap:8px;padding:0 16px;background:linear-gradient(#f3f4f6,#e5e7eb);color:#6b7280;font-size:13px}
.bar i{width:12px;height:12px;border-radius:50%;display:block}.bar i:nth-child(1){background:#ff5f57}.bar i:nth-child(2){background:#febc2e}.bar i:nth-child(3){background:#28c840}.bar span{margin:0 auto;transform:translateX(-24px)}
.crop{background-repeat:no-repeat;display:block}
.pill{position:absolute;left:18px;top:18px;padding:7px 14px;border-radius:999px;background:rgba(15,27,35,.82);color:#e9f6f7;font-size:14px;font-weight:700;letter-spacing:.01em;backdrop-filter:blur(6px)}
.cell{position:relative;border-radius:14px;overflow:hidden;box-shadow:0 18px 44px rgba(5,15,25,.28),0 0 0 1px rgba(0,0,0,.08)}
.phone{padding:13px;border-radius:52px;background:#0d1116;box-shadow:0 30px 70px rgba(5,15,25,.5),inset 0 0 0 2px #2a313a}
.phone .scr{border-radius:40px;overflow:hidden;position:relative}
.cap{position:absolute;bottom:26px;left:0;right:0;text-align:center;font-size:20px;font-weight:700}`;
const crop = (f, W, H, x, y, s) => `<div class="crop" style="width:${W}px;height:${H}px;background-image:url(${uri(f)});background-size:${W / (s.w || 1)}px;background-position:${-x * (W / s.w) / 1}px ${-y * (W / s.w) / 1}px"></div>`;
// img with natural size scaling: crop region (x,y,w,h) of raw image displayed at width outW
const region = (f, rx, ry, rw, rh, outW) => { const k = outW / rw; return `<div class="crop" style="width:${outW}px;height:${Math.round(rh * k)}px;background-image:url(${uri(f)});background-size:auto;background-size:${'RAWW'}px;background-position:${-rx * k}px ${-ry * k}px" data-f="${f}" data-k="${k}"></div>`; };
const RAW = { };
const sizeOf = f => { const b = readFileSync(path.join(SHOTS, f + '.png')); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const reg = (f, rx, ry, rw, rh, outW) => { const [W] = sizeOf(f); const k = outW / rw; return `<div class="crop" style="width:${outW}px;height:${Math.round(rh * k)}px;background-image:url(${uri(f)});background-size:${Math.round(W * k)}px auto;background-position:${-rx * k}px ${-ry * k}px"></div>`; };
const win = (f, outW, title = 'zipos.github.io/transit-lab') => { const [W, H] = sizeOf(f); return `<div class="win" style="width:${outW}px"><div class="bar"><i></i><i></i><i></i><span>${title}</span></div><img src="${uri(f)}" style="display:block;width:${outW}px"></div>`; };
const page = (w, h, bg, inner) => `<!doctype html><meta charset=utf-8><style>${css}</style><body><div class="stage" style="width:${w}px;height:${h}px;background:${bg}">${inner}</div>`;
const phone = (f, outW, extra = '') => { const [W, H] = sizeOf(f); const k = outW / W; return `<div class="phone"><div class="scr" style="width:${outW}px;height:${Math.round(H * k)}px"><img src="${uri(f)}" style="width:${outW}px;display:block"></div></div>${extra}`; };

const specs = {
  hero: () => page(1800, 1160, LIGHT, win('hero-light', 1640)),
  themes: () => {
    const [W, H] = sizeOf('hero-light'); const w = 1640, h = Math.round(H * w / W);
    return page(1800, 1160, LIGHT, `<div class="win" style="width:${w}px"><div class="bar"><i></i><i></i><i></i><span>zipos.github.io/transit-lab</span></div><div style="position:relative;width:${w}px;height:${h}px"><img src="${uri('hero-dark')}" style="position:absolute;inset:0;width:${w}px"><img src="${uri('hero-light')}" style="position:absolute;inset:0;width:${w}px;clip-path:polygon(0 0,57% 0,43% 100%,0 100%)"><div class="pill" style="left:auto;right:24px;top:auto;bottom:130px">Dark</div><div class="pill" style="left:470px;top:auto;bottom:130px;background:rgba(255,255,255,.9);color:#17323b">Light</div></div></div>`);
  },
  'line-inspector': () => page(1800, 1160, LIGHT, win('line-inspector', 1640)),
  results: () => page(1800, 1160, LIGHT, win('results', 1640)),
  'metro-draft': () => page(1800, 1160, LIGHT, win('metro-draft', 1640)),
  'metro-open': () => page(1800, 1160, LIGHT, win('metro-open', 1640)),
  tour: () => page(1800, 1160, LIGHT, win('tour', 1640)),
  layers: () => {
    const cells = [['layer-density', 'Resident density'], ['layer-access', 'Walk time to tram, rail or metro'], ['flows-crowding', 'Passenger flows & crowding'], ['layer-travel', 'Travel time from a point']];
    const c = cells.map(([f, t]) => `<div class="cell">${reg(f, 482, 95, 1678, 1170, 860)}<div class="pill">${t}</div></div>`).join('');
    return page(1800, 1330, LIGHT, `<div style="display:grid;grid-template-columns:860px 860px;gap:26px">${c}</div>`);
  },
  panels: () => {
    const cards = [['results', 'Results compared with the published network', 95], ['challenges', 'Challenges with budgets and star goals', 95], ['budget', 'Overloaded segments and budget mode', 152]];
    const c = cards.map(([f, t, y]) => `<div style="width:520px;text-align:center"><div class="cell">${reg(f, 0, y, 474, 1190, 520)}</div><div style="margin-top:22px;font-size:19px;font-weight:700;color:#17323b">${t}</div></div>`).join('');
    return page(1800, 1500, LIGHT, `<div style="display:flex;gap:40px;align-items:flex-start">${c}</div>`);
  },
  mobile: () => page(1800, 1260, LIGHT, `<div style="display:flex;gap:70px;align-items:center">${['m-map', 'm-network', 'm-line'].map(f => phone(f, 470)).join('')}</div>`),
  language: () => page(1400, 1260, LIGHT, `<div style="display:flex;gap:90px;align-items:center">${phone('m-line', 470)}${phone('m-pl-line', 470)}</div>`),
  zoom: () => page(1800, 760, LIGHT, `<div style="display:grid;grid-template-columns:860px 860px;gap:26px">${[['thin-region', 'Whole region · 911 vehicles'], ['thin-zoom', 'Zoomed in on Mikołów · all 34 vehicles']].map(([f, t]) => `<div class="cell">${reg(f, 0, 0, 1680, 1170, 860)}<div class="pill">${t}</div></div>`).join('')}</div>`),
  dialogs: () => page(1400, 860, LIGHT, `<div style="display:flex;gap:46px;align-items:center"><div class="cell" style="width:600px">${reg('modal-data', 556, 90, 1048, 1190, 600)}</div><div class="cell" style="width:600px">${reg('modal-plans', 556, 395, 1048, 560, 600)}</div></div>`),
};
export async function compose(b, only = []) {
  for (const [name, build] of Object.entries(specs)) {
    if (only.length && !only.includes(name)) continue;
    const html = build();
    const m = html.match(/class="stage" style="width:(\d+)px;height:(\d+)px/);
    const ctx = await b.newContext({ viewport: { width: +m[1], height: +m[2] }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.setContent(html, { waitUntil: 'load' });
    await p.waitForTimeout(400);
    const png = path.join(SHOTS, `${name}.composed.png`);
    await p.screenshot({ path: png });
    execFileSync('cwebp', ['-q', '82', '-m', '5', png, '-o', path.join(DOCS, `${name}.webp`)], { stdio: 'ignore' });
    console.log(name, `${m[1]}x${m[2]}`);
    await ctx.close();
  }
}
