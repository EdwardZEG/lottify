const express = require('express');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const router = express.Router();

// Ruta que se llama desde Mercado Pago al volver con pago exitoso
router.get('/register/payment-success', async (req, res) => {
  const { preference_id } = req.query;
  if (!preference_id) {
    return res.render('register', { error: 'No se pudo verificar el pago. Por favor, asegúrate de volver al sitio desde Mercado Pago o contacta soporte.' });
  }
  // Buscar datos temporales por preferenceId
  const pending = await PendingRegistration.findOne({ preferenceId: preference_id });
  if (!pending) {
    return res.render('register', { error: 'No se encontraron datos de registro asociados al pago. Por favor, regístrate nuevamente.' });
  }
  const { fullname, email, password } = pending;
  // Verifica si el usuario ya existe
  const existing = await User.findOne({ email });
  if (existing) {
    await PendingRegistration.deleteOne({ preferenceId: preference_id });
    return res.render('register', { error: 'El correo ya está registrado.' });
  }
  // Crea el usuario
  const user = new User({ fullname, email, password });
  await user.save();
  req.session.user = user;
  await PendingRegistration.deleteOne({ preferenceId: preference_id });
  res.redirect('/dashboard');
});

module.exports = router;
