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

function paymentReturnFields(req) {
  const source = { ...req.query, ...(req.body || {}) };
  const clean = (value) => {
    if (value == null) return '';
    const text = String(value);
    return text === 'null' || text === 'undefined' ? '' : text;
  };
  return {
    paymentId: clean(source.payment_id || source.collection_id),
    status: clean(source.status || source.collection_status),
    externalReference: clean(source.external_reference),
    preferenceId: clean(source.preference_id)
  };
}

const { subscriptionPaymentState, activatePremium } = require('./payment');

// Nueva ruta para éxito de suscripción. El modal de prueba puede volver por GET o POST.
async function handleSubscriptionPaymentSuccess(req, res) {
  const { paymentId, status, externalReference, preferenceId } = paymentReturnFields(req);
  const sessionUserId = req.session.userId ? String(req.session.userId) : '';

  try {
    let paymentStatus = status;
    let targetUserId = externalReference || sessionUserId;

    if (paymentId && process.env.MP_ACCESS_TOKEN) {
      try {
        const payment = await new Payment(mercadoPago).get({ id: paymentId });
        const apiStatus = payment && (payment.status || (payment.body && payment.body.status));
        const apiReference = payment && (payment.external_reference || (payment.body && payment.body.external_reference));
        if (apiStatus) paymentStatus = String(apiStatus);
        if (apiReference) targetUserId = String(apiReference);
      } catch (apiError) {
        console.error('No se pudo consultar el pago de prueba:', apiError.message);
      }
    }

    if (paymentStatus === 'pending' || paymentStatus === 'in_process') {
      return res.redirect('/dashboard?info=payment-pending');
    }

    if ((paymentStatus !== 'approved' || !targetUserId) && sessionUserId) {
      const user = await User.findById(sessionUserId);
      if (user && user.subscriptionStatus !== 'premium') {
        const state = await subscriptionPaymentState(user);
        if (state === 'approved') {
          await activatePremium(user._id);
          return res.redirect('/dashboard?success=subscription-activated');
        }
        if (state === 'pending') return res.redirect('/dashboard?info=payment-pending');
      }
    }

    if (paymentStatus !== 'approved' || !targetUserId || (!paymentId && !preferenceId && !externalReference)) {
      return res.redirect('/dashboard?error=payment-failed');
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.redirect('/dashboard?error=user-not-found');
    }

    const sameSession = sessionUserId && sessionUserId === String(user._id);
    const sameReference = externalReference && externalReference === String(user._id);
    const samePreference = preferenceId && user.mercadoPagoPreferenceId === preferenceId;
    if (!sameSession && !sameReference && !samePreference) {
      return res.redirect('/dashboard?error=payment-verification-failed');
    }

    await activatePremium(user._id);
    return res.redirect('/dashboard?success=subscription-activated');
  } catch (error) {
    console.error('Error procesando suscripción:', error.message);
    return res.redirect('/dashboard?error=subscription-failed');
  }
}

router.get('/subscription/payment-success', handleSubscriptionPaymentSuccess);
router.post('/subscription/payment-success', handleSubscriptionPaymentSuccess);

// Rutas de fallo y pendiente para suscripción
router.get('/subscription/payment-failure', (req, res) => {
  res.redirect('/dashboard?error=payment-failed');
});

router.get('/subscription/payment-pending', (req, res) => {
  res.redirect('/dashboard?info=payment-pending');
});

module.exports = router;
