# WCA Easy Groups — relevo para el siguiente agente

Fecha: 22/10/2026. Sustituye a `CLAUDE_HANDOFF.md`, que es de cuando solo existía la primera matriz y queda como contexto histórico de producto (las reglas de dominio de su sección 3 siguen vigentes).

Orden de lectura recomendado:

1. Este documento.
2. [`docs/MODO_PRO.md`](docs/MODO_PRO.md): diseño del modo PRO, con las decisiones del usuario y las fases.
3. `AGENTS.md`: aviso de Next.js 16 (leer `node_modules/next/dist/docs/` antes de tocar APIs de Next).

---

## 1. Qué es y cómo trabajar con el usuario

**WCA Easy Groups** crea, revisa y (más adelante) publica grupos y tareas de personal de competiciones WCA. Su objetivo es ser lo bastante sencilla para un open pequeño, de modo que basten un par de clics, y lo bastante potente para un campeonato nacional, cubriendo todo lo que hoy se hace con CompScript pero con interfaz visual.

- Repositorio: <https://github.com/ruben-lopez-dejuan/wca-easy-groups>, rama `main`.
- Producción: <https://groups.lopezruben.com>, desplegada en Vercel (proyecto `rulo7/wca-easy-groups`) con cada push a `main`. El DNS del dominio está en IONOS.
- Usuario: Rubén López de Juan, organizador y delegado WCA en España. Escribe en español.

Preferencias firmes del usuario:

- **Al terminar cada paquete de trabajo, hacer commit y push**, siempre a `main` y **sin incluir `.claude/`**, salvo que el usuario diga expresamente que no. Los mensajes de commit van en inglés, en imperativo, con un cuerpo breve en viñetas.
- **Interfaz sobria y compacta.** Poco texto: las explicaciones van detrás de un «?» (`components/hint.tsx`) o en un `title`. El color solo cuando significa algo, como los colores de tarea S/J/R/D o los de escenario. Nada de decoración.
  - Rechazó unos iconos de puzles dibujados a mano. Hay que mantener los iconos oficiales de `@cubing/icons`.
  - Hay que comprobar que cabeceras y columnas no se solapan ni se cortan a unos 1280 px. Es lo que más le molesta.
- Las tareas usan los códigos C (compite), J (juez), **S (scrambler, no M)**, R (runner), D (delegado), L (stage lead), A (announcer), E (data entry) y O (otra).
- Prefiere que se verifique visualmente en el navegador antes de darle algo por terminado.

## 2. Infraestructura y configuración

- Variables de entorno: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `WCA_CLIENT_ID`, `WCA_CLIENT_SECRET` y `WCA_BASE_URL` (ver `.env.example`). Están en `.env.local`, que Git ignora, y en Vercel para producción. **Nunca mostrar ni commitear sus valores.**
- OAuth de la WCA: scopes `public manage_competitions` y callback `/api/auth/callback/wca`, en local y en producción.
- Pendiente por parte del usuario:
  - Aviso de Safe Browsing en `lopezruben.com`: cerrar el registro DNS que apuntaba a GitHub Pages en IONOS y pedir revisión en Search Console.
  - Regenerar el secreto de la app OAuth «Pruebas», que llegó a verse en una captura.
- La CLI de Vercel quedó con la sesión iniciada en el equipo del usuario. Se puede cerrar con `npx vercel logout`.

## 3. Stack y convenciones

- Next.js `16.4.2` con App Router. `params` y `searchParams` son Promises, y `cookies()` y `headers()` son async. También React 19, TypeScript 5.6 y NextAuth 4.
- Los datos no salen del navegador:
  - El WCIF importado se guarda en IndexedDB (`lib/competition-store.ts`).
  - El borrador se guarda en `localStorage` con la clave `wca-easy-groups:draft:{id}` (`lib/draft.ts`, versión 3).
  - No hay base de datos de servidor.
