# WCA Easy Groups

Una herramienta clara y flexible para crear grupos y asignaciones de personal en competiciones oficiales de la World Cube Association.

## Primera entrega

- Inicio de sesión mediante OAuth de la WCA.
- Listado de las competiciones que administra la persona conectada.
- Importación del WCIF completo de una competición.
- Almacenamiento local del WCIF en el navegador para trabajar sin enviar los datos a terceros.

## Desarrollo local

1. Instala las dependencias con `npm install`.
2. Copia `.env.example` a `.env.local`.
3. Crea una aplicación OAuth en la WCA y añade sus credenciales al archivo.
4. Usa `http://localhost:3000/api/auth/callback/wca` como URL de redirección.
5. Inicia la aplicación con `npm run dev`.

El token OAuth permanece en la sesión cifrada del servidor. El WCIF importado se guarda en IndexedDB dentro del navegador.
