const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePicture: { type: String }, // Campo para la foto de perfil
  resetToken: String,
  resetTokenExpiration: Date,
  resetCode: String,
  resetCodeExpiration: Date,
  verified: { type: Boolean, default: false }, // Campo de verificación
  status: { type: String, enum: ["activo", "inactivo"], default: "activo" },
  profile: { type: String, enum: ["administrador", "usuario", "docente"], default: "usuario" },
  // Nuevos campos para suscripción
  subscriptionStatus: { 
    type: String, 
    enum: ["free", "premium", "expired"], 
    default: "free" 
  },
  subscriptionDate: { type: Date },
  subscriptionExpiry: { type: Date },
  mercadoPagoPreferenceId: { type: String }
});

userSchema.pre("save", async function (next) {
  if (this.isModified("profile") && this.profile) {
    this.profile = this.profile.toLowerCase();
  }
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
