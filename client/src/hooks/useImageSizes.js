import { useEffect, useState } from 'react';

export function useImageSizes(images) {
  const [sizes, setSizes] = useState({});
  const signature = images.map((image) => `${image.id}|${image.url}|${image.width}|${image.height}`).join(',');

  useEffect(() => {
    let cancelled = false;
    const next = {};
    const pending = [];
    for (const image of images) {
      if (image.width && image.height) {
        next[image.id] = { width: image.width, height: image.height };
      } else if (image.url) {
        pending.push(
          new Promise((resolve) => {
            const element = new Image();
            element.onload = () => {
              next[image.id] = { width: element.naturalWidth, height: element.naturalHeight };
              resolve();
            };
            element.onerror = resolve;
            element.src = image.url;
          }),
        );
      }
    }
    Promise.all(pending).then(() => {
      if (!cancelled) setSizes(next);
    });
    return () => {
      cancelled = true;
    };
  }, [signature]);

  return sizes;
}
