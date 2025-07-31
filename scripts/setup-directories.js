const fs = require('fs');
const path = require('path');

// Directorios necesarios
const directories = [
  'public/uploads',
  'public/uploads/profiles'
];

console.log('🔧 Creando directorios necesarios...');

// Información del entorno
if (process.env.RAILWAY_ENVIRONMENT) {
  console.log('🚂 Ejecutándose en Railway');
}

directories.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  
  if (!fs.existsSync(fullPath)) {
    try {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`✓ Directorio creado: ${dir}`);
      
      // Verificar permisos de escritura
      fs.accessSync(fullPath, fs.constants.W_OK);
      console.log(`✓ Permisos de escritura confirmados: ${dir}`);
    } catch (error) {
      console.error(`❌ Error creando directorio ${dir}:`, error.message);
      process.exit(1);
    }
  } else {
    console.log(`✓ Directorio ya existe: ${dir}`);
  }
});

console.log('🎉 Setup de directorios completado.');
