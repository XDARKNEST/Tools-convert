// Queue manager — sequential processing (FFmpeg WASM is single-instance heavy).
import { idbGet, idbSet } from './idb.js';

export class Queue {
  constructor({ engine, onUpdate }) { this.engine = engine; this.onUpdate = onUpdate; this.items = []; this.paused = false; this.running = false; }
  add(file) {
    this.items.push({
      id: crypto.randomUUID(), file, name: file.name, size: file.size,
      status: 'waiting', progress: 0, subtitleTracks: null, output: null, outName: file.name.replace(/\.mkv$/i,'.mp4'),
      eta: '', _t0: 0
    });
    this.persistMeta();
  }
  get(id){ return this.items.find(i=>i.id===id); }
  remove(id){ this.items = this.items.filter(i=>i.id!==id); this.persistMeta(); this.onUpdate(); }
  clear(){ this.items = []; this.persistMeta(); this.onUpdate(); }
  retry(id){ const it = this.get(id); if (it){ it.status='waiting'; it.progress=0; this.onUpdate(); this.startAll(this._mode||'remux'); } }
  pauseAll(){ this.paused = true; }
  async startAll(mode){
    this._mode = mode; this.paused = false;
    if (this.running) return; this.running = true;
    try {
      for (const it of this.items) {
        if (this.paused) break;
        if (it.status === 'completed' || it.status === 'running') continue;
        await this._process(it, mode);
      }
    } finally { this.running = false; this.onUpdate(); }
  }
  async _process(it, mode) {
    try {
      it.status = 'analyzing'; it._t0 = performance.now(); this.onUpdate();
      it.subtitleTracks = await this.engine.probe(it.file);
      it.status = 'encoding'; this.onUpdate();
      const { mp4, srt } = await this.engine.convert(it.file, mode, p => {
        it.progress = p;
        const dt = (performance.now() - it._t0)/1000;
        if (p > 0.02) { const total = dt / p; it.eta = `ETA ${Math.max(0, total - dt).toFixed(0)}s`; }
        this.onUpdate();
      });
      it.output = mp4; it.srt = srt; it.progress = 1; it.status = 'completed'; it.eta = '';
    } catch(e) {
      console.error(e); it.status = 'failed'; it.error = e.message || String(e);
    }
    this.onUpdate();
  }
  persistMeta(){
    const meta = this.items.map(({id,name,size,status})=>({id,name,size,status}));
    idbSet('queue-meta', meta).catch(()=>{});
  }
  async restore(){
    // metadata only — File handles are not persistable across reloads
    const meta = await idbGet('queue-meta').catch(()=>null);
    if (!meta) return; // user must re-add files; we surface nothing to avoid confusion
  }
}
