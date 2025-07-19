const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Envía un correo de verificación con diseño personalizado.
 * @param {string} to - Correo destinatario
 * @param {string} code - Código de verificación
 * @param {string} [name] - Nombre del usuario (opcional)
 */
function sendVerificationEmail(to, code, name = "") {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: "Código de verificación",
    html: `
      <div style="max-width:410px;margin:auto;background:#fff;border-radius:1.1rem;border:1.5px solid #e0e0e0;padding:2.1rem 1.5rem 1.5rem 1.5rem;font-family:'Poppins',Arial,sans-serif;text-align:center;">
        <div style="margin-bottom:1.1rem;">
          <img src="cid:logo_verificacion" alt="Logo" style="width:70px;height:70px;object-fit:contain;display:inline-block;">
        </div>
        <h2 style="font-size:1.25rem;font-weight:700;color:#222;margin-bottom:0.7rem;">Código de verificación</h2>
        <p style="font-size:1.01rem;color:#222;margin-bottom:1.1rem;">${name ? `Hola <b>${name}</b>,` : ""} Utiliza el siguiente código para continuar:</p>
        <div style="font-size:2.1rem;font-weight:700;color:rgb(7,10,243);letter-spacing:0.12em;background:#f6f6f6;border-radius:0.6rem;display:inline-block;padding:0.6rem 1.3rem;margin-bottom:1.1rem;border:1.5px solid #e0e0e0;user-select:none;-webkit-user-select:none;-moz-user-select:none;">
          ${code}
        </div>
        <div style="margin:1.1rem 0 0.7rem 0;font-size:1.01rem;color:#444;">
          Ingresa este código en la página para continuar
        </div>
        <hr style="border:0;border-top:3px solid #111;width:100%;margin:0.7rem 0 0.7rem 0;">
        <div style="margin:0.7rem 0 0.7rem 0;font-size:1.08rem;color:#888;font-weight:500;">
          Si no solicitaste este correo, ignóralo.
        </div>
      </div>
    `,
    attachments: [{
      filename: 'logo_verificacion.png',
      path: __dirname + '/public/img/logo_verificacion.png',
      cid: 'logo_verificacion',
      contentType: 'image/png',
      contentDisposition: 'inline'
    }]
  };
  return transporter.sendMail(mailOptions);
}

module.exports = transporter;
module.exports.sendVerificationEmail = sendVerificationEmail;
