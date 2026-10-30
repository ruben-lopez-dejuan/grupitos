# Leer Google Sheets en el modo PRO

El modo PRO puede leer el formulario de voluntarios directamente de Google Sheets (como `ReadSpreadsheet` de CompScript): Personas → «Importar de hoja de cálculo» → Google Sheets. La lectura la hace el servidor (`lib/google-sheets.ts`, `app/api/sheets/route.ts`) y solo para personas con sesión de la WCA iniciada (no funciona en la demo). Hay dos formas de dar acceso a la hoja:

| | Compartida por enlace | Cuenta de servicio |
| --- | --- | --- |
| Configuración | Ninguna | Una vez: proyecto de Google Cloud y dos variables de entorno |
| Quién puede ver la hoja | Cualquiera que tenga el enlace | Solo quien la comparta y la cuenta de servicio |
| Pestaña y rango | La pestaña del enlace; el rango, solo celdas (`A1:Z`) | También `Respuestas!A1:Z` |

Si hay cuenta de servicio, la app la usa primero; si la hoja no está compartida con ella, prueba por enlace.

También se puede importar sin Google: copia las celdas en Google Sheets (Ctrl+A, Ctrl+C) y pégalas en la pestaña CSV, o sube un CSV exportado.

## Compartida por enlace (sin configuración)

1. En la hoja de respuestas del formulario: «Compartir» → Acceso general → **Cualquier persona con el enlace**, como **Lector**.
2. Abre la pestaña que quieras leer y copia el enlace del navegador (lleva `#gid=…`, que indica la pestaña). Pégalo en la app; si hace falta, un rango de celdas (`A1:Z`).
3. Elige la columna que identifica a cada persona (WCA ID, número de inscripción, correo o nombre), qué columnas pasan a ser propiedades y si las filas sin inscripción se crean como voluntarios.
4. **Al terminar, vuelve a poner la hoja como «Restringido».** Mientras esté compartida por enlace, cualquiera que tenga el enlace puede ver los datos del formulario.

Las cuentas de Google de algunas organizaciones no permiten compartir por enlace fuera de la organización; en ese caso, usa la cuenta de servicio o CSV.

## Cuenta de servicio (configuración una sola vez)

1. Entra en <https://console.cloud.google.com/> con la cuenta de Google que quieras usar y crea un proyecto (por ejemplo «grupitos»).
2. En «APIs y servicios → Biblioteca», activa **Google Sheets API**.
3. En «APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio», crea una cuenta (sin roles de proyecto). Anota su correo, del tipo `nombre@proyecto.iam.gserviceaccount.com`.
4. En la cuenta de servicio → «Claves → Añadir clave → JSON». Se descarga un archivo con `client_email` y `private_key`. **Ese archivo es secreto: no lo subas al repositorio ni lo pegues en un chat.**
5. Añade dos variables de entorno en Vercel (Project → Settings → Environment Variables, entornos Production y Preview) y en `.env.local` para desarrollo:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: el `client_email`.
   - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: el `private_key` completo, incluido `-----BEGIN PRIVATE KEY-----`. Puede ir con saltos de línea reales o con `\n` literales; la app acepta ambos.
6. Vuelve a desplegar (o reinicia `npm run dev`).

En cada competición, comparte la hoja con el correo de la cuenta de servicio como **lector** y pega su enlace en la app.

## Seguridad

- La ruta `/api/sheets` solo responde a personas con sesión de la WCA iniciada y solo lee: por enlace, la exportación CSV de `docs.google.com` (como mucho 5 MB); con la cuenta de servicio, el scope `spreadsheets.readonly`.
- Las filas van del servidor al navegador sin guardarse en el servidor; lo importado queda en el navegador, como el resto de la configuración.
- La clave privada vive solo en las variables de entorno del servidor; el navegador nunca la ve. La cuenta de servicio solo puede leer las hojas que se compartan explícitamente con ella.
