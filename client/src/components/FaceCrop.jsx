export default function FaceCrop({ image, size, face, width = 40, className = '' }) {
  if (!image?.url || !size || !face) {
    return (
      <div
        className={`skeleton shrink-0 rounded border border-line ${className}`}
        style={{ width, height: width }}
        aria-hidden="true"
      />
    );
  }
  const [x1, y1, x2, y2] = face.bbox;
  const padX = (x2 - x1) * 0.25;
  const padY = (y2 - y1) * 0.25;
  const left = Math.max(0, x1 - padX);
  const top = Math.max(0, y1 - padY);
  const right = Math.min(size.width, x2 + padX);
  const bottom = Math.min(size.height, y2 + padY);
  const cropW = right - left;
  const cropH = bottom - top;
  const height = Math.round(width * (cropH / cropW));
  const posX = size.width === cropW ? 0 : (left / (size.width - cropW)) * 100;
  const posY = size.height === cropH ? 0 : (top / (size.height - cropH)) * 100;

  return (
    <div
      role="img"
      aria-label="Detected face"
      className={`shrink-0 rounded border border-line bg-no-repeat ${className}`}
      style={{
        width,
        height: Math.min(height, width * 1.5),
        backgroundImage: `url(${image.url})`,
        backgroundSize: `${(size.width / cropW) * 100}% ${(size.height / cropH) * 100}%`,
        backgroundPosition: `${posX}% ${posY}%`,
      }}
    />
  );
}
