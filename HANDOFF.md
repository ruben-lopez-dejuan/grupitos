# WCA Easy Groups — relevo para el siguiente agente

Fecha: 22/10/2026, actualizado el 23/10/2026. Sustituye a `CLAUDE_HANDOFF.md`, que es de cuando solo existía la primera matriz y queda como contexto histórico de producto (las reglas de dominio de su sección 3 siguen vigentes).

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
  - `npm test`: Vitest, con 183 tests en verde (límite de 20 s por test: la demo de 260 personas tarda unos segundos).
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

Último commit al actualizar este documento: `ad46b27 Restrict judging, scrambling and running to segments`. Las fases 1 y 2 del modo PRO están hechas y la 3 empezada (sección 6). Lo hecho sin aprobación expresa del usuario está en [`docs/INFORME_2026-10-23.md`](docs/INFORME_2026-10-23.md).

### 4.1. Flujo y pestañas (`components/group-workspace.tsx`)

No hay barra lateral: la barra superior lleva la marca, la competición, el interruptor PRO y la cuenta, y las pestañas van numeradas (un ✓ en «Revisar» cuando hay propuesta, y el paso «Publicar» al final, aún no disponible). La pestaña activa se sincroniza con el hash de la URL. Con PRO apagado no aparecen Horario ni Segmentos.

1. **Zona:** número de estaciones y modo de entrada (puestos fijos, sala de espera o mixto, que usa sala de espera en primeras rondas y puestos fijos después).
2. **Horario** (solo PRO): ver sección 6.
3. **Reglas** (opciones al estilo Groupifier; en PRO, además, «Quién puede hacer cada tarea»):
   - Reparto de competidores en grupos: `scrambler-safe` (recomendado), `symmetric`, `balanced`, `ranks` y `name-optimised`.
   - Opciones de tareas: asignar jueces y runners, evitar trabajar justo antes del propio grupo, repartir delegados, permitir tareas normales a delegados y organizadores, tareas de delegado y data entry.
   - Otras opciones: sin tareas para newcomers, tareas solo en las propias pruebas, sin runners extranjeros.
4. **Personas** (`components/people-panel.tsx`): roles (delegado, delegado en prácticas, organizador, staff, data entry), personal de confianza, quién hace tareas de delegado, fotos y marca de newcomer. En PRO, además, voluntarios, indisponibilidades, importación de hoja de cálculo y tabla de propiedades (sección 6).
5. **Segmentos** (solo PRO): sección 6.
6. **Grupos:** primeras rondas y rondas siguientes; para cada ronda, grupos totales, scramblers y runners con steppers; botón para excluir una ronda o reactivarla. En PRO, el total se reparte entre los bloques del horario y se ve el reparto por escenario.
7. **Revisar** (`components/group-review.tsx`): matriz al estilo Delegate Dashboard.
   - Una persona por fila y un grupo por columna.
   - Selección múltiple arrastrando, con Mayús/Ctrl o con las flechas, y deshacer/rehacer.
   - Para editar: teclear una letra asigna esa tarea; un número sobre una celda C fija la estación.
   - Filtros, orden, búsqueda, ficha de persona y columna «Total tareas».
   - Validación en línea, con avisos y errores por ronda, por grupo y por fila. Pulsar «N errores» o «N avisos» despliega esa lista.
   - Los totales de cada grupo cuentan la ronda entera, aunque haya filtro o búsqueda.
   - Selector de rondas en rejilla alineada.
8. **Hojas de tiempos** (`components/printing-panel.tsx` y `lib/scorecards/*`): scorecards de Groupifier en PDF con `pdfmake`, rellenadas o en blanco, en varios idiomas y con comprobación de mezcla. Cada scorecard ajusta su texto (`fitText`) para no salirse de su cuarto de página. En PRO se puede imprimir por escenario o grupo a grupo; las hojas llevan el número de grupo compartido y el nombre del escenario.

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

## 6. Modo PRO: estado (23/10/2026)

Configuración en `settings.pro: ProConfig { enabled, schedule, people?, segments?, jobs? }` (`lib/pro/*`), guardada con el borrador. `parseDraft()` normaliza borradores antiguos (incluido el de la fase 1, que guardaba salas como escenarios).

