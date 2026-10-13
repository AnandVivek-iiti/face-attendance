import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, UploadCloud, X } from 'lucide-react';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MAX_IMAGES } from '../utils/constants';
import { formatBytes } from '../utils/format';

function readDimensions(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const element = new Image();
    element.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: element.naturalWidth, height: element.naturalHeight });
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    element.src = url;
  });
}

export default function ImageUploader({
  files,
  onChange,
  disabled = false,
  heading = 'Drag classroom photographs here',
  noun = 'photograph',
  maxFiles = MAX_IMAGES,
}) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState(null);

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );

  useEffect(() => () => previews.forEach((item) => URL.revokeObjectURL(item.url)), [previews]);

  const addFiles = async (incoming) => {
    const list = Array.from(incoming);
    const messages = [];
    const accepted = [];
    for (const file of list) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        messages.push(`${file.name} is not a JPEG, PNG or WebP image.`);
      } else if (file.size > MAX_IMAGE_BYTES) {
        messages.push(`${file.name} is larger than ${formatBytes(MAX_IMAGE_BYTES)}.`);
      } else {
        const size = await readDimensions(file);
        if (size && size.width * size.height > MAX_IMAGE_PIXELS) {
          messages.push(`${file.name} has more than ${MAX_IMAGE_PIXELS / 1000000} million pixels.`);
        } else {
          accepted.push(file);
        }
      }
    }
    const room = maxFiles - files.length;
    if (accepted.length > room) messages.push(`You can upload up to ${maxFiles} ${noun}s.`);
    setProblem(messages.length ? messages.join(' ') : null);
    if (accepted.length && room > 0) onChange((current) => [...current, ...accepted.slice(0, room)]);
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) addFiles(event.dataTransfer.files);
  };

  const removeAt = (index) => {
    setProblem(null);
    onChange(files.filter((_, position) => position !== index));
  };

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center rounded-panel border-2 border-dashed px-6 py-8 text-center transition-all duration-200 ${
          dragging
            ? 'border-primary bg-primary-soft shadow-glass'
            : 'glass border-line hover:border-primary/50'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <UploadCloud size={30} className="text-primary" aria-hidden="true" />
        <p className="mt-2 text-sm font-semibold text-ink">{heading}</p>
        <p className="mt-0.5 text-xs text-muted">
          JPEG, PNG or WebP, up to {formatBytes(MAX_IMAGE_BYTES)} each. One or several.
        </p>
        <button
          type="button"
          disabled={disabled || files.length >= maxFiles}
          onClick={() => input.current?.click()}
          className="ripple mt-3 inline-flex items-center gap-1.5 rounded-ctl border border-line bg-white/10 px-3 py-1.5 text-sm font-semibold text-ink transition duration-150 hover:bg-white/[0.16] disabled:opacity-50"
        >
          <ImagePlus size={16} aria-hidden="true" />
          {files.length ? `Add more ${noun}s` : `Choose ${noun}s`}
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          multiple
          hidden
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {problem && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {problem}
        </p>
      )}

      {previews.length > 0 && (
        <ul className="stagger mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {previews.map((item, index) => (
            <li
              key={`${item.file.name}-${item.file.lastModified}-${index}`}
              className="glass lift overflow-hidden rounded-panel border border-line"
            >
              <div className={`relative aspect-[4/3] bg-scrim/50 ${disabled ? 'scan-loop' : ''}`}>
                <img src={item.url} alt={`${noun} ${index + 1} preview`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                  aria-label={`Remove ${noun} ${index + 1}`}
                  className="absolute right-1.5 top-1.5 rounded-full bg-scrim/80 p-1 text-white ring-1 ring-white/20 transition hover:bg-scrim disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="px-2 py-1.5 text-xs">
                <p className="font-semibold capitalize text-ink">{noun} {index + 1}</p>
                <p className="truncate text-muted" title={item.file.name}>
                  {item.file.name} ({formatBytes(item.file.size)})
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
