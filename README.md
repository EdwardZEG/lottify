# Lottify - Juego de Lotería Multijugador

Sistema de lotería multijugador en tiempo real con Node.js, Express, MongoDB y Socket.io.

## Características

- ✅ Sistema de autenticación completo (registro, login, recuperación)
- ✅ Juego de lotería multijugador en tiempo real
- ✅ Panel de administración
- ✅ Soporte para móviles y escritorio
- ✅ Integración con Mercado Pago
- ✅ Sistema de salas de juego
- ✅ Subida de fotos de perfil

## Tecnologías

- **Backend**: Node.js, Express.js
- **Base de datos**: MongoDB Atlas
- **Tiempo real**: Socket.io
- **Vistas**: EJS + Bootstrap
- **Pagos**: Mercado Pago
- **Email**: Nodemailer

## Despliegue en Vercel

### Variables de entorno requeridas:

1. `MONGO_URI` - URL de conexión a MongoDB Atlas
2. `SESSION_SECRET` - Secreto para las sesiones
3. `EMAIL_USER` - Email para envío de correos
4. `EMAIL_PASS` - Contraseña del email
5. `MP_ACCESS_TOKEN` - Token de acceso de Mercado Pago
6. `BASE_URL` - URL base de la aplicación (ej: https://tu-app.vercel.app)

### Comandos para desplegar:

```bash
# Instalar Vercel CLI
npm i -g vercel

# Desplegar
vercel

# Configurar variables de entorno
vercel env add MONGO_URI
vercel env add SESSION_SECRET
vercel env add EMAIL_USER
vercel env add EMAIL_PASS
vercel env add MP_ACCESS_TOKEN
vercel env add BASE_URL
```

## Desarrollo Local

1. Instala dependencias:
   ```bash
   npm install
   ```

2. Configura variables de entorno en `.env`:
   ```
   MONGO_URI=tu_mongodb_uri
   SESSION_SECRET=tu_secreto
   PORT=5000
   EMAIL_USER=tu_email
   EMAIL_PASS=tu_password
   MP_ACCESS_TOKEN=tu_token_mp
   BASE_URL=http://localhost:5000
   ```

3. Inicia el servidor:
   ```bash
   npm start
   ```

## Estructura del Proyecto

```
├── index.js              # Servidor principal
├── models/               # Modelos de MongoDB
├── routes/               # Rutas de la aplicación
├── views/                # Vistas EJS
├── public/               # Archivos estáticos
├── package.json          # Dependencias
├── vercel.json          # Configuración de Vercel
└── .env                 # Variables de entorno
```

## Usuarios

- **Admin**: Acceso completo al panel de administración
- **Usuario**: Acceso al juego y configuración de perfil
- **Invitado**: Acceso limitado al juego

## Rutas principales

- `/` - Redirige al login
- `/register` - Registro de usuario
- `/login` - Página de login
- `/dashboard` - Dashboard principal (móvil/escritorio)
- `/jugar` - Página del juego
- `/config` - Configuración de perfil
- `/admin` - Panel de administración
- `/guest` - Acceso de invitado

## Nota sobre Socket.io en Vercel

⚠️ **Importante**: Vercel tiene limitaciones con WebSockets. Para production se recomienda:
1. Usar un servicio especializado como Railway, Render o Heroku para el servidor Socket.io
2. O implementar Socket.io con polling como fallback

## Licencia

ISC
