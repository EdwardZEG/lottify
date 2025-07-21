const express = require("express");
const router = express.Router();
const User = require("../models/User");
const crypto = require("crypto");
const transporter = require("../mailer");
const multer = require("multer");
const path = require("path");

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/profiles/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB límite
  },
  fileFilter: function (req, file, cb) {
    // Solo permitir imágenes
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

// Middleware para detectar móvil/tablet
function isMobile(req) {
  const ua = req.headers["user-agent"] || "";
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
}

// Página de registro
router.get("/register", (req, res) => {
  res.render("register");
});

// Endpoint para validar si un correo ya está registrado
router.post("/register/check-email", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ exists: false });
  const user = await User.findOne({ email });
  res.json({ exists: !!user });
});

// Registro
router.post("/register", async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;
  if (password !== confirmPassword) {
    return res.render("register", { error: "Las contraseñas no coinciden." });
  }
  // Validación de contraseña segura
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
  if (!regex.test(password)) {
    return res.render("register", { error: "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un símbolo." });
  }
  try {
    // Generar código de verificación
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const user = new User({ fullname: name, email, password, verificationCode });
    await user.save();
    // Enviar correo de verificación con diseño personalizado
    const { sendVerificationEmail } = require("../mailer");
    await sendVerificationEmail(email, verificationCode, name);
    res.redirect("/login");
  } catch (err) {
    if (err.code === 11000 && err.keyPattern && err.keyPattern.email) {
      // Error de email duplicado
      return res.render("register", { error: "El correo ya está registrado." });
    }
    // Otro error
    return res.render("register", { error: "Error al registrar usuario. Intenta de nuevo." });
  }
});

// Página de login
router.get("/login", (req, res) => {
  res.render("login", { clearRemember: false });
});

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (user && (await user.comparePassword(password))) {
    req.session.userId = user._id;
    req.session.user = user; // Agregar el usuario completo a la sesión
    res.redirect("/dashboard");
  } else {
    res.render("login", { error: "Credenciales incorrectas.", clearRemember: true });
  }
});

// Dashboard protegido (unificado para móvil y escritorio)
router.get("/dashboard", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const user = await User.findById(req.session.userId);
  if (!user) return res.redirect("/login");
  
  // Asegurar que el usuario esté en la sesión
  req.session.user = user;
  
  if (user.profile === "administrador") {
    // Admin dashboard: obtener todos los usuarios para la tabla
    const users = await User.find({}, "_id fullname email status profile");
    if (isMobile(req)) {
      return res.render("admin-dashboard-mobile", { user, users });
    } else {
      return res.render("admin-dashboard", { user, users });
    }
  }
  if (isMobile(req)) {
    res.render("dashboard-mobile", { user });
  } else {
    res.render("dashboard", { user });
  }
});

// Ruta específica para admin dashboard
router.get("/admin-dashboard", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  
  const user = await User.findById(req.session.userId);
  if (!user) return res.redirect("/login");
  
  // Verificar que sea administrador
  if (user.profile !== "administrador") {
    return res.redirect("/dashboard");
  }
  
  // Obtener todos los usuarios para la tabla
  const users = await User.find({}, "_id fullname email status profile");
  
  if (isMobile(req)) {
    res.render("admin-dashboard-mobile", { user, users });
  } else {
    res.render("admin-dashboard", { user, users });
  }
});