- Comandos:
  - `npm run dev`. El usuario suele tenerlo ya abierto en el puerto 3000, y un segundo `next dev` en la misma carpeta no arranca.
  - `npm run typecheck`.
  - `npm test`: Vitest, con 156 tests en verde.
  - `npm run build`.
- Demo sin login, solo en desarrollo:
  - `/demo?size=small`: 34 personas y una sala.
  - `/demo?size=large`: 260 personas, salas Rojo/Verde/Hall y un horario de dos días.
  - `/demo/competitions`: la lista de competiciones.
  - Son datos sintéticos de `lib/demo-competition.ts`.
- Estilos: CSS a mano, sin framework.
  - `app/product.css` es una cascada de reglas que se van sobrescribiendo: las últimas mandan. Para añadir algo se pone al final.
  - `app/pro.css` contiene los estilos del modo PRO.
  - Los colores salen de variables en `:root` y `:root[data-theme="dark"]` (`--surface`, `--line`, `--ink`, `--muted`, `--blue`, `--error`, `--warning`…).
  - El tema se guarda en `localStorage` con la clave `wca-easy-groups-theme`. El usuario usa el oscuro.
- i18n propio en `lib/i18n/`:
  - `messages/es.ts` es la referencia y `en.ts` está tipado contra ella.
  - Para traducir se usa `useI18n()` en el cliente, que da `t` y `tp` (plural), y `getI18n()` en el servidor. Los nombres de pruebas salen de `useEventName()` y los textos de validación de `useIssueText()`.
  - El test `tests/i18n.test.ts` falla si a algún idioma le falta una clave o si sus marcadores no coinciden con los del español.
  - **Toda cadena visible debe ir en los dos diccionarios.**
- Licencias: el reparto y los scorecards están portados de Groupifier (Apache-2.0); ver `THIRD_PARTY_NOTICES.md`. CompScript es MIT: si se porta código suyo, hay que citarlo allí. Delegate Dashboard es GPL: se puede tomar como idea, pero no se puede copiar código.

## 4. Estado actual

Último commit: `1a8afe3 Translate the interface into English`. **La fase 1 del modo PRO (sección 6) está hecha pero sin commitear.**

### 4.1. Flujo y pestañas (`components/group-workspace.tsx`)

La barra lateral y las pestañas superiores sincronizan la pestaña activa con el hash de la URL.

1. **Zona de competición:** número de estaciones y modo de entrada (puestos fijos, sala de espera o mixto, que usa sala de espera en primeras rondas y puestos fijos después).
2. **Horario** (solo con PRO activado): ver sección 6.
3. **Reglas de asignación** (opciones al estilo Groupifier):
   - Reparto de competidores en grupos: `scrambler-safe` (recomendado), `symmetric`, `balanced`, `ranks` y `name-optimised`.
   - Opciones de tareas: asignar jueces y runners, evitar trabajar justo antes del propio grupo, repartir delegados, permitir tareas normales a delegados y organizadores, tareas de delegado y data entry.
   - Otras opciones: sin tareas para newcomers, tareas solo en las propias pruebas, sin runners extranjeros.
4. **Personas y roles** (`components/people-panel.tsx`): roles (delegado, delegado en prácticas, organizador, staff, data entry), personal de confianza, quién hace tareas de delegado, fotos y marca de newcomer.
5. **Grupos por ronda:** primeras rondas y rondas siguientes; para cada ronda, grupos, scramblers y runners con steppers; botón para excluir una ronda o reactivarla.
6. **Revisar y validar** (`components/group-review.tsx`): matriz al estilo Delegate Dashboard.
   - Una persona por fila y un grupo por columna.
   - Selección múltiple arrastrando, con Mayús/Ctrl o con las flechas, y deshacer/rehacer.
   - Para editar: teclear una letra asigna esa tarea; un número sobre una celda C fija la estación.
   - Filtros, orden, búsqueda, ficha de persona y columna «Total tareas».
   - Validación en línea, con avisos y errores por ronda, por grupo y por fila.
