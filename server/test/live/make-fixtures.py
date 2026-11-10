"""Builds the images used by test/live/mlLive.test.js from the public-domain astronaut photo bundled with scikit-image.
   pip install scikit-image opencv-python-headless numpy ; python test/live/make-fixtures.py <outdir>"""
import sys, os, numpy as np, cv2
from skimage import data
out = sys.argv[1] if len(sys.argv) > 1 else "live-fixtures"
os.makedirs(out, exist_ok=True)
bgr = cv2.cvtColor(data.astronaut(), cv2.COLOR_RGB2BGR)
big = cv2.resize(bgr, (1024, 1024))
w = lambda n, im: cv2.imwrite(os.path.join(out, n), im)
w("reference.jpg", big)  # the ML service demands a reference face of at least 96 px
# A sharp, textured "classroom": the native-resolution face pasted onto a busy background, so the whole photo is rated good.
bg = cv2.resize(cv2.cvtColor(data.coffee(), cv2.COLOR_RGB2BGR), (1280, 960))
def paste(canvas, face, x, y):
    out = canvas.copy(); out[y:y + face.shape[0], x:x + face.shape[1]] = face; return out
w("class_same.jpg", paste(bg, bgr, 384, 224))
w("class_blur.jpg", cv2.GaussianBlur(paste(bg, bgr, 384, 224), (0, 0), 14))
w("class_tiny.jpg", cv2.resize(cv2.resize(bgr, (64, 64)), (640, 640)))
w("class_two.jpg", paste(paste(bg, bgr, 60, 224), cv2.flip(bgr, 1), 700, 224))
w("noface.jpg", cv2.resize(cv2.cvtColor(data.coffee(), cv2.COLOR_RGB2BGR), (800, 600)))
print("fixtures in", out)
