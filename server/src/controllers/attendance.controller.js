const asyncHandler = require("../utils/asyncHandler");
const sessionService = require("../services/sessionService");
const analysisService = require("../services/analysisService");
const recordService = require("../services/recordService");
const finalizationService = require("../services/finalizationService");
const historyService = require("../services/historyService");
const { success } = require("../utils/response");

const createSession = asyncHandler(async (req, res) =>
  success(res, await sessionService.createSession(req.user, req.body), {
    status: 201,
  }),
);

const addImages = asyncHandler(async (req, res) =>
  success(
    res,
    await sessionService.addImages(req.params.id, req.user, req.files),
    { status: 201 },
  ),
);

const analyze = asyncHandler(async (req, res) =>
  success(res, await analysisService.analyzeSession(req.params.id, req.user)),
);

const getSession = asyncHandler(async (req, res) =>
  success(res, await sessionService.getReview(req.params.id, req.user)),
);

const updateRecord = asyncHandler(async (req, res) =>
  success(
    res,
    await recordService.updateRecord(
      req.params.id,
      req.params.studentId,
      req.user,
      req.body,
    ),
  ),
);

const finalize = asyncHandler(async (req, res) =>
  success(
    res,
    await finalizationService.finalizeSession(req.params.id, req.user),
  ),
);

const history = asyncHandler(async (req, res) => {
  const { pagination, ...data } = await historyService.getHistory(
    req.user,
    req.query,
  );
  return success(res, data, { pagination });
});

module.exports = {
  createSession,
  addImages,
  analyze,
  getSession,
  updateRecord,
  finalize,
  history,
};