7. **Hojas de tiempos** (`components/printing-panel.tsx` y `lib/scorecards/*`): scorecards de Groupifier en PDF con `pdfmake`, rellenadas o en blanco, en varios idiomas y con comprobación de mezcla. Cada scorecard ajusta su texto (`fitText`) para no salirse de su cuarto de página.

La lista de competiciones (`components/competition-list.tsx`) muestra bandera y ciudad, ordena las próximas primero y guarda las pasadas detrás de un botón. La interfaz está en español e inglés.

### 4.2. Modelo de datos

- `GeneratedAssignment` (en `lib/assignments.ts`): `{ id, roundId, eventId, personId, name, wcaId, birthdate, seedResult, inRound, station?, tasks: Task[] }`, donde `Task = { group, role }`. Como mucho hay una tarea por grupo; el validador marca lo que esté mal.
- `WorkspaceSettings` (en `lib/draft.ts`): `{ stations, zoneMode, rounds, options, people, printing, pro? }`. `generationSignature()` decide cuándo la propuesta queda «desactualizada».
- `RoundConfig` (en `lib/rounds.ts`): sugerencias de Groupifier para el número de grupos, los scramblers (uno cada cinco estaciones) y los runners (uno cada ocho).
- `lib/validation.ts`: `validateRound()` devuelve objetos `Issue { severity, code, roundId, group?, assignmentId?, params }`. Los textos los escribe la interfaz con el código. `validateTimes()` es la validación del modo PRO (sección 6).

### 4.3. Generador (`lib/group-generator.ts`)

Parte de Groupifier, con mejoras propias:

- Reparto de competidores en grupos con `splitIntoGroups` de Groupifier y repaso de delegados (`spreadRole`).
- Las tareas se rellenan por turnos entre grupos, para que G1 no se quede con los mejores candidatos. El candidato se elige por claves ordenadas, la primera diferencia decide (`best()` y `compareKeys()`).
- `scrambler-safe` toma los scramblers del personal de confianza o de la mitad más rápida de la ronda. Todos los del pool mezclan una vez antes de que nadie repita.
- El staff tiene prioridad mientras no supere el doble de la carga media de los demás (`STAFF_LOAD_FACTOR`).
- La carga cuenta en bloques (`floor(load/4)`) antes que estar en la ronda, para que quien está en muchas pruebas no cargue con la mayor parte del trabajo.
- En PRO no asigna tareas a nadie que esté ocupado a la misma hora (sección 6).

Es un algoritmo voraz y determinista. El diseño PRO prevé sustituir la selección de personal por un ILP con `javascript-lp-solver`, como hace CompScript (fase 3).

## 5. Lo que queremos: modo PRO

El objetivo, en palabras del usuario: «Todo lo que ves aquí que se utilice quiero poder yo utilizar, programar, de una manera más user friendly». «Aquí» se refiere a CompScript, a los scripts del Nacional de CubingUSA y a sus propios scripts del Amore Open 2026.

Todo el detalle está en [`docs/MODO_PRO.md`](docs/MODO_PRO.md):

- la tabla que relaciona cada necesidad con su función de CompScript y con la interfaz de PRO;
- los principios;
- la arquitectura, con el modelo `ProConfig`, las condiciones como árbol JSON y el motor ILP;
- las pestañas;
- las seis fases.

Decisiones del usuario (22/10/2026):

1. **Horario:** se importa del WCIF y se edita en la app.
2. **Voluntarios:** lectura directa de Google Sheets. Hace falta una cuenta de servicio de Google en el servidor: una variable en Vercel y una ruta API que lea la hoja; la hoja se comparte con el correo de la cuenta.
3. **Editor:** solo visual, con plantillas JSON exportables. No habrá lenguaje de texto.
4. **Publicación al WCIF:** al final de todo el modo PRO, en la fase 6.

