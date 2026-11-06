"""Synthetic, non-biometric test images (no real people)."""
import cv2, numpy as np

def _rng(seed): return np.random.default_rng(seed)

def checkerboard(h=960, w=1280, cell=40):
    y, x = np.indices((h, w)); g = (((y // cell) + (x // cell)) % 2 * 255).astype(np.uint8)
    return cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)

def noise(h=960, w=1280, seed=0):
    return _rng(seed).integers(0, 255, (h, w, 3), dtype=np.uint8)

def smooth_texture(h=960, w=1280, seed=1):
    n = _rng(seed).integers(0, 255, (h // 8, w // 8, 3), dtype=np.uint8)
    return cv2.resize(n, (w, h), interpolation=cv2.INTER_CUBIC)

def ornament_pattern(h=960, w=1280, step=90):
    """Repeating 'two eyes + mouth' motif: a decorative pattern that resembles faces."""
    img = np.full((h, w, 3), (200, 190, 170), np.uint8)
    for cy in range(step, h, step):
        for cx in range(step, w, step):
            cv2.circle(img, (cx, cy), 34, (90, 120, 160), -1)
            cv2.circle(img, (cx - 11, cy - 7), 5, (20, 20, 20), -1)
            cv2.circle(img, (cx + 11, cy - 7), 5, (20, 20, 20), -1)
            cv2.ellipse(img, (cx, cy + 9), (11, 5), 0, 0, 180, (20, 20, 20), 2)
    return img

def blank(h=960, w=1280, v=128): return np.full((h, w, 3), v, np.uint8)
def dark(h=960, w=1280): return np.full((h, w, 3), 5, np.uint8)
def tiny(h=200, w=200): return np.full((h, w, 3), 128, np.uint8)

PATTERNS = {"checkerboard": checkerboard, "noise": noise, "smooth_texture": smooth_texture,
            "ornament_faces": ornament_pattern, "blank": blank}

# --- degradations applied to ONE consented/bundled image (same identity, never cross-person) ---
def blur(img, k): return cv2.GaussianBlur(img, (0, 0), k)
def darken(img, f): return np.clip(img.astype(np.float32) * f, 0, 255).astype(np.uint8)
def downscale(img, f): return cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
def jpeg(img, q): return cv2.imdecode(cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, q])[1], 1)
def occlude_lower(img, bbox):
    x1, y1, x2, y2 = bbox; out = img.copy(); out[(y1 + y2) // 2 + 10:y2, x1:x2] = 90; return out
