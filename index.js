require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const fs = require("fs");

// Crear directorios necesarios al inicio
const uploadDir = 'public/uploads/profiles/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('✓ Directorio de uploads creado');
}

// Logging para Railway
if (process.env.RAILWAY_ENVIRONMENT) {
  console.log('🚂 Ejecutándose en Railway');
  console.log('📁 Verificando directorios...');
  console.log('Upload dir exists:', fs.existsSync(uploadDir));
  console.log('Upload dir path:', path.resolve(uploadDir));
}

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: process.env.BASE_URL || "http://localhost:5000",
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

// Configurar compartir sesión entre Express y Socket.io
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
  }),
  cookie: {
    maxAge: 60 * 60 * 1000, // 1 hora
    secure: false, // Para desarrollo local
    httpOnly: true
  },
  rolling: true, // Renueva el tiempo de expiración en cada request
});

// Almacenar partidas activas
const activeGames = new Map();

// Configuración de EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Permite recibir JSON en el body
app.use(express.static(path.join(__dirname, "public")));

// Configuración específica para Railway - servir archivos upload
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), {
  maxAge: '1d',
  etag: false
}));

// Usar el middleware de sesión en Express
app.use(sessionMiddleware);

// Configurar Socket.io para usar las sesiones de Express
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Conexión a MongoDB Atlas
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Conectado a MongoDB Atlas"))
  .catch((err) => console.error("Error de conexión:", err));

// Rutas
const authRoutes = require("./routes/auth");
app.use("/", authRoutes);

// Ruta de pagos Mercado Pago
const paymentRoutes = require("./routes/payment");
app.use("/payment", paymentRoutes);

const registerPaymentSuccess = require("./routes/register-payment-success");
app.use("/", registerPaymentSuccess);

// Rutas de salas de juego
const gameRoomRoutes = require("./routes/game-rooms");
app.use("/api/game-rooms", gameRoomRoutes);

// API de debug para verificar estado de uploads
app.get("/api/debug/uploads", (req, res) => {
  const uploadDir = 'public/uploads/profiles/';
  const absolutePath = path.resolve(uploadDir);
  
  try {
    const exists = fs.existsSync(uploadDir);
    let files = [];
    let writable = false;
    
    if (exists) {
      files = fs.readdirSync(uploadDir);
      try {
        fs.accessSync(uploadDir, fs.constants.W_OK);
        writable = true;
      } catch (e) {
        writable = false;
      }
    }
    
    res.json({
      environment: process.env.NODE_ENV || 'development',
      railway: !!process.env.RAILWAY_ENVIRONMENT,
      uploadDir: uploadDir,
      absolutePath: absolutePath,
      exists: exists,
      writable: writable,
      files: files,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      uploadDir: uploadDir,
      absolutePath: absolutePath
    });
  }
});

// API para obtener información del usuario actual
app.get("/api/current-user", (req, res) => {
  if (!req.session.user) {
    // Usuario no autenticado - devolver información de invitado
    return res.json({ 
      fullname: "Invitado",
      email: "",
      profilePicture: null,
      isGuest: true
    });
  }
  
  // Devolver directamente los datos del usuario autenticado
  res.json({
    fullname: req.session.user.fullname,
    email: req.session.user.email,
    profilePicture: req.session.user.profilePicture,
    isGuest: false
  });
});

// Middleware para detectar móvil/tablet
function isMobile(req) {
  const ua = req.headers["user-agent"] || "";
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
}

// Ruta para la página de juego
app.get("/jugar", (req, res) => {
  console.log("=== RUTA /jugar ===");
  console.log("Session ID:", req.sessionID);
  console.log("Session:", req.session);
  console.log("User in session:", req.session.user);
  
  // Obtener código de partida de query params
  let roomCode = req.query.code;
  
  // Verificar si es invitado (sin autenticación) o usuario registrado
  const isGuest = !req.session.user;
  
  if (isGuest) {
    // Para invitados, requiere código de sala
    if (!roomCode) {
      console.log("Invitado sin código de sala, redirigiendo");
      return res.redirect("/guest-dashboard");
    }
    
    console.log("Invitado accediendo con código:", roomCode);
    
    if (isMobile(req)) {
      res.render("jugar-mobile", {
        user: { fullname: "Invitado", isGuest: true },
        roomCode: roomCode
      });
    } else {
      res.render("jugar", {
        user: { fullname: "Invitado", isGuest: true },
        roomCode: roomCode
      });
    }
  } else {
    // Usuario autenticado
    if (!roomCode) {
      // Generar código de sala aleatorio de 6 caracteres
      roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      console.log("Código de sala generado:", roomCode);
    }
    
    console.log("Usuario autenticado con código:", roomCode);
    
    if (isMobile(req)) {
      res.render("jugar-mobile", {
        user: req.session.user,
        roomCode: roomCode
      });
    } else {
      res.render("jugar", {
        user: req.session.user,
        roomCode: roomCode
      });
    }
  }
});