Referencias. Clonarlas si hace falta; están fuera del repo.

- CompScript: <https://github.com/cubingusa/compscript>. Su motor está en `functions/` y su ILP en `solver/`.
- Scripts del Nacional de CubingUSA 2026: <https://github.com/cubingusa/nats-scripts>.
- Scripts del usuario: <https://github.com/ruben-lopez-dejuan/AmoreOpen2026_scripts>.
  - `lib/_constants.cs`: salas y definiciones de elegibilidad.
  - `lib/_jobs.cs`, `lib/_scorers.cs`, `lib/_assignment_sets.cs` y `lib/_unavailabilities.cs`: trabajos, puntuaciones, conjuntos y disponibilidad.
  - `0_precomp/1_build_schedule.cs`: construcción del horario.

## 6. Modo PRO, fase 1: hecha, sin commitear y con un error de modelo

### 6.1. Lo implementado

- `lib/pro/schedule.ts`:
  - Modelo: `ProConfig { enabled, schedule }` y `ProSchedule { timeZone, days, stages, blocks, activities }`.
  - Bloques `ProRoundBlock { activityCode, stageId, start, end, groups }`, que se dividen en grupos iguales igual que `CreateGroups` de CompScript.
  - Actividades sin grupos: `ProActivity`.
  - Las horas se guardan como hora local del recinto, `YYYY-MM-DDTHH:mm`.
  - Funciones:
    - `importSchedule()`: lee el horario del WCIF.
    - `groupSlots()`: numera los grupos G1…Gn por hora y, a igual hora, por escenario. También gestiona los intentos de multi (`-a1`, `-a2`).
    - `scheduleProblems()`: problemas del propio horario.
    - `withScheduledGroups()`: da a cada ronda los grupos que salen del horario.
- `components/pro-schedule-panel.tsx`: la pestaña Horario.
  - Edición de escenarios: nombre, color, añadir y quitar.
  - Línea de tiempo por día.
  - Editor del bloque seleccionado: ronda, escenario, día, inicio, fin y número de grupos.
  - Botón «Copiar a los demás escenarios», el equivalente de `Map(AllStages(), …)`.
  - Reimportar del WCIF.
- Interruptor **PRO** en la barra superior de la competición, guardado en `settings.pro`; al apagarlo no se pierde la configuración.
- Integración con el resto:
  - En «Grupos por ronda», las rondas que están en el horario muestran el número de grupos que da el horario.
  - En la matriz, cada grupo muestra su escenario y su hora.
  - El generador recibe `slots` y no asigna tareas a quien ya está ocupado a esa hora.
  - `validateTimes()` produce el error `time-overlap`, que señala a quien tiene dos cosas a la vez, en la misma ronda o en otra.
- Tests en `tests/pro-schedule.test.ts`. Probado en `/demo?size=large`, en claro, oscuro y móvil.

### 6.2. Corrección necesaria: salas y escenarios son cosas distintas

La fase 1 trata **cada sala del WCIF como un escenario**, y eso no es correcto. El WCIF real del Campeonato de España 2026 (`SpanishChampionship2026`), que el usuario facilitó como archivo local y que **no debe commitearse porque contiene datos personales**, muestra el modelo de CompScript/natshelper:

- **Sala** (`schedule.venues[].rooms[]`, estándar WCIF): un espacio físico con sus actividades, una por ronda y sala.
- **Escenario** (stage): una subdivisión de una sala. Se define con una extensión de la sala:

  ```json
  { "id": "org.cubingusa.natshelper.v1.Room",
    "specUrl": "https://github.com/cubingusa/natshelper/blob/main/specification.md",
    "data": { "stages": [ { "id": 0, "name": "Araba", "color": "#F39200" },
                          { "id": 1, "name": "Bizkaia", "color": "#008B3B" },
                          { "id": 2, "name": "Gipuzkoa", "color": "#25346C" } ] } }
  ```

  Los ids de escenario son únicos en toda la competición. Opcionalmente, un escenario tiene `groupNamePrefix`. En CompScript se crea con `CreateStage(name, roomName, color, groupNamePrefix)`.
