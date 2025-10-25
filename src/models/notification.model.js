const { Schema, model, Types } = require('mongoose');

const NotificationSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['info','success','warning','error'], default: 'info' },
  isRead: { type: Boolean, default: false },
  relatedEntityType: { type: String },
  relatedEntityId: { type: Types.ObjectId },
}, { timestamps: true, versionKey: false, collection: 'notifications' });

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = model('Notification', NotificationSchema);
