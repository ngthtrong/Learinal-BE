const { Schema, model, Types } = require("mongoose");

const QuestionSchema = new Schema(
  {
    questionId: { type: String, required: true },
    questionText: { type: String, required: true },
    options: { type: [String], required: true },
    correctAnswerIndex: { type: Number, required: true },
    explanation: { type: String },
    topicTags: { type: [String], default: [] },
    topicId: { type: String }, // ID của topic trong mục lục (tableOfContents) mà câu hỏi thuộc về
    topicStatus: { type: String },
    difficultyLevel: {
      type: String,
      enum: ["Remember", "Understand", "Apply", "Analyze"],
    },
  },
  { _id: false }
);

const QuestionSetSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true },
    subjectId: { type: Types.ObjectId, ref: "Subject", required: true },
    title: { type: String, required: true },
    status: {
      type: String,
      enum: [
        "Pending",
        "Processing",
        "Draft",
        "Public",
        "PendingValidation",
        "InReview",
        "Validated",
        "Rejected",
        "PendingApproval",
        "Published",
        "Error",
      ],
      required: true,
    },
    isShared: { type: Boolean, required: true, default: false },
    sharedUrl: { type: String, unique: true, sparse: true },
    questions: { type: [QuestionSchema], default: [] },
  },
  { timestamps: true, versionKey: false, collection: "questionSets" }
);

QuestionSetSchema.index({ userId: 1, subjectId: 1, status: 1, createdAt: -1 });

module.exports = model("QuestionSet", QuestionSetSchema);
