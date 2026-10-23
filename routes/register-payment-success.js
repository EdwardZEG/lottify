const express = require('express');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const router = express.Router();

const mercadoPago = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

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
  const paymentId = req.query.payment_id || req.query.collection_id;
  const externalReference = req.query.external_reference;

  if (!paymentId || !externalReference) {
    return res.redirect('/dashboard?error=payment-verification-failed');
  }

  try {
    const payment = await new Payment(mercadoPago).get({ id: String(paymentId) });
    if (!payment || String(payment.external_reference) !== String(externalReference)) {
      return res.redirect('/dashboard?error=payment-verification-failed');
    }

    const user = await User.findById(externalReference);
    if (!user) {
      return res.redirect('/dashboard?error=user-not-found');
    }

    if (payment.status === 'approved') {
      await User.findByIdAndUpdate(externalReference, {
        subscriptionStatus: 'premium',
        subscriptionDate: new Date(),
        subscriptionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
      return res.redirect('/dashboard?success=subscription-activated');
    }

    if (payment.status === 'pending' || payment.status === 'in_process') {
      return res.redirect('/dashboard?info=payment-pending');
    }

    return res.redirect('/dashboard?error=payment-failed');
  } catch (error) {
    console.error('Error procesando suscripción:', error.message);
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
