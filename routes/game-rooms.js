const express = require('express');
const router = express.Router();
const GameRoom = require('../models/GameRoom');

// Middleware para verificar autenticación
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'No autorizado' });
    }
    next();
};

// Crear una nueva sala de juego
router.post('/create-room', requireAuth, async (req, res) => {
    try {
        const { categoria, nivel, modo } = req.body;
        
        // Validar que los datos requeridos estén presentes
        if (!categoria || !nivel || !modo) {
            return res.status(400).json({ 
                error: 'Faltan datos requeridos: categoría, nivel y modo' 
            });
        }
        
        // Verificar si el usuario ya tiene una sala activa
        const existingRoom = await GameRoom.findOne({
            hostId: req.session.user._id,
            status: { $in: ['waiting', 'playing'] }
        });
        
        if (existingRoom) {
            // Si ya tiene una sala, devolverla en lugar de crear una nueva
            return res.json({
                success: true,
                room: {
                    code: existingRoom.code,
                    configuration: existingRoom.configuration,
                    status: existingRoom.status,
                    playersCount: existingRoom.players.length,
                    maxPlayers: existingRoom.maxPlayers
                }
            });
        }
        
        // Generar código único
        const code = await GameRoom.generateUniqueCode();
        
        // Crear nueva sala
        const gameRoom = new GameRoom({
            code,
            hostId: req.session.user._id,
            hostName: req.session.user.fullname || 'Anfitrión',
            configuration: {
                categoria,
                nivel,
                modo
            },
            players: [{
                userId: req.session.user._id,
                name: req.session.user.fullname || 'Anfitrión'
            }]
        });
        
        await gameRoom.save();
        
        console.log(`Nueva sala creada: ${code} por ${req.session.user.fullname}`);
        
        res.json({
            success: true,
            room: {
                code: gameRoom.code,
                configuration: gameRoom.configuration,
                status: gameRoom.status,
                playersCount: gameRoom.players.length,
                maxPlayers: gameRoom.maxPlayers
            }
        });
        
    } catch (error) {
        console.error('Error creando sala:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor al crear la sala' 
        });
    }
});

// Unirse a una sala existente
router.post('/join-room', requireAuth, async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code || code.length < 6) {
            return res.status(400).json({ 
                error: 'Código de sala inválido' 
            });
        }
        
        // Buscar la sala
        const gameRoom = await GameRoom.findOne({ 
            code: code.toString(),
            status: 'waiting' // Solo se puede unir a salas en espera
        });
        
        if (!gameRoom) {
            return res.status(404).json({ 
                error: 'Sala no encontrada o ya iniciada' 
            });
        }
        
        // Verificar si la sala está llena
        if (gameRoom.players.length >= gameRoom.maxPlayers) {
            return res.status(400).json({ 
                error: 'La sala está llena' 
            });
        }
        
        // Intentar agregar al jugador
        const added = gameRoom.addPlayer(
            req.session.user._id, 
            req.session.user.fullname || 'Jugador',
            false // false indica que es usuario registrado
        );
        
        if (!added) {
            return res.status(400).json({ 
                error: 'Ya estás en esta sala' 
            });
        }
        
        await gameRoom.save();
        
        console.log(`${req.session.user.fullname} se unió a la sala ${code}`);
        
        res.json({
            success: true,
            room: {
                code: gameRoom.code,
                configuration: gameRoom.configuration,
                status: gameRoom.status,
                playersCount: gameRoom.players.length,
                maxPlayers: gameRoom.maxPlayers,
                isHost: gameRoom.hostId.toString() === req.session.user._id.toString()
            }
        });
        
    } catch (error) {
        console.error('Error uniéndose a sala:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor al unirse a la sala' 
        });
    }
});

// Abandonar una sala
router.post('/leave-room', requireAuth, async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'Código de sala requerido' });
        }
        
        const gameRoom = await GameRoom.findOne({ code });
        
        if (!gameRoom) {
            return res.status(404).json({ error: 'Sala no encontrada' });
        }
        
        // Si es el host, marcar la sala como abandonada
        if (gameRoom.hostId.toString() === req.session.user._id.toString()) {
            gameRoom.status = 'abandoned';
            await gameRoom.save();
            
            console.log(`Host ${req.session.user.fullname} abandonó la sala ${code}`);
        } else {
            // Si es un jugador normal, solo removerlo
            gameRoom.removePlayer(req.session.user._id);
            await gameRoom.save();
            
            console.log(`${req.session.user.fullname} abandonó la sala ${code}`);
        }
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error abandonando sala:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor al abandonar la sala' 
        });
    }
});

