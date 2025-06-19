const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  grade: { type: String, required: true },
  dob: { type: Date, required: true },
  school: { type: String, required: true },
  branch: { type: String },
  mobileNumber: { type: String, required: true },
  alternatePhoneNumber: { type: String, required: false },
  completedTests: [{
    testType: String,
    completedAt: Date,
    score: Number
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);