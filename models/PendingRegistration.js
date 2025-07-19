const mongoose = require('mongoose');

const PendingRegistrationSchema = new mongoose.Schema({
  preferenceId: { type: String, required: true, unique: true },
  fullname: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 3600 } // Expira en 1 hora
});

module.exports = mongoose.model('PendingRegistration', PendingRegistrationSchema);
