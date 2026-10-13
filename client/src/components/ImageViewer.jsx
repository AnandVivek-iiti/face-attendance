import { useState } from 'react';
import AnnotatedImage from './AnnotatedImage';
import FaceDetail from './FaceDetail';
import PhotoTabs from './PhotoTabs';
import QualityAlert from './QualityAlert';
import ToggleSwitch from './ui/ToggleSwitch';
import { IMAGE_QUALITY } from '../utils/constants';
import { decisionConfig } from './ConfidenceBadge';
import { DECISION } from '../utils/constants';

const legend = [DECISION.HIGH, DECISION.REVIEW, DECISION.UNKNOWN];

export default function ImageViewer({
  images,
  sizes,
  faces,
  activeIndex,
  onChangeIndex,
  selectedKey,
  onSelectFace,
  onUploadNew,
}) {
  const [showLabels, setShowLabels] = useState(true);
  const image = images[activeIndex];
  if (!image) return null;

  const unusable = image.hasQuality && image.imageQuality.status === IMAGE_QUALITY.UNUSABLE;
  const imageFaces = unusable ? [] : faces.filter((face) => face.imageId === image.id);
  const selectedFace = faces.find((face) => face.key === selectedKey) ?? null;
  const imageById = Object.fromEntries(images.map((item) => [item.id, item]));

  return (
    <div className="space-y-3">
      {images.length > 1 && <PhotoTabs images={images} activeIndex={activeIndex} onChange={onChangeIndex} />}
      <QualityAlert
        quality={image.hasQuality ? image.imageQuality : null}
        photoLabel={images.length > 1 ? `Photo ${activeIndex + 1}` : undefined}
        onUploadNew={onUploadNew}
        compact
      />
      <div className={unusable ? 'opacity-50' : ''}>
        <AnnotatedImage
          image={image}
          size={sizes[image.id]}
          faces={imageFaces}
          selectedKey={selectedKey}
          showLabels={showLabels}
          onSelectFace={onSelectFace}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink" aria-label="Box legend">
          {legend.map((decision) => {
            const { label } = decisionConfig(decision);
            const border = decision === DECISION.HIGH ? 'solid' : decision === DECISION.REVIEW ? 'dashed' : 'dotted';
            const color = decision === DECISION.HIGH ? '#3dff3d' : decision === DECISION.REVIEW ? '#ffb454' : '#ff7b72';
            return (
              <li key={decision} className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-4" style={{ border: `2px ${border} ${color}` }} aria-hidden="true" />
                {label}
              </li>
            );
          })}
        </ul>
        <ToggleSwitch checked={showLabels} onChange={setShowLabels} label="Box labels" />
      </div>
      <div className="surface rounded-ctl border border-line p-3 animate-fade">
        <FaceDetail face={selectedFace} image={selectedFace ? imageById[selectedFace.imageId] : null} size={selectedFace ? sizes[selectedFace.imageId] : null} />
      </div>
    </div>
  );
}
