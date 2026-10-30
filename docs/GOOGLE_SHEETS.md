# Leer Google Sheets en el modo PRO

El modo PRO puede leer el formulario de voluntarios directamente de Google Sheets (como `ReadSpreadsheet` de CompScript). La lectura la hace el servidor con una **cuenta de servicio** de Google: no hace falta que cada organizador conecte su cuenta de Google, basta con compartir la hoja con el correo de la cuenta de servicio.

Mientras no esté configurado, la app lo indica y se puede importar igual pegando o subiendo un **CSV** exportado del formulario.

El código ya está hecho (`lib/google-sheets.ts`, `app/api/sheets/route.ts`, Personas → «Importar de hoja de cálculo» → Google Sheets). Lo único que falta es la configuración de abajo: si la app dice «Falta conectar el servidor con Google», es que las dos variables no están puestas en ese entorno.

## Configuración (una sola vez)

1. Entra en <https://console.cloud.google.com/> con la cuenta de Google que quieras usar y crea un proyecto (por ejemplo «grupitos»).
2. En «APIs y servicios → Biblioteca», activa **Google Sheets API**.
3. En «APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio», crea una cuenta (sin roles de proyecto). Anota su correo, del tipo `nombre@proyecto.iam.gserviceaccount.com`.
4. En la cuenta de servicio → «Claves → Añadir clave → JSON». Se descarga un archivo con `client_email` y `private_key`. **Ese archivo es secreto: no lo subas al repositorio ni lo pegues en un chat.**
5. Añade dos variables de entorno en Vercel (Project → Settings → Environment Variables, entornos Production y Preview) y en `.env.local` para desarrollo:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: el `client_email`.
   - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: el `private_key` completo, incluido `-----BEGIN PRIVATE KEY-----`. Puede ir con saltos de línea reales o con `\n` literales; la app acepta ambos.
6. Vuelve a desplegar (o reinicia `npm run dev`).

## Uso en cada competición

1. En la hoja de respuestas del formulario: «Compartir» → añade el correo de la cuenta de servicio como **lector**.
2. En la app, modo PRO → Personas → «Importar de hoja de cálculo» → Google Sheets: pega el enlace de la hoja y, si hace falta, un rango (`Respuestas!A1:Z`).
3. Elige la columna que identifica a cada persona (WCA ID, número de inscripción, correo o nombre), qué columnas pasan a ser propiedades y si las filas sin inscripción se crean como voluntarios.

## Seguridad

- La ruta `/api/sheets` solo responde a personas con sesión de la WCA iniciada y solo lee (scope `spreadsheets.readonly`).
- La clave privada vive solo en las variables de entorno del servidor; el navegador nunca la ve.
- La cuenta de servicio solo puede leer las hojas que se compartan explícitamente con ella.
