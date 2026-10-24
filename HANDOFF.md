# Grupitos — relevo para el siguiente agente

Fecha: 22/10/2026, actualizado el 23/10/2026. Sustituye a `CLAUDE_HANDOFF.md`, que es de cuando solo existía la primera matriz y queda como contexto histórico de producto (las reglas de dominio de su sección 3 siguen vigentes).

Orden de lectura recomendado:

1. Este documento.
2. [`docs/MODO_PRO.md`](docs/MODO_PRO.md): diseño del modo PRO, con las decisiones del usuario y las fases.
3. `AGENTS.md`: aviso de Next.js 16 (leer `node_modules/next/dist/docs/` antes de tocar APIs de Next).

---

## 1. Qué es y cómo trabajar con el usuario

**Grupitos** crea, revisa y (más adelante) publica grupos y tareas de personal de competiciones WCA. Su objetivo es ser lo bastante sencilla para un open pequeño, de modo que basten un par de clics, y lo bastante potente para un campeonato nacional, cubriendo todo lo que hoy se hace con CompScript pero con interfaz visual.

- Repositorio: <https://github.com/ruben-lopez-dejuan/grupitos>, rama `main`.
- Producción: <https://grupitos.lopezruben.com>, desplegada en Vercel (proyecto `rulo7/grupitos`; antes `wca-easy-groups`) con cada push a `main`. El DNS del dominio está en IONOS.
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
  - `npm test`: Vitest, con 212 tests en verde (límite de 20 s por test: la demo de 260 personas tarda unos segundos).
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

Último commit al actualizar este documento: `d8c0723 Show per-stage staffing as defaults, in the rounds table's look`. Las fases 1, 2 y 3 del modo PRO están hechas (sección 6). Lo hecho sin aprobación expresa del usuario está en [`docs/INFORME_2026-10-23.md`](docs/INFORME_2026-10-23.md).

### 4.1. Flujo y pestañas (`components/group-workspace.tsx`)

No hay barra lateral: la barra superior lleva la marca, la competición con «Cambiar competición» al lado, el interruptor PRO y la cuenta. El pie lleva el botón «Siguiente: …» de cada paso; **los grupos solo se generan desde el paso Grupos**. Además, y las pestañas van numeradas (un ✓ en «Revisar» cuando hay propuesta, y el paso «Publicar» al final, aún no disponible). La pestaña activa se sincroniza con el hash de la URL. Con PRO apagado no aparecen Horario ni Clusters.

1. **Zona:** número de estaciones y modo de entrada (puestos fijos, sala de espera o mixto, que usa sala de espera en primeras rondas y puestos fijos después).
2. **Horario** (solo PRO): ver sección 6.
3. **Reglas** (opciones al estilo Groupifier; en PRO, además, «Quién puede hacer cada tarea»):
   - Reparto de competidores en grupos: `scrambler-safe` (recomendado), `symmetric`, `balanced`, `ranks` y `name-optimised`.
   - Opciones de tareas: asignar jueces y runners, evitar trabajar justo antes del propio grupo, repartir delegados, permitir tareas normales a delegados y organizadores, tareas de delegado y data entry.
   - Otras opciones: sin tareas para newcomers, tareas solo en las propias pruebas, sin runners extranjeros.
4. **Personas** (`components/people-panel.tsx`): roles (delegado, delegado en prácticas, organizador, staff, data entry), personal de confianza, quién hace tareas de delegado, fotos y marca de newcomer. En PRO, además, voluntarios, indisponibilidades, importación de hoja de cálculo y tabla de propiedades (sección 6).
5. **Clusters** (solo PRO; en el código siguen llamándose `segments`): sección 6.
6. **Grupos:** primeras rondas y rondas siguientes; para cada ronda, grupos totales, scramblers y runners con steppers; botón para excluir una ronda o reactivarla. En PRO, el total se reparte entre los bloques del horario y se ve el reparto por escenario.
7. **Revisar** (`components/group-review.tsx`): matriz al estilo Delegate Dashboard.
   - Una persona por fila y un grupo por columna.
   - Selección múltiple arrastrando, con Mayús/Ctrl o con las flechas, y deshacer/rehacer.
   - Para editar: teclear una letra asigna esa tarea; un número sobre una celda C fija la estación.
   - Filtros, orden, búsqueda, ficha de persona y columna «Total tareas».
   - Validación en línea, con avisos y errores por ronda, por grupo y por fila. Pulsar «N errores» o «N avisos» despliega esa lista.
   - Los totales de cada grupo cuentan la ronda entera, aunque haya filtro o búsqueda.
   - Selector de rondas en rejilla alineada.
