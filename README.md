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

## Idiomas

La interfaz está en español e inglés. Los textos viven en `lib/i18n/messages/`, un archivo por idioma; `es.ts` es la referencia.

Para añadir un idioma:

1. Copia `lib/i18n/messages/es.ts` a `lib/i18n/messages/<código>.ts`, cambia `export const es` por `export const <código>: Messages` y traduce los textos. Respeta los marcadores (`{name}`, `{count}`…) y los sufijos de plural (`_one`, `_other`; puedes añadir `_few`, `_many`… si el idioma los usa).
2. Regístralo en `LOCALES` dentro de `lib/i18n/index.ts`.
3. Ejecuta `npm run typecheck` y `npm test`: fallan si falta una clave o si un texto no tiene los mismos marcadores que el español.

El idioma se elige con el selector de la cabecera y se guarda en una cookie; sin elección, se usa el idioma del navegador.