// Dashboard de invitado
router.get("/guest", (req, res) => {
  // Renderiza la vista de invitado con datos fijos
  if (isMobile(req)) {
    res.render("guest-dashboard-mobile", {
      user: {
        fullname: "Invitado",
        email: "invitado@ejemplo.com",
        avatar: "/public/img/logo_formularios.svg"
      }
    });
  } else {
    res.render("guest-dashboard", {
      user: {
        fullname: "Invitado",
        email: "invitado@ejemplo.com",
        avatar: "/public/img/logo_formularios.svg"
      }
    });
  }
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// Página de recuperación de contraseña (paso 1)
router.get("/forgot", (req, res) => {
  res.render("forgot");
});

// Enviar código de verificación por email (paso 1)
router.post("/forgot", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.render("forgot", { error: "Correo no encontrado." });
  // Solo actualizar el código, no crear usuario nuevo ni guardar fullname
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  user.resetCode = code;
  user.resetCodeExpiration = Date.now() + 15 * 60 * 1000; // 15 minutos
  await user.save();
  // Enviar email real con diseño limpio reutilizando la función
  const { sendVerificationEmail } = require("../mailer");
  await sendVerificationEmail(user.email, code);
  res.redirect(`/verify-code?email=${encodeURIComponent(user.email)}`);
});

// Página para ingresar código y nueva contraseña (paso 2)
router.get("/verify-code", (req, res) => {
  const { email } = req.query;
  res.render("verify-code", { email });
});

// Verificar código y cambiar contraseña (paso 2)
router.post("/verify-code", async (req, res) => {
  const { email, code, password } = req.body;
  const user = await User.findOne({
    email,
    resetCode: code,
    resetCodeExpiration: { $gt: Date.now() },
  });
  if (!user)
    return res.render("verify-code", {
      error: "Código inválido o expirado.",
      email,
    });
  user.password = password;
  user.resetCode = undefined;
  user.resetCodeExpiration = undefined;
  await user.save();
  // Destruir cualquier sesión activa del usuario tras el cambio de contraseña
  req.session.destroy(() => {
    // Redirige directamente al login sin mostrar ninguna vista
    return res.redirect("/login");
  });
});

// API: Actualizar usuario (nombre/email)
router.put("/admin/user/:id", async (req, res) => {
  if (!req.session.userId && !req.session.user) return res.status(401).json({ error: "No autorizado" });
  
  let admin;
  if (req.session.user) {
    admin = req.session.user;
  } else {
    admin = await User.findById(req.session.userId);
  }
  
  if (!admin || admin.profile !== "administrador") return res.status(403).json({ error: "Solo el admin puede editar usuarios" });
  
  let { fullname, email, profile, status } = req.body;
  if (profile) profile = profile.toLowerCase();
  
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id, 
      { fullname, email, profile, status }, 
      { new: true }
    );
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json({ success: true, user });
  } catch (err) {
    console.error("Error al actualizar usuario:", err);
    res.status(500).json({ error: "Error al actualizar usuario" });
  }
});

// API: Eliminar usuario
router.delete("/admin/user/:id", async (req, res) => {
  if (!req.session.userId && !req.session.user) return res.status(401).json({ error: "No autorizado" });
  
  let admin;
  if (req.session.user) {
    admin = req.session.user;
  } else {
    admin = await User.findById(req.session.userId);
  }
  
  if (!admin || admin.profile !== "administrador") return res.status(403).json({ error: "Solo el admin puede eliminar usuarios" });
  
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json({ success: true });
  } catch (err) {
    console.error("Error al eliminar usuario:", err);
    res.status(500).json({ error: "Error al eliminar usuario" });
  }
});

// API: Cambiar estado (activo/inactivo)
router.patch("/admin/user/:id/status", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "No autorizado" });
  const admin = await User.findById(req.session.userId);
  if (!admin || admin.profile !== "administrador") return res.status(403).json({ error: "Solo el admin puede cambiar el estado" });
  const { status } = req.body;
  if (!["activo", "inactivo"].includes(status)) return res.status(400).json({ error: "Estado inválido" });
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: "Error al cambiar estado" });
  }
});

