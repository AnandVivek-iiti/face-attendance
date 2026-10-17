// Feeds the pointer position into --mx / --my on whichever .lift surface is
// under the cursor, which drives the soft spotlight in index.css. One delegated
// listener, throttled to a frame, and only on devices with a real hover pointer.

let pending = null;
let frame = 0;

function apply() {
  frame = 0;
  if (!pending) return;
  const { el, x, y } = pending;
  pending = null;
  const box = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${x - box.left}px`);
  el.style.setProperty('--my', `${y - box.top}px`);
}

function onMove(event) {
  if (event.pointerType === 'touch') return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const el = target.closest('.lift');
  if (!el) return;
  pending = { el, x: event.clientX, y: event.clientY };
  if (!frame) frame = requestAnimationFrame(apply);
}

if (
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
  !window.__pointerGlowBound
) {
  window.__pointerGlowBound = true;
  document.addEventListener('pointermove', onMove, { passive: true });
}
