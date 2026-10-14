const mongoose = require('mongoose');

const gameRoomSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 6,
        maxlength: 7
    },
    hostId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    hostName: {
        type: String,
        required: true
    },
    configuration: {
        categoria: {
            type: String,
            required: true,
            enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
        },
        nivel: {
            type: String,
            required: true
        },
        modo: {
            type: String,
            required: true,
            enum: ['Partida Offline', 'Partida Online']
        }
    },
    status: {
        type: String,
        enum: ['waiting', 'playing', 'finished', 'abandoned'],
        default: 'waiting'
    },
    players: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        name: String,
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }],
    maxPlayers: {
        type: Number,
        default: 5,
        min: 1,
        max: 5
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    startedAt: {
        type: Date
    },
    finishedAt: {
        type: Date
    },
    // TTL (Time To Live) index - la sala se elimina automáticamente después de 2 horas
    expiresAt: {
        type: Date,
        default: Date.now,
        expires: 7200 // 2 horas en segundos
    }
});

// Índices para optimizar las consultas (sin duplicar los únicos)
gameRoomSchema.index({ hostId: 1 });
gameRoomSchema.index({ status: 1 });

// Middleware para actualizar expiresAt cuando la partida comienza
gameRoomSchema.pre('save', function(next) {
    if (this.isModified('status')) {
        if (this.status === 'playing') {
            // Extender la expiración a 4 horas cuando la partida empieza
            this.expiresAt = new Date(Date.now() + 14400 * 1000); // 4 horas
            this.startedAt = new Date();
        } else if (this.status === 'finished' || this.status === 'abandoned') {
            // Marcar para eliminación en 10 minutos cuando termina
            this.expiresAt = new Date(Date.now() + 600 * 1000); // 10 minutos
            if (this.status === 'finished') {
                this.finishedAt = new Date();
            }
        }
    }
    next();
});

// Método para generar código único de 6 dígitos
gameRoomSchema.statics.generateUniqueCode = async function() {
    let code;
    let exists = true;
    
    while (exists) {
        // Generar código de 6 dígitos
        code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Verificar si ya existe
        const existingRoom = await this.findOne({ code });
        exists = !!existingRoom;
    }
    
    return code;
};

// Método para limpiar salas expiradas manualmente
gameRoomSchema.statics.cleanExpiredRooms = async function() {
    const result = await this.deleteMany({
        $or: [
            { expiresAt: { $lt: new Date() } },
            { status: 'abandoned', updatedAt: { $lt: new Date(Date.now() - 600000) } }, // 10 minutos
            { status: 'finished', updatedAt: { $lt: new Date(Date.now() - 600000) } } // 10 minutos
        ]
    });
    
    console.log(`Limpieza automática: ${result.deletedCount} salas eliminadas`);
    return result.deletedCount;
};

// Método para agregar un jugador
gameRoomSchema.methods.addPlayer = function(userId, userName) {
    if (this.players.length >= this.maxPlayers) {
        throw new Error('La sala está llena');
    }
    
    // Verificar si el jugador ya está en la sala
    const existingPlayer = this.players.find(p => p.userId.toString() === userId.toString());
    if (existingPlayer) {
        return false; // El jugador ya está en la sala
    }
    
    this.players.push({
        userId,
        name: userName
    });
    
    return true;
};

// Método para remover un jugador
gameRoomSchema.methods.removePlayer = function(userId) {
    const initialLength = this.players.length;
    this.players = this.players.filter(p => p.userId.toString() !== userId.toString());
    return this.players.length < initialLength;
};

module.exports = mongoose.model('GameRoom', gameRoomSchema);
