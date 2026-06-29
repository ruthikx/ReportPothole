const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['citizen', 'worker', 'engineer', 'supervisor', 'commissioner', 'admin'],
      default: 'citizen',
    },
    ward: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ward',
    },
    wardName: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    fcmToken: {
      type: String,
    },
    deviceId: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
