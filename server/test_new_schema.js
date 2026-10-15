const { z } = require('zod');
const text = (max) => z.string().trim().min(1).max(max);
const studentProfile = z.object({
  rollNumber: text(32),
  name: z.string().trim().optional(),
  year: z.coerce.number().int().min(1).max(6).optional(),
  semester: z.coerce.number().int().min(1).max(12).optional(),
  department: text(100),
  courseId: z.string().trim().min(1).optional()
});

// Test 1: Valid data
const res1 = studentProfile.safeParse({ 
  rollNumber: "ME21701", 
  name: "Test Student", 
  department: "ME", 
  courseId: "507f1f77bcf86cd799439011" 
});
console.log("Test 1 - Valid with courseId:", res1.success);

// Test 2: Without courseId (optional)
const res2 = studentProfile.safeParse({ 
  rollNumber: "ME21701", 
  name: "Test Student", 
  department: "ME" 
});
console.log("Test 2 - Without courseId:", res2.success);

// Test 3: Empty rollNumber should fail
const res3 = studentProfile.safeParse({ 
  rollNumber: "", 
  name: "Test Student", 
  department: "ME" 
});
console.log("Test 3 - Empty rollNumber:", !res3.success);
if (!res3.success) console.log("  Issue:", res3.error.issues[0].message);

// Test 4: Empty department should fail
const res4 = studentProfile.safeParse({ 
  rollNumber: "ME21701", 
  name: "Test Student", 
  department: "" 
});
console.log("Test 4 - Empty department:", !res4.success);
if (!res4.success) console.log("  Issue:", res4.error.issues[0].message);

// Test 5: rollNumber too long
const res5 = studentProfile.safeParse({ 
  rollNumber: "A".repeat(33), 
  name: "Test Student", 
  department: "ME" 
});
console.log("Test 5 - rollNumber too long:", !res5.success);
if (!res5.success) console.log("  Issue:", res5.error.issues[0].message);

// Test 6: Empty department
const res6 = studentProfile.safeParse({ 
  rollNumber: "ME21701", 
  name: "Test Student", 
  department: "" 
});
console.log("Test 6 - Empty department:", !res6.success);
if (!res6.success) console.log("  Issue:", res6.error.issues[0].message);

// Test 7: courseId empty string should now be optional/valid
const res7 = studentProfile.safeParse({ 
  rollNumber: "ME21701", 
  name: "Test Student", 
  department: "ME",
  courseId: "" 
});
console.log("Test 7 - courseId empty string:", res7.success);
if (!res7.success) console.log("  Issue:", res7.error.issues[0].message);