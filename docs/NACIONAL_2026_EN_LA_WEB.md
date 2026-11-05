# Campeonato de España 2026 en la web

Cómo recrear en Grupitos la configuración de los scripts de CompScript del Nacional
([aasalobrena/Scripts-Compscript, `SpanishChampionship2026`](https://github.com/aasalobrena/Scripts-Compscript/tree/main/SpanishChampionship2026)).
Está escrita para el estado del repo a 03/11/2026 (commit `9d6e98a`): preparación (`0_precomp`), biblioteca
(`lib`) y un primer script del sábado (`1_saturday/0_after_333bf-r1.cs`), que aún no se puede ejecutar. Faltan las
rondas siguientes del domingo y el lunes.

**Decisiones de la organización (05/11/2026), que mandan sobre el script:**

- 14 estaciones por escenario y 16 jueces por grupo (2 de reserva).
- Como máximo 21 por grupo en Bizkaia (1,5 por estación) y 28 en Araba y Gipuzkoa (2 por estación). Pyraminx tiene 22 en el script; aquí, 21. 3BLD r2 tiene 25 en Bizkaia; aquí, 21.
- Quien hace puzles individual no compite en Square-1, 6x6 ni 3BLD. El script lo mandaba a Square-1 grupo 1. La revisión avisa si sigue inscrito, y hay que quitarlo de esas pruebas en la WCA.
- La final secundaria va en Gipuzkoa, a la derecha, como en el script.
- Prepara la sala auxiliar el equipo Side room, con su delegado. Queda por decidir si hace falta montaje el sábado: el script solo lo tiene el domingo.
- Solo los delegados tienen equipo fijo por escenario.

Todo se hace con el **modo PRO** activado (interruptor arriba a la derecha). La configuración se
guarda en tu navegador, por competición.

## Atajo: la plantilla de un clic

En **Zona → Plantillas** elige «Campeonato de España 2026» y pulsa **Aplicar**. Hace los pasos 2 a
8 de esta guía de una vez (`lib/pro/templates/spanish-championship-2026.ts`) y avisa de las salas,
rondas o días que no encuentre. Después solo queda:

- Importar de la hoja las propiedades `team`, `weight-*`, `delegate-cluster`, `delegate-cluster-extra` y `puzzles` (por ejemplo «individual, parejas»).
- Revisar en **Horario** la hora de los puzles individual: la WCA dice 11:00 y el script 11:30. La plantilla usa las 11:00.
- Mirar los avisos de la revisión: con 14 estaciones y estos máximos, Pyraminx y 3x3 no caben (244 y 311 inscritos para 231 y 308 plazas, a 05/11).
- Marcar los delegados de turno y, si lo queréis, activar «Delegado de turno».

Con **Exportar JSON** guardas tu versión ajustada y con **Importar JSON…** la cargas en otro
navegador o en otra competición (las salas se buscan por nombre; los datos personales no van en
el archivo).

El resto de la guía explica qué hace cada parte, por si quieres hacerlo a mano o cambiar algo.

## 0. Importar

1. Dashboard → importar la competición (el WCIF trae salas, escenarios y grupos de natshelper).
2. En la competición, activa **PRO**.
3. Si el formulario de voluntarios ha cambiado desde que se subió al WCIF
   (`1_import_spreadsheet.cs`: hoja `compscript`), en **Personas → Importar de hoja de cálculo**
   lee la hoja (o expórtala a CSV y súbela). Empareja por WCA ID y marca como propiedades `team`,
   `weight-judge`, `weight-runner`, `weight-scrambler` y `delegate-cluster`.

## 1. Horario (`2_remove_schedule.cs`, `3_build_schedule.cs`)

Viene del WCIF: sala Pabellón con Araba, Bizkaia y Gipuzkoa, y Sala Auxiliar sin escenarios.
Comprueba en **Horario** que cada ronda tiene los grupos del script (por ejemplo clock 3 por
escenario, 333-r4 con 7 en Gipuzkoa y 6 en Bizkaia) y que el multi tiene sus dos intentos.
Nada más que hacer.

## 2. Equipos (`_constants.cs`, `_volunteers.cs`: `InTeam`, `Volunteers`)

**Personas → Equipos**, propiedad `team`. Las sugerencias ya siguen `CanVolunteer`; comprueba que
queda así:

| Equipo | Tipo | Sala | Notas |
| --- | --- | --- | --- |
| Voluntario normal | Voluntarios (staff) | Cualquier sala | `STAGE_TEAM` |
| Side room | Voluntarios (staff) | Primero en Sala Auxiliar (sin «solo allí») | `SIDE_TEAM`: también trabaja en los escenarios |
| Data entry | Data entry | | `AddRole(Team([DATA_TEAM]), DATA_ROLE)` |
| Organizador, Delegado | Mantener roles | | siguen su rol de la WCA |
| Streaming, Registro / Stand AES, Control de Accesos, Médico | Sin tareas | | no están en `CanVolunteer` |
| Otro | Sin tareas | | igual que el script: tener equipo y no ser voluntario = no trabaja |
| Aceptado SIN categorizar | Mantener roles | | no está en `AllTeams`: trabaja como quien no tiene equipo |

**Horas ocupadas por cluster** (pestaña **Clusters**; `5_manual_assignments.cs` y `_unavailabilities.cs`). Quien está en el
cluster no recibe tareas y, si puede, compite en otro grupo:

| Cluster | Día | Horas | Motivo |
| --- | --- | --- | --- |
| Equipo de sala auxiliar (Side room y `delegate-cluster` 1) | Sábado 5 | 11:40–12:35 | mezcla del multi |
| Equipo de sala auxiliar | Domingo 6 | 08:45–09:50 | montaje y mezcla del multi |
| Equipo de sala auxiliar | Domingo 6 | 12:15–12:25 | montaje |
| Puzles: individual | Sábado 5 | 11:00–13:30 | |
| Puzles: parejas | Sábado 5 | 16:30–18:30 | |

La mezcla del sábado ocupa toda la prueba de 6x6: quien esté en el equipo y compita en 6x6 sale como aviso en la revisión.

## 3. Clusters (para los delegados por turnos)

**Clusters → Nuevo**, uno por grupo de `delegate-cluster` (`InDelegateCluster`):

- «Delegados 1 y 2»: *alguna* de las condiciones `delegate-cluster` es `1`, `delegate-cluster` es `2`.
- «Delegados 3»: `delegate-cluster` es `3`.
- «Delegados 4»: `delegate-cluster` es `4`.
- «Delegados 5» y «Delegados 6»: `delegate-cluster-extra` es `5` o `6`, para las primeras rondas en dos escenarios (7x7 y 3BLD).

Los equipos no hace falta crearlos como clusters: aparecen solos como «Equipo: …» en todas las
listas de clusters.

## 4. Reglas → Orden de asignación de grupos (`_assignment_sets.cs`: `FirstRoundAssignmentSets`)

Añade los conjuntos en este orden (todos con **Rondas: Primeras rondas** salvo los de delegados):

| # | Conjunto del script | Quién | Solo los mejores | Dónde | ★ |
| --- | --- | --- | --- | --- | --- |
| 1–3 | Puzles parejas (Megaminx) | Puzles: parejas | top y resto | Grupo 1: Bizkaia si son top; si no, Araba y Gipuzkoa | los 5 primeros |
| 4 | `mbf` (Pyraminx) | Equipo de sala auxiliar | | Araba, grupo 3 | |
| 5–28 | `TopSideSet` y `SideSet` | Inscritos en la prueba de sala auxiliar, o su equipo | top y resto | Los grupos compatibles (abajo): Bizkaia si son top; si no, Araba y Gipuzkoa | los 5 primeros |
| 29 | `TopSet` | Cualquiera | 5 **por grupo de Bizkaia** | Bizkaia | sí |
| 30 | `TopSet` | Cualquiera | Top **por grupo de Bizkaia**, por prueba | Bizkaia | no |
| 31 | `CORE_SET` | Equipo: Organizador | | Gipuzkoa | |
| 32–… | `DelegatesSet` | ver tabla de abajo | | | |
| | `AES_SET` | Equipo: Registro / Stand AES | | Gipuzkoa | |
| | `DATA_SET` | Equipo: Data entry | | Gipuzkoa | |
| | `StreamingSet` | Equipo: Streaming | | Araba; sin Araba, Gipuzkoa | |
| | `EveryoneSet` | Cualquiera | | Araba y Gipuzkoa, hasta su máximo | |

Top por grupo de Bizkaia (`6_assign_main.cs`): reloj 18, 7x7 18, Square-1 15, 6x6 14, 3BLD 18, 5x5 20, Megaminx 19, Pyraminx 21 (22 en el script), 4x4 16, 2x2 19, Skewb 20, 3x3 21, OH 19.

Grupos compatibles con la sala auxiliar:

| Ronda | Sala auxiliar | Grupos |
| --- | --- | --- |
| Reloj | 4BLD | 1 |
| 7x7 | 4BLD | 2 |
| 5x5 | Multi | 1 |
| Megaminx | Multi | 2 |
| 4x4 | Multi | 1 y 2 |
| 2x2 | Multi | 3 y 4 |
| Skewb | 5BLD | 1 y 2 |
| 3x3 | 5BLD | 4 |

Los conjuntos de top y resto pueden pasar del reparto par de la ronda, hasta el máximo del escenario, para que los asientos libres de Bizkaia no se llenen con los últimos de la ronda. Dentro de un conjunto, cada persona va al grupo más vacío, así que el top de Bizkaia queda igualado aunque los de la sala auxiliar se concentren en unos grupos.

**Delegados** (`DelegateStage`): con «Rondas: Elegir rondas», un conjunto por día y grupo de
delegados. Primeras rondas del sábado 5: clock, Square-1, 6×6, 5×5 y Megaminx.
Del domingo 6: Pyraminx, 4×4, 2×2, Skewb, 3×3 y OH.

| Día | Delegados 1 y 2 | Delegados 3 | Delegados 4 |
| --- | --- | --- | --- |
| Sábado 5 | Bizkaia | Gipuzkoa | Araba |
| Domingo 6 | Gipuzkoa | Araba | Bizkaia |

En 7x7 y 3BLD, sin Araba, van por `delegate-cluster-extra`: 5 a Bizkaia y 6 a Gipuzkoa.

## 4 bis. Rondas siguientes

### Según los scripts de 2026

Los scripts de rondas siguientes de 2026 están a medias: a 05/11/2026 solo existe
`1_saturday/0_after_333bf-r1.cs`. Lo que ya definen va en la plantilla, antes que todo lo demás.
`SecondRoundAssignGroups`, definido en el script pero sin usar, no está recogido: pone 25 en Bizkaia.

| Conjunto | Rondas | Quién | Dónde |
| --- | --- | --- | --- |
| Finales 2026: Bizkaia | Reloj, 7x7, Square-1 y 6x6 r2 | top 14, contando primero a los españoles; **Plazas:** hasta el máximo del escenario | Bizkaia |
| Finales 2026: Gipuzkoa | Las mismas | el resto | Gipuzkoa |
| 3BLD ronda 2: Bizkaia | 3BLD r2 | top 21, sin destacados (25 en el script; 21 es el máximo de Bizkaia) | Bizkaia |
| 3BLD ronda 2: Gipuzkoa | 3BLD r2 | el resto | Gipuzkoa |

Con 20 finalistas quedan 14 y 6, no 10 y 10; por eso la opción **Plazas**. En Bizkaia, una regla de
estación por posición, primero los españoles y **desde el centro**: con 2 filas de 4 mesas de 2 y 14
estaciones da exactamente el `SeedToStation` del script (filas de 8 y 6). En Gipuzkoa, por posición,
primero los españoles. Las estaciones solo se aplican con la zona en puestos fijos o mixto.

Personal por ronda: 3BLD r2 con 4 mezcladores y 3 runners; esas finales con 3 y 3. Diferencias con
`FinalAssignStaff`, porque la app no lo permite o el script no lo define:

- Gipuzkoa lleva 3 mezcladores y no 2, porque una ronda tiene un número para todos sus escenarios.
- No hay checkers (`CheckerJob`, 2 en Bizkaia y 1 en Gipuzkoa): no es una tarea de la app.
- Los jueces salen de las estaciones y la reserva del escenario (el script pide 15 en Bizkaia y aún no da número para Gipuzkoa).
- Los delegados por escenario (3 y 2 en finales) no se configuran por ronda.

### Provisional, copiado de 2025

El resto de rondas siguientes aún no tiene script de 2026, así que la plantilla copia los de 2025
(`Scripts-Compscript/SpanishChampionship2025`) con los escenarios de 2026. Van antes que los de
primeras rondas, cada uno con sus rondas, así que no se pisan. «Finales» son aquí las que no están
arriba (5x5, Megaminx y las del domingo y el lunes):

| Conjunto | Rondas | Quién | Dónde |
| --- | --- | --- | --- |
| Final 3x3: impares / pares | 333-r4 | top 12, contando primero a los españoles, impares / pares, por ranking | Bizkaia / Gipuzkoa, grupos 2 a 7 (cara a cara, el mejor en el 7) |
| Final 3x3: grupo 1 | 333-r4 | el resto | grupo 1 (Gipuzkoa) |
| Semifinal 3x3 | 333-r3 | top 22 / top 28 / el resto; cada escenario se llena hasta el reparto par (con 42: 14 en cada uno) | Bizkaia / Gipuzkoa / Araba |
| Finales: impares / pares | Finales | impares / pares, contando primero a los españoles | Bizkaia / Gipuzkoa |
| Destacados (rondas siguientes) | Rondas siguientes sin finales | top 4 por grupo, destacados | Bizkaia |
| Delegados | Pyraminx r2 (domingo); 3x3 r2, 4x4 r2, 2x2 r2, OH r2 y Skewb r2 (lunes) | por grupo de delegados | lunes: 1 y 2 Araba, 3 Bizkaia, 4 Gipuzkoa |
| Resto (rondas siguientes) | Rondas siguientes sin finales | el resto | cualquier escenario |

Y una regla de estación para las finales: por posición, de menor a mayor, primero los españoles
(`FinalsStations`). En 2025 la final de 3x3 tenía 8 pares (top 16, grupos 2 a 9); en el horario de
2026 hay 6 grupos a la vez, así que son 12, y los 4 restantes van al grupo 1, que dura 20 minutos.
Las posiciones son las de la ronda anterior. Revisa estos números cuando estén los scripts de 2026.

Si en la WCA se enlazan rondas como duales (por ejemplo 3x3 r1 y r2), la r2 cuenta como primera
ronda: le aplican los conjuntos de primeras rondas y no los de «Rondas siguientes», y se genera desde
el principio. La r3 clasifica por el mejor resultado de las dos. Ahora mismo el WCIF no tiene
ninguna ronda dual.

Las rondas de la sala auxiliar (4BLD, 5BLD, multi) no tienen grupos en esos escenarios, así que
esos conjuntos no se aplican allí y todo el mundo va a su único grupo, como
`AssignGroups(…, [EveryoneSet()])` en `4_assign_side.cs`.

## 5. Reglas → Reglas de estación (`4_assign_side.cs`: `SideStations`)

`StationAssignmentRule(true, "ascending", PsychSheetPosition)` es lo que la app hace sin reglas
(estación 1 para el mejor). Si quieres dejarlo explícito: una regla con **Rondas: Elegir** 4BLD,
5BLD y multi, **Dónde: Sala auxiliar**, «posición, de menor a mayor».

## 6. Reglas → tareas

- Activa **Tareas solo en sus pruebas** y **Evitar tareas a newcomers**: es la parte de
  `CanVolunteer` para quien no tiene equipo (compite en la prueba y tiene WCA ID). Los voluntarios
  quedan exentos.
- **Delegado de turno**: actívalo si queréis `DelegateJob(1)`; en Personas marca como delegados de
  turno a los que tienen `delegate-cluster` > 0 (`CanDelegate`).
- **Quién puede hacer cada tarea**: Cualquiera (en el script `CanJudge`, `CanRun` y `CanScramble`
  son de relleno).
- **Puntuación con pesos**: los scorers del script aún son de relleno; deja la puntuación apagada
  o usa el perfil «Amore Open 2026», que es el de 2025.

## 7. Zona → personal por escenario (`4_assign_side.cs`: `AssignStaff`)

En la tabla de personal por sala y escenario: los tres escenarios tienen **14 estaciones, 16 jueces, 4 mezcladores y 3 runners**, con **28 por grupo como
máximo** en Araba y Gipuzkoa y **21** en Bizkaia. Las finales llevan 3 mezcladores y 3 runners. Sala Auxiliar: **20 estaciones, 2 mezcladores,
2 runners** (`JudgeJob(20), RunnerJob(2), ScramblerJob(2)`). Para el multi el script pide 10 jueces
y ni mezcladores ni runners: en **Grupos**, ronda 333mbf, pon 0 mezcladores y 0 runners.

## 8. Hojas de tiempos (`0_groupifier_config.cs`)

A4, orden **Apilado**, **Portada por grupo** y hoja de mezclas para **Los mejores** y **Finales**.

## Lo que todavía no es igual

- **Jueces del multi**: las estaciones son por sala, no por ronda, así que el multi pide un juez
  por competidor hasta 20, no 10.
- **Checkers, delegados por escenario en finales y mezcladores distintos por escenario en finales** (3 en Bizkaia y 2 en Gipuzkoa): la app no los tiene. Gipuzkoa lleva 3.
- **Data entry**: el script pide 3 personas por tanda (2 en la sala y 1 en Bizkaia); la app, una por franja.
- **Delegado de turno por escenario**: el script da preferencia al escenario del cluster; la app reparte sin mirar el escenario.
- **Casos de una sola persona** (dos personas con grupo u horas propios en el script): no van en la plantilla, para no guardar datos personales. Se ponen a mano.
- **Límites de mezcla**: la plantilla mantiene los que preparó la organización (7x7 5:00, 5x5 1:40…), que no coinciden con los del script (7x7 4:30, 5x5 1:30…).
- **Quién trabaja en la sala auxiliar**: el script solo usa Voluntario normal, Side room y
  `delegate-cluster` 1. Aquí Side room va primero y luego entra cualquiera que pueda, y el delegado
  de turno de la sala auxiliar no se limita al cluster 1.
- **Montaje y mezcla del multi** quedan como horas ocupadas del cluster; no se publican como tareas
  (`CreateCompetitionGroupsAssignments`).
- **Reglas de CanVolunteer**: «sin newcomers» y «solo sus pruebas» para jueces y runners evitan, pero no prohíben del todo. Para mezclar sí es una regla firme: nadie mezcla una prueba en la que no compite, salvo si toda la ronda compite a la vez (4BLD, 5BLD), aunque quede una plaza vacía.
- **Choque entre multi y 4×4**: los conjuntos de sala auxiliar llevan a quienes hacen multi a los grupos
  1 y 2 de 4×4, para evitarlo. Falta comprobar con el WCIF que ya no queda nadie con choque.