- **Grupo de un escenario:** es un `childActivity` de la actividad de la ronda en su sala, con esta extensión:

  ```json
  { "id": "org.cubingusa.natshelper.v1.Group", "data": { "stageId": 1 } }
  ```

  - **El `activityCode` se repite en cada escenario.** Hay un `333-r1-g1` en Araba, otro en Bizkaia y otro en Gipuzkoa, cada uno con su propio `id`.
  - El nombre sigue el patrón `"<Ronda> <escenario> <n>"`, por ejemplo «3x3x3 Cube Round 1 Bizkaia 1».
  - En las salas sin escenarios, los grupos cuelgan directamente de la sala y no llevan extensión.

Estructura del WCIF del Nacional, solo la parte de horario y sin datos personales:

- Recinto «Lasesarre», zona horaria `Europe/Madrid`, del 5 al 7 de diciembre de 2026 (tres días). Los horarios del WCIF están en UTC; a las 08:00Z son las 09:00 en Madrid.
- **Sala 0 «Pabellón»** (`#fb1313`), con los escenarios Araba, Bizkaia y Gipuzkoa:
  - Las primeras rondas se reparten en los tres escenarios con los mismos grupos. Por ejemplo, `333-r1` tiene 12 grupos (4 por escenario) y `clock-r1` tiene 9 (3 por escenario).
  - Varias rondas siguientes van solo en dos escenarios (Bizkaia y Gipuzkoa):
    - Con un grupo por escenario: `333bf-r2`, `777-r2`, `clock-r2`, `555-r2`, `sq1-r2`, `minx-r2`, `333bf-r3` y `666-r2`.
    - Con dos grupos por escenario: `skewb-r3`, `333oh-r3`, `pyram-r3`, `444-r3` y `222-r3`.
  - `333-r4` tiene 16 grupos.
  - Actividades `other-*`: `checkin` (Registro / Doors open), `lunch`, `setup` (montajes), `awards` y `misc` (torneos de puzzles y Copa de España). **`other-setup` no está todavía en `OTHER_KINDS`.**
- **Sala 1 «Sala Auxiliar»** (`#681da8`), sin escenarios: `444bf-r1`, `555bf-r1`, `333mbf-r1-a1`, `333mbf-r1-a2` y dos `other-multi` para la entrega de cubos.
- Pruebas: 333 (4 rondas), 222, 444, 333bf, 333oh, pyram y skewb (3 rondas cada una); 555, 666, 777, clock, minx y sq1 (2 rondas); 444bf, 555bf y 333mbf (1 ronda).
- Personas: 300 aceptadas de 342. Todavía no hay `assignments`.
- Roles: 12 delegados, 11 organizadores y 7 data entry.
- 66 personas tienen propiedades en la extensión `org.cubingusa.natshelper.v1.Person`: `team` (Voluntario normal, Delegado, Data entry, Registro / Stand AES, Organizador, Side room, Streaming, Médico…), `weight-judge`, `weight-runner`, `weight-scrambler` y `delegate-cluster`. **Hay que leerlas en la fase 2.**
- Extensiones de competición:
  - `groupifier.CompetitionConfig`, que contiene `scorecardPaperSize`, `scorecardOrder`, `printScorecardsCoverSheets` y las opciones de comprobación de mezcla. Se podría usar para rellenar `PrintingOptions` al importar.
  - `finaltags.competition`.

### 6.3. Cambio de modelo propuesto, que es la siguiente tarea