### 6.1. Fase 1: horario, salas y escenarios (hecha)

- **Salas y escenarios** (Codex, `c6df4be`): `ProRoom { id, name, color, stages: ProStage[] }`. Los escenarios se leen de la extensión `org.cubingusa.natshelper.v1.Room` y los grupos de `org.cubingusa.natshelper.v1.Group { stageId }`. Se conservan las ventanas exactas de los grupos importados (`groupWindows`). La pestaña Horario permite arrastrar y redimensionar bloques. Fixture anonimizado en `tests/fixtures/schedule-with-rooms-and-stages.json`.
- **Numeración** (`groupSlots()`): cada grupo es una columna de la matriz (`group`, G1…Gn por hora y orden de escenario) y tiene el **número que ve la gente** (`number`): los grupos que empiezan a la misma hora en escenarios distintos comparten número («G1 Araba», «G1 Bizkaia»), y cada hora de inicio nueva toma el siguiente. Es la convención que pidió el usuario y el número que irá a `-g{n}` en el WCIF. La matriz, los textos de validación, la ficha de persona y las hojas lo muestran así.
- **Grupos totales**: en la pestaña Grupos se fija el total de cada ronda; `setRoundGroups()` lo reparte entre sus bloques en proporción a su duración (al menos uno por bloque) y el horario los puede colocar de otra forma.
- **Generador**: reparto global de competidores (Codex, `df0051c`) que evita que alguien compita en dos sitios a la vez; cuando el horario no lo permite (un multi en la sala auxiliar durante toda una ronda), lo coloca en el grupo que menos se solapa y la validación lo deja como **aviso** (`unavoidable-time-overlap`), porque solo se arregla cambiando el horario.
- **MultiBLD**: se leen los grupos por intento (`333mbf-r1-g1-a1`), así que el multi conserva su grupo único; quien hace multi no recibe tareas durante la entrega de cubos (`other-multi`, `eventBusyWindows()`).

### 6.2. Fase 2: personas y segmentos (hecha)

- `lib/pro/people.ts`, pestaña Personas (`components/pro-people-panel.tsx`):
  - **Propiedades** por persona: tabla con columnas libres; se importan las de natshelper del WCIF (`team`, `weight-judge`…). Valores como texto; las comparaciones leen números cuando ambos lados lo son.
  - **Voluntarios que no compiten** (`ProVolunteer`, clave `vol-N`; `WcifPerson.appKey` solo existe en la app). El generador los trata como staff.
  - **Indisponibilidades**: franja horaria o «mientras compite X». El generador no les da tareas entonces y la revisión avisa (`unavailable`).
  - **Importación de hoja de cálculo** (`lib/pro/sheet-import.ts`, `components/sheet-import-panel.tsx`): Google Sheets por servidor (`app/api/sheets/route.ts`, `lib/google-sheets.ts`, cuenta de servicio; ver [`docs/GOOGLE_SHEETS.md`](docs/GOOGLE_SHEETS.md)) o CSV pegado o subido. Identifica por WCA ID, nº de inscripción, correo o nombre (sin tildes), elige columnas como propiedades y puede crear voluntarios con las filas sin inscripción. **La cuenta de servicio aún no existe**: hasta que el usuario la cree y ponga `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` en Vercel, la app lo dice y funciona con CSV.
- `lib/pro/segments.ts`, pestaña Segmentos (`components/pro-segments-panel.tsx`): segmentos con nombre que cumplen todas o alguna de una lista de condiciones (rol, propiedad, edad, inscrito en, marca personal por debajo de un tiempo, newcomer, país, otro segmento), cada una negable; recuento y lista en vivo; plantillas sacadas de los scripts (voluntarios elegibles, runners, mezcladores de 3x3). La revisión filtra por segmento.

### 6.3. Fase 3: motor de personal (empezada)

