const mongoose = require('mongoose');

const responseSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  testType: {
    type: String,
    enum: ['level1', 'level2', 'level3'],
    required: true
  },
  grade: {
    type: String,
    required: true
  },
  responses: [{
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true
    },
    answer: mongoose.Schema.Types.Mixed,
    isCorrect: Boolean,
    timeTaken: Number
  }],
  score: {
    type: Number,
    required: true
  },
  totalQuestions: {
    type: Number,
    required: true
  },
  completedAt: {
    type: Date,
    default: Date.now
  }
});

responseSchema.index({ userId: 1, testType: 1 }, { unique: true });

module.exports = mongoose.model('TestResponse', responseSchema);