process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.MONGODB_URI = process.env.E2E_MONGODB_URI || 'mongodb://127.0.0.1:27017/face_attendance_test';
process.env.ML_SERVICE_URL = 'http://ml.test';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.ML_TIMEOUT_MS = '2000';
process.env.UPLOAD_MAX_SIZE = '1000000';
