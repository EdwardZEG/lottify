#!/bin/bash

echo "Iniciando build para Railway..."

# Instalar dependencias
echo "Instalando dependencias..."
npm install

# Crear directorios necesarios
echo "Creando directorios..."
node scripts/setup-directories.js

# Verificar estructura
echo "Verificando estructura de directorios..."
ls -la public/uploads/

echo "Build completado para Railway!"
