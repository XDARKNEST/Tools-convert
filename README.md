# Convert MKV to MP4 by Lenz

100% client-side MKV → MP4 converter with full subtitle support (SSA, ASS, SRT, PGS, VobSub, WebVTT).
Built with vanilla HTML/CSS/JS, Tailwind (CDN), FFmpeg WASM, Web Workers, IndexedDB, and PWA.

## Run locally

Because FFmpeg WASM uses SharedArrayBuffer, the page must be served with COOP/COEP headers:

```
npx http-server -p 8080 --cors -H "Cross-Origin-Opener-Policy: same-origin" -H "Cross-Origin-Embedder-Policy: require-corp"
```

or simply:

```
python3 -m http.server 8080
```

(headers are also injected by the service worker after the first load).

## Deploy

- **Vercel** — `vercel.json` already sets COOP/COEP headers.
- **Netlify** — `netlify.toml` sets headers.
- **Cloudflare Pages / GitHub Pages** — uses `_headers` file (CF Pages) or relies on the service worker (GH Pages).

## Modes

| Mode | What it does |
|------|--------------|
| A — Fast Remux | Stream copy MKV→MP4 + extract SRT |
| B — Soft Subtitle | Embed subtitle as mov_text |
| C — Burn Subtitle | Bake ASS/SSA styling into video |
| D — Hybrid Android | Burn + SRT backup |

## Privacy

No upload. No tracking. No backend. Ever.
