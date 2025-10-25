const { Schema, model, Types } = require('mongoose');

const UserAnswerSchema = new Schema({
  questionId: { type: String, required: true },
  selectedOptionIndex: { type: Number, required: true },
  isCorrect: { type: Boolean, required: true },
}, { _id: false });

const QuizAttemptSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', required: true },
  setId: { type: Types.ObjectId, ref: 'QuestionSet', required: true },
  score: { type: Number, required: true },
  userAnswers: { type: [UserAnswerSchema], required: true },
  isCompleted: { type: Boolean, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
}, { timestamps: true, versionKey: false, collection: 'quizAttempts' });

QuizAttemptSchema.index({ userId: 1, endTime: -1 });
QuizAttemptSchema.index({ setId: 1, endTime: -1 });

module.exports = model('QuizAttempt', QuizAttemptSchema);
