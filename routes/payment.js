const express = require('express');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const PendingRegistration = require('../models/PendingRegistration');
const router = express.Router();

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

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
      unit_price: 10, // Cambia el precio según tu necesidad
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

module.exports = router;