// Ruta POST para crear partida desde dashboard
app.post("/jugar", (req, res) => {
  console.log("=== POST /jugar - Crear Partida ===");
  console.log("Session ID:", req.sessionID);
  console.log("Body:", req.body);
  
  // Verificar si el usuario está autenticado
  if (!req.session.user) {
    return res.status(401).json({ error: "Usuario no autenticado" });
  }
  
  // Obtener parámetros de la partida
  const { categoria, nivel, modo } = req.body;
  
  // Validar parámetros
  if (!categoria || !nivel || !modo) {
    return res.status(400).json({ error: "Faltan parámetros requeridos" });
  }
  
  // Generar código de sala aleatorio de 6 caracteres
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  console.log(`Partida creada: ${categoria} - Nivel ${nivel} - ${modo}`);
  console.log("Código de sala generado:", roomCode);
  
  // Almacenar configuración de la partida (opcional)
  // Puedes guardar esto en una base de datos o almacenarlo temporalmente
  const gameConfig = {
    roomCode,
    categoria,
    nivel,
    modo,
    createdBy: req.session.user._id,
    createdAt: new Date()
  };
  
  // Retornar el código de sala al cliente
  res.json({ 
    success: true,
    roomCode: roomCode,
    gameConfig: gameConfig
  });
});

app.get("/", (req, res) => {
  res.redirect("/login");
});

// Ruta de prueba para verificar imágenes
app.get("/test-images", (req, res) => {
  res.render("test-images");
});

