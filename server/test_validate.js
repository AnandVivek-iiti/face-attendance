const { z } = require('zod');
const text = (max) => z.string().trim().min(1).max(max);
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");
const semester = z.coerce.number().int().min(1).max(12);
const studentProfile = z.object({ rollNumber: text(32), name: text(120).optional(), year: z.coerce.number().int().min(1).max(6).optional(), semester: semester.optional(), department: text(100), courseId: objectId });

// Test with valid data
const res1 = studentProfile.safeParse({ rollNumber: "ME21701", name: "Test", department: "ME", courseId: "507f1f77bcf86cd799439011" });
console.log("Valid with proper id:", res1.success);
if (!res1.success) {
  console.log("Issues:", JSON.stringify(res1.error.issues, null, 2));
}

// Test with empty courseId
const res2 = studentProfile.safeParse({ rollNumber: "ME21701", name: "Test", department: "ME", courseId: "" });
console.log("Valid with empty id:", res2.success);
if (!res2.success) {
  console.log("Issues:", JSON.stringify(res2.error.issues, null, 2));
}

// Test with rollNumber too long
const res3 = studentProfile.safeParse({ rollNumber: "A".repeat(33), name: "Test", department: "ME", courseId: "507f1f77bcf86cd799439011" });
console.log("Valid with long rollNumber:", res3.success);
if (!res3.success) {
  console.log("Issues:", JSON.stringify(res3.error.issues, null, 2));
}

// Test with empty department
const res4 = studentProfile.safeParse({ rollNumber: "ME21701", name: "Test", department: "", courseId: "507f1f77bcf86cd799439011" });
console.log("Valid with empty department:", res4.success);
if (!res4.success) {
  console.log("Issues:", JSON.stringify(res4.error.issues, null, 2));
}