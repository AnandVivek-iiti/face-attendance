const { z } = require('zod');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { ML_PATHS, ML_DECISION } = require('../config/constants');

const imageQualitySchema = z.object({
  status: z.string().min(1),
  blurScore: z.number().nullable().optional(),
  brightnessScore: z.number().nullable().optional(),
  message: z.string().nullable().optional()
});

const faceSchema = z
  .object({
    faceId: z.string().min(1),
    bbox: z.array(z.number()).length(4),
    detectionConfidence: z.number().nullable().optional(),
    faceQuality: z.number().nullable().optional(),
    studentId: z.string().min(1).nullable().optional(),
    similarity: z.number().nullable().optional(),
    decision: z.enum(Object.values(ML_DECISION)),
    embedding: z.array(z.number().finite()).optional()
  })
  .superRefine((face, ctx) => {
    if (face.decision !== ML_DECISION.UNKNOWN && (!face.studentId || face.similarity == null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Identified face requires studentId and similarity' });
    }
  });

const summarySchema = z.object({
  detectedFaces: z.number(),
  highConfidence: z.number(),
  needsReview: z.number(),
  unknown: z.number()
});

const perImageQualitySchema = imageQualitySchema.extend({ index: z.number().int().nonnegative() });

const analysisSchema = z.object({
  imageQuality: imageQualitySchema,
  imageQualities: z.array(perImageQualitySchema).default([]),
  faces: z.array(faceSchema).default([]),
  summary: summarySchema.optional()
});

const embeddingSchema = z.object({
  embedding: z.array(z.number().finite()).min(1),
  embeddingModel: z.string().min(1).optional(),
  embeddingDim: z.number().int().positive().optional(),
  faceQuality: z.number().nullable().optional(),
  detectionConfidence: z.number().nullable().optional(),
  bbox: z.array(z.number()).optional()
});

const invalidResponse = () => new AppError('Invalid ML service response', 502, { code: 'ML_INVALID_RESPONSE' });

// The ML service reports errors as {"error": {"code": "...", "message": "..."}}.
// Older FastAPI-style bodies used a flat "detail" string; accept both.
const rejectionMessage = (body) => {
  if (body && body.error && typeof body.error.message === 'string') return body.error.message;
  if (body && typeof body.detail === 'string') return body.detail;
  if (body && typeof body.message === 'string') return body.message;
  return 'ML service rejected the image';
};

const rejectionCode = (body) => (body && body.error && typeof body.error.code === 'string' ? body.error.code : null);

const post = async (path, form) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.mlTimeoutMs);
  try {
    let response;
    try {
      response = await fetch(`${env.mlServiceUrl}${path}`, {
        method: 'POST',
        body: form,
        headers: env.mlApiKey ? { 'X-API-Key': env.mlApiKey } : undefined,
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === 'AbortError') throw new AppError('ML service timeout', 504, { code: 'ML_TIMEOUT' });
      throw new AppError('ML service unavailable', 503, { code: 'ML_UNAVAILABLE' });
    }

    let body = null;
    try {
      body = await response.json();
    } catch (error) {
      if (error.name === 'AbortError') throw new AppError('ML service timeout', 504, { code: 'ML_TIMEOUT' });
      body = null;
    }

    if (response.status >= 400 && response.status < 500) {
      throw new AppError(rejectionMessage(body), 422, { code: rejectionCode(body) || 'ML_REJECTED' });
    }
    if (!response.ok) throw new AppError('ML service error', 502, { code: 'ML_ERROR' });
    if (body === null) throw invalidResponse();
    return body;
  } finally {
    clearTimeout(timer);
  }
};

const imageBlob = (buffer, filename, mimeType) => new Blob([buffer], { type: mimeType });

const parse = (schema, body) => {
  const result = schema.safeParse(body);
  if (!result.success) throw invalidResponse();
  return result.data;
};

const generateEmbedding = async ({ buffer, filename, mimeType }) => {
  const form = new FormData();
  form.append('image', imageBlob(buffer, filename, mimeType), filename);
  const body = await post(ML_PATHS.EMBEDDING, form);
  return parse(embeddingSchema, body);
};

/**
 * Send every classroom image in a single request so the ML service can
 * deduplicate a student across photos and return image-prefixed face ids.
 *
 * @param {Array<{buffer: Buffer, filename: string, mimeType: string}>} images
 * @param {Array<{studentId: string, embeddings: number[][]}>} gallery
 */
const analyzeClassroom = async ({ images, gallery, embeddingModel, includeEmbeddings = true, allowEmptyStudents = false }) => {
  const form = new FormData();
  images.forEach((image) => {
    form.append('images', imageBlob(image.buffer, image.filename, image.mimeType), image.filename);
  });
  form.append('students', JSON.stringify(gallery));
  if (embeddingModel) form.append('embeddingModel', embeddingModel);
  if (includeEmbeddings) form.append('includeEmbeddings', 'true');
  if (allowEmptyStudents) form.append('allowEmptyStudents', 'true');

  const body = await post(ML_PATHS.ANALYZE, form);
  return parse(analysisSchema, body);
};

module.exports = { generateEmbedding, analyzeClassroom };