// Obtener información de una sala
router.get('/room-info/:code', requireAuth, async (req, res) => {
    try {
        const { code } = req.params;
        
        const gameRoom = await GameRoom.findOne({ code });
        
        if (!gameRoom) {
            return res.status(404).json({ error: 'Sala no encontrada' });
        }
        
        res.json({
            success: true,
            room: {
                code: gameRoom.code,
                configuration: gameRoom.configuration,
                status: gameRoom.status,
                playersCount: gameRoom.players.length,
                maxPlayers: gameRoom.maxPlayers,
                players: gameRoom.players.map(p => ({ name: p.name, joinedAt: p.joinedAt })),
                isHost: gameRoom.hostId.toString() === req.session.user._id.toString(),
                createdAt: gameRoom.createdAt
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo info de sala:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor al obtener información de la sala' 
        });
    }
});

// Finalizar una sala (cuando termina la partida)
router.post('/finish-room', requireAuth, async (req, res) => {
    try {
        const { code, winner } = req.body;
        
        const gameRoom = await GameRoom.findOne({ code });
        
        if (!gameRoom) {
            return res.status(404).json({ error: 'Sala no encontrada' });
        }
        
        // Solo el host puede finalizar la sala
        if (gameRoom.hostId.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        
        // Eliminar la sala inmediatamente al finalizar la partida
        await GameRoom.findOneAndDelete({ code });
        
        console.log(`Sala ${code} finalizada y eliminada por ${req.session.user.fullname}`);
        
        res.json({ success: true, deleted: true });
        
    } catch (error) {
        console.error('Error finalizando sala:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor al finalizar la sala' 
        });
    }
});

// Limpiar salas del usuario (para restablecer estado)
router.post('/reset-user-rooms', requireAuth, async (req, res) => {
    try {
        // Marcar todas las salas del usuario como abandonadas
        await GameRoom.updateMany(
            { 
                hostId: req.session.user._id, 
                status: { $in: ['waiting', 'playing'] } 
            },
            { 
                status: 'abandoned',
                expiresAt: new Date(Date.now() + 60000) // Expira en 1 minuto
            }
        );
        
        // También remover al usuario de cualquier sala donde sea jugador
        await GameRoom.updateMany(
            { 'players.userId': req.session.user._id },
            { $pull: { players: { userId: req.session.user._id } } }
        );
        
        console.log(`Salas del usuario ${req.session.user.fullname} restablecidas`);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error restableciendo salas del usuario:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor al restablecer salas' 
        });
    }
});

// Limpiar salas expiradas (endpoint administrativo)
router.post('/cleanup', requireAuth, async (req, res) => {
    try {
        const deletedCount = await GameRoom.cleanExpiredRooms();
        res.json({ 
            success: true, 
            message: `${deletedCount} salas eliminadas` 
        });
    } catch (error) {
        console.error('Error en limpieza:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor durante la limpieza' 
        });
    }
});

// Ruta especial para que invitados se unan a salas (sin autenticación)
router.post('/join-room-guest', async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code || code.length < 6) {
            return res.status(400).json({ 
                error: 'Código de sala inválido' 
            });
        }
        
        // Buscar la sala
        const gameRoom = await GameRoom.findOne({ 
            code: code.toString(),
            status: 'waiting' // Solo se puede unir a salas en espera
        });
        
        if (!gameRoom) {
            return res.status(404).json({ 
                error: 'Sala no encontrada o ya iniciada' 
            });
        }
        
        // Verificar si la sala está llena
        if (gameRoom.players.length >= gameRoom.maxPlayers) {
            return res.status(400).json({ 
                error: 'La sala está llena' 
            });
        }
        
        // Generar un ID temporal para el invitado
        const guestId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const guestName = 'Invitado';
        
        // Intentar agregar al jugador invitado
        const added = gameRoom.addPlayer(guestId, guestName, true); // true indica que es invitado
        
        if (!added) {
            return res.status(400).json({ 
                error: 'Error al unirse a la sala' 
            });
        }
        
        await gameRoom.save();
        
        console.log(`Invitado se unió a la sala ${code}`);
        
        res.json({
            success: true,
            room: {
                code: gameRoom.code,
                configuration: gameRoom.configuration,
                status: gameRoom.status,
                playersCount: gameRoom.players.length,
                maxPlayers: gameRoom.maxPlayers,
                isHost: false, // Los invitados nunca son hosts
                guestId: guestId // ID temporal para el invitado
            }
        });
        
    } catch (error) {
        console.error('Error de invitado uniéndose a sala:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor al unirse a la sala' 
        });
    }
});

module.exports = router;
