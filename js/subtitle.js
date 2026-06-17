// Minimal SRT/ASS parser + canvas renderer.
export function parseSubtitle(text, format) {
  if (!text) return [];
  if (/ass|ssa/i.test(format) || /^\[Script Info\]/m.test(text)) return parseASS(text);
  return parseSRT(text);
}

function tsToSec(t){ // 00:00:00,000 or 0:00:00.00
  const m = t.trim().replace(',', '.').match(/(\d+):(\d+):([\d.]+)/);
  if (!m) return 0; return (+m[1])*3600 + (+m[2])*60 + parseFloat(m[3]);
}
function parseSRT(text){
  const out = [];
  for (const blk of text.replace(/\r/g,'').split(/\n\n+/)) {
    const lines = blk.split('\n').filter(Boolean); if (lines.length < 2) continue;
    const tline = lines.find(l => l.includes('-->')); if (!tline) continue;
    const [a,b] = tline.split('-->').map(s => tsToSec(s));
    const i = lines.indexOf(tline);
    out.push({ start:a, end:b, text: lines.slice(i+1).join('\n').replace(/<[^>]+>/g,'') });
  }
  return out;
}
function parseASS(text){
  const out = []; const lines = text.split(/\r?\n/);
  const events = lines.findIndex(l => /^\[Events\]/i.test(l)); if (events<0) return out;
  let fmt = null;
  for (let i = events+1; i < lines.length; i++) {
    const l = lines[i]; if (/^\[/.test(l)) break;
    if (/^Format:/i.test(l)) { fmt = l.replace(/^Format:\s*/i,'').split(',').map(s=>s.trim()); continue; }
    if (/^Dialogue:/i.test(l) && fmt) {
      const vals = l.replace(/^Dialogue:\s*/i,'').split(',');
      const get = k => vals[fmt.indexOf(k)];
      const txt = vals.slice(fmt.indexOf('Text')).join(',').replace(/\{[^}]*\}/g,'').replace(/\\N/g,'\n');
      out.push({ start: tsToSec(get('Start')), end: tsToSec(get('End')), text: txt });
    }
  }
  return out;
}

export function renderSubtitleFrame(ctx, cues, t) {
  const active = cues.filter(c => t >= c.start && t <= c.end);
  if (!active.length) return;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const fs = Math.max(16, Math.round(H * 0.045));
  ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.lineWidth = Math.max(2, fs * 0.12); ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.fillStyle = '#fff';
  let y = H - 16;
  for (const c of active) {
    const lines = c.text.split('\n').reverse();
    for (const line of lines) { ctx.strokeText(line, W/2, y); ctx.fillText(line, W/2, y); y -= fs*1.15; }
  }
}
