const express = require('express');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const PendingRegistration = require('../models/PendingRegistration');
const User = require('../models/User');
const router = express.Router();

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

let checkedPublicKey;

async function publicKeyForCheckout() {
  if (checkedPublicKey !== undefined) return checkedPublicKey;
  const key = process.env.MP_PUBLIC_KEY;
  if (!key) {
    checkedPublicKey = null;
    return null;
  }
  try {
    const response = await fetch(
      'https://api.mercadopago.com/v1/payment_methods?public_key=' + encodeURIComponent(key)
    );
    checkedPublicKey = response.ok ? key : null;
  } catch (err) {
    checkedPublicKey = null;
  }
  return checkedPublicKey;
}

function requestBaseUrl(req) {
  const host = req.get('host');
  if (!host) return process.env.BASE_URL;
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return `${proto}://${host}`;
}

// Ruta original para registro con pago
router.post('/create-preference', async (req, res) => {
  const { fullname, email, password } = req.body;
  // Validación básica
  if (!fullname || !email || !password) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }
  const isHttps = process.env.BASE_URL && process.env.BASE_URL.startsWith('https://');
  const successUrl = `${process.env.BASE_URL}/register/payment-success`;
  const preferenceData = {
    items: [{
      title: 'Registro Plataforma',
      unit_price: 10, // Precio de registro
      quantity: 1
    }],
    payer: { email },
    back_urls: {
      success: successUrl,
      failure: `${process.env.BASE_URL}/register/payment-failure`,
      pending: `${process.env.BASE_URL}/register/payment-pending`
    }
  };
  if (isHttps) {
    preferenceData.auto_return = 'approved';
  }
  console.log('URL de éxito Mercado Pago:', successUrl);
  try {
    const preference = new Preference(client);
    const response = await preference.create({ body: preferenceData });
    // Guardar datos temporales con el preferenceId
    await PendingRegistration.create({
      preferenceId: response.id,
      fullname,
      email,
      password
    });
    res.json({ id: response.id });
  } catch (err) {
    console.error('Error Mercado Pago:', err);
    if (err.cause && err.cause.response) {
      // Si Mercado Pago responde con detalles
      const mpError = await err.cause.response.text();
      console.error('Detalle Mercado Pago:', mpError);
      return res.status(400).json({ error: 'Mercado Pago: ' + mpError });
    }
    res.status(500).json({ error: 'Error creando preferencia de pago' });
  }
});

// Nueva ruta para suscripción desde dashboard
router.post('/create-subscription-preference', async (req, res) => {
  // Verificar que el usuario esté logueado
  if (!req.session.userId && !req.session.user) {
    return res.status(401).json({ error: 'Usuario no autenticado' });
  }

  try {
    const userId = req.session.userId || (req.session.user && req.session.user._id);
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Falta MP_ACCESS_TOKEN en el entorno' });
    }

    const baseUrl = requestBaseUrl(req);
    if (!baseUrl) {
      return res.status(500).json({ error: 'No se pudo armar la dirección de regreso del pago' });
    }

    const isHttps = baseUrl.startsWith('https://');
    const successUrl = `${baseUrl}/subscription/payment-success`;
    
    const preferenceData = {
      items: [{
        id: 'lottify-premium-30',
        title: 'Suscripción Premium - Lottify',
        description: 'Acceso premium por 30 días',
        quantity: 1,
        currency_id: 'MXN',
        unit_price: 25
      }],
      payer: { 
        email: user.email
      },
      back_urls: {
        success: successUrl,
        failure: `${baseUrl}/subscription/payment-failure`,
        pending: `${baseUrl}/subscription/payment-pending`
      },
      external_reference: user._id.toString()
    };
    
    if (isHttps) {
      preferenceData.auto_return = 'approved';
    }

    const preference = new Preference(client);
    const response = await preference.create({ body: preferenceData });

    await User.findByIdAndUpdate(user._id, {
      mercadoPagoPreferenceId: response.id
    });
    
    const publicKey = await publicKeyForCheckout();
    res.json({ 
      id: response.id,
      init_point: response.init_point,
      public_key: publicKey,
      checkout: publicKey ? 'modal' : 'redirect'
    });
  } catch (err) {
    console.error('Error creando preferencia de suscripción:', err);
    if (err.cause && err.cause.response) {
      const mpError = await err.cause.response.text();
      console.error('Detalle Mercado Pago:', mpError);
      return res.status(400).json({ error: 'Mercado Pago: ' + mpError });
    }
    res.status(500).json({ error: 'Error creando preferencia de suscripción' });
  }
});

module.exports = router;