8. **Hojas de tiempos** (en PRO se eligen los escenarios dentro de la tabla de rondas, nunca grupos sueltos; opciones de escenario en la casilla de grupo y de número de inscripción por detrás para doble cara) (`components/printing-panel.tsx` y `lib/scorecards/*`): scorecards de Groupifier en PDF con `pdfmake`, rellenadas o en blanco, en varios idiomas y con comprobación de mezcla. Las tarjetas tienen el aspecto de Groupifier: etiquetas enteras (`noWrap`), números de intento a 20 puntos y el mismo orden (de peor a mejor dentro de cada grupo, de modo que el mejor lleva el número 1; en rondas siguientes, por el puesto en la ronda anterior). Solo se ajusta lo justo para que quepan cuatro por página con pdfmake 0.3, que mide algo más que el de Groupifier: 4 puntos menos en dos márgenes, números de intento más pequeños en carta o con escenario, y nombres largos encogidos a una línea (`fitText`). `tests/scorecard-layout.test.ts` comprueba con pdfmake el peor caso en todos los idiomas y papeles. En PRO se puede imprimir por escenario o grupo a grupo; las hojas llevan el número de grupo compartido y el nombre del escenario.

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

Configuración en `settings.pro: ProConfig { enabled, schedule, people?, segments?, jobs?, staffing?, scoring?, sets?, stationRules? }` (`lib/pro/*`), guardada con el borrador. `parseDraft()` normaliza borradores antiguos (incluido el de la fase 1, que guardaba salas como escenarios).

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

### 6.3. Fase 3: motor de personal (hecha)

- **Quién puede hacer cada tarea** (pestaña Reglas, PRO): un segmento para jueces, otro para scramblers y otro para runners (`settings.pro.jobs`), calculado **por prueba**: hay condiciones de la ronda, «inscrito en la prueba de la ronda» y «marca por debajo del límite de la prueba» con correspondencias (3BLD y OH usan 3x3), que es el `CanScramble` del usuario. Plantilla «Mezcladores por prueba» con los límites del Amore. La revisión avisa con `not-eligible`.
- **Personal por sala y escenario** (pestaña Zona, PRO, `settings.pro.staffing`): estaciones, scramblers y runners **predeterminados** por escenario, con el aspecto de la tabla de Grupos. Las estaciones deciden los jueces. Si se cambian scramblers o runners de una ronda en Grupos, la ronda queda marcada (`RoundConfig.staffSetByHand`) y usa su valor en todos sus escenarios.
- **Puntuación con pesos e ILP** (`lib/pro/scoring.ts`, `lib/pro/staff-ilp.ts`, `components/pro-scoring-panel.tsx`, `settings.pro.scoring`): doce criterios inspirados en los scorers de CompScript (tareas que ya lleva, horas trabajadas hoy, seguir en la misma tarea hasta 60 min, más de 90 min seguidos, justo antes de competir, compite en la prueba, reservar a quien puede mezclar, staff y voluntarios, confianza, rapidez, preferencias `weight-<tarea>`, menor de 10). Perfiles «Equilibrado» y «Amore Open 2026» (los `VolunteerScorers` de sus scripts). Con la puntuación activada, cada grupo, en orden de hora, recibe a la vez sus scramblers, runners y jueces de un programa entero (`javascript-lp-solver`): cada puesto que se pueda llenar se llena y se maximiza la puntuación. Las opciones de siempre (sin tareas a newcomers, etc.) pesan −5000. El problema es de asignación, así que el simplex ya da soluciones enteras: la demo grande tarda menos de un segundo. Turbopack necesita `turbopack.resolveAlias` para `fs` y `child_process` en el navegador (`next.config.mjs`, `lib/empty-module.ts`).
- **«¿Por qué esta persona?»**: cada tarea generada guarda `why` (personas libres, tareas previas, motivos y, con pesos, la puntuación y sus mayores aportaciones). Se ve al pasar por la celda y en la ficha.
- **Solapes encadenados**: competir en dos pruebas con grupos que se solapan hasta 10 minutos cuenta como ir de una a otra (`COMPETING_OVERLAP_TOLERANCE`).
- Posibles mejoras: más scorers (estaciones coherentes `MismatchedStationScorer`, condiciones libres `ConditionalScorer` con segmentos), pesos distintos por tarea y exportar los perfiles como plantilla JSON.

### 6.3b. Personal en salas auxiliares y equipos (23/10/2026)

