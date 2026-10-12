require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const enabled = Boolean(process.env.E2E_MONGODB_URI);
const SCENARIOS = {
  photo1: {
    imageQuality: {
      status: "good",
      blurScore: 180,
      brightnessScore: 0.7,
      message: null,
    },
    faces: [
      {
        faceId: "f1",
        bbox: [1, 2, 3, 4],
        detectionConfidence: 0.99,
        faceQuality: 0.9,
        studentId: "S001",
        similarity: 0.95,
        decision: "high_confidence",
      },
      {
        faceId: "f2",
        bbox: [5, 6, 7, 8],
        detectionConfidence: 0.98,
        faceQuality: 0.8,
        studentId: "S002",
        similarity: 0.93,
        decision: "high_confidence",
      },
      {
        faceId: "f3",
        bbox: [9, 9, 9, 9],
        detectionConfidence: 0.9,
        faceQuality: 0.6,
        studentId: "S003",
        similarity: 0.61,
        decision: "needs_review",
      },
      {
        faceId: "f4",
        bbox: [2, 2, 2, 2],
        detectionConfidence: 0.9,
        faceQuality: 0.5,
        studentId: null,
        similarity: null,
        decision: "unknown",
      },
    ],
    summary: {
      detectedFaces: 4,
      highConfidence: 2,
      needsReview: 1,
      unknown: 1,
    },
  },
  photo2: {
    imageQuality: {
      status: "good",
      blurScore: 150,
      brightnessScore: 0.6,
      message: null,
    },
    faces: [
      {
        faceId: "g1",
        bbox: [1, 1, 1, 1],
        detectionConfidence: 0.99,
        faceQuality: 0.95,
        studentId: "S001",
        similarity: 0.97,
        decision: "high_confidence",
      },
      {
        faceId: "g2",
        bbox: [3, 3, 3, 3],
        detectionConfidence: 0.99,
        faceQuality: 0.9,
        studentId: "S004",
        similarity: 0.9,
        decision: "high_confidence",
      },
    ],
    summary: {
      detectedFaces: 2,
      highConfidence: 2,
      needsReview: 0,
      unknown: 0,
    },
  },
  blurry: {
    imageQuality: {
      status: "unusable",
      blurScore: 3,
      brightnessScore: 0.1,
      message: "Image is too blurry",
    },
    faces: [],
    summary: {
      detectedFaces: 0,
      highConfidence: 0,
      needsReview: 0,
      unknown: 0,
    },
  },
};

const jpeg = (scenario, pad = 0) =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from(`SCENARIO:${scenario};`),
    Buffer.alloc(pad, 1),
  ]);

const startFakeMl = () =>
  new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const form = await new Response(Buffer.concat(chunks), {
        headers: { "content-type": req.headers["content-type"] },
      }).formData();
      const image = Buffer.from(await form.get("image").arrayBuffer()).toString(
        "latin1",
      );
      res.setHeader("content-type", "application/json");
      if (req.url === "/embeddings")
        return res.end(
          JSON.stringify({ embedding: [0.1, 0.2, 0.3], faceQuality: 0.9 }),
        );
      const gallery = JSON.parse(form.get("gallery"));
      server.lastGallery = gallery;
      const scenario = /SCENARIO:(\w+);/.exec(image)[1];
      return res.end(JSON.stringify(SCENARIOS[scenario]));
    });
    server.listen(0, () => resolve(server));
  });