1. Modelo:
   - `ProRoom { id, name, color, stages: ProStage[] }`, con `ProStage { id, name, color, groupNamePrefix? }`.
   - Una sala sin escenarios funciona como un escenario implícito.
   - `ProRoundBlock` pasa a tener `roomId` y `stageId?`. Alternativa: mantener `stageId` y añadir `roomId` a cada escenario.
2. Importación:
   - Leer `org.cubingusa.natshelper.v1.Room.stages`.
   - Agrupar los `childActivities` por `Group.stageId`.
   - Crear un bloque por ronda y escenario, con `groups` igual al número de hijos de ese escenario y horas tomadas de los propios hijos. Ojo: si un escenario tiene huecos o grupos de duración desigual, un bloque de grupos iguales no lo representa bien. Valorar guardar los grupos importados tal cual.
   - Los grupos sin `stageId` van a la sala.
3. Interfaz:
   - La línea de tiempo tiene una columna por escenario, agrupadas bajo la cabecera de su sala, y una columna por cada sala sin escenarios.
   - Se pueden crear y quitar salas y escenarios dentro de una sala.
   - Al copiar un bloque, se copia a los demás escenarios de su misma sala.
4. `groupSlots()`: mismo criterio de numeración (hora y después orden de escenario), pero conservando el número local de cada escenario, que es el que irá al `activityCode` (`-g{n}`).
5. Añadir `setup` a `OTHER_KINDS` y su traducción.
6. Crear un fixture **anonimizado** en `tests/fixtures/` (sin personas, o con nombres falsos) que reproduzca esta estructura de horario, y tests de importación con él.
7. Ajustar la demo grande (`lib/demo-competition.ts`) para que use una sala con escenarios, como el Nacional, más una sala auxiliar.

## 7. Siguientes fases

Están detalladas en `docs/MODO_PRO.md`.

1. **Corrección de salas y escenarios** (sección 6.3) y commit de la fase 1 cuando el usuario lo apruebe.
2. **Fase 2, personas y segmentos:**
   - Etiquetas y propiedades por persona, leyendo las de natshelper.
   - Voluntarios que no compiten.
   - Indisponibilidades por franja y la regla «no disponible cuando compite X».
   - Importación desde Google Sheets: cuenta de servicio, ruta API en el servidor y relación de columnas con campos.
   - Constructor visual de segmentos, con recuento en vivo.
3. **Fase 3, motor de personal:**
   - Trabajos por ronda y escenario, con su cantidad y quién puede hacerlos.
   - Puntuaciones con pesos y perfiles.
   - ILP por grupo.
   - Botón «¿por qué esta persona?».
4. **Fase 4, reparto avanzado en grupos:** conjuntos ordenados de personas asignados a escenarios y grupos, reglas de estación y competidores destacados.
5. **Fase 5, equipos:** rotación día × escenario y equipos equilibrados automáticamente.
6. **Fase 6, publicación e informes:**
   - Escribir actividades y `assignments` en el WCIF, conservando las extensiones desconocidas.
   - Escribir las extensiones natshelper de sala y grupo.
   - Mostrar el diff, pedir confirmación explícita, hacer el PATCH y volver a leer el WCIF para comprobarlo.
   - Informes.

Pendientes conocidos fuera de PRO:

- Estaciones distintas en cada escenario.
- Nombres de escenario en las hojas de tiempos.

## 8. Cómo comprobar el trabajo

- `npm run typecheck` y `npm test` siempre. `npm run build` antes de hacer push.
- Comprobación visual en `/demo?size=large` y `/demo?size=small`, en tema claro y oscuro, a unos 1280 px y en móvil. Hay que confirmar que no hay desplazamiento horizontal de la página, que no hay textos cortados y que las cabeceras están alineadas con sus columnas.
- Para probar con datos reales, importar una competición desde el dashboard con la cuenta WCA del usuario. Para el WCIF del Nacional, cargarlo en IndexedDB solo en local y no subirlo nunca al repositorio.