- **Staff que no compite**: las personas con rol WCA sin inscripción (`nonCompetingStaff()`, como dos organizadores del Nacional) aparecen como no competidoras.
- **Delegados por escasez**: la tarea de delegado se planifica para toda la competición antes que el resto, empezando por los grupos con menos delegados libres (antes, las rondas de la sala principal se los llevaban y la sala auxiliar se quedaba sin ninguno).
- **Mezcladores de reserva**: si un grupo no se cubre con el grupo habitual (rondas de un solo grupo en sala auxiliar, escenarios en paralelo), entra gente que no compite en la ronda pero tiene marca en la prueba que se mezcla (`SCRAMBLE_EVENT`: 4BLD → 4x4, 5BLD → 5x5, BLD/OH/multi → 3x3).
- **Equipo por sala o escenario** (Zona, PRO, `LaneStaffing.team`): un cluster (o equipo) dedicado a esa sala; sus miembros van primero allí y no trabajan en ningún otro sitio. Para equipos de la propiedad `team` es mejor la sala del propio equipo (6.6).
- Con el WCIF del Nacional ya no queda ningún grupo sin delegado ni sin mezcladores, con reglas o con puntuación.
- **Prioridad de tareas de staff** (Reglas → «Más opciones», todos los modos, `options.taskOrder`, `components/task-order-panel.tsx`): lista ordenable con flechas de delegado de turno, mezcladores, data entry, runners y jueces. Con reglas, cada tarea elige en ese orden dentro de cada ronda; con el delegado primero (por defecto) sus horas se reservan para toda la competición. Con puntuación, mezcladores, runners y jueces se resuelven juntos y los puestos de las primeras tareas valen más en el ILP (`solveGroupStaff(…, priority)`), así que se cubren antes si falta gente. El usuario aclaró que lo que quería era el orden de los conjuntos de la sección 6.5; este panel se quedó en «Más opciones».
- **Data entry**: una persona por franja horaria, no por escenario; se asigna en el primer grupo que se encuentra a esa hora y la validación da por cubiertos los grupos paralelos (`dataEntryCovered`).
- **CanScramble**: una prueba sin límite acepta a cualquiera con marca en la prueba que se mezcla, y la correspondencia incluye 4BLD → 4x4 y 5BLD → 5x5 (`SCRAMBLE_EVENT`). La plantilla «Pueden mezclar» ya no exige estar inscrito en la ronda. Los mezcladores de 4BLD/5BLD con marca solo en 4x4/5x5 no dan aviso (`scrambleResult`).
- **Clusters**: los segmentos se llaman clusters en la interfaz y hay más plantillas (delegados de servicio, organizadores, delegados y en prácticas, newcomers, mayores de edad, equipo side room, staff y voluntarios).

### 6.5. Fase 4: orden de asignación de grupos y destacados (23/10/2026)

- **Conjuntos de asignación** (Reglas, PRO, `settings.pro.sets`, `lib/pro/assignment-sets.ts`, `components/assignment-sets-panel.tsx`): el `AssignmentSet` de CompScript, leído en `groups/assign.js` y en los scripts del Amore y de los nacionales de EE. UU. Lista ordenada; cada conjunto tiene:
  - **Quién**: un cluster y/o «solo los mejores N» (por grupo permitido, como `TopCompetitorsPerRound` = 4 × grupos del Rojo, o por ronda). «Los mejores» es el orden del psych sheet en primeras rondas y la clasificación de la ronda anterior después (`roundCompetitors`).
  - **Rondas**: primeras rondas, todas o elegidas.
  - **Dónde**: salas o escenarios (una sala incluye sus escenarios) y números de grupo (cualquiera, el primero, el último o una lista «1, 3-4»), con el número que ve la gente.
  - **Destacado**: estrella en la revisión y en la hoja de tiempos (arriba a la derecha, como Groupifier; Roboto no tiene ★, así que es un SVG).