// API: Obtener todos los usuarios (para panel admin)
router.get("/admin/users", async (req, res) => {
  if (!req.session.userId && !req.session.user) return res.status(401).json({ error: "No autorizado" });
  
  let admin;
  if (req.session.user) {
    admin = req.session.user;
  } else {
    admin = await User.findById(req.session.userId);
  }
  
  if (!admin || admin.profile !== "administrador") return res.status(403).json({ error: "Solo el admin puede ver usuarios" });
  
  try {
    const users = await User.find({}, "_id fullname email status profile profilePicture");
    res.json(users);
  } catch (err) {
    console.error("Error al obtener usuarios:", err);
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

// API: Crear usuario desde panel admin
router.post("/admin/user", async (req, res) => {
  if (!req.session.userId && !req.session.user) return res.status(401).json({ error: "No autorizado" });
  
  let admin;
  if (req.session.user) {
    admin = req.session.user;
  } else {
    admin = await User.findById(req.session.userId);
  }
  
  if (!admin || admin.profile !== "administrador") return res.status(403).json({ error: "Solo el admin puede crear usuarios" });
  
  let { fullname, email, profile, password, status } = req.body;
  if (!fullname || !email || !password) return res.status(400).json({ error: "Faltan datos obligatorios" });
  if (profile) profile = profile.toLowerCase();
  
  try {
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: "El correo ya está registrado" });
    
    const user = new User({ 
      fullname, 
      email, 
      profile: profile || 'usuario', 
      password,
      status: status || 'activo',
      verified: true // Los usuarios creados por admin están verificados por defecto
    });
    
    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    console.error("Error al crear usuario:", err);
    res.status(500).json({ error: "Error al crear usuario" });
  }
});

// API: Crear usuario desde panel admin (ruta alternativa)
router.post("/admin/users", async (req, res) => {
  if (!req.session.userId && !req.session.user) return res.status(401).json({ error: "No autorizado" });
  
  let admin;
  if (req.session.user) {
    admin = req.session.user;
  } else {
    admin = await User.findById(req.session.userId);
  }
  
  if (!admin || admin.profile !== "administrador") return res.status(403).json({ error: "Solo el admin puede crear usuarios" });
  
  let { fullname, email, profile, password, status } = req.body;
  if (!fullname || !email || !password) return res.status(400).json({ error: "Faltan datos obligatorios" });
  if (profile) profile = profile.toLowerCase();
  
  try {
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: "El correo ya está registrado" });
    
    const user = new User({ 
      fullname, 
      email, 
      profile: profile || 'usuario', 
      password,
      status: status || 'activo',
      verified: true // Los usuarios creados por admin están verificados por defecto
    });
    
    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    console.error("Error al crear usuario:", err);
    res.status(500).json({ error: "Error al crear usuario" });
  }
});

// API: Obtener un usuario por ID (para editar)
router.get("/admin/user/:id", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "No autorizado" });
  const admin = await User.findById(req.session.userId);
  if (!admin || admin.profile !== "administrador") return res.status(403).json({ error: "Solo el admin puede ver usuarios" });
  try {
    const user = await User.findById(req.params.id, "_id fullname email status profile");
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener usuario" });
  }
});

// Página de configuración
router.get("/config", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  try {
    const user = await User.findById(req.session.userId);
    if (!user) return res.redirect("/login");
    
    if (isMobile(req)) {
      res.render("config-mobile", { user });
    } else {
      res.render("config", { user });
    }
  } catch (err) {
    res.redirect("/login");
  }
});

// API: Actualizar perfil de usuario
router.put("/api/user/profile", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ success: false, message: "No autorizado" });
  
  const { fullname } = req.body;
  if (!fullname || !fullname.trim()) {
    return res.status(400).json({ success: false, message: "El nombre es obligatorio" });
  }

  try {
    const user = await User.findByIdAndUpdate(
      req.session.userId, 
      { fullname: fullname.trim() }, 
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    res.json({ success: true, message: "Perfil actualizado correctamente", user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error al actualizar el perfil" });
  }
});

// API: Subir foto de perfil
router.post("/api/user/profile-picture", upload.single('profilePicture'), async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ success: false, message: "No autorizado" });
  
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No se subió ningún archivo" });
  }

  try {
    const profilePictureUrl = `/uploads/profiles/${req.file.filename}`;
    
    const user = await User.findByIdAndUpdate(
      req.session.userId, 
      { profilePicture: profilePictureUrl }, 
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    res.json({ 
      success: true, 
      message: "Foto de perfil actualizada correctamente", 
      profilePicture: profilePictureUrl 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error al actualizar la foto de perfil" });
  }
});

module.exports = router;
