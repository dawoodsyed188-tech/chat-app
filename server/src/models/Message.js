import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    userId: {
      type: String,
      trim: true
    },
    color: {
      type: String,
      trim: true
    },
    context: {
      type: String,
      enum: ['room', 'direct'],
      default: 'room',
      index: true
    },
    roomId: {
      type: String,
      trim: true,
      default: 'general',
      index: true
    },
    recipientId: {
      type: String,
      trim: true,
      index: true
    },
    recipientName: {
      type: String,
      trim: true,
      maxlength: 40
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('Message', messageSchema);
