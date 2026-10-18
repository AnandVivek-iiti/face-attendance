FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    INSIGHTFACE_ROOT=/models \
    FACE_CROP_DIR=/app/storage/face-crops \
    PORT=8000

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the model into the image so a cold start does not re-download it.
RUN python -c "from insightface.app import FaceAnalysis; FaceAnalysis(name='buffalo_l', root='/models', allowed_modules=['detection','recognition'], providers=['CPUExecutionProvider'])"

COPY app ./app
# Run as a conventional non-root uid (1000) instead of root.
RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /app/storage/face-crops \
    && chown -R appuser:appuser /app /models
USER appuser

# Listens on $PORT (default 8000) so any host that injects it works: Cloud Run
# sets PORT=8080, local docker uses 8000.
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/health')"

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
