# Campeonato de España 2026 en la web

Cómo recrear en Grupitos la configuración de los scripts de CompScript del Nacional
([aasalobrena/Scripts-Compscript, `SpanishChampionship2026`](https://github.com/aasalobrena/Scripts-Compscript/tree/main/SpanishChampionship2026)).
Está escrita para el estado del repo a 23/10/2026: solo tiene la preparación (`0_precomp`) y la
biblioteca (`lib`); los scripts de primeras rondas, de rondas siguientes, de jueces por escenario
y de indisponibilidades aún no están subidos.

Todo se hace con el **modo PRO** activado (interruptor arriba a la derecha). La configuración se
guarda en tu navegador, por competición.

## Atajo: la plantilla de un clic

En **Zona → Plantillas** elige «Campeonato de España 2026» y pulsa **Aplicar**. Hace los pasos 2 a
8 de esta guía de una vez (`lib/pro/templates/spanish-championship-2026.ts`) y avisa de las salas,
rondas o días que no encuentre. Después solo queda:

- Ajustar en **Reglas** los números de «Destacados» (4) y «Top» (18) por grupo de Bizkaia, que son de partida; con «Por prueba…» se pone un número distinto en cada prueba (5x5, Square-1…). La vista previa de cada conjunto avisa si pide más gente de la que cabe.
- Rellenar `delegate-cluster` si queréis los conjuntos de delegados.
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
escenario, 333-r4 con 1 en Gipuzkoa y 7 en las finales) y que el multi tiene sus dos intentos.
Nada más que hacer.

## 2. Equipos (`_constants.cs`, `_helpers.cs`: `InTeam`, `CanVolunteer`)

**Personas → Equipos**, propiedad `team`. Las sugerencias ya siguen `CanVolunteer`; comprueba que
queda así:

| Equipo | Tipo | Sala | Notas |
| --- | --- | --- | --- |
| Voluntario normal | Voluntarios (staff) | Cualquier sala | `STAGE_TEAM` |
| Side room | Voluntarios (staff) | Primero en Sala Auxiliar (sin «solo allí») | `SIDE_TEAM`: también trabaja en los escenarios |
| Data entry | Data entry | | `AddRole(Team([DATA_TEAM]), DATA_ROLE)` |
| Organizador, Delegado | Mantener roles | | siguen su rol de la WCA |
| Streaming, Registro / Stand AES, Control de Accesos, Médico | Sin tareas | | no están en `CanVolunteer` |
| Aceptado SIN categorizar, Otro | Sin tareas | | igual que el script: tener equipo y no ser voluntario = no trabaja. Cámbialo si no es lo que queréis |

**Horas ocupadas** (`9_competitiongroups.cs`), en la línea «Ocupado» de Equipos, equipo Side room,
domingo 6: 08:45–09:15 y 12:15–12:25 (montaje).

**Mezcla del multi** (09:15–09:50 del domingo en el script): en **Horario**, añade en la Sala
Auxiliar una actividad de tipo «Mezcla del multi» antes de cada intento, y en **Grupos** pon los
mezcladores del multi. Los mezcladores de cada intento trabajan en la mezcla que acaba justo antes
de ese intento (el mismo día), y el equipo Side room va primero.

## 3. Clusters (para los delegados por turnos)

**Clusters → Nuevo**, uno por grupo de `delegate-cluster` (`InDelegateCluster`):

- «Delegados 1 y 2»: *alguna* de las condiciones `delegate-cluster` es `1`, `delegate-cluster` es `2`.
- «Delegados 3»: `delegate-cluster` es `3`.
- «Delegados 4»: `delegate-cluster` es `4`.

Ojo: en el WCIF actual todos tienen `delegate-cluster` = 0, así que estos clusters salen vacíos
hasta que se rellene la propiedad.

Los equipos no hace falta crearlos como clusters: aparecen solos como «Equipo: …» en todas las
listas de clusters.

## 4. Reglas → Orden de asignación de grupos (`_assignment_sets.cs`: `FirstRoundAssignmentSets`)

Añade los conjuntos en este orden (todos con **Rondas: Primeras rondas** salvo los de delegados):

| # | Conjunto del script | Quién | Solo los mejores | Dónde | ★ |
| --- | --- | --- | --- | --- | --- |
| 1 | `FeaturedSet` | Cualquiera | N **por grupo de este conjunto** | Bizkaia | sí |
| 2 | `TopSet` | Cualquiera | M **por grupo de este conjunto** (y «Por prueba…» si cambia) | Bizkaia | no |
| 3 | `CoreSet` | Equipo: Organizador | | Gipuzkoa | |
| 4–9 | `DelegatesSet` | ver tabla de abajo | | | |
| 10 | `AESSet` | Equipo: Registro / Stand AES | | Gipuzkoa | |
| 11 | `DataSet` | Equipo: Data entry | | Gipuzkoa | |
| 12 | `StreamingSet` | Equipo: Streaming | | Araba | |
| 13 | `EveryoneSet` | Cualquiera | | Araba y Gipuzkoa (todo menos Bizkaia) | |

N y M son el tercer y cuarto argumento de `FirstRoundAssignGroups` en los scripts de primeras
rondas (aún no subidos). Ojo con la unidad: el script los multiplica por **todos** los grupos de la
ronda (`NumberPerGroupToPerRound`, en la app «por grupo de toda la ronda»), así que 4 y 18 allí
serían 48 y 216 en 3x3: más que Bizkaia. Con «por grupo de este conjunto», 4 y 18 son 22 por grupo
de Bizkaia. Un conjunto nunca llena un grupo por encima del reparto par de la ronda: quien no cabe
pasa a los conjuntos siguientes.

**Delegados** (`DelegateStage`): con «Rondas: Elegir rondas», un conjunto por día y grupo de
delegados. Primeras rondas del sábado 5: clock, 7×7, Square-1, 6×6, 3BLD, 5×5 y Megaminx.
Del domingo 6: Pyraminx, 4×4, 2×2, Skewb, 3×3 y OH.

| Día | Delegados 1 y 2 | Delegados 3 | Delegados 4 |
| --- | --- | --- | --- |
| Sábado 5 | Bizkaia | Gipuzkoa | Araba |
| Domingo 6 | Gipuzkoa | Araba | Bizkaia |

(El lunes solo hay rondas siguientes, que el script no reparte por conjuntos.)

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

## 7. Zona → personal de la Sala Auxiliar (`4_assign_side.cs`: `AssignStaff`)

En la tabla de personal por sala y escenario, Sala Auxiliar: **20 estaciones, 2 mezcladores,
2 runners** (`JudgeJob(20), RunnerJob(2), ScramblerJob(2)`). Para el multi el script pide 10 jueces
y ni mezcladores ni runners: en **Grupos**, ronda 333mbf, pon 0 mezcladores y 0 runners.

## 8. Hojas de tiempos (`0_groupifier_config.cs`)

A4, orden **Apilado**, **Portada por grupo** y hoja de mezclas para **Los mejores** y **Finales**.

## Lo que todavía no es igual

- **Jueces del multi**: las estaciones son por sala, no por ronda, así que el multi pide un juez
  por competidor hasta 20, no 10.
- **Quién trabaja en la sala auxiliar**: el script solo usa Voluntario normal, Side room y
  `delegate-cluster` 1. Aquí Side room va primero y luego entra cualquiera que pueda, y el delegado
  de turno de la sala auxiliar no se limita al cluster 1.
- **Montaje y mezcla del multi** quedan como horas ocupadas del equipo; no se publican como tareas
  (`CreateCompetitionGroupsAssignments`).
- **Reglas de CanVolunteer**: «solo sus pruebas» y «sin newcomers» evitan, pero no prohíben del todo.
- **Conflicto real del horario**: con destacados y top en Bizkaia, los del top que hacen multi no
  caben todos en el único grupo de 4×4 de Bizkaia antes del segundo intento; la revisión lo marca.
  En 2025 se resolvía con un conjunto «multi» antes del top (`MultiSet`): Quién = un cluster
  «inscrito en 3x3 Multi-Blind», Grupos = números concretos de 4×4/2×2 que acaben antes.
