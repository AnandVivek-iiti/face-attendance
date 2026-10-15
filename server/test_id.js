const mongoose = require('mongoose');
console.log('ObjectId string format:', mongoose.Types.ObjectId.isValid('507f1f77bcf86cd799439011'));
const id = new mongoose.Types.ObjectId();
console.log('Generated ID:', id);
console.log('ID string:', id.toString());
console.log('ID string length:', id.toString().length);