- Hecho: **quién puede hacer cada tarea** (pestaña Reglas, PRO): un segmento para jueces, otro para scramblers y otro para runners (`settings.pro.jobs`). El generador solo da la tarea a sus miembros (el segmento de scramblers sustituye a la regla de la mitad más rápida) y la revisión avisa (`not-eligible`).
- Pendiente, en este orden recomendado:
  1. **Elegibilidad por prueba**: el `CanScramble` real del usuario usa un límite de marca por prueba con correspondencias (BLD y OH → 3x3). Hoy un único segmento vale para todas las pruebas, y por eso «Pueden mezclar 3x3» da avisos en Megaminx. Propuesta: una condición «marca en la prueba de la ronda por debajo de su límite» con una tabla de límites por prueba, o elegibilidad por ronda.
  2. **Trabajos por ronda × escenario** con cantidades (hoy: scramblers y runners por ronda, jueces = estaciones).
  3. **Puntuación con pesos** (los scorers de CompScript: JobCount, SameJob, Consecutive, FollowingGroup, PersonProperty, Preference…) y perfiles; el motor actual es voraz con claves lexicográficas, así que esto lleva al **ILP por grupo** (`javascript-lp-solver`, MIT, como CompScript).
  4. **«¿Por qué esta persona?»**: guardar por asignación qué reglas cumplió y cuánto sumó cada criterio.

### 6.4. Datos de referencia: WCIF del Campeonato de España 2026

Archivo local del usuario (**no commitear: tiene datos personales**). Estructura:

- Recinto «Lasesarre», `Europe/Madrid`, 5–7 de diciembre de 2026. Horas del WCIF en UTC.
- Sala «Pabellón» con los escenarios Araba, Bizkaia y Gipuzkoa (primeras rondas en los tres; varias rondas siguientes solo en Bizkaia y Gipuzkoa; `333-r4` con 16 grupos) y sala «Sala Auxiliar» sin escenarios (444bf, 555bf, multi en dos intentos y dos entregas de cubos). El multi del sábado (15:15–16:25 en hora local) coincide con 5×5 y Megaminx: con el reparto actual, quienes hacen multi y 5×5 quedan en los grupos de 5×5 que solo se solapan 7 minutos, y en Megaminx en los grupos que no se solapan.
- 300 personas aceptadas; 12 delegados, 11 organizadores y 7 data entry; 66 con propiedades natshelper (`team`, `weight-judge`, `weight-runner`, `weight-scrambler`, `delegate-cluster`).
- Extensiones de competición `groupifier.CompetitionConfig` (opciones de impresión, aún no se leen) y `finaltags.competition`.

## 7. Siguientes fases

1. **Terminar la fase 3** (sección 6.3).
2. **Fase 4, reparto avanzado en grupos:** conjuntos ordenados de personas (por segmento) asignados a escenarios y grupos, reglas de estación y competidores destacados.
3. **Fase 5, equipos:** rotación día × escenario y equipos equilibrados automáticamente.
4. **Fase 6, publicación e informes:**
   - Escribir actividades y `assignments` en el WCIF, conservando las extensiones desconocidas.
   - Escribir las extensiones natshelper de sala y grupo, con el número de grupo compartido en `-g{n}`.
   - Mostrar el diff, pedir confirmación explícita, hacer el PATCH y volver a leer el WCIF para comprobarlo.
   - Informes.

Pendientes conocidos:

- Estaciones distintas en cada escenario (hoy todas usan el mismo número).
- Leer `groupifier.CompetitionConfig` para rellenar las opciones de impresión.
- La configuración PRO no se exporta todavía como plantilla JSON.

## 8. Cómo comprobar el trabajo

- `npm run typecheck` y `npm test` siempre. `npm run build` antes de hacer push.
- Comprobación visual en `/demo?size=large` y `/demo?size=small`, en tema claro y oscuro, a unos 1280 px y en móvil. Hay que confirmar que no hay desplazamiento horizontal de la página, que no hay textos cortados y que las cabeceras están alineadas con sus columnas.
- Para probar con datos reales, importar una competición desde el dashboard con la cuenta WCA del usuario. Para el WCIF del Nacional, cargarlo en IndexedDB solo en local y no subirlo nunca al repositorio.
