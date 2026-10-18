require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const mlClient = require("../src/services/mlClient");

const originalFetch = global.fetch;
test.afterEach(() => {
  global.fetch = originalFetch;
});

const input = {
  images: [{ buffer: Buffer.from([1, 2, 3]), filename: "a.jpg", mimeType: "image/jpeg" }],
  gallery: [],
};
const embeddingInput = {
  buffer: Buffer.from([1, 2, 3]),
  filename: "a.jpg",
  mimeType: "image/jpeg",
};
const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status });

const validBody = {
  imageQuality: {
    status: "good",
    blurScore: 184.5,
    brightnessScore: 0.78,
    message: null,
  },
  faces: [
    {
      faceId: "face_001",
      bbox: [120, 80, 240, 220],
      detectionConfidence: 0.98,
      faceQuality: 0.91,
      studentId: "ME23XXXX",
      similarity: 0.94,
      decision: "high_confidence",
    },
  ],
  summary: { detectedFaces: 1, highConfidence: 1, needsReview: 0, unknown: 0 },
};

test("accepts the documented ML response", async () => {
  global.fetch = async () => jsonResponse(validBody);
  const result = await mlClient.analyzeClassroom(input);
  assert.equal(result.faces[0].studentId, "ME23XXXX");
});

test("maps connection failure to 503", async () => {
  global.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(mlClient.analyzeClassroom(input), {
    message: "ML service unavailable",
    statusCode: 503,
  });
});

test("retries a transient failure and then succeeds", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return calls < 3 ? jsonResponse({}, 503) : jsonResponse(validBody);
  };
  const result = await mlClient.analyzeClassroom(input);
  assert.equal(calls, 3);
  assert.equal(result.faces[0].studentId, "ME23XXXX");
});

test("does not retry a deterministic 4xx rejection", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return jsonResponse({ detail: "No face detected" }, 400);
  };
  await assert.rejects(mlClient.generateEmbedding(embeddingInput), { statusCode: 422 });
  assert.equal(calls, 1);
});

test("maps abort to 504", async () => {
  global.fetch = (url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    });
  await assert.rejects(mlClient.analyzeClassroom(input), {
    message: "ML service timeout",
    statusCode: 504,
  });
});

test("rejects malformed payloads with 502", async () => {
  global.fetch = async () => jsonResponse({ faces: "nope" });
  await assert.rejects(mlClient.analyzeClassroom(input), {
    message: "Invalid ML service response",
    statusCode: 502,
  });
});

test("rejects identified faces without a studentId", async () => {
  const body = {
    ...validBody,
    faces: [{ ...validBody.faces[0], studentId: null }],
  };
  global.fetch = async () => jsonResponse(body);
  await assert.rejects(mlClient.analyzeClassroom(input), { statusCode: 502 });
});

test("maps ML 5xx to 502 and ML 4xx to 422 with the ML message", async () => {
  global.fetch = async () => jsonResponse({}, 500);
  await assert.rejects(mlClient.generateEmbedding(embeddingInput), {
    message: "ML service error",
    statusCode: 502,
  });
  global.fetch = async () => jsonResponse({ detail: "No face detected" }, 400);
  await assert.rejects(mlClient.generateEmbedding(embeddingInput), {
    message: "No face detected",
    statusCode: 422,
  });
});

test("validates embedding payload", async () => {
  global.fetch = async () =>
    jsonResponse({ embedding: [0.1, 0.2], faceQuality: 0.9 });
  const result = await mlClient.generateEmbedding(embeddingInput);
  assert.equal(result.embedding.length, 2);
  global.fetch = async () => jsonResponse({ embedding: [] });
  await assert.rejects(mlClient.generateEmbedding(embeddingInput), { statusCode: 502 });
});
