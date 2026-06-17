// Tiny IndexedDB key-value helper
const DB = 'lenz-db', STORE = 'kv';
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export async function idbGet(key){ const db = await open(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readonly').objectStore(STORE).get(key); tx.onsuccess=()=>res(tx.result); tx.onerror=()=>rej(tx.error); }); }
export async function idbSet(key, val){ const db = await open(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readwrite').objectStore(STORE).put(val,key); tx.onsuccess=()=>res(); tx.onerror=()=>rej(tx.error); }); }
