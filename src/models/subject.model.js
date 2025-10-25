const { Schema, model, Types } = require('mongoose');

const TopicSchema = new Schema({
  topicId: { type: String, required: true },
  topicName: { type: String, required: true },
  childTopics: { type: [this], default: [] },
}, { _id: false });

const SubjectSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', required: true },
  subjectName: { type: String, required: true, trim: true },
  description: { type: String },
  tableOfContents: { type: [TopicSchema], default: [] },
  summary: { type: String },
}, { timestamps: true, versionKey: false, collection: 'subjects' });

SubjectSchema.index({ userId: 1, subjectName: 1 });

module.exports = model('Subject', SubjectSchema);
