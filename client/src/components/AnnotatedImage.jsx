import FaceBoundingBox from './FaceBoundingBox';

export default function AnnotatedImage({ image, size, faces, selectedKey, showLabels, onSelectFace }) {
  if (!image.url) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-ctl border border-line bg-scrim/60 text-sm text-muted">
        Image not available
      </div>
    );
  }
  return (
    <div className="relative w-full overflow-hidden rounded-ctl border border-line bg-scrim/50">
      <img
        src={image.url}
        alt={`Classroom photograph ${image.index + 1}`}
        className="block w-full select-none animate-fade"
        draggable="false"
      />
      {size &&
        faces.map((face) => (
          <FaceBoundingBox
            key={face.key}
            face={face}
            size={size}
            selected={face.key === selectedKey}
            showLabel={showLabels}
            onSelect={onSelectFace}
          />
        ))}
    </div>
  );
}
