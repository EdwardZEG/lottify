// Controlar el despliegue del menú de navegación en dispositivos móviles
document.getElementById("menu-icon").addEventListener("click", function(event) {
    event.stopPropagation();
    const menu = document.getElementById("menu");
    menu.classList.toggle("active");
});

// Controlar el despliegue de los botones de sesión y registro al hacer clic en el icono de usuario
document.getElementById("user-icon").addEventListener("click", function(event) {
    event.stopPropagation();
    const authButtons = document.getElementById("auth-buttons");
    authButtons.classList.toggle("show");
});

// Detectar clics fuera de los menús y los iconos para cerrar todo
document.addEventListener("click", function(event) {
    const menu = document.getElementById("menu");
    const authButtons = document.getElementById("auth-buttons");
    
    // Cerrar el menú si el clic es fuera del menú y el icono de hamburguesa
    if (!menu.contains(event.target) && !document.getElementById("menu-icon").contains(event.target)) {
        menu.classList.remove("active");
    }
    
    // Cerrar los botones de autenticación si el clic es fuera del icono de usuario
    if (!authButtons.contains(event.target) && !document.getElementById("user-icon").contains(event.target)) {
        authButtons.classList.remove("show");
    }
});