test("end to end attendance flow", { skip: !enabled }, async (t) => {
  const ml = await startFakeMl();
  process.env.ML_SERVICE_URL = `http://127.0.0.1:${ml.address().port}`;
  const { app } = require("../src/app");
  const storageService = require("../src/services/storageService");
  const authService = require("../src/services/authService");
  const User = require("../src/models/User");
  storageService.ensureDirs();
  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, { token, body, form } = {}) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: form || (body ? JSON.stringify(body) : undefined),
    });
    return { status: response.status, json: await response.json() };
  };
  const login = async (email) =>
    (
      await call("POST", "/auth/login", {
        body: { email, password: "password123" },
      })
    ).json.data.token;
  const imageForm = (field, buffers, type = "image/jpeg") => {
    const form = new FormData();
    buffers.forEach((buffer, index) =>
      form.append(field, new Blob([buffer], { type }), `img${index}.jpg`),
    );
    return form;
  };

  t.after(async () => {
    server.close();
    ml.close();
    await mongoose.disconnect();
  });

  const hash = await authService.hashPassword("password123");
  const mk = (name, email, role, studentId) =>
    User.create({ name, email, role, passwordHash: hash, studentId });
  await mk("Admin", "admin@x.io", "admin");
  const prof = await mk("Prof", "prof@x.io", "professor");
  await mk("Prof2", "prof2@x.io", "professor");
  await mk("Stu1", "stu1@x.io", "student", "S001");
  await mk("Stu2", "stu2@x.io", "student", "S002");

  const bad = await call("POST", "/auth/login", {
    body: { email: "admin@x.io", password: "wrong-password" },
  });
  assert.equal(bad.status, 401);
  const admin = await login("admin@x.io");
  const professor = await login("prof@x.io");
  const professor2 = await login("prof2@x.io");
  const stu1 = await login("stu1@x.io");

  const studentIds = {};
  for (const n of [1, 2, 3, 4, 5]) {
    const res = await call("POST", "/students", {
      token: admin,
      body: {
        studentId: `S00${n}`,
        rollNumber: `R00${n}`,
        name: `Student ${n}`,
        department: "ME",
        semester: 3,
        section: "a",
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.section, "A");
    studentIds[n] = res.json.data._id;
  }
  await call("POST", "/students", {
    token: admin,
    body: {
      studentId: "S009",
      rollNumber: "R009",
      name: "Other",
      department: "ME",
      semester: 5,
      section: "B",
    },
  });
  const dup = await call("POST", "/students", {
    token: admin,
    body: {
      studentId: "S001",
      rollNumber: "R777",
      name: "Dup",
      department: "ME",
      semester: 3,
      section: "A",
    },
  });
  assert.equal(dup.status, 409);

  const noImage = await call(
    "POST",
    `/students/${studentIds[1]}/face/embedding`,
    { token: admin },
  );
  assert.equal(noImage.status, 409);

  const notImage = await call("POST", `/students/${studentIds[1]}/face`, {
    token: admin,
    form: imageForm("image", [Buffer.from("not an image at all")]),
  });
  assert.equal(notImage.status, 400);
  const wrongType = await call("POST", `/students/${studentIds[1]}/face`, {
    token: admin,
    form: imageForm("image", [jpeg("photo1")], "text/plain"),
  });
  assert.equal(wrongType.status, 400);
  const tooBig = await call("POST", `/students/${studentIds[1]}/face`, {
    token: admin,
    form: imageForm("image", [jpeg("photo1", 1_200_000)]),
  });
  assert.equal(tooBig.status, 413);

  for (const n of [1, 2, 3, 4]) {
    const face = await call("POST", `/students/S00${n}/face`, {
      token: admin,
      form: imageForm("image", [jpeg("photo1")]),
    });
    assert.equal(face.status, 201);
    assert.ok(face.json.data.registeredImage.startsWith("registered-faces/"));
    const emb = await call(
      "POST",
      `/students/${studentIds[n]}/face/embedding`,
      { token: admin },
    );
    assert.equal(emb.status, 200);
    assert.equal(emb.json.data.student.hasFaceEmbedding, true);
    assert.equal(emb.json.data.student.faceEmbedding, undefined);
  }
  const listed = await call("GET", "/students?semester=3&section=a", {
    token: admin,
  });
  assert.equal(listed.json.data.length, 5);
  assert.ok(listed.json.data.every((s) => s.faceEmbedding === undefined));
  assert.equal(listed.json.pagination.total, 5);
  assert.equal((await call("GET", "/students", { token: stu1 })).status, 403);
  assert.equal(
    (await call("GET", `/students/${studentIds[1]}`, { token: stu1 })).status,
    200,
  );
  assert.equal(
    (await call("GET", `/students/${studentIds[2]}`, { token: stu1 })).status,
    403,
  );

  const course = await call("POST", "/courses", {
    token: admin,
    body: {
      courseCode: "me301",
      courseName: "Thermo",
      professorId: String(prof._id),
      semester: 3,
      section: "A",
    },
  });
  assert.equal(course.status, 201);
  assert.equal(course.json.data.enrolledCount, 5);
  const courseId = course.json.data._id;
  const badProf = await call("POST", "/courses", {
    token: admin,
    body: {
      courseCode: "X",
      courseName: "X",
      professorId: String(prof._id).replace(/./, "0"),
      semester: 3,
      section: "A",
    },
  });
  assert.equal(badProf.status, 400);
  assert.equal(
    (await call("GET", `/courses/${courseId}`, { token: professor2 })).status,
    403,
  );
  assert.equal(
    (await call("GET", "/courses", { token: professor2 })).json.data.length,
    0,
  );
  assert.equal(
    (await call("GET", "/courses/" + "f".repeat(24), { token: admin })).status,
    404,
  );

  assert.equal(
    (
      await call("POST", "/attendance/sessions", {
        token: professor2,
        body: { courseId },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("POST", "/attendance/sessions", {
        token: professor,
        body: { courseId: "f".repeat(24) },
      })
    ).status,
    404,
  );
  const created = await call("POST", "/attendance/sessions", {
    token: professor,
    body: { courseId, date: "2026-10-05" },
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.data.status, "draft");
  const sessionId = created.json.data.id;
  const duplicate = await call("POST", "/attendance/sessions", {
    token: professor,
    body: { courseId, date: "2026-10-05" },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.json.code, "DUPLICATE_ATTENDANCE");

  assert.equal(
    (
      await call("POST", `/attendance/sessions/${sessionId}/analyze`, {
        token: professor,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("POST", `/attendance/sessions/${sessionId}/images`, {
        token: professor2,
        form: imageForm("images", [jpeg("photo1")]),
      })
    ).status,
    403,
  );
  const uploaded = await call(
    "POST",
    `/attendance/sessions/${sessionId}/images`,
    {
      token: professor,
      form: imageForm("images", [jpeg("photo1"), jpeg("photo2")]),
    },
  );
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.json.data.uploadedImages.length, 2);
  assert.equal(uploaded.json.data.uploadedImages[0].path, undefined);
  assert.equal(
    fs
      .readdirSync(storageService.dirs.temporary)
      .filter((f) => f !== ".gitkeep").length,
    0,
  );
  assert.equal(
    fs.readdirSync(path.join(storageService.dirs.attendanceImages, sessionId))
      .length,
    2,
  );

  assert.equal(
    (
      await call("POST", `/attendance/sessions/${sessionId}/analyze`, {
        token: professor2,
      })
    ).status,
    403,
  );
  const analyzed = await call(
    "POST",
    `/attendance/sessions/${sessionId}/analyze`,
    { token: professor },
  );
  assert.equal(analyzed.status, 200, JSON.stringify(analyzed.json));
  assert.equal(ml.lastGallery.length, 4);
  assert.equal(ml.lastGallery[0].embedding.length, 3);
  const { session, records, warnings } = analyzed.json.data;
  assert.equal(session.status, "review");
  assert.equal(records.length, 5);
  const rec = (code) => records.find((r) => r.student.studentId === code);
  assert.equal(rec("S001").status, "present");
  assert.equal(rec("S001").evidence.length, 2);
  assert.equal(rec("S001").confidence, 0.97);
  assert.equal(rec("S002").status, "present");
  assert.equal(rec("S003").status, "needs_review");
  assert.equal(rec("S004").status, "present");
  assert.equal(rec("S005").status, "absent");
  assert.equal(rec("S005").decision, "not_detected");
  assert.deepEqual(
    [
      session.presentCount,
      session.absentCount,
      session.needsReviewCount,
      session.totalStudents,
    ],
    [3, 1, 1, 5],
  );
  assert.equal(session.analysis.unknownFaces.length, 1);
  assert.equal(warnings[0].type, "missing_embeddings");
  assert.deepEqual(warnings[0].studentIds, ["S005"]);

  assert.equal(
    (await call("GET", `/attendance/sessions/${sessionId}`, { token: stu1 }))
      .status,
    403,
  );
  assert.equal(
    (
      await call("GET", `/attendance/sessions/${sessionId}`, {
        token: professor2,
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("GET", `/attendance/sessions/${sessionId}`, { token: admin }))
      .status,
    200,
  );

  const early = await call(
    "POST",
    `/attendance/sessions/${sessionId}/finalize`,
    { token: professor },
  );
  assert.equal(early.status, 409);
  assert.equal(early.json.code, "REVIEW_PENDING");
  assert.deepEqual(early.json.details.pendingStudentIds, ["S003"]);

  const hist0 = await call("GET", "/attendance/history", { token: stu1 });
  assert.equal(hist0.status, 200);
  assert.equal(hist0.json.data.summary.total, 0);

  const noRec = await call(
    "PUT",
    `/attendance/sessions/${sessionId}/records/S009`,
    { token: professor, body: { status: "present" } },
  );
  assert.equal(noRec.status, 404);
  assert.equal(
    (
      await call("PUT", `/attendance/sessions/${sessionId}/records/S003`, {
        token: professor2,
        body: { status: "present" },
      })
    ).status,
    403,
  );
  const confirmed = await call(
    "PUT",
    `/attendance/sessions/${sessionId}/records/S003`,
    { token: professor, body: { status: "present" } },
  );
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.json.data.record.status, "present");
  assert.equal(confirmed.json.data.record.source, "ai_reviewed");
  assert.equal(confirmed.json.data.record.reviewedByProfessor, true);
  assert.ok(confirmed.json.data.record.reviewedAt);
  assert.equal(confirmed.json.data.summary.needsReviewCount, 0);

  const manual = await call(
    "PUT",
    `/attendance/sessions/${sessionId}/records/${studentIds[5]}`,
    { token: professor, body: { status: "present", note: "seen late" } },
  );
  assert.equal(manual.json.data.record.source, "manual");
  assert.equal(manual.json.data.summary.presentCount, 5);
  const flipped = await call(
    "PUT",
    `/attendance/sessions/${sessionId}/records/S005`,
    { token: professor, body: { status: "absent" } },
  );
  assert.equal(flipped.json.data.summary.absentCount, 1);

  const unchanged = await call(
    "PUT",
    `/attendance/sessions/${sessionId}/records/S001`,
    { token: professor, body: { status: "present" } },
  );
  assert.equal(unchanged.json.data.record.source, "ai_reviewed");

  const noEvidence = await call(
    "PUT",
    `/attendance/sessions/${sessionId}/records/S005`,
    { token: professor, body: { reassignTo: "S004" } },
  );
  assert.equal(noEvidence.status, 422);
  const sameStudent = await call(
    "PUT",
    `/attendance/sessions/${sessionId}/records/S002`,
    { token: professor, body: { reassignTo: "S002" } },
  );
  assert.equal(sameStudent.status, 400);
  const moved = await call(
    "PUT",
    `/attendance/sessions/${sessionId}/records/S002`,
    { token: professor, body: { reassignTo: "S005" } },
  );
  assert.equal(moved.status, 200);
  assert.equal(moved.json.data.record.status, "absent");
  assert.equal(moved.json.data.record.evidence.length, 0);
  assert.equal(moved.json.data.relatedRecord.status, "present");
  assert.equal(moved.json.data.relatedRecord.aiStudentId, "S002");
  assert.equal(moved.json.data.relatedRecord.evidence.length, 1);

  const AuditLog = require("../src/models/AuditLog");
  const actions = (await AuditLog.find({ sessionId }).lean()).map(
    (a) => a.action,
  );
  for (const action of [
    "session_created",
    "images_uploaded",
    "analysis_completed",
    "ai_marked_present",
    "ai_flagged_review",
    "ai_marked_absent",
    "record_confirmed",
    "record_status_changed",
    "identity_changed",
  ]) {
    assert.ok(actions.includes(action), `missing audit ${action}`);
  }

  const finalized = await call(
    "POST",
    `/attendance/sessions/${sessionId}/finalize`,
    { token: professor },
  );
  assert.equal(finalized.status, 200, JSON.stringify(finalized.json));
  assert.equal(finalized.json.data.session.status, "finalized");
  assert.deepEqual(
    [
      finalized.json.data.session.presentCount,
      finalized.json.data.session.absentCount,
    ],
    [4, 1],
  );
  assert.equal(
    (
      await call("POST", `/attendance/sessions/${sessionId}/finalize`, {
        token: professor,
      })
    ).json.code,
    "SESSION_FINALIZED",
  );
  assert.equal(
    (
      await call("PUT", `/attendance/sessions/${sessionId}/records/S001`, {
        token: professor,
        body: { status: "absent" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("POST", `/attendance/sessions/${sessionId}/analyze`, {
        token: professor,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("POST", `/attendance/sessions/${sessionId}/images`, {
        token: professor,
        form: imageForm("images", [jpeg("photo1")]),
      })
    ).status,
    409,
  );

  const own = await call("GET", "/attendance/history", { token: stu1 });
  assert.equal(own.json.data.summary.total, 1);
  assert.equal(own.json.data.summary.present, 1);
  assert.equal(own.json.data.records[0].course.courseCode, "ME301");
  assert.equal(own.json.data.records[0].source, undefined);
  assert.equal(
    (await call("GET", "/attendance/history?studentId=S002", { token: stu1 }))
      .status,
    403,
  );
  assert.equal(
    (
      await call("GET", `/attendance/history?studentId=${studentIds[2]}`, {
        token: stu1,
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("GET", "/attendance/history?studentId=S001", { token: stu1 }))
      .status,
    200,
  );
  const profHistory = await call("GET", "/attendance/history", {
    token: professor,
  });
  assert.equal(profHistory.json.data.sessions.length, 1);
  assert.equal(profHistory.json.data.sessions[0].status, "finalized");
  assert.equal(
    (await call("GET", "/attendance/history", { token: professor2 })).json.data
      .sessions.length,
    0,
  );
  const profStudent = await call("GET", "/attendance/history?studentId=S002", {
    token: professor,
  });
  assert.equal(profStudent.json.data.summary.total, 1);
  assert.equal(profStudent.json.data.summary.absent, 1);

  const second = await call("POST", "/attendance/sessions", {
    token: professor,
    body: { courseId, date: "2026-10-06" },
  });
  const secondId = second.json.data.id;
  await call("POST", `/attendance/sessions/${secondId}/images`, {
    token: professor,
    form: imageForm("images", [jpeg("blurry")]),
  });
  const unusable = await call(
    "POST",
    `/attendance/sessions/${secondId}/analyze`,
    { token: professor },
  );
  assert.equal(unusable.status, 422);
  assert.equal(unusable.json.code, "IMAGE_UNUSABLE");
  assert.equal(unusable.json.message, "Image is too blurry");
  const failedView = await call("GET", `/attendance/sessions/${secondId}`, {
    token: professor,
  });
  assert.equal(failedView.json.data.session.status, "failed");
  assert.equal(failedView.json.data.records.length, 0);
  assert.equal(failedView.json.data.session.failure.code, "IMAGE_UNUSABLE");
  assert.equal(
    (
      await call("POST", `/attendance/sessions/${secondId}/finalize`, {
        token: professor,
      })
    ).status,
    409,
  );
  const again = await call("POST", `/attendance/sessions/${secondId}/analyze`, {
    token: professor,
  });
  assert.equal(again.status, 422);

  await call("POST", `/attendance/sessions/${secondId}/images`, {
    token: professor,
    form: imageForm("images", [jpeg("photo2")]),
  });
  const recovered = await call(
    "POST",
    `/attendance/sessions/${secondId}/analyze`,
    { token: professor },
  );
  assert.equal(recovered.status, 200, JSON.stringify(recovered.json));
  assert.equal(recovered.json.data.session.status, "review");
  assert.ok(
    recovered.json.data.warnings.some(
      (w) => w.type === "image_unusable" && w.message === "Image is too blurry",
    ),
  );
  assert.equal(recovered.json.data.session.failure, null);

  await call("PUT", `/attendance/sessions/${secondId}/records/S004`, {
    token: professor,
    body: { status: "absent" },
  });
  const reanalyzed = await call(
    "POST",
    `/attendance/sessions/${secondId}/analyze`,
    { token: professor },
  );
  assert.equal(reanalyzed.status, 200);
  const keptReview = reanalyzed.json.data.records.find(
    (r) => r.student.studentId === "S004",
  );
  assert.equal(keptReview.status, "absent");
  assert.equal(keptReview.reviewedByProfessor, true);

  const third = await call("POST", "/attendance/sessions", {
    token: professor,
    body: { courseId, date: "2026-10-07" },
  });
  const thirdId = third.json.data.id;
  await call("POST", `/attendance/sessions/${thirdId}/images`, {
    token: professor,
    form: imageForm("images", [jpeg("photo1")]),
  });
  ml.close();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const down = await call("POST", `/attendance/sessions/${thirdId}/analyze`, {
    token: professor,
  });
  assert.equal(down.status, 503);
  assert.equal(down.json.message, "ML service unavailable");
  assert.equal(
    (await call("GET", `/attendance/sessions/${thirdId}`, { token: professor }))
      .json.data.session.status,
    "failed",
  );

  const deleted = await call("DELETE", `/students/S003`, { token: admin });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.json.data.active, false);
  const updated = await call("PUT", `/students/S003`, {
    token: admin,
    body: { name: "Renamed" },
  });
  assert.equal(updated.json.data.name, "Renamed");
});
