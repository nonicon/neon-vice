// localStorage save: money, missions completed, best stats, player position.
// v2 (2026-11-18): reviewed, kept — save now also records 8-mission progress.
const KEY = 'neon-vice-save-v1';
export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object') return null;
    return d;
  } catch (_) { return null; }
}
export function saveGame(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      money: data.money | 0,
      missionsDone: data.missionsDone | 0,
      bestMoney: data.bestMoney | 0,
      carsStolen: data.carsStolen | 0,
      pos: data.pos ? [data.pos.x, data.pos.y, data.pos.z] : null,
      savedAt: Date.now(),
    }));
    return true;
  } catch (_) { return false; }
}
export function clearSave() { try { localStorage.removeItem(KEY); } catch (_) { /* ignore */ } }
export function hasSave() { return loadSave() !== null; }
