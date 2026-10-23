# Modo PRO — diseño

Estado (23/10/2026): fases 1, 2 y 3 hechas. El detalle del estado y el relevo están en [`HANDOFF.md`](../HANDOFF.md).

## Objetivo

Un modo que se activa por competición (nacionales, campeonatos grandes, opens con varias salas) y que permite hacer **todo lo que hoy se hace con CompScript**, pero con formularios, listas y constructores visuales en lugar de un lenguaje de programación. El modo normal sigue igual para opens pequeños.

Fuentes analizadas:

- CompScript (`cubingusa/compscript`, licencia MIT): catálogo completo de funciones y su motor.
- Scripts del Nacional de CubingUSA 2026 (`cubingusa/nats-scripts`).
- Scripts del Amore Open 2026 (`ruben-lopez-dejuan/AmoreOpen2026_scripts`): la referencia principal de lo que necesitas de verdad.

## Qué se usa de verdad

| Necesidad | En CompScript (tus scripts / NATS) | En Easy Groups PRO |
| --- | --- | --- |
| Salas y escenarios con colores | `CreateRoom` (sala WCIF), `CreateStage` (escenario dentro de una sala, extensión natshelper), `DeleteRooms` | Pestaña **Horario**: salas y sus escenarios con color, importados del WCIF y editables |
| Grupos con horas reales por escenario | `CreateGroups(_444-r1, 4, …)` en cada escenario | Línea de tiempo por día; cada ronda se reparte en N grupos por escenario dentro de su franja |
| Actividades sin grupos | `CreateMiscActivity` (check-in, comida, tutorial, entrega de multi) | Actividades varias en la línea de tiempo |
| Etiquetas y propiedades de personas | `SetProperty(…, "SideJuez", …)`, `AddRole`, `StringProperty`, `BooleanProperty` | Columnas editables en la tabla de **Personas** |
| Voluntarios que no compiten | `AddPerson(id)` | «Añadir voluntario» por WCA ID o a mano |
| Importar formulario de voluntarios | `ReadSpreadsheet` + reglas de mapeo (equipo, asistencia, % de preferencia) | Importación de CSV (exportado de Google Forms) con mapeo de columnas a etiquetas, preferencias e indisponibilidades |
| Indisponibilidades | `UnavailableBetween(inicio, fin)`; `DuringTimes(CompetingTimes(otra persona))` (padres que acompañan) | Franjas por persona y regla «no disponible cuando compite X» |
| Filtros reutilizables | `Define("EligibleVolunteer", And(Registered(), Not(HasRole(…)), …))` | **Segmentos**: constructor visual de filtros con recuento en vivo |
| Quién puede mezclar | `CanScramble`: PB por debajo de un límite por prueba, con correspondencia de pruebas (BLD y OH → 3×3) | Tabla de límites por prueba + correspondencias, usable como condición |
| Reparto de grupos por conjuntos | `AssignmentSet` en orden: top N → escenario Rojo y destacados; organizadores y delegados → Rojo; los de 4BLD → grupos 3–4 de 2×2 para no solapar | Lista ordenada de **conjuntos** por ronda (o plantilla para todas): segmento → escenarios y grupos permitidos |
| Estaciones | `StationAssignmentRule` ascendente por psych sheet o por posición en la ronda anterior; `StationExclusionRule` (stream) | Reglas de estación por ronda |
| Trabajos por ronda y escenario | `Job("judge", 20, eligibility=…)`, scramblers, runners, delegados, checkers | Tabla **Personal**: por ronda × escenario, cantidad y segmento elegible de cada trabajo |
| Preferencias ponderadas | `JobCountScorer`, `PriorAssignmentScorer`, `SameJobScorer`, `ConsecutiveJobScorer`, `FollowingGroupScorer`, `PersonPropertyScorer`, `ConditionalScorer`, `PreferenceScorer`, `SolvingSpeedScorer`, `MismatchedStationScorer` | **Puntuación**: cada criterio con su explicación y un peso con deslizador; perfiles guardados («Nacional», «Open») |
| Equipos de voluntarios | `staff-team` + rotación de escenario por día (`AssignedStageForTeam`) | Pestaña **Equipos**: equipos y tabla de rotación día × escenario |
| Equipos equilibrados automáticos | `Cluster` con `BalanceConstraint` / `LimitConstraint` | «Crear equipos equilibrados» eligiendo qué equilibrar y qué limitar |
| Asignaciones manuales y tareas especiales | `ManuallyAssign`, `CreateCompetitionGroupsAssignments` (mezclar multi) | Fijar celdas (se respetan al regenerar) y tareas con horario propio |
| Stream y destacados | `featured=true`, `AddFeaturedCompetitors` | Casilla «destacado» en conjuntos y personas |
| Informes | `Table`, carga de voluntarios, asignaciones por día | Informes de carga, horario por persona y por escenario, exportables |
| Publicar | `ExportWCIF` / escritura en la WCA | Publicación al WCIF (compartida con el modo normal) |

