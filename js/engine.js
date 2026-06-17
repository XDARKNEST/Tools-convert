// FFmpeg WASM engine wrapper. Lazy-loads ffmpeg.wasm from CDN (cached by SW + IndexedDB).
const CDN = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js';
const WASM = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm';

export class Engine {
  constructor({ onState }) { this.onState = onState || (()=>{}); this.ready = false; this.ffmpeg = null; this.busy = false; }
  async load() {
    if (this.ready) return;
    this.onState('loading', 'Downloading FFmpeg core (~31MB)…');
    const mod = await import(/* @vite-ignore */ CDN);
    const util = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js');
    this.ffmpeg = new mod.FFmpeg();
    this.ffmpeg.on('log', ({ message }) => { this._log = (this._log||'') + message + '\n'; });
    this.ffmpeg.on('progress', ({ progress }) => { if (this.onProgress) this.onProgress(Math.max(0, Math.min(1, progress))); });
    await this.ffmpeg.load({
      coreURL: await util.toBlobURL(CORE, 'text/javascript'),
      wasmURL: await util.toBlobURL(WASM, 'application/wasm'),
    });
    this._util = util;
    this.ready = true; this.onState('ready', '✓ FFmpeg ready · cached for offline');
  }

  async _withFile(file, fn) {
    while (this.busy) await new Promise(r=>setTimeout(r,80));
    this.busy = true;
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const inName = 'in.mkv';
      await this.ffmpeg.writeFile(inName, data);
      this._log = '';
      const result = await fn(inName);
      try { await this.ffmpeg.deleteFile(inName); } catch{}
      return result;
    } finally { this.busy = false; }
  }

  // Probe streams via ffmpeg -i (parses stderr log)
  async probe(file) {
    return this._withFile(file, async (inName) => {
      try { await this.ffmpeg.exec(['-i', inName]); } catch {}
      return parseStreams(this._log || '');
    });
  }

  async extractSubtitleText(file, track) {
    return this._withFile(file, async (inName) => {
      const out = 'sub.srt';
      try {
        await this.ffmpeg.exec(['-i', inName, '-map', `0:${track.id}`, '-c:s', 'srt', out]);
        const data = await this.ffmpeg.readFile(out);
        await this.ffmpeg.deleteFile(out);
        return new TextDecoder().decode(data);
      } catch(e) { return ''; }
    });
  }

  async convert(file, mode, onProgress) {
    this.onProgress = onProgress;
    return this._withFile(file, async (inName) => {
      const out = 'out.mp4';
      let args;
      if (mode === 'remux')  args = ['-i', inName, '-map','0:v:0','-map','0:a?','-c','copy', out];
      else if (mode === 'soft') args = ['-i', inName, '-map','0:v:0','-map','0:a?','-map','0:s?','-c:v','copy','-c:a','copy','-c:s','mov_text', out];
      else if (mode === 'burn' || mode === 'hybrid') {
        // burn first subtitle track if exists
        args = ['-i', inName, '-vf', `subtitles=${inName}`, '-c:v','libx264','-preset','veryfast','-crf','22','-c:a','aac','-b:a','160k', out];
      } else args = ['-i', inName, '-c','copy', out];
      await this.ffmpeg.exec(args);
      const data = await this.ffmpeg.readFile(out);
      await this.ffmpeg.deleteFile(out);
      const mp4 = new Blob([data.buffer], { type:'video/mp4' });
      let extra = null;
      if (mode === 'remux' || mode === 'hybrid') {
        try {
          await this.ffmpeg.writeFile('in2.mkv', new Uint8Array(await file.arrayBuffer()));
          await this.ffmpeg.exec(['-i','in2.mkv','-map','0:s:0','sub.srt']);
          const s = await this.ffmpeg.readFile('sub.srt');
          extra = new Blob([s.buffer], { type:'application/x-subrip' });
          await this.ffmpeg.deleteFile('in2.mkv'); await this.ffmpeg.deleteFile('sub.srt');
        } catch{}
      }
      this.onProgress = null;
      return { mp4, srt: extra };
    });
  }
}

function parseStreams(log) {
  const out = []; const rx = /Stream #0:(\d+)(?:\((\w+)\))?: Subtitle: (\w+)([^\n]*)/g;
  let m; while ((m = rx.exec(log))) {
    out.push({ id: +m[1], lang: m[2]||'und', format: m[3], default: /\(default\)/.test(m[4]), forced: /\(forced\)/.test(m[4]) });
  } return out;
}
