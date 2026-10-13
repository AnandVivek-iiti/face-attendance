import { useEffect, useState, useCallback } from "react";

/**
 * Face thumbnail for the "Enroll faces" table.
 *  - Keeps the reveal (shimmer + blur) animation running until the image has
 *    FULLY loaded and decoded, then fades it in.
 *  - Click to expand into a full-size lightbox (Esc / click outside to close).
 *  - Reports load state so the row can keep Enroll disabled until the face is ready.
 *
 * <FaceThumb src={url} size={64} onReady={(ready) => setRowReady(ready)} />
 */
const CSS = `
.ft{position:relative;overflow:hidden;border-radius:10px;cursor:zoom-in;background:#14281f;flex:none;border:0;padding:0}
.ft img{width:100%;height:100%;object-fit:cover;display:block;transition:opacity .35s,filter .45s,transform .45s}
.ft[data-ready="false"] img{opacity:0;filter:blur(14px);transform:scale(1.08)}
.ft[data-ready="false"]::after{content:"";position:absolute;inset:0;
  background:linear-gradient(110deg,transparent 30%,rgba(120,255,190,.22) 50%,transparent 70%);
  background-size:200% 100%;animation:ft-sweep 1.1s linear infinite}
@keyframes ft-sweep{from{background-position:200% 0}to{background-position:-200% 0}}
.ft-box{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:rgba(0,0,0,.82);cursor:zoom-out;animation:ft-in .18s}
.ft-box img{max-width:min(92vw,900px);max-height:90vh;border-radius:14px;box-shadow:0 20px 70px #000;image-rendering:auto}
@keyframes ft-in{from{opacity:0}to{opacity:1}}
`;

export function useImageReady(src) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!src) return;
    let alive = true;
    const img = new Image();
    img.src = src;
    // decode() resolves only once the pixels are actually ready to paint
    (img.decode ? img.decode() : new Promise((ok, no) => { img.onload = ok; img.onerror = no; }))
      .then(() => alive && setReady(true))
      .catch(() => alive && setReady(true)); // don't leave a broken image spinning forever
    return () => { alive = false; };
  }, [src]);
  return ready;
}

export default function FaceThumb({ src, size = 64, alt = "Detected face", onReady }) {
  const ready = useImageReady(src);
  const [open, setOpen] = useState(false);

  useEffect(() => { onReady?.(ready); }, [ready, onReady]);

  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <style>{CSS}</style>
      <button type="button" className="ft" data-ready={ready} style={{ width: size, height: size }}
        onClick={() => ready && setOpen(true)} aria-label="Enlarge face">
        <img src={src} alt={alt} />
      </button>
      {open && (
        <div className="ft-box" onClick={close} role="dialog" aria-modal="true">
          <img src={src} alt={alt} />
        </div>
      )}
    </>
  );
}