- **Algoritmo** (`splitWithSets()` en `lib/group-generator.ts`): como `Assign` de CompScript, cada conjunto toma a su gente aún sin colocar, de mejor a peor, y la reparte una por grupo y pasada, el grupo más vacío primero (el desempate alterna para hacer serpiente), sin pasar del tamaño par `ceil(n / grupos)` salvo que todos sus grupos estén llenos. Los conjuntos posteriores no mueven a nadie. El resto rellena los huecos con la regla de orden (simétrica: de uno en uno desde el último grupo; por ranking: tramos consecutivos) de forma que los grupos quedan parejos. Si ningún conjunto coloca a nadie, se usa el reparto de siempre. El arreglo de solapes y el reparto de delegados solo mueven a la gente de un conjunto entre los grupos de ese conjunto.
- Diferencias con CompScript: no hay scorers por grupo (`ByMatchingValue`, `RecentlyCompeted`…); el reparto dentro de un conjunto es determinista en vez de un ILP; el destacado no se escribe aún en `groupifier.ActivityConfig.featuredCompetitorWcaUserIds` (se hará con la publicación al WCIF).
- **Tope y vista previa** (24/10/2026): un conjunto nunca llena un grupo por encima del reparto par de la ronda; quien no cabe pasa a los siguientes (`SetStats` de `splitWithSets`). `lib/pro/sets-preview.ts` simula cada ronda con los inscritos y el panel avisa de las rondas donde no caben. «Solo los mejores» admite un número por prueba (`topByEvent`) y tres unidades: por grupo del conjunto, por grupo de toda la ronda, en total.
- Plantillas: «Destacados (streaming)» (top 4 por grupo en el primer escenario, primeras rondas), «Organizadores» y «Delegados de servicio» (crean su cluster si no existe, reutilizándolo si ya hay uno con las mismas reglas) y «Un cluster».
- Comprobado con el WCIF del Nacional: con «top 4 por grupo en Araba» salen 144 destacados en 13 primeras rondas, todos en Araba y sin ningún solape.
- **Reglas de estación** (Reglas, PRO, `settings.pro.stationRules`, `lib/pro/station-rules.ts`, `components/station-rules-panel.tsx`): el `StationAssignmentRule` de CompScript (`assignStations` en `groups/assign.js`). Cada regla cubre rondas, salas o escenarios y números de grupo (los mismos selectores que los conjuntos, `components/group-scope.tsx`) y ordena las estaciones 1, 2, 3… por posición (psych sheet en primeras rondas, ronda anterior después), número de inscripción, nombre o una propiedad numérica, de menor a mayor o al revés. Las **exclusiones** apartan a un cluster de algunas estaciones (como `NonNAStream` de los nacionales de EE. UU.: estaciones 1–2 del streaming). Sin exclusiones se ordena sin más; con ellas se resuelve un problema de asignación (`javascript-lp-solver`) que llena todas las estaciones posibles y aleja a cada persona lo menos posible de su puesto en el orden (suma de desviaciones al cuadrado). Solo actúan en rondas con estación fija (donde la app ya numera estaciones); vale la primera regla que cubre cada grupo. Sin reglas, todo sigue igual: la estación 1 es para el mejor del grupo.
- **Plantilla CSV de pesos** (Personas → importar hoja): un enlace descarga un CSV con una fila por persona (ID, WCA ID, nombre), las columnas `weight-judge`, `weight-scrambler`, `weight-runner` y `team` y las propiedades existentes con sus valores. Una columna «ID» empareja por número de inscripción, así que al reimportarla también encuentra a los newcomers.

### 6.6. Equipos en vivo y roles WCA (24/10/2026)