// Socket.io para manejar las partidas con autenticación de sesión
io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  // Almacenar referencia de usuario en el socket
  socket.userId = null;
  socket.userInfo = null;

  // Unirse a una sala (nueva estructura con datos de usuario)
  socket.on('join-room', async (data) => {
    let gameCode, userSessionId, guestUserData;
    
    // Permitir tanto string como objeto
    if (typeof data === 'string') {
      gameCode = data;
    } else {
      gameCode = data.roomCode;
      userSessionId = data.sessionId;
      guestUserData = data.user; // Datos del usuario invitado
    }
    
    console.log(`Socket ${socket.id} uniéndose a sala ${gameCode}`);
    console.log('Datos recibidos:', data);
    
    if (!gameCode) {
      socket.emit('error', 'Código de sala requerido');
      return;
    }

    // Obtener información del usuario desde la sesión o datos de invitado
    let userInfo = {
      name: 'Usuario Anónimo',
      avatar: null,
      email: ''
    };

    // Si hay datos de usuario invitado, usarlos
    if (guestUserData && guestUserData.name) {
      userInfo = {
        name: guestUserData.name,
        avatar: guestUserData.avatar || null,
        email: guestUserData.email || ''
      };
      console.log('Datos de invitado recibidos:', userInfo);
    }
    // Intentar obtener datos del usuario de la sesión
    else if (socket.request.session && socket.request.session.user) {
      const sessionUser = socket.request.session.user;
      userInfo = {
        name: sessionUser.fullname || 'Usuario Anónimo',
        avatar: sessionUser.profilePicture || null,
        email: sessionUser.email || ''
      };
      console.log('Usuario de sesión obtenido:', userInfo);
    } else {
      // Fallback para usuarios sin sesión
      userInfo = {
        name: `Jugador${Date.now().toString().slice(-4)}`,
        avatar: null,
        email: null
      };
      console.log('No hay sesión de usuario, usando datos por defecto');
      console.log('Session data:', socket.request.session);
    }

    socket.userInfo = userInfo;

    if (!activeGames.has(gameCode)) {
      // Crear nueva partida
      activeGames.set(gameCode, {
        players: {},
        maxPlayers: 5,
        gameState: 'waiting',
        host: socket.id,
        currentCard: null,
        currentCardIndex: 0,
        gameEnded: false,
        winner: null,
        availableCards: [],
        timeLeft: 30
      });
    }

    const game = activeGames.get(gameCode);
    
    // BLOQUEAR INGRESO SI LA PARTIDA YA COMENZÓ (excepto para reconexiones)
    if (game.gameState === 'playing' || game.gameState === 'starting') {
      // Verificar si es una reconexión válida
      let isValidReconnection = false;
      
      for (const [playerId, player] of Object.entries(game.players)) {
        if (player.email && player.email === userInfo.email && userInfo.email) {
          isValidReconnection = true;
          break;
        } else if (!player.connected && player.name === userInfo.name) {
          isValidReconnection = true;
          break;
        }
      }
      
      if (!isValidReconnection) {
        console.log(`Acceso denegado: La partida ${gameCode} ya ha iniciado`);
        socket.emit('game-already-started', {
          message: 'Esta partida ya ha iniciado',
          gameState: game.gameState
        });
        return;
      }
    }
    
    // Verificar si el usuario ya está en la partida (reconexión)
    let existingPlayerId = null;
    let isReconnection = false;
    
    // Buscar por email o nombre para reconectar
    for (const [playerId, player] of Object.entries(game.players)) {
      if (player.email && player.email === userInfo.email && userInfo.email) {
        // Reconexión por email (más confiable)
        existingPlayerId = playerId;
        isReconnection = true;
        console.log(`Reconexión detectada por email para ${userInfo.name}`);
        break;
      } else if (!player.connected && player.name === userInfo.name) {
        // Reconexión por nombre si está desconectado
        existingPlayerId = playerId;
        isReconnection = true;
        console.log(`Reconexión detectada por nombre para ${userInfo.name}`);
        break;
      }
    }
    
    if (isReconnection && existingPlayerId) {
      // Es una reconexión - actualizar el socket ID y marcar como conectado
      const existingPlayer = game.players[existingPlayerId];
      
      // Remover el jugador con el ID anterior
      delete game.players[existingPlayerId];
      
      // Agregar con el nuevo socket ID pero manteniendo sus datos
      game.players[socket.id] = {
        ...existingPlayer,
        id: socket.id,
        connected: true
      };
      
      // Verificar que tenga su cartilla, si no generarla
      if (!game.players[socket.id].playerCards || game.players[socket.id].playerCards.length === 0) {
        console.log(`Generando nueva cartilla para jugador reconectado: ${userInfo.name}`);
        generatePlayerCards(game.players[socket.id]);
      }
      
      // Si era el host, actualizar el host ID
      if (game.host === existingPlayerId) {
        game.host = socket.id;
      }
      
      console.log(`Jugador ${userInfo.name} reconectado con nuevo socket ID: ${socket.id}`);
    } else {
      // Es un jugador nuevo
      // Verificar si la partida está llena
      const connectedPlayers = Object.keys(game.players).length;
      if (connectedPlayers >= game.maxPlayers) {
        socket.emit('error', 'La partida está llena');
        return;
      }

      // Crear jugador con información real del usuario
      game.players[socket.id] = {
        id: socket.id,
        name: userInfo.name,
        avatar: userInfo.avatar,
        email: userInfo.email,
        selectedCards: 0,
        playerCards: [],
        connected: true,
        winner: false
      };

      // Generar cartilla para el jugador
      generatePlayerCards(game.players[socket.id]);
    }

    socket.join(gameCode);
    
    // Determinar si es host
    const isHost = game.host === socket.id;

    // Enviar estado de la sala al jugador que se conecta
    socket.emit('room-state', {
      players: game.players,
      gameState: game.gameState,
      isHost: isHost,
      currentCard: game.currentCard,
      currentCardIndex: game.currentCardIndex,
      gameEnded: game.gameEnded,
      winner: game.winner,
      playerCards: game.players[socket.id].playerCards,
      timeLeft: game.timeLeft
    });

    // Enviar estado actualizado a TODOS los jugadores de la sala
    io.to(gameCode).emit('players-updated', {
      players: game.players,
      playersCount: Object.keys(game.players).length
    });

        // Log del jugador conectado
    console.log(`Jugador ${userInfo.name} se unió al juego ${gameCode}. Total de jugadores: ${Object.keys(game.players).length}`);
  });

  // Unirse a una partida (mantener compatibilidad)
  socket.on('joinGame', (data) => {
    const { gameCode, playerName, playerAvatar } = data;
    
    if (!activeGames.has(gameCode)) {
      // Crear nueva partida
      activeGames.set(gameCode, {
        players: [],
        maxPlayers: 5,
        status: 'waiting',
        host: socket.id,
        gameConfig: data.gameConfig || {},
        currentCard: null,
        gameStartTime: null,
        cards: [],
        availableCards: [],
        cardIndex: 0,
        winners: []
      });
    }

    const game = activeGames.get(gameCode);
    
    // Verificar si la partida está llena
    if (game.players.length >= game.maxPlayers) {
      socket.emit('gameError', { message: 'La partida está llena' });
      return;
    }

    // Verificar si el jugador ya está en la partida
    const existingPlayerIndex = game.players.findIndex(p => p.name === playerName);
    if (existingPlayerIndex !== -1) {
      // Actualizar socket ID del jugador existente (reconexión)
      game.players[existingPlayerIndex].id = socket.id;
      game.players[existingPlayerIndex].connected = true;
      console.log(`Jugador ${playerName} se reconectó a la partida ${gameCode}`);
    } else {
      // Agregar nuevo jugador
      const player = {
        id: socket.id,
        name: playerName,
        avatar: playerAvatar || playerName.substring(0, 2).toUpperCase(),
        selectedCards: 0,
        board: [],
        completedCards: [],
        connected: true,
        isHost: game.players.length === 0
      };
      
      // Generar cartilla para el nuevo jugador
      generatePlayerBoard(player);
      
      game.players.push(player);
      console.log(`Nuevo jugador ${playerName} se unió a la partida ${gameCode}`);
    }

    socket.join(gameCode);

    // Enviar estado actual de la partida al jugador que se conecta
    socket.emit('gameState', {
      gameCode: gameCode,
      players: game.players,
      status: game.status,
      isHost: game.host === socket.id,
      maxPlayers: game.maxPlayers,
      gameConfig: game.gameConfig
    });
    
    // Enviar cartilla al jugador
    const player = game.players.find(p => p.id === socket.id);
    if (player && player.board.length > 0) {
      socket.emit('playerBoard', {
        board: player.board
      });
    }

    // Notificar a todos los jugadores sobre el cambio
    io.to(gameCode).emit('playersUpdate', {
      players: game.players,
      totalPlayers: game.players.filter(p => p.connected !== false).length
    });

    console.log(`Estado de partida ${gameCode}:`, {
      totalPlayers: game.players.length,
      connectedPlayers: game.players.filter(p => p.connected !== false).length,
      players: game.players.map(p => ({ name: p.name, connected: p.connected }))
    });
  });

  // Iniciar juego (nueva estructura)
  socket.on('start-game', () => {
    // Buscar la partida donde este socket es el host
    let gameCode = null;
    let game = null;
    
    for (const [code, gameData] of activeGames.entries()) {
      if (gameData.host === socket.id) {
        gameCode = code;
        game = gameData;
        break;
      }
    }
    
    if (!game) {
      socket.emit('error', 'No tienes permisos para iniciar la partida');
      return;
    }

    if (game.gameState !== 'waiting') {
      console.log(`Partida ${gameCode} ya está en estado: ${game.gameState}`);
      return;
    }

    const playerCount = Object.keys(game.players).length;
    if (playerCount < 1) { // Permitir 1+ jugadores para testing
      socket.emit('error', 'Se necesita al menos 1 jugador para iniciar');
      return;
    }

    // Iniciar countdown
    game.gameState = 'starting';
    
    io.to(gameCode).emit('countdown-start', { count: 5 });

    let countdown = 5;
    const countdownInterval = setInterval(() => {
      countdown--;
      io.to(gameCode).emit('countdown-update', countdown);
      
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        game.gameState = 'playing';
        startNewGameplay(gameCode);
      }
    }, 1000);

    console.log(`Iniciando partida ${gameCode} con ${playerCount} jugadores`);
  });

  // Seleccionar carta (nueva estructura)
  socket.on('card-selected', (data) => {
    const { cardIndex, selectedCards } = data;
    
    // Buscar la partida donde está este jugador
    let gameCode = null;
    let game = null;
    
    for (const [code, gameData] of activeGames.entries()) {
      if (gameData.players[socket.id]) {
        gameCode = code;
        game = gameData;
        break;
      }
    }
    
    if (!game || !game.players[socket.id]) return;

    const player = game.players[socket.id];
    
    // Verificar que el índice es válido
    if (cardIndex < 0 || cardIndex >= player.playerCards.length) return;
    
    const card = player.playerCards[cardIndex];
    
    // Verificar que la carta coincide con la carta actual
    if (!game.currentCard || card.number !== game.currentCard.number) return;
    
    // Verificar que no fue seleccionada antes
    if (card.selected) return;

    // Marcar carta como seleccionada
    card.selected = true;
    player.selectedCards = selectedCards;

    // Notificar a otros jugadores
    io.to(gameCode).emit('player-updated', {
      playerId: socket.id,
      selectedCards: selectedCards
    });

    console.log(`${player.name} seleccionó carta ${card.number}. Progreso: ${selectedCards}/16`);

    // Verificar victoria
    if (selectedCards >= 16) {
      game.gameEnded = true;
      game.winner = socket.id;
      player.winner = true;

      io.to(gameCode).emit('game-ended', {
        winner: socket.id,
        winnerName: player.name
      });

      console.log(`¡${player.name} ha ganado la partida ${gameCode}!`);
    }
  });

  // Ganador detectado
  socket.on('player-won', () => {
    // Buscar la partida donde está este jugador
    let gameCode = null;
    let game = null;
    
    for (const [code, gameData] of activeGames.entries()) {
      if (gameData.players[socket.id]) {
        gameCode = code;
        game = gameData;
        break;
      }
    }
    
    if (!game || !game.players[socket.id]) return;

    const player = game.players[socket.id];
    
    // Verificar que realmente tiene 16 cartas
    if (player.selectedCards >= 16 && !game.gameEnded) {
      game.gameEnded = true;
      game.winner = socket.id;
      player.winner = true;

      io.to(gameCode).emit('game-ended', {
        winner: socket.id,
        winnerName: player.name
      });

      console.log(`¡${player.name} ha ganado la partida ${gameCode}!`);
    }
  });

  // Iniciar partida en modo desarrollo (para testing)
  socket.on('startGameDev', (gameCode) => {
    const game = activeGames.get(gameCode);
    
    if (!game || game.host !== socket.id) {
      socket.emit('gameError', { message: 'No tienes permisos para iniciar la partida' });
      return;
    }

    if (game.status !== 'waiting') {
      console.log(`Partida ${gameCode} ya está en estado: ${game.status}`);
      return; // No enviar error, simplemente ignorar
    }

    // Cambiar estado y notificar
    game.status = 'starting';
    game.gameStartTime = Date.now() + 6000; // 6 segundos desde ahora
    
    io.to(gameCode).emit('gameStarting', {
      countdown: 5,
      gameConfig: game.gameConfig,
      startTime: game.gameStartTime
    });

    console.log(`[DEV] Iniciando partida ${gameCode} con ${game.players.length} jugadores (modo desarrollo)`);

    // Iniciar countdown sincronizado
    let countdown = 5;
    game.countdownInterval = setInterval(() => {
      countdown--;
      io.to(gameCode).emit('countdownUpdate', countdown);
      
      if (countdown <= 0) {
        clearInterval(game.countdownInterval);
        delete game.countdownInterval;
        game.status = 'playing';
        startGameplay(gameCode);
      }
    }, 1000);
  });

  // Iniciar partida (solo el host)
  socket.on('startGame', (gameCode) => {
    const game = activeGames.get(gameCode);
    
    if (!game || game.host !== socket.id) {
      socket.emit('gameError', { message: 'No tienes permisos para iniciar la partida' });
      return;
    }

    if (game.players.length < 5) {
      socket.emit('gameError', { message: 'Se necesitan 5 jugadores para iniciar la partida' });
      return;
    }

    if (game.status !== 'waiting') {
      console.log(`Partida ${gameCode} ya está en estado: ${game.status}`);
      return; // No enviar error, simplemente ignorar
    }

    // Cambiar estado y notificar
    game.status = 'starting';
    game.gameStartTime = Date.now() + 6000; // 6 segundos desde ahora
    
    io.to(gameCode).emit('gameStarting', {
      countdown: 5,
      gameConfig: game.gameConfig,
      startTime: game.gameStartTime
    });

    console.log(`Iniciando partida ${gameCode} con ${game.players.length} jugadores`);

    // Iniciar countdown sincronizado
    let countdown = 5;
    game.countdownInterval = setInterval(() => {
      countdown--;
      io.to(gameCode).emit('countdownUpdate', countdown);
      
      if (countdown <= 0) {
        clearInterval(game.countdownInterval);
        delete game.countdownInterval;
        game.status = 'playing';
        startGameplay(gameCode);
      }
    }, 1000);
  });

  // Seleccionar carta
  socket.on('selectCard', (data) => {
    const { gameCode, cardIndex } = data;
    const game = activeGames.get(gameCode);
    
    if (!game) return;

    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;

    // Actualizar cartas seleccionadas del jugador
    player.selectedCards++;
    
    // Notificar a todos los jugadores
    io.to(gameCode).emit('playerCardSelected', {
      playerId: socket.id,
      selectedCards: player.selectedCards
    });

    // Verificar victoria
    if (player.selectedCards >= 16) {
      io.to(gameCode).emit('playerWin', {
        winner: player,
        gameCode: gameCode
      });
      
      // Finalizar partida
      game.status = 'finished';
    }
  });

  // Evento para cuando un jugador selecciona una carta
  socket.on('cardSelected', (data) => {
    const { gameCode, cardId, playerProgress } = data;
    const game = activeGames.get(gameCode);
    if (!game) return;

    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;

    // Verificar que la carta está en su cartilla y no fue seleccionada antes
    const cardInBoard = player.board.find(card => card.id === cardId && !card.selected);
    if (!cardInBoard) return;

    // Verificar que la carta está entre las que ya salieron
    const cardShown = game.cards.some(card => card.id === cardId);
    if (!cardShown) return;

    // Marcar carta como seleccionada
    cardInBoard.selected = true;
    player.selectedCards = playerProgress;
    player.completedCards.push(cardId);

    console.log(`${player.name} seleccionó carta ${cardId} (${player.selectedCards}/16)`);

    // Notificar a otros jugadores
    socket.to(gameCode).emit('playerCardSelected', {
      playerId: socket.id,
      playerName: player.name,
      cardId: cardId,
      selectedCards: player.selectedCards
    });

    // Verificar si ganó (16 cartas)
    if (player.selectedCards >= 16) {
      console.log(`¡${player.name} ha ganado!`);
      
      // Agregar a ganadores
      game.winners.push({
        id: player.id,
        name: player.name,
        completionTime: Date.now()
      });

      // Notificar victoria
      io.to(gameCode).emit('playerWin', {
        winner: {
          id: player.id,
          name: player.name
        },
        isWinner: socket.id === player.id
      });

      // Si es el primer ganador, terminar el juego después de 5 segundos
      if (game.winners.length === 1) {
        setTimeout(() => {
          endGame(gameCode);
        }, 5000);
      }
    }
  });

  // Evento para cuando un jugador gana completamente
  socket.on('playerWin', (data) => {
    const { gameCode, completionTime } = data;
    const game = activeGames.get(gameCode);
    if (!game) return;

    const player = game.players.find(p => p.id === socket.id);
    if (!player || player.selectedCards < 16) return;

    // Agregar a ganadores si no está ya
    const alreadyWinner = game.winners.find(w => w.id === player.id);
    if (!alreadyWinner) {
      game.winners.push({
        id: player.id,
        name: player.name,
        completionTime: completionTime || Date.now()
      });

      console.log(`¡${player.name} ha completado su cartilla!`);

      // Notificar a todos
      io.to(gameCode).emit('playerWin', {
        winner: {
          id: player.id,
          name: player.name
        }
      });

      // Terminar juego si es el primer ganador
      if (game.winners.length === 1) {
        setTimeout(() => {
          endGame(gameCode);
        }, 3000);
      }
    }
  });

  // Evento cuando el host abandona voluntariamente la partida
  socket.on('host-abandon-game', async () => {
    console.log('Host abandonó la partida voluntariamente:', socket.id);
    
    // Buscar la partida donde este socket es el host
    for (const [gameCode, game] of activeGames.entries()) {
      if (game.host === socket.id && game.players[socket.id]) {
        console.log(`Eliminando partida ${gameCode} - Host abandonó`);
        
        // Notificar a todos los jugadores que el host abandonó
        io.to(gameCode).emit('host-left', {
          message: 'El creador de la partida ha abandonado el juego'
        });
        
        // Actualizar estado en la base de datos
        try {
          const GameRoom = require('./models/GameRoom');
          await GameRoom.findOneAndUpdate(
            { code: gameCode },
            { status: 'abandoned' },
            { new: true }
          );
          console.log(`Partida ${gameCode} marcada como abandonada en la base de datos`);
        } catch (error) {
          console.error('Error al actualizar estado de partida en DB:', error);
        }
        
        // Eliminar la partida del servidor
        activeGames.delete(gameCode);
        console.log(`Partida ${gameCode} eliminada del servidor`);
        break;
      }
    }
  });

  // Evento cuando un jugador abandona la partida (no host)
  socket.on('leave-game', () => {
    console.log('Jugador abandonó la partida:', socket.id);
    
    // Buscar la partida donde está este jugador
    for (const [gameCode, game] of activeGames.entries()) {
      if (game.players[socket.id] && game.host !== socket.id) {
        console.log(`Jugador ${socket.id} abandonó la partida ${gameCode}`);
        
        // Remover al jugador de la partida
        delete game.players[socket.id];
        
        // Notificar a los demás jugadores
        io.to(gameCode).emit('players-updated', {
          players: game.players,
          playersCount: Object.keys(game.players).length
        });
        
        // El jugador sale del room
        socket.leave(gameCode);
        break;
      }
    }
  });

  // Desconexión - Mejorado para detectar desconexiones en tiempo real
  socket.on('disconnect', async () => {
    console.log('Usuario desconectado:', socket.id);
    
    // Remover jugador de todas las partidas
    for (const [gameCode, game] of activeGames.entries()) {
      // Nueva estructura (objeto de jugadores)
      if (game.players && typeof game.players === 'object' && game.players[socket.id]) {
        const player = game.players[socket.id];
        const wasHost = game.host === socket.id;
        
        if (game.gameState === 'playing') {
          // Marcar como desconectado durante el juego
          player.connected = false;
          io.to(gameCode).emit('player-disconnected', socket.id);
          
          // Actualizar estado de sala para todos los jugadores
          io.to(gameCode).emit('room-state', {
            players: game.players,
            isHost: false, // Se actualizará individualmente para cada socket
            gameState: game.gameState,
            playerCards: [], // No enviamos las cartas en la desconexión
            currentCard: game.currentCard,
            currentCardIndex: game.currentCardIndex,
            gameEnded: game.gameEnded,
            winner: game.winner,
            timeLeft: game.timeLeft
          });
        } else {
          // Si es el host y está en sala de espera, eliminar partida
          if (wasHost && game.gameState === 'waiting') {
            console.log(`Host desconectado en sala de espera. Eliminando partida ${gameCode}`);
            
            // Actualizar estado en la base de datos
            try {
              const GameRoom = require('./models/GameRoom');
              await GameRoom.findOneAndUpdate(
                { code: gameCode },
                { status: 'abandoned' },
                { new: true }
              );
              console.log(`Estado de partida ${gameCode} actualizado a 'abandoned' en BD`);
            } catch (error) {
              console.error('Error actualizando estado de partida en BD:', error);
            }
            
            // Notificar a todos los jugadores que la partida fue eliminada
            io.to(gameCode).emit('host-left', {
              message: 'El host ha abandonado la partida. Serás redirigido al dashboard.'
            });
            
            // Eliminar partida inmediatamente
            activeGames.delete(gameCode);
            continue; // Saltar al siguiente juego
          }
          
          // Si es el host durante el juego, también abandonar partida
          if (wasHost && game.gameState === 'playing') {
            console.log(`Host desconectado durante el juego. Partida ${gameCode} abandonada`);
            
            // Actualizar estado en la base de datos
            try {
              const GameRoom = require('./models/GameRoom');
              await GameRoom.findOneAndUpdate(
                { code: gameCode },
                { status: 'abandoned' },
                { new: true }
              );
              console.log(`Estado de partida ${gameCode} actualizado a 'abandoned' en BD`);
            } catch (error) {
              console.error('Error actualizando estado de partida en BD:', error);
            }
            
            // Notificar a todos los jugadores que el host se desconectó
            io.to(gameCode).emit('host-disconnected', {
              message: 'El host ha abandonado la partida. Serás redirigido al dashboard.'
            });
            
            // Eliminar partida inmediatamente
            activeGames.delete(gameCode);
            continue; // Saltar al siguiente juego
          }
          
          // Remover si está en sala de espera
          delete game.players[socket.id];
          
          // Actualizar lista de jugadores en tiempo real para todos los conectados
          io.to(gameCode).emit('players-updated', {
            players: game.players
          });
          
          // También enviar estado completo de la sala
          const remainingPlayers = Object.keys(game.players);
          remainingPlayers.forEach(playerId => {
            const playerSocket = io.sockets.sockets.get(playerId);
            if (playerSocket) {
              playerSocket.emit('room-state', {
                players: game.players,
                isHost: game.host === playerId,
                gameState: game.gameState
              });
            }
          });
        }
        
        // Verificar si quedan jugadores conectados
        const connectedPlayers = Object.values(game.players).filter(p => p.connected !== false);
        if (connectedPlayers.length === 0) {
          activeGames.delete(gameCode);
          console.log(`Partida ${gameCode} eliminada - sin jugadores`);
        }
        // Si el host se desconecta durante el juego, asignar nuevo host
        else if (wasHost && game.gameState === 'playing' && connectedPlayers.length > 0) {
          const newHost = connectedPlayers.find(p => p.connected !== false);
          if (newHost) {
            game.host = Object.keys(game.players).find(playerId => game.players[playerId] === newHost);
            io.to(gameCode).emit('new-host', { 
              hostId: game.host,
              hostName: newHost.name
            });
          }
        }
      }
      // Estructura antigua (array de jugadores) - mantener compatibilidad
      else if (game.players && Array.isArray(game.players)) {
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        
        if (playerIndex !== -1) {
          const disconnectedPlayer = game.players[playerIndex];
          
          // En lugar de eliminar, marcar como desconectado si el juego ha iniciado
          if (game.status === 'playing') {
            game.players[playerIndex].connected = false;
            io.to(gameCode).emit('playerDisconnected', {
              playerId: socket.id,
              playerName: disconnectedPlayer.name
            });
          } else {
            // Solo remover si está en sala de espera
            game.players.splice(playerIndex, 1);
          }
          
          // Notificar a otros jugadores
          io.to(gameCode).emit('playersUpdate', {
            players: game.players,
            totalPlayers: game.players.filter(p => p.connected !== false).length
          });

          // Si no quedan jugadores conectados, eliminar partida
          const connectedPlayers = game.players.filter(p => p.connected !== false);
          if (connectedPlayers.length === 0) {
            if (game.cardInterval) {
              clearInterval(game.cardInterval);
            }
            if (game.countdownInterval) {
              clearInterval(game.countdownInterval);
            }
            activeGames.delete(gameCode);
            console.log(`Partida ${gameCode} eliminada - sin jugadores`);
          }
          // Si el host se desconecta, asignar nuevo host
          else if (game.host === socket.id && connectedPlayers.length > 0) {
            game.host = connectedPlayers[0].id;
            io.to(gameCode).emit('newHost', { 
              hostId: game.host,
              hostName: connectedPlayers[0].name
            });
          }
        }
      }
    }
  });
});

