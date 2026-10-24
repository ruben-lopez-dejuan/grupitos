# WCA Easy Groups

Grupos y tareas de personal para competiciones de la [World Cube Association](https://www.worldcubeassociation.org).

Importas la competición desde la WCA, la app reparte a los competidores en grupos y asigna jueces, mezcladores, runners, delegado de turno y data entry. Después revisas y corriges el resultado en una tabla, imprimes las hojas de tiempos y descargas el WCIF con los grupos.

- En producción: <https://groups.lopezruben.com> (se entra con la cuenta de la WCA).
- Para un open pequeño bastan un par de clics. Para un campeonato con varias salas, escenarios y equipos de voluntarios está el **modo PRO**, que cubre lo que se suele hacer con [CompScript](https://github.com/cubingusa/compscript), pero desde una interfaz visual.
- Funciona en español y en inglés, en tema claro y oscuro, y también en el móvil.
- Es un proyecto independiente, no oficial de la WCA.

## Índice

- [Cómo se trabaja](#cómo-se-trabaja)
- [Modo básico](#modo-básico)
- [Modo PRO](#modo-pro)
- [Datos y privacidad](#datos-y-privacidad)
- [Lo que todavía no hace](#lo-que-todavía-no-hace)
- [Desarrollo](#desarrollo)
- [Idiomas](#idiomas)
- [Documentación](#documentación)
- [Créditos y licencias](#créditos-y-licencias)

## Cómo se trabaja

1. **Entrar con la WCA.** La contraseña se escribe siempre en la web de la WCA, mediante OAuth.
2. **Elegir la competición.** Aparecen las competiciones que organizas o delegas, con bandera y ciudad. Las próximas salen primero y las pasadas quedan detrás de un botón.
3. **Seguir los pasos numerados** de la barra superior. Cada paso tiene un botón «Siguiente» al pie, y la pestaña activa queda en la URL.

| Paso | Qué se decide |
| --- | --- |
| Zona | Estaciones y modo de entrada (puestos fijos, sala de espera o mixto). En PRO, además, el personal por sala y escenario y las plantillas. |
| Horario *(PRO)* | Salas, escenarios y la hora de cada grupo. |
| Reglas | Cómo se reparten los competidores y quién puede hacer cada tarea. |
| Personas | Roles, personal de confianza y fotos. En PRO, además, voluntarios, equipos, propiedades e importación de hojas. |
| Clusters *(PRO)* | Grupos de personas definidos por condiciones. |
| Grupos | Número de grupos, mezcladores y runners de cada ronda. Es el único paso que genera la propuesta. |
| Revisar | La propuesta en una tabla editable, con validación en vivo. |
| Hojas de tiempos | Scorecards en PDF. |
| Publicar | Publicación en la WCA (grupos, tareas y ajustes) o descarga del WCIF. |

Todo se guarda solo en el navegador mientras trabajas. Si cambias algo que afecta al reparto, la propuesta queda marcada como desactualizada hasta que vuelves a generarla.

## Modo básico

Pensado para cualquier competición, con las reglas de [Groupifier](https://github.com/jonatanklosko/groupifier).

### Grupos

- Número de grupos sugerido por ronda según las estaciones y el modo de entrada, ajustable con un contador.
- Cinco formas de repartir a los competidores:
  - **Mezcladores seguros** (recomendada): garantiza que haya gente rápida libre para mezclar.
  - **Simétrica.**
  - **Equilibrada.**
  - **Por ranking.**
  - **Por nombre.**
- Los delegados se reparten entre los grupos.
- Primeras rondas y rondas siguientes por separado. En las siguientes se calcula cuánta gente pasa. Cualquier ronda se puede excluir o reactivar.

### Personal

- **Tareas:**
  - J, juez;
  - S, mezclador (scrambler);
  - R, runner;
  - D, delegado de turno;
  - E, data entry;
  - L, stage lead;
  - A, announcer;
  - O, otra.
- **Disponibilidad:** nadie recibe una tarea mientras compite. Hay opciones para evitar que alguien trabaje justo antes de su propio grupo.
- **Roles de la WCA:** delegados, delegados en prácticas, organizadores y roles `staff-*`. Los `staff-judge`, `staff-scrambler` y `staff-runner` van primero para su tarea, y los `staff-other` evitan tareas.
- **Opciones de reparto:**
  - sin tareas para newcomers;
  - tareas solo en las propias pruebas;
  - sin runners extranjeros;
  - delegados y organizadores con o sin tareas normales.
- **Orden de las tareas:** se puede elegir qué se cubre antes cuando falta gente (delegado, mezcladores, data entry, runners y jueces).
- **Carga repartida:** quien está en muchas pruebas no carga con la mayor parte del trabajo. Además, cada tarea guarda un «¿por qué esta persona?», con las personas libres que había y los motivos de la elección.

### Revisión

- Una persona por fila y un grupo por columna.
- **Edición rápida:**
  - selección múltiple arrastrando, con Mayús/Ctrl o con las flechas;
  - una letra asigna esa tarea a las celdas seleccionadas;
  - un número sobre una celda C fija la estación;
  - deshacer y rehacer.
- **Herramientas:** filtros, orden, búsqueda (siempre de la A a la Z), ficha de cada persona y total de tareas.
- **Rondas siguientes:** en lugar de la marca personal se ve el puesto y el resultado de la ronda anterior, y el orden «por seed» sigue ese puesto.
- **Validación en vivo** por ronda, grupo y fila. Detecta:
  - grupos sin juez, mezclador o delegado;
  - estaciones repetidas;
  - choques de horario;
  - personas que compiten y trabajan a la vez.

  Pulsar «N errores» o «N avisos» abre la lista.

### Hojas de tiempos

- Scorecards de Groupifier en PDF: rellenadas o en blanco, en A4 o carta (cuatro por hoja) o en A6.
- En varios idiomas.
- **Opciones:**
  - columna de comprobación de mezcla;
  - portada de control por grupo para el delegado y data entry;
  - número de inscripción por detrás, para imprimir a doble cara.
- Mismo orden que Groupifier: dentro de cada grupo, de peor a mejor, así que el mejor de la ronda lleva el número 1. En rondas siguientes cuenta el puesto en la ronda anterior.
- Mismo aspecto que Groupifier, también en euskera y los demás idiomas: las etiquetas salen enteras.

## Modo PRO

Se activa con el interruptor PRO de la barra superior. Está inspirado en CompScript, en los scripts de los nacionales de EE. UU. y en los scripts del Amore Open 2026 y del Campeonato de España 2026.

### Horario, salas y escenarios

- **Horario:** se importa del WCIF y se edita arrastrando y redimensionando bloques.
- **Escenarios:** se leen y escriben en la extensión natshelper de CompScript (`org.cubingusa.natshelper.v1`).
- **Numeración de grupos:** los grupos que empiezan a la vez en escenarios distintos comparten número («G1 Araba», «G1 Bizkaia»).
- **Total de grupos por ronda:** se reparte entre sus bloques de horario.
- **Choques:** nadie compite en dos sitios a la vez. Si el horario no lo permite, la persona va al grupo que menos se solapa y la revisión lo avisa.
- **MultiBLD:**
  - **intentos:** cada intento es una columna. Los competidores hacen todos los intentos y cada intento tiene su propio personal;
  - **mezcla:** los mezcladores trabajan en el bloque de mezcla de cubos que acaba justo antes de su intento;
  - **resultados:** se leen bien (por ejemplo, 35/36 57:13).

### Personas, voluntarios y equipos

- **Voluntarios que no compiten:**
  - se pueden añadir a mano o importar;
  - si tienen WCA ID, el nombre se toma de la WCA, porque el WCA ID es lo que los identifica.
- **Propiedades por persona,** como en CompScript: equipo, `weight-judge`, preferencias…
  - las de natshelper se leen del WCIF;
  - se pueden descargar como plantilla CSV para rellenarlas.
- **Importación de hojas:**
  - **origen:** CSV pegado o subido, o Google Sheets directamente si el servidor tiene cuenta de servicio;
  - **cabeceras:** entiende las de CompScript (`identifier:`, `property:`, `ignore:`);
  - **emparejamiento:** por WCA ID, luego número de inscripción, correo y nombre;
  - **comprobación:** enseña antes cómo empareja cada fila y nunca duplica a nadie. «Fusionar duplicados» arregla las copias de importaciones antiguas.
- **Indisponibilidades:** una franja horaria o «mientras compite X».
- **Equipos en vivo:** cada valor de la propiedad de equipo tiene un comportamiento:
  - **tipo:** mantener roles, voluntarios, evitar tareas, sin tareas o data entry;
  - **sala:** primero allí o solo allí;
  - **tareas** que hace;
  - **horas ocupadas.**

  Se aplica en cada generación, sin pasos intermedios.

### Clusters

- Grupos de personas que cumplen todas o alguna de una lista de condiciones, cada una negable:
  - rol;
  - propiedad;
  - edad;
  - inscrito en una prueba;
  - marca por debajo de un tiempo;
  - newcomer;
  - país;
  - otro cluster.
- El recuento y la lista se actualizan en vivo.
- Hay plantillas: pueden mezclar, mayores de edad, staff y voluntarios… Cada equipo aparece también como cluster.

### Quién hace cada tarea y cuánta gente hace falta

- **Quién puede hacer cada tarea:** un cluster para jueces, otro para mezcladores y otro para runners, evaluado **por prueba**. Por ejemplo, «puede mezclar 3BLD» si tiene marca de 3x3 por debajo de un límite.
- **Personal por sala y escenario:** estaciones, mezcladores y runners predeterminados, además de:
  - un **máximo de competidores por grupo** para ese escenario;
  - un **equipo propio**, que trabaja allí y en ningún otro sitio.
- **Puntuación con pesos:**
  - **criterios:** doce, inspirados en los scorers de CompScript (carga, horas trabajadas hoy, seguir en la misma tarea, rachas largas, justo antes de competir, rapidez, preferencias `weight-*`…);
  - **perfiles:** «Equilibrado» y «Amore Open 2026»;
  - **cálculo:** cada grupo se resuelve como un programa entero, igual que el ILP de CompScript, y tarda menos de un segundo con 260 personas.

### Orden de asignación, destacados y estaciones

- **Conjuntos de asignación,** como el `AssignmentSet` de CompScript. Una lista ordenada en la que cada conjunto dice:
  - **quién:** un cluster y/o «solo los mejores N», con un N distinto por prueba si hace falta;
  - **en qué rondas;**
  - **dónde:** sala, escenario y números de grupo.

  El tope es duro: un conjunto nunca llena un grupo por encima del reparto par. Una vista previa avisa de las rondas donde no cabe la gente. Si hay un choque de horario real, gana evitar el choque.
- **Destacados:** una estrella en la revisión, en la hoja de tiempos y en el WCIF (`featuredCompetitorWcaUserIds` de Groupifier).
- **Reglas de estación,** como `StationAssignmentRule`. Ordenan las estaciones por posición, inscripción, nombre o una propiedad, y pueden apartar a un cluster de ciertas estaciones (por ejemplo, las del streaming).

### Plantillas

- La configuración PRO (clusters, conjuntos, reglas, personal por sala, equipos, puntuación y opciones) se exporta e importa como JSON, sin datos personales.
- Las salas se guardan por nombre y las horas por número de día, así que sirven de un año al siguiente.
- Incluye la plantilla **Campeonato de España 2026** de un clic. Ver [`docs/NACIONAL_2026_EN_LA_WEB.md`](docs/NACIONAL_2026_EN_LA_WEB.md).

### Durante la competición

- **Actualizar desde la WCA:** vuelve a descargar el WCIF (resultados e inscripciones) sin tocar la configuración ni la propuesta.
- **Generar rondas nuevas:** genera solo las rondas que ya tienen competidores. Lo asignado antes cuenta: horas, cargas y quién compite o trabaja en cada momento.

### WCIF de entrada y de salida

- **Grupos existentes:** si el WCIF ya trae grupos (de CompScript, Groupifier…), se cargan como propuesta y se abre directamente la revisión.
- **Empezar de cero:** borra el borrador de esa competición y vuelve a descargar el WCIF.
- **Publicar en la WCA** (paso Publicar), como Groupifier y Delegate Dashboard:
  - **Revisar cambios** descarga el WCIF que tiene ahora la WCA y enseña qué cambia: grupos reutilizados, nuevos y quitados, y cuántas personas ganan o pierden asignaciones. Si el horario de la WCA cambió desde la importación, no deja publicar los grupos hasta actualizar.
  - **Publicar grupos y ajustes** pide confirmación, envía el cambio (`PATCH /api/v0/competitions/{id}/wcif`) y vuelve a leer el WCIF para comprobar que la WCA lo tiene todo. **Guardar solo los ajustes** no toca grupos ni tareas.
  - Se envían el horario con los grupos, las asignaciones y extensiones de cada persona y las extensiones de la competición. Nunca pruebas, rondas, resultados, roles ni inscripciones.
- **Ajustes compartidos:** los ajustes de la app se guardan en el WCIF de la competición (extensión `wcaEasyGroups.Settings`, ver [`docs/WCIF_EXTENSION.md`](docs/WCIF_EXTENSION.md)). Quien abra la competición en otro navegador o con otra cuenta con permisos encuentra los mismos ajustes y los grupos publicados. Si la WCA tiene ajustes más nuevos que los del navegador, la app lo avisa y deja cargarlos.
- **Exportar WCIF** (paso Publicar):
  - **grupos:** reutiliza los del WCIF que coinciden en sala, escenario y hora, crea los que faltan y quita los que sobran;
  - **contenido:** escribe asignaciones con estación, destacados, propiedades natshelper y escenarios;
  - **el resto:** deja todo lo demás igual. Con la exportación, la ida y vuelta da el mismo WCIF.
  - **tu trabajo:** el archivo lleva también la configuración, los ajustes PRO y la propuesta con tus cambios a mano, en la extensión `wca-easy-groups.Draft`.
- **Seguir en otro dispositivo:** «Importar WCIF exportado», en el paso Zona o en la lista de competiciones, recupera todo tal como lo dejaste. Funciona aunque la competición aún no esté en ese navegador. Con un WCIF de otra herramienta se cargan sus grupos.

## Datos y privacidad

- **Lectura:** de la WCA se lee el WCIF de la competición, a través de la versión 2 de la API.
- **Almacenamiento:**
  - el WCIF se guarda en IndexedDB y el borrador en `localStorage`, ambos en tu navegador;
  - no hay base de datos en el servidor;
  - el token OAuth queda en la sesión cifrada del servidor.
- **Escritura:** solo se escribe en la WCA al publicar, después de enseñar los cambios y pedir confirmación. Los ajustes de la app van en el WCIF público de la competición: no pongas datos privados en las notas.
- **El archivo exportado** lleva datos personales (los del WCIF privado y tu propuesta). Guárdalo como guardarías el WCIF.
- **Google Sheets:** las hojas se leen desde el servidor solo cuando lo pides, y solo las que hayas compartido con la cuenta de servicio.

## Lo que todavía no hace

- **Equipos automáticos:** rotación de equipos por día y escenario, y equipos equilibrados automáticamente.
- **Scorers por grupo de CompScript:** «ha competido hace poco», mismo país…
- **Opciones de impresión del WCIF:** no lee aún las de `groupifier.CompetitionConfig`.

## Desarrollo

Requisitos: Node.js 20.9 o superior.

```bash
npm install
cp .env.example .env.local
npm run dev
```

### Variables de entorno

| Variable | Para qué |
| --- | --- |
| `NEXTAUTH_SECRET` | Cifrado de la sesión (cualquier cadena larga y aleatoria). |
| `NEXTAUTH_URL` | URL de la app, por ejemplo `http://localhost:3000`. |
| `WCA_CLIENT_ID`, `WCA_CLIENT_SECRET` | Aplicación OAuth de la WCA. |
| `WCA_BASE_URL` | `https://www.worldcubeassociation.org`, o la de staging. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Opcional: leer Google Sheets en el modo PRO. Ver [`docs/GOOGLE_SHEETS.md`](docs/GOOGLE_SHEETS.md). |

Para la aplicación OAuth de la WCA:

- se crea en tu perfil de la WCA, en el apartado de aplicaciones OAuth;
- usa los scopes `public manage_competitions`;
- como URL de redirección lleva `http://localhost:3000/api/auth/callback/wca`, o la de tu dominio.

### Demo sin cuenta

Solo en desarrollo, con datos inventados (`lib/demo-competition.ts`):

- `/demo?size=small`: 34 personas y una sala;
- `/demo?size=large`: 260 personas, tres salas y dos días;
- `/demo/competitions`: la lista de competiciones.

### Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo en el puerto 3000. |
| `npm run typecheck` | Comprobación de tipos de TypeScript. |
| `npm test` | Tests con Vitest (generador, validación, importadores, WCIF, plantillas, i18n…). |
| `npm run build` | Compilación de producción. |

Cada push a `main` se despliega en Vercel.

### Tecnología y estructura

Tecnología:

- Next.js 16 con App Router, React 19, TypeScript y NextAuth 4;
- CSS propio, sin framework;
- PDF con `pdfmake`;
- programas enteros con `javascript-lp-solver`;
- iconos de pruebas de `@cubing/icons`.

Estructura:

| Ruta | Contenido |
| --- | --- |
| `app/` | Páginas, rutas API (`api/wca`, `api/sheets`, `api/auth`), estilos e icono. |
| `components/` | Interfaz: `group-workspace.tsx` es el área de trabajo con sus pasos, y `group-review.tsx` la tabla de revisión. |
| `lib/group-generator.ts` | El generador: reparto en grupos, choques, conjuntos y personal. |
| `lib/validation.ts` | Avisos y errores de la revisión. |
| `lib/pro/` | Modo PRO: horario, personas, equipos, clusters, puntuación, ILP, conjuntos, reglas de estación, plantillas e importador de hojas. |
| `lib/scorecards/` | Hojas de tiempos (portadas de Groupifier). |
| `lib/wcif-groups.ts`, `lib/wcif-export.ts` | Leer y escribir grupos en el WCIF. |
| `lib/i18n/` | Textos en español e inglés. |
| `tests/` | Tests de Vitest y fixtures anonimizados. |

## Idiomas

La interfaz está en español e inglés. Los textos viven en `lib/i18n/messages/`, un archivo por idioma; `es.ts` es la referencia.

Para añadir un idioma:

1. **Copiar y traducir.** Copia `lib/i18n/messages/es.ts` a `lib/i18n/messages/<código>.ts`, cambia `export const es` por `export const <código>: Messages` y traduce los textos.
   - Respeta los marcadores (`{name}`, `{count}`…).
   - Respeta los sufijos de plural (`_one`, `_other`). Puedes añadir `_few`, `_many`… si el idioma los usa.
2. **Registrar.** Añade el idioma a `LOCALES` en `lib/i18n/index.ts`.
3. **Comprobar.** Ejecuta `npm run typecheck` y `npm test`. Fallan si falta una clave o si un texto no tiene los mismos marcadores que el español.

El idioma se elige con el selector de la cabecera y se guarda en una cookie. Si no se elige, se usa el del navegador.

## Documentación

- [`docs/MODO_PRO.md`](docs/MODO_PRO.md): diseño del modo PRO y su relación con CompScript.
- [`docs/NACIONAL_2026_EN_LA_WEB.md`](docs/NACIONAL_2026_EN_LA_WEB.md): cómo recrear en la app los scripts del Campeonato de España 2026.
- [`docs/GOOGLE_SHEETS.md`](docs/GOOGLE_SHEETS.md): configurar la lectura de Google Sheets.
- [`HANDOFF.md`](HANDOFF.md): estado detallado del proyecto y decisiones de diseño.

## Créditos y licencias

- **[Groupifier](https://github.com/jonatanklosko/groupifier)**, de Jonatan Kłosko (Apache-2.0). Están portados de él:
  - el reparto en grupos;
  - las sugerencias por ronda;
  - las hojas de tiempos.
- **[CompScript](https://github.com/cubingusa/compscript)**, de CubingUSA (MIT). Es el modelo del modo PRO; sus ideas se han reimplementado sin copiar código.
- **[javascript-lp-solver](https://github.com/JWally/jsLPSolver)** (Unlicense).

El detalle está en [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