Rehecho tras revisar el mapeo con el usuario y los scripts del Nacional 2026 de aasalobrena
([Scripts-Compscript/SpanishChampionship2026](https://github.com/aasalobrena/Scripts-Compscript/tree/main/SpanishChampionship2026), también 2025 y Euro 2026). Guía para recrear esa configuración en la app: [`docs/NACIONAL_2026_EN_LA_WEB.md`](docs/NACIONAL_2026_EN_LA_WEB.md).

- **Roles `staff-*` de la WCA** (`staffRoleFromWcif`, `hasWcaJob` en `lib/people.ts`), como Groupifier: `staff-judge`, `staff-scrambler` y `staff-runner` son staff y van primero para su tarea (con pesos, criterio «Rol WCA de la tarea»); `staff-dataentry` es data entry; `staff-other` y cualquier otro `staff-*` van a la lista nueva **Evitar tareas** (`avoid`: cuentan como rol ocupado, solo trabajan si no hay nadie más). Antes todos eran staff (más tareas). `migrateWcaStaffRoles` mueve una vez a los `staff-other` de borradores antiguos (`PeopleSettings.wcaStaffRoles = 2`).
- **Equipos en vivo** (`lib/pro/teams.ts`, `components/team-setup-panel.tsx`, `ProPeople.teams`): cada valor de la propiedad de equipo tiene tipo (mantener roles, voluntarios = staff, evitar tareas, sin tareas, data entry), sala (primero allí o solo allí), tareas que hace y horas ocupadas. Se lee en cada generación (`withTeams`, `teamUnavailability`, `teamJobExclusions`, `teamLanes`); ya no hay «Aplicar» ni copias en las listas. El tipo del equipo manda sobre staff/evitar/sin tareas/data entry; delegados y organizadores siguen su rol WCA. Personas muestra a esa gente con la etiqueta de su equipo.
- **Sugerencias** como `CanVolunteer` del Nacional 2026: voluntarios y side room trabajan (side room primero en la sala auxiliar), data entry hace data entry, organizador y delegado mantienen roles, y cualquier otro equipo no tiene tareas (también «Aceptado SIN categorizar» y «Otro»).
- **Equipos como clusters**: «Equipo: X» (`team:X`) aparece en conjuntos, reglas de estación, quién hace cada tarea y el filtro de la revisión, salvo que ya exista un cluster guardado con la misma regla.
- **Equipo de sala**: al repartir grupos, sus miembros se alejan de las horas de su sala si se puede sin perjudicar a nadie (`reserved` en `resolveCompetitorOverlaps`), y mientras su sala funciona solo reciben tareas allí (como el script, que asigna la sala auxiliar antes que el resto).
- **Voluntarios** (staff) no reciben la penalización de «solo sus pruebas» ni de newcomers en la puntuación con pesos.
- **Conjuntos**: «solo los mejores N» puede contar por grupo de la ronda entera (`perGroup: "round"`, `NumberPerGroupToPerRound`).
- **Borradores antiguos**: el `teamRoles` de una elección se convierte en `teams`, y la copia que el antiguo «Aplicar» dejaba en Zona (cluster «Equipo: X» como equipo de la sala) se quita (`withoutOldTeamRooms` en `lib/draft.ts`).
- Con el WCIF del Nacional y los conjuntos del script: 108 destacados, todos en Bizkaia; Organizador, AES y Data en Gipuzkoa; Streaming en Araba; los equipos sin tareas, 0 tareas; el equipo Side room pasa de 1 a 15 tareas en la sala auxiliar. Quedan 2 personas con choque real multi/4×4 (ver la guía).

### 6.7. Plantillas PRO (24/10/2026)

- `lib/pro/template.ts`: `exportTemplate`, `parseTemplate`, `applyTemplate`. Formato `wca-easy-groups/pro-template` v1: clusters, conjuntos, reglas de estación, personal por sala, equipos, puntuación, opciones de reglas e impresión y mezcladores/runners por ronda. Salas y escenarios por **nombre** (sin tildes ni mayúsculas), horas ocupadas por **número de día**. Sin datos personales ni horario. Al aplicar, cada sección presente sustituye la actual y se avisa de salas, rondas y días que no existen.
- Plantilla incluida «Campeonato de España 2026» (`lib/pro/templates/spanish-championship-2026.ts`), con los valores de prueba destacados 1 y top 2 por grupo de la ronda.
- Interfaz: Zona → Plantillas (`components/pro-template-panel.tsx`). Comprobado con el WCIF del Nacional: todo se encuentra.

### 6.8. Importador sin copias, empezar de cero y grupos del WCIF (24/10/2026)

- **Incidencia del usuario**: tras importar la hoja, la gente salía dos veces («vol-100… Data entry»). El importador antiguo creaba por defecto un voluntario por cada fila que no emparejaba, sin buscar entre los voluntarios ya creados, y la lista de roles no sabía mostrar el nombre de un voluntario.
- **Importador** (`lib/pro/sheet-import.ts`): cada fila se empareja por WCA ID, luego ID, correo y nombre contra todos (también voluntarios); un nombre compartido no empareja. Lee las cabeceras de CompScript (`identifier:`, `property:`, `ignore:`) y, como ReadSpreadsheet, puede quitar las propiedades importadas a quien no esté en la hoja. Solo crea voluntarios si se marca, y enseña antes cómo empareja cada fila.
- **Reparación** (`findVolunteerCopies`, `mergeVolunteerCopies` en `lib/pro/people.ts`): «Fusionar duplicados» en Personas junta cada voluntario copia de una persona inscrita (mismo WCA ID o nombre único) con ella, con sus propiedades, horas y roles, y quita propiedades de claves que ya no son nadie.
- **Empezar de cero** (junto al nombre de la competición): vuelve a descargar el WCIF si puede y borra el borrador de esa competición en el navegador; PRO sigue activo si lo estaba.
- **Grupos del WCIF** (`lib/wcif-groups.ts`): si el WCIF ya tiene asignaciones de grupo (CompScript, Groupifier…), al abrir la competición por primera vez o al empezar de cero se cargan como propuesta y se abre Revisar. En PRO cada grupo va a la columna de su sala, escenario y hora; si hay escenarios se activa PRO con el horario del WCIF. Lee estaciones y la estrella de Groupifier (`featuredCompetitorWcaUserIds`).

### 6.9. Multi por intentos, resultados de multi y exportar WCIF (24/10/2026)

- **Resultados de multi** (`lib/results.ts`): se decodifica el valor de la WCA (0DDTTTTTMM y el antiguo 1SSAATTTTT): 650343301 = 35/36 57:13.
- **Intentos de multi** (`GroupSlot.attempt`, `linkedTo`): cada intento posterior es una columna propia con el mismo número de grupo. Los competidores se reparten en las columnas del intento 1 (contando las horas de todos los intentos) y luego compiten en todos (`Task.attempt`); cada intento tiene su propio personal. `competingGroups` solo cuenta el intento 1, así que hojas y validación no cambian. Revisar rotula las columnas «G1 A1», «G1 A2»… (grupo e intento); Grupos cuenta grupos del intento 1.
- **Exportar WCIF** (paso Publicar, `lib/wcif-export.ts`, `components/publish-panel.tsx`): descarga el WCIF guardado con la propuesta, sin enviarlo a la WCA. Reutiliza los grupos del WCIF que coinciden en sala, escenario y hora, crea los demás (horas PRO, o la ronda partida en partes iguales sin PRO) y quita los que ya no se usan; escribe asignaciones con estación, destacados de Groupifier, propiedades natshelper y escenarios. Conserva `formatVersion`, `id` y lo demás. Con el Nacional: 112 grupos reutilizados, 4611 asignaciones, ida y vuelta idéntica.

### 6.10. Máximo por escenario, mezcla del multi y mitad de competición (24/10/2026)

- **Máx. por grupo** por sala o escenario (Zona, `LaneStaffing.maxPerGroup`): los grupos de ese escenario tienen como mucho ese número y los demás se reparten el resto (`groupTargets`). Lo respetan el reparto, los conjuntos, el arreglo de solapes y la vista previa; la revisión avisa (`over-group-limit`). Si todos los grupos tienen máximo y la ronda no cabe, el sobrante se reparte en proporción al máximo de cada escenario y sale un único aviso de ronda (`round-over-limit`).
- **Horas ocupadas al repartir competidores**: las indisponibilidades con hora (de una persona o de su equipo) entran en `reserved` con peso 1, así que el arreglo de solapes saca a esa persona del grupo si hay otro libre. «Mientras compite X» no cuenta aquí, porque X aún no tiene grupo.
- **Mezcla del multi** (actividad de Horario `multi-scramble`; se reconoce al importar por el nombre): los mezcladores de cada intento trabajan en la mezcla que acaba justo antes de ese intento, el mismo día (`GroupSlot.scrambleWindow`, `windowsForTask`). Generador y validación usan esa hora.
- **Mitad de competición**: «Actualizar desde la WCA» (barra superior) vuelve a descargar el WCIF sin tocar configuración ni propuesta y activa las rondas que ya tienen competidores. «Generar rondas nuevas» (Grupos) genera solo esas rondas con `fixedAssignments`: las horas, cargas y rachas de lo ya asignado cuentan, y los nuevos competidores evitan los grupos donde ya compiten o trabajan.

### 6.14. Nuevo nombre: Grupitos (25/10/2026)

- La app se llama **Grupitos** y su dominio pasa a ser <https://grupitos.lopezruben.com>. El repositorio es `ruben-lopez-dejuan/grupitos`; GitHub redirige el nombre antiguo.
- **Identificadores internos con el nombre antiguo, a propósito**: se mantienen las claves del navegador (`wca-easy-groups:draft:…`, `wca-easy-groups-theme`, `wca-easy-groups:show-photos`, la cookie `wca-easy-groups-locale` y la base IndexedDB `wca-easy-groups`), el formato de plantillas `wca-easy-groups/pro-template` y las extensiones `wcaEasyGroups.Settings` y `wcaEasyGroups.Draft`. Cambiarlos dejaría sin leer lo ya guardado, lo publicado en la WCA y los archivos descargados.
- **Cambio de dominio**: el navegador guarda los borradores por dominio. Para llevarse el trabajo del dominio antiguo al nuevo hay dos caminos: publicar los ajustes en la WCA, o descargar el WCIF en el dominio antiguo e importarlo en el nuevo. Guía completa en [`docs/RENOMBRAR_A_GRUPITOS.md`](docs/RENOMBRAR_A_GRUPITOS.md).

### 6.13. Publicar en la WCA y ajustes compartidos (24/10/2026)

- **Ruta** `PATCH /api/wca/competitions/[id]` (`wcaPatchWcif` en `lib/wca.ts`): reenvía a la WCA con el token de la sesión. Exige `id` igual al de la URL y `formatVersion`, y rechaza cualquier cuerpo con `events`.
- **Qué se envía** (`buildPatch` en `lib/wca-sync.ts`), siempre construido sobre el WCIF recién descargado:
  - `schedule` con los grupos;
  - `persons` solo con `wcaUserId`, `assignments` y `extensions` (sin `registration`: con `isCompeting: false` la WCA crearía inscripciones; sin `roles`);
  - `extensions` de la competición: todas las que ya tenía más `wcaEasyGroups.Settings`.

  Por qué así, según el código de la WCA (`Competition#set_wcif!`): solo exige `id` y `formatVersion`, pero **sustituye** el horario entero, la lista entera de extensiones de la competición y, por persona, la lista de asignaciones y de extensiones.
- **Extensiones**: la WCA exige `specUrl` (URL) y un id de palabras separadas por puntos (sin guiones). Por eso el borrador de los archivos pasa a `wcaEasyGroups.Draft` (se sigue leyendo el id antiguo), y `specUrlOf` en `lib/wcif-export.ts` pone la URL de natshelper o Groupifier a las que no la tienen.
- **Ajustes en la WCA** (`wcaEasyGroups.Settings`, [`docs/WCIF_EXTENSION.md`](docs/WCIF_EXTENSION.md)): `{ settings, generatedWith }` comprimido (deflate-raw + base64, `CompressionStream`), porque la WCA guarda cada extensión en un `TEXT` de 64 KB. Los del Nacional ocupan 40 KB en JSON y 7 KB comprimidos. Lleva `savedAt` y `savedBy`. Es público.
- **Comprobación**: antes de publicar, `changedRounds` bloquea los grupos si las rondas del horario de la WCA cambiaron desde la importación. Después, `checkPublished` vuelve a leer el WCIF y comprueba asignaciones y ajustes.
- **Al abrir una competición**:
  - sin borrador local y con ajustes en el WCIF guardado, se abren esos ajustes con los grupos del WCIF;
  - con borrador, si la WCA tiene ajustes más nuevos que `Draft.remoteSavedAt` (en el WCIF guardado o en uno descargado en segundo plano al abrir), sale un aviso con «Cargar los de la WCA».

  «Actualizar desde la WCA» hace la misma comprobación.
- **Demo**: `offline`, sin publicar ni descarga en segundo plano.
- **Voluntarios con cuenta WCA** (`ProVolunteer.wcaUserId`, `components/wca-account-link.tsx`, ruta `GET /api/wca/users?q=` sobre `/api/v0/search/users`, que también devuelve cuentas sin WCA ID):
  - **Exportar:** si el WCIF ya tiene a esa cuenta, se usa esa persona. Si no, y tiene tareas, se añade una persona nueva que no compite.
  - **Publicar:** solo a las personas nuevas se les manda `registration: { isCompeting: false }`, y la WCA crea la inscripción de staff (`update_persons_wcif!`).
  - **Volver a cargar:** `groupsFromWcif(…, aliases)` devuelve sus tareas al voluntario (`linkedVolunteers`). Esas inscripciones no llevan rol, así que `nonCompetingStaff` no las cuenta dos veces.
- **Comprobado** en la demo con una WCA simulada en el navegador: publicar, comprobar, y cargar ajustes más nuevos de «otra persona». **Falta probarlo contra la WCA de verdad**: lo hará el usuario con una competición suya.

### 6.12. Seguir en otro dispositivo (24/10/2026)

- **Exportar** (`components/publish-panel.tsx`): el WCIF descargado lleva el borrador entero (`Draft`: configuración, PRO, propuesta con cambios a mano y `generatedWith`) en la extensión de competición `wca-easy-groups.Draft`, con `savedAt` (`withDraft` en `lib/wcif-session.ts`). El botón ya no exige propuesta: sirve también para llevarse solo la configuración.
- **Importar** (`components/resume-from-file.tsx`, «Importar WCIF exportado»):
  - en el paso Zona: comprueba que el archivo es de esa competición, pide confirmación, guarda el WCIF del archivo en IndexedDB y el borrador en `localStorage`, y abre Revisar si hay propuesta;
  - en la lista de competiciones: lo mismo, y abre la competición aunque no estuviera en ese navegador.

  Sin la extensión (un WCIF de CompScript o Groupifier), se cargan sus grupos como propuesta, como al abrir una competición por primera vez. La carga es la misma función que al abrir la competición (`openCompetition` en `group-workspace.tsx`).
- **Cuidado con el PATCH**: la extensión lleva datos personales. Antes de publicar en la WCA hay que quitarla con `withoutDraft`.

### 6.11. Inicio, móvil, icono y README (24/10/2026)

- **Página de inicio** (`app/page.tsx`, textos `landing` en es/en): qué hace la app en modo básico y PRO, sin adornos.
- **Móvil**: bloque `@media (max-width:700px)` al final de `app/pro.css`. Hace tres cosas:
  - la barra superior se parte en dos líneas;
  - las tablas de rondas y de personal pasan a tarjetas, con la etiqueta en `data-label` y `::before`;
  - los controles de Revisar se ajustan al ancho.

  Al tocar el área de trabajo hay que comprobar que a 375 px `document.documentElement.scrollWidth` es 375.
- **Icono**: `app/icon.svg` y `app/apple-icon.png`. `components/app-mark.tsx` lo dibuja en la marca. Si se cambia el dibujo, hay que cambiarlo en los tres sitios.
- **Logo de la WCA** (`public/wca-logo.svg`): es el `WCA Logo.svg` oficial del repositorio de la WCA, sin los metadatos de Inkscape. Se descargó con permiso del usuario y está anotado en `THIRD_PARTY_NOTICES.md`. Va en el panel de entrar y en el botón; en el botón va sobre un círculo blanco porque el arco azul se pierde en el azul del botón.
- **README**: describe todas las funciones. Hay que actualizarlo cuando se añada algo visible.

### 6.4. Datos de referencia: WCIF del Campeonato de España 2026

Archivo local del usuario (**no commitear: tiene datos personales**). Estructura:

- Recinto «Lasesarre», `Europe/Madrid`, 5–7 de diciembre de 2026. Horas del WCIF en UTC.
- Sala «Pabellón» con los escenarios Araba, Bizkaia y Gipuzkoa (primeras rondas en los tres; varias rondas siguientes solo en Bizkaia y Gipuzkoa; `333-r4` con 16 grupos) y sala «Sala Auxiliar» sin escenarios (444bf, 555bf, multi en dos intentos y dos entregas de cubos). El multi del sábado (15:15–16:25 en hora local) coincide con 5×5 y Megaminx: con el reparto actual, quienes hacen multi y 5×5 quedan en los grupos de 5×5 que solo se solapan 7 minutos, y en Megaminx en los grupos que no se solapan.
- 300 personas aceptadas; 12 delegados, 11 organizadores y 7 data entry; 66 con propiedades natshelper (`team`, `weight-judge`, `weight-runner`, `weight-scrambler`, `delegate-cluster`).
- Extensiones de competición `groupifier.CompetitionConfig` (opciones de impresión, aún no se leen) y `finaltags.competition`.

## 7. Siguientes fases

1. **Fase 4, reparto avanzado en grupos:** hechos los conjuntos ordenados, los destacados y las reglas de estación (6.5). Queda, si se quiere, añadir scorers por grupo (nombres parecidos, mismo país, «ha competido hace poco») y escribir la estrella en el WCIF al publicar.
2. **Fase 5, equipos:** rotación día × escenario y equipos equilibrados automáticamente.
3. **Fase 6, publicación e informes:**
   - **WCIF v2**: la importación ya pide `GET /api/v0/competitions/{id}/wcif/version/2` (formato 2.2; con el token del organizador devuelve el WCIF privado). Para publicar, `PATCH /api/v0/competitions/{id}/wcif` y **hay que mandar siempre `formatVersion` e `id`** (recomendación de la WCA que trasladó el usuario).
   - Escribir actividades y `assignments` en el WCIF, conservando las extensiones desconocidas. *Hecho: descarga (6.9) y PATCH (6.13).*
   - Escribir las extensiones natshelper de sala y grupo, con el número de grupo compartido en `-g{n}`.
   - Mostrar el diff, pedir confirmación explícita, hacer el PATCH y volver a leer el WCIF para comprobarlo. *Hecho (6.13).*
   - Informes.

Pendientes conocidos:

- Leer `groupifier.CompetitionConfig` para rellenar las opciones de impresión.

## 8. Cómo comprobar el trabajo

- `npm run typecheck` y `npm test` siempre. `npm run build` antes de hacer push.
- Comprobación visual en `/demo?size=large` y `/demo?size=small`, en tema claro y oscuro, a unos 1280 px y en móvil. Hay que confirmar que no hay desplazamiento horizontal de la página, que no hay textos cortados y que las cabeceras están alineadas con sus columnas.
- Para probar con datos reales, importar una competición desde el dashboard con la cuenta WCA del usuario. Para el WCIF del Nacional, cargarlo en IndexedDB solo en local y no subirlo nunca al repositorio.