// Mapeo de números de carta a nombres en inglés para TTS
const cardNames = {
  1: "Tree", 2: "Flower", 3: "Grass", 4: "Mountain", 5: "Fish",
  6: "Bird", 7: "Cat", 8: "Dog", 9: "Car", 10: "Bus",
  11: "Bike", 12: "Apple", 13: "Banana", 14: "Watermelon", 15: "Carrot",
  16: "Tomato", 17: "Grapes", 18: "Strawberry", 19: "Pineapple", 20: "Spring",
  21: "Summer", 22: "Autumn", 23: "Winter", 24: "Sunny", 25: "Rainy",
  26: "Cloudy", 27: "Snowy", 28: "Windy", 29: "Hot", 30: "Cold",
  31: "Warm", 32: "Stormy", 33: "Foggy", 34: "Sun", 35: "Moon",
  36: "Star", 37: "Sky", 38: "Rainbow", 39: "Thunder", 40: "Lightning",
  41: "Mercury", 42: "Venus", 43: "Earth", 44: "Mars", 45: "Jupiter",
  46: "Saturn", 47: "Uranus", 48: "Neptune", 49: "Comet", 50: "Rocket",
  51: "Eclipse", 52: "Sunrise", 53: "Sunset", 54: "Nightfall"
};

// Función para generar cartilla de jugador (nueva estructura)
function generatePlayerCards(player) {
  const allCards = [];
  
  // Generar todas las cartas (1-54)
  for (let i = 1; i <= 54; i++) {
    allCards.push({
      number: i,
      name: `Carta ${i}`,
      englishName: cardNames[i] || `Card ${i}`,
      filename: `A1 - ${i}.svg`,
      selected: false
    });
  }
  
  // Mezclar y tomar 16 cartas
  const shuffled = allCards.sort(() => 0.5 - Math.random());
  player.playerCards = shuffled.slice(0, 16);
  player.selectedCards = 0;
  
  console.log(`Cartilla generada para ${player.name}: ${player.playerCards.length} cartas`);
}

