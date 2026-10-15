const { z } = require('zod');
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const schema = z.object({ rollNumber: z.string().trim().min(1).max(32), courseId: objectId });
console.log('Valid:', schema.safeParse({ rollNumber: 'ME21701', courseId: '507f1f77bcf86cd799439011' }));
console.log('Invalid:', schema.safeParse({ rollNumber: 'ME21701', courseId: 'invalid' }));