const { z } = require('zod');
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const schema = z.object({ rollNumber: z.string().trim().min(1).max(32), courseId: objectId });
const resValid = schema.safeParse({ rollNumber: 'ME21701', courseId: '507f1f77bcf86cd799439011' });
console.log('Valid success:', resValid.success);
if (!resValid.success) {
  console.log('Valid issues:', JSON.stringify(resValid.error.issues, null, 2));
}

const resInvalid = schema.safeParse({ rollNumber: 'ME21701', courseId: 'invalid' });
console.log('Invalid success:', resInvalid.success);
if (!resInvalid.success) {
  console.log('Invalid issues:', JSON.stringify(resInvalid.error.issues, null, 2));
}