// Función para iniciar el gameplay (nueva estructura)
function startNewGameplay(gameCode) {
  const game = activeGames.get(gameCode);
  if (!game) return;

  console.log(`Iniciando gameplay para partida ${gameCode}`);

  // Inicializar el mazo
  initializeNewGameDeck(game);

  // Obtener la primera carta inmediatamente
  const firstCard = game.availableCards[0];
  game.currentCard = firstCard;
  game.timeLeft = 5;

  // Enviar estado inicial a todos los jugadores CON la primera carta
  const players = game.players;
  for (const playerId in players) {
    const player = players[playerId];
    if (player.connected) {
      io.to(playerId).emit('game-started', {
        playerCards: player.playerCards,
        currentCard: firstCard, // Enviar primera carta inmediatamente
        timeLeft: 5,
        timestamp: Date.now()
      });
    }
  }

  // Incrementar índice para la primera carta
  game.currentCardIndex = 1;

  // Iniciar temporizador para la primera carta SIN delay
  let timeLeft = 5;
  const cardTimer = setInterval(() => {
    timeLeft--;
    game.timeLeft = timeLeft;
    
    // Enviar actualización de tiempo a todos
    io.to(gameCode).emit('time-update', { timeLeft: timeLeft });
    
    if (timeLeft <= 0) {
      clearInterval(cardTimer);
      // Mostrar siguiente carta después de un breve delay
      setTimeout(() => {
        showNextNewCard(gameCode);
      }, 500);
    }
  }, 1000);
}

// Función para inicializar el mazo (nueva estructura)
function initializeNewGameDeck(game) {
  game.availableCards = [];
  
  // Crear mazo con todas las cartas (1-54)
  for (let i = 1; i <= 54; i++) {
    game.availableCards.push({
      number: i,
      name: `Carta ${i}`,
      englishName: cardNames[i] || `Card ${i}`,
      filename: `A1 - ${i}.svg`
    });
  }
  
  // Mezclar el mazo
  game.availableCards = game.availableCards.sort(() => 0.5 - Math.random());
  game.currentCardIndex = 0;
  
  console.log(`Mazo inicializado para partida con ${game.availableCards.length} cartas`);
}

// Función para mostrar la siguiente carta (nueva estructura con sincronización mejorada)
function showNextNewCard(gameCode) {
  const game = activeGames.get(gameCode);
  if (!game || game.gameEnded) return;
  
  if (game.currentCardIndex >= game.availableCards.length) {
    // Juego terminado - todas las cartas salieron
    endNewGame(gameCode);
    return;
  }
  
  const currentCard = game.availableCards[game.currentCardIndex];
  game.currentCard = currentCard;
  game.timeLeft = 5; // 5 segundos exactos
  
  console.log(`Mostrando carta ${currentCard.name} (${game.currentCardIndex + 1}/54) en partida ${gameCode}`);
  
  // Enviar carta a todos los jugadores con timestamp para sincronización
  io.to(gameCode).emit('new-card', {
    card: currentCard,
    index: game.currentCardIndex,
    timeLeft: 5,
    timestamp: Date.now()
  });
  
  game.currentCardIndex++;
  
  // Temporizador sincronizado de 5 segundos
  let timeLeft = 5;
  const cardTimer = setInterval(() => {
    timeLeft--;
    game.timeLeft = timeLeft;
    
    if (timeLeft <= 0) {
      clearInterval(cardTimer);
      // Mostrar siguiente carta después de un breve delay
      setTimeout(() => {
        showNextNewCard(gameCode);
      }, 500);
    }
  }, 1000);
}