## Salas y escenarios

Son dos niveles distintos (como en el WCIF del Campeonato de España 2026):

- **Sala**: `schedule.venues[].rooms[]` del WCIF. Espacio físico; cada ronda tiene una actividad por sala.
- **Escenario**: subdivisión de una sala, en la extensión `org.cubingusa.natshelper.v1.Room` (`data.stages: [{ id, name, color, groupNamePrefix? }]`, ids únicos en la competición). Por ejemplo, la sala «Pabellón» tiene los escenarios Araba, Bizkaia y Gipuzkoa, y la «Sala Auxiliar» no tiene escenarios.
- **Grupo**: `childActivity` de la actividad de la ronda en la sala. Si pertenece a un escenario, lleva la extensión `org.cubingusa.natshelper.v1.Group` con `{ stageId }`; el `activityCode` (`333-r1-g1`) se repite en cada escenario y el nombre es «<Ronda> <Escenario> <n>».
- Una sala sin escenarios se comporta como un único escenario implícito.

El detalle de la estructura real y del cambio de modelo pendiente está en `HANDOFF.md`, secciones 6.2 y 6.3.

## Principios

1. **Todo lo de tus scripts, sin escribir código.** Los `Define` pasan a ser segmentos con nombre; los scripts por día pasan a ser una receta por pasos; los pesos, deslizadores con presets.
2. **Explicable.** Para cada asignación, «¿por qué esta persona?»: qué reglas cumplió y cuánto sumó cada criterio de puntuación.
3. **Reutilizable.** Plantillas exportables (JSON) entre competiciones: tu configuración del Amore se convierte en una plantilla.
4. **Determinista y reversible.** Mismos datos dan el mismo resultado; deshacer y fijar celdas también en PRO.
5. **El modo normal no cambia.** PRO es un interruptor por competición.

## Arquitectura

- **Modelo `ProConfig`** (TypeScript, guardado con el borrador): escenarios, grupos con horario, actividades varias, etiquetas y propiedades por persona, voluntarios extra, indisponibilidades, equipos y rotaciones, segmentos, conjuntos de reparto por ronda, reglas de estación, trabajos por ronda × escenario, perfil de puntuación y celdas fijadas.
- **Condiciones** como árbol JSON (Y / O / NO + predicados: rol, etiqueta, propiedad = valor, edad, compite en prueba, PB < límite, puesto en psych sheet ≤ N, posición en la ronda anterior ≤ N, newcomer, país, equipo, ya tiene tarea en…). Se evalúan con funciones puras y se pueden testear.
- **Motor** con programación lineal entera (`javascript-lp-solver`, MIT, el mismo de CompScript), grupo a grupo:
  - Restricciones duras: elegibilidad, disponibilidad con horas reales (solapes entre escenarios incluidos), una tarea por persona y grupo, cantidades por trabajo.
  - Objetivo: la suma de los criterios de puntuación con sus pesos.
  - Grupos: los conjuntos se aplican en orden y cada uno se reparte de forma equilibrada entre sus grupos permitidos.
- **Validación con horario real:** solapes entre escenarios, descansos mínimos, indisponibilidades incumplidas.

## Interfaz

Al activar PRO aparecen estas pestañas:

1. **Horario**: escenarios con color; línea de tiempo por día; cada ronda en N grupos por escenario dentro de su franja; actividades varias.
2. **Personas**: tabla con filtros, etiquetas y propiedades editables, importación de CSV con mapeo de columnas, voluntarios no competidores e indisponibilidades.
3. **Segmentos**: constructor visual de filtros con recuento en vivo y la lista de quién entra.
4. **Equipos**: manuales o automáticos equilibrados, con rotación día × escenario.
5. **Reparto de grupos**: lista ordenada de conjuntos por ronda, reglas de estación y destacados.
6. **Personal**: trabajos por ronda × escenario y perfil de puntuación.
7. **Ejecutar y revisar**: ejecutar todo o una ronda, matriz por escenario, «¿por qué?» e informes.

## Fases

Cada fase deja algo usable.

1. **Horario y escenarios.** Base de todo lo demás: sin horas no hay indisponibilidades ni solapes. *Hecha (22/10/2026):*
   - Interruptor PRO por competición en la barra superior; la configuración se conserva al desactivarlo.
   - Pestaña Horario: escenarios importados de las salas del WCIF, con nombre y color editables; línea de tiempo por día; bloques de ronda divididos en grupos iguales (como `CreateGroups`); actividades sin grupos; copiar un bloque a los demás escenarios; reimportar del WCIF.
   - Los grupos de cada ronda salen del horario (G1…Gn por hora y escenario); la matriz muestra escenario y hora de cada grupo.
   - El generador no da a nadie una tarea mientras compite o trabaja en otro grupo a la misma hora, también entre rondas y escenarios.
   - Validación: error «a la vez» por persona; avisos del horario (rondas sin horario, bloques que coinciden en un escenario, rondas que empiezan antes de acabar la anterior).
   - Salas con escenarios dentro, ventanas exactas de los grupos importados y edición arrastrando (Codex, 22/10/2026).
   - 23/10/2026: los grupos paralelos comparten número; el total de grupos se fija por ronda y se reparte entre los bloques; multi-blind por intentos y entrega de cubos; impresión por escenario.
   - Pendiente para fases siguientes: estaciones por escenario, nombres de escenario en las hojas de tiempos y publicación del horario al WCIF.
2. **Personas y segmentos.** Etiquetas, importación de CSV, voluntarios extra, indisponibilidades y constructor de filtros. *Hecha (23/10/2026):* propiedades (con las de natshelper), voluntarios, indisponibilidades (franja o «mientras compite X»), importación de Google Sheets (cuenta de servicio, pendiente de crear) o CSV, segmentos con constructor visual y plantillas, filtro por segmento en la revisión.
3. **Motor de personal.** Trabajos por escenario, elegibilidad, puntuación con pesos y «¿por qué?». *Hecha (23/10/2026):* elegibilidad por segmento y por prueba (límites de marca por prueba con correspondencias, como `CanScramble`), personal predeterminado por sala y escenario, puntuación con pesos y perfiles e ILP por grupo, «¿por qué esta persona?» con la puntuación desglosada y solapes cortos encadenados.
4. **Reparto de grupos avanzado.** Conjuntos ordenados, estaciones y destacados. *Conjuntos y destacados hechos (23/10/2026):* lista ordenada en Reglas con cluster y/o «los mejores N» (por grupo o por ronda), rondas, salas o escenarios, números de grupo y estrella en la hoja de tiempos; el resto sigue la regla de orden. Pendiente: reglas de estación.
5. **Equipos.** Rotación por día y equipos equilibrados automáticos.
6. **Publicación e informes.** Escribir en el WCIF (también para el modo normal) e informes exportables.

## Decisiones tomadas (22/10/2026)

1. **Horario**: se importa del WCIF (salas, escenarios de la extensión natshelper y grupos de cada ronda) y se edita en la app: crear o borrar salas y escenarios dentro de cada sala, repartir cada ronda en grupos con horas y añadir actividades varias.
2. **Voluntarios**: lectura directa de Google Sheets, como `ReadSpreadsheet`. Requiere una cuenta de servicio de Google configurada en el servidor (variable de entorno en Vercel); para cada competición, la hoja se comparte con el correo de esa cuenta. La lectura se hace en el servidor y la hoja nunca se publica.
3. **Editor**: solo visual, con plantillas exportables (JSON).
4. **Publicación al WCIF**: al final del modo PRO; hasta entonces se publica con otra herramienta.

## Licencias

CompScript es MIT: se puede reutilizar su enfoque y partes de su código citándolo en `THIRD_PARTY_NOTICES.md`, como ya se hace con Groupifier.
