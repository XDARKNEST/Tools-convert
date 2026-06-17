// Convert MKV to MP4 by Lenz — main UI module
import { Queue } from './queue.js';
import { Engine } from './engine.js';
import { parseSubtitle, renderSubtitleFrame } from './subtitle.js';
import { idbGet, idbSet } from './idb.js';
import { FAQ } from './faq.js';

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

// ---------- THEME ----------
const themeBtn = $('#themeBtn');
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.dataset.theme = savedTheme;
document.documentElement.classList.toggle('dark', savedTheme === 'dark');
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  document.documentElement.classList.toggle('dark', next === 'dark');
  localStorage.setItem('theme', next);
});
$('#yr').textContent = new Date().getFullYear();

// ---------- FAQ ----------
const faqEl = $('#faqList');
faqEl.innerHTML = FAQ.map(([q,a]) => `<details class="faq"><summary>${q}</summary><p>${a}</p></details>`).join('');

// ---------- PWA ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false;
});
$('#installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice;
  deferredPrompt = null; $('#installBtn').hidden = true;
});

// ---------- ENGINE ----------
const engine = new Engine({
  onState: (s, msg) => { $('#engineState').textContent = s; if (msg) $('#engineMsg').textContent = msg; },
});
$('#loadEngine').addEventListener('click', async () => {
  $('#loadEngine').disabled = true;
  try { await engine.load(); $('#loadEngine').textContent = '✓ Engine ready'; }
  catch(e){ $('#loadEngine').disabled = false; $('#engineMsg').textContent = 'Failed: ' + e.message; }
});

// ---------- QUEUE ----------
const queue = new Queue({ engine, onUpdate: renderQueue });
queue.restore();

function renderQueue() {
  const list = $('#queueList');
  $('#qCount').textContent = queue.items.length;
  list.innerHTML = '';
  for (const it of queue.items) {
    const li = document.createElement('li');
    li.className = 'qitem';
    const badgeCls = it.status === 'completed' ? 'ok' : it.status === 'failed' ? 'err' : (it.status==='waiting'?'':'run');
    li.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="truncate font-medium text-sm flex-1" title="${it.name}">${it.name}</span>
        <span class="badge ${badgeCls}">${it.status}</span>
      </div>
      <div class="bar"><div style="width:${(it.progress*100).toFixed(1)}%"></div></div>
      <div class="meta">
        <span>${humanSize(it.size)} · ${it.subtitleTracks?.length||0} subs</span>
        <span>${it.eta||''}</span>
      </div>
      <div class="flex gap-2 mt-2 flex-wrap">
        <button class="chip" data-act="preview">👁 Preview</button>
        ${it.status==='completed' ? '<button class="chip" data-act="dl">⬇ Download</button>' : ''}
        ${it.status==='failed' ? '<button class="chip" data-act="retry">↻ Retry</button>' : ''}
        <button class="chip" data-act="remove">✕</button>
      </div>`;
    li.querySelectorAll('button').forEach(b => b.addEventListener('click', () => onItemAction(it.id, b.dataset.act)));
    list.appendChild(li);
  }
  $('#downloadAll').disabled = !queue.items.some(i => i.status==='completed');
}

async function onItemAction(id, act) {
  const it = queue.get(id); if (!it) return;
  if (act === 'remove') queue.remove(id);
  else if (act === 'retry') queue.retry(id);
  else if (act === 'dl' && it.output) downloadBlob(it.output, it.outName);
  else if (act === 'preview') preview(it);
}

function humanSize(n){ if(!n) return '0 B'; const u=['B','KB','MB','GB']; let i=0; while(n>=1024&&i<u.length-1){n/=1024;i++;} return n.toFixed(1)+' '+u[i]; }

function downloadBlob(blob, name){
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
}

// ---------- DROPZONE ----------
const dz = $('#dropzone'), fileInput = $('#fileInput');
dz.addEventListener('click', e => { if (e.target.tagName !== 'BUTTON') fileInput.click(); });
$('#pickFiles').addEventListener('click', e => { e.stopPropagation(); fileInput.removeAttribute('webkitdirectory'); fileInput.click(); });
$('#pickFolder').addEventListener('click', e => { e.stopPropagation(); fileInput.setAttribute('webkitdirectory',''); fileInput.click(); });
fileInput.addEventListener('change', () => addFiles([...fileInput.files]));
['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
dz.addEventListener('drop', async e => {
  const files = [];
  if (e.dataTransfer.items) {
    for (const it of e.dataTransfer.items) {
      const entry = it.webkitGetAsEntry?.();
      if (entry) await walkEntry(entry, files); else if (it.getAsFile) { const f = it.getAsFile(); if (f) files.push(f); }
    }
  } else files.push(...e.dataTransfer.files);
  addFiles(files);
});
async function walkEntry(entry, out){
  if (entry.isFile) await new Promise(r => entry.file(f => { out.push(f); r(); }));
  else if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = await new Promise(r => reader.readEntries(r));
    for (const e of entries) await walkEntry(e, out);
  }
}
function addFiles(files){
  const mkvs = files.filter(f => /\.mkv$/i.test(f.name)).slice(0, 100 - queue.items.length);
  if (!mkvs.length) return alert('Please select MKV files.');
  mkvs.forEach(f => queue.add(f));
  renderQueue();
}

// ---------- ACTIONS ----------
$('#startAll').addEventListener('click', async () => {
  if (!engine.ready) { try { await engine.load(); } catch(e){ return alert('Load engine first'); } }
  const mode = document.querySelector('input[name="mode"]:checked').value;
  queue.startAll(mode);
});
$('#pauseAll').addEventListener('click', () => queue.pauseAll());
$('#clearAll').addEventListener('click', () => { if(confirm('Clear queue?')) queue.clear(); });
$('#downloadAll').addEventListener('click', async () => {
  const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
  const zip = new JSZip();
  for (const it of queue.items) if (it.status==='completed' && it.output) zip.file(it.outName, it.output);
  const blob = await zip.generateAsync({ type:'blob' });
  downloadBlob(blob, 'lenz-converted.zip');
});

// ---------- PREVIEW ----------
const video = $('#previewVideo'), canvas = $('#subCanvas'), trackSel = $('#subTrack');
let currentSubs = null, rafId = 0;
async function preview(it){
  video.src = URL.createObjectURL(it.file);
  trackSel.innerHTML = (it.subtitleTracks||[]).map((t,i)=>`<option value="${i}">#${t.id} · ${t.lang||'und'} · ${t.format}${t.default?' · default':''}</option>`).join('') || '<option>No subs</option>';
  trackSel.onchange = () => loadSub(it, +trackSel.value);
  if ((it.subtitleTracks||[]).length) loadSub(it, 0);
  // hint
  if (it.subtitleTracks?.some(t => /ass|ssa/i.test(t.format))) $('#smartHint').classList.remove('hidden');
}
async function loadSub(it, idx){
  try {
    const t = it.subtitleTracks[idx];
    const text = await engine.extractSubtitleText(it.file, t);
    currentSubs = parseSubtitle(text, t.format);
  } catch(e){ currentSubs = null; }
}
function tick(){
  rafId = requestAnimationFrame(tick);
  const ctx = canvas.getContext('2d');
  canvas.width = video.clientWidth; canvas.height = video.clientHeight;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (currentSubs) renderSubtitleFrame(ctx, currentSubs, video.currentTime);
}
video.addEventListener('play', () => { cancelAnimationFrame(rafId); tick(); });
video.addEventListener('pause', () => cancelAnimationFrame(rafId));