// Función para terminar juego (nueva estructura)
function endNewGame(gameCode) {
  const game = activeGames.get(gameCode);
  if (!game) return;
  
  game.gameEnded = true;
  
  console.log(`Juego ${gameCode} terminado`);
  
  // Enviar resultados finales
  io.to(gameCode).emit('game-finished', {
    gameCode: gameCode,
    totalCards: game.currentCardIndex,
    players: game.players
  });
  
  // Limpiar la partida después de 30 segundos
  setTimeout(() => {
    activeGames.delete(gameCode);
    console.log(`Partida ${gameCode} eliminada`);
  }, 30000);
}

// Servicio de limpieza automática de salas expiradas
const GameRoom = require('./models/GameRoom');

// Limpiar salas expiradas cada 30 minutos
const cleanupInterval = setInterval(async () => {
  try {
    const deletedCount = await GameRoom.cleanExpiredRooms();
    if (deletedCount > 0) {
      console.log(`[Limpieza automática] ${deletedCount} salas eliminadas`);
    }
  } catch (error) {
    console.error('Error en limpieza automática:', error);
  }
}, 30 * 60 * 1000); // 30 minutos

// Limpieza inicial al iniciar el servidor
setTimeout(async () => {
  try {
    const deletedCount = await GameRoom.cleanExpiredRooms();
    if (deletedCount > 0) {
      console.log(`[Limpieza inicial] ${deletedCount} salas eliminadas`);
    }
  } catch (error) {
    console.error('Error en limpieza inicial:', error);
  }
}, 5000); // 5 segundos después del inicio

// Cerrar el intervalo cuando la aplicación se cierre
process.on('SIGINT', () => {
  clearInterval(cleanupInterval);
  console.log('Servicio de limpieza detenido');
  process.exit(0);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
