// Keyboard + mouse input. Pointer lock is requested on canvas click (after a
// user gesture); headless screenshot mode never needs it.
// v2 (2026-11-18): reviewed, kept — edge-triggered pressedKeys survives slow frames.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressedKeys = new Set(); // edge buffer: survives slow frames
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicked = false;
    this.locked = false;
    this._handlers = [];
    const kd = (e) => { this.keys.add(e.code); this.pressedKeys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); };
    const ku = (e) => { this.keys.delete(e.code); };
    const mm = (e) => { if (this.locked) { this.mouseDX += e.movementX || 0; this.mouseDY += e.movementY || 0; } };
    const md = (e) => { if (e.button === 0 && e.target === canvas) this.clicked = true; }; // UI button clicks must not fire the gun
    const lc = () => { this.locked = document.pointerLockElement === canvas; };
    const cc = () => { try { canvas.requestPointerLock(); } catch (_) { /* headless: ignore */ } };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('mousemove', mm);
    window.addEventListener('mousedown', md);
    document.addEventListener('pointerlockchange', lc);
    canvas.addEventListener('click', cc);
    this._handlers = [[window, 'keydown', kd], [window, 'keyup', ku], [window, 'mousemove', mm], [window, 'mousedown', md], [document, 'pointerlockchange', lc]];
  }
  isDown(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressedKeys.has(code); }
  clearPressed() { this.pressedKeys.clear(); }
  consumeClick() { const c = this.clicked; this.clicked = false; return c; }
  takeMouse() { const dx = this.mouseDX, dy = this.mouseDY; this.mouseDX = 0; this.mouseDY = 0; return { dx, dy }; }
  // Test/autopilot hooks: pretend a key is held.
  press(code) { this.keys.add(code); }
  release(code) { this.keys.delete(code); }
  clear() { this.keys.clear(); }
}
