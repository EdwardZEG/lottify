const express = require('express');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const router = express.Router();

// Ruta que se llama desde Mercado Pago al volver con pago exitoso (REGISTRO)
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
  req.session.userId = user._id;
  await PendingRegistration.deleteOne({ preferenceId: preference_id });
  res.redirect('/dashboard');
});

// Nueva ruta para éxito de suscripción
router.get('/subscription/payment-success', async (req, res) => {
  const { preference_id, external_reference } = req.query;
  
  if (!preference_id || !external_reference) {
    return res.redirect('/dashboard?error=payment-verification-failed');
  }

  try {
    // Buscar al usuario por el external_reference
    const user = await User.findById(external_reference);
    if (!user) {
      return res.redirect('/dashboard?error=user-not-found');
    }

    // Actualizar el usuario como suscriptor premium
    await User.findByIdAndUpdate(external_reference, {
      subscriptionStatus: 'premium',
      subscriptionDate: new Date(),
      subscriptionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 días
    });

    console.log(`Suscripción activada para usuario: ${user.email}`);

    // Redirigir al dashboard con mensaje de éxito
    res.redirect('/dashboard?success=subscription-activated');
  } catch (error) {
    console.error('Error procesando suscripción:', error);
    res.redirect('/dashboard?error=subscription-failed');
  }
});

// Rutas de fallo y pendiente para suscripción
router.get('/subscription/payment-failure', (req, res) => {
  res.redirect('/dashboard?error=payment-failed');
});

router.get('/subscription/payment-pending', (req, res) => {
  res.redirect('/dashboard?info=payment-pending');
});

module.exports = router;
