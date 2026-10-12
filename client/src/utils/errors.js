const CODE_MESSAGES = {
  INVALID_STUDENTS: 'No enrolled student has face data yet. Enroll student faces before analyzing.',
  EMBEDDING_MODEL_MISMATCH: 'Stored face data was made with a different model. Generate face data again for the students.',
  TOO_MANY_STUDENTS: 'This course has more students than one analysis can handle.',
  INVALID_IMAGE_COUNT: 'Upload between 1 and 5 photographs.',
  FILE_TOO_LARGE: 'A photograph is larger than 10 MB.',
  IMAGE_TOO_LARGE: 'A photograph has too many pixels. Use a smaller resolution.',
  UNSUPPORTED_MEDIA_TYPE: 'Only JPEG, PNG and WebP images are supported.',
};

function fromPayload(data) {
  if (!data) return null;
  if (typeof data === 'string') return data.trim() && data.length < 300 ? data : null;
  const nested = data.error && typeof data.error === 'object' ? data.error : null;
  const code = nested?.code ?? data.code;
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  if (nested?.message) return nested.message;
  if (data.message) return data.message;
  if (typeof data.error === 'string') return data.error;
  return null;
}

export function getErrorMessage(error, fallback = 'Something went wrong. Try again.') {
  if (!error) return fallback;
  const message = fromPayload(error.response?.data);
  if (message) return message;
  if (error.code === 'ECONNABORTED') return 'The server took too long to respond.';
  if (error.code === 'ERR_NETWORK' || (!error.response && error.request)) {
    return 'Cannot reach the server. Check your connection.';
  }
  const status = error.response?.status;
  if (status === 401) return 'Your session has expired. Sign in again.';
  if (status === 403) return 'You do not have permission to do this.';
  if (status === 404) return 'The requested item was not found.';
  if (status === 413) return 'The upload is too large.';
  if (status >= 500) return 'The server ran into a problem.';
  return error.message || fallback;
}
