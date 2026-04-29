import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40
    },
    description: {
      type: String,
      trim: true,
      maxlength: 120
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('Room', roomSchema);
