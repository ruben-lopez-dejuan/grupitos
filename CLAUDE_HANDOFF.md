# WCA Easy Groups — contexto de producto y traspaso técnico

> **Obsoleto como estado del proyecto (22/10/2026).** El relevo actual está en [`HANDOFF.md`](HANDOFF.md). Este documento se conserva por el contexto de producto y las reglas de dominio de la sección 3.

## 1. Resumen del proyecto

**WCA Easy Groups** es una aplicación web para crear, revisar y publicar grupos y asignaciones de personal de competiciones oficiales de la World Cube Association (WCA).

Repositorio principal:

- <https://github.com/ruben-lopez-dejuan/wca-easy-groups>

La idea central no es construir otro generador completamente automático y opaco. Queremos una herramienta que:

1. permita empezar en pocos minutos en un open pequeño;
2. sea suficientemente flexible para campeonatos grandes, con varias salas o escenarios;
3. genere una propuesta razonable y explicable;
4. permita corregirla rápidamente en una matriz visual;
5. detecte conflictos antes de publicar;
6. escriba finalmente los grupos y tareas en el WCIF oficial.

La prioridad principal del producto es la **facilidad de uso**. La aplicación debe ocultar la complejidad técnica del WCIF y de los algoritmos de asignación, pero no debe quitar control a organizadores y delegados.

## 2. Problema que intentamos resolver

En una competición WCA cada persona compite una vez por ronda y normalmente también realiza tareas: juez, mezclador, runner u otras funciones.

Preparar grupos manualmente se complica por varios motivos:

- el número de competidores cambia según la prueba;
- puede haber una o varias salas o escenarios simultáneos;
- puede trabajarse con puestos fijos o con sala de espera;
- los grupos deben tener tamaños razonablemente equilibrados;
- cada grupo necesita suficientes jueces y buenos mezcladores;
- una persona no puede competir y trabajar simultáneamente;
- hay que considerar horarios, rondas solapadas y descansos;
- algunas personas son especialmente fiables para tareas concretas;
- en campeonatos grandes existen stream, personal dedicado, restricciones horarias y excepciones individuales;
- el resultado debe convertirse en actividades y asignaciones WCIF válidas.

Las herramientas actuales suelen estar en uno de dos extremos:

- muy automáticas, sencillas pero poco configurables;
- muy potentes, pero orientadas a usuarios expertos y configuradas mediante scripts.

WCA Easy Groups intenta ocupar el espacio intermedio: **presets sencillos + controles avanzados progresivos + revisión manual eficiente**.

## 3. Reglas del dominio que no deben interpretarse mal

### 3.1. Hacer tareas antes de competir es normal y necesario

No debe implementarse una regla general que prohíba trabajar antes de competir. En muchas rondas es imprescindible que los competidores de grupos posteriores trabajen en los primeros grupos.

La preferencia correcta es:

- permitir tareas antes y después de competir;
- evitar, cuando haya alternativas, trabajar en el grupo inmediatamente anterior al propio;
- tratar esto como preferencia o penalización, no como prohibición absoluta;
- nunca dejar un grupo sin personal por intentar cumplir esta preferencia.

### 3.2. Cada persona compite una vez por ronda

En una ronda normal cada competidor debe tener exactamente una asignación `competitor`. Puede tener cero, una o varias tareas de personal en otros grupos de esa ronda.

### 3.3. Puestos fijos y sala de espera

La aplicación contempla dos modos operativos:

- **Puestos fijos:** cada competidor recibe número de estación. Conviene poder conservar estaciones entre rondas o aplicar reglas de distribución.
- **Sala de espera:** hay más personas en el grupo que estaciones disponibles y van entrando cuando queda una estación libre. En este modo no siempre tiene sentido asignar una estación individual.

### 3.4. Los buenos mezcladores importan

Uno de los presets debe garantizar, cuando los datos lo permitan, que todos los grupos tengan mezcladores experimentados.

La experiencia debe inferirse principalmente de los resultados oficiales de la persona en la prueba. El personal marcado manualmente como «de confianza» debe recibir prioridad, pero no ser el único grupo de candidatos.

Todavía falta consensuar una definición final de «buen mezclador». Una opción razonable para continuar sería combinar:

- resultado oficial en la prueba;
- percentil relativo dentro de los inscritos;
- lista de personal de confianza;
- número de tareas ya asignadas;
- disponibilidad y conflictos horarios.

No conviene fijar todavía un umbral rígido sin probarlo con competiciones reales de distintos tamaños.

## 4. Referencias de producto y código

### Groupifier

- Repositorio: <https://github.com/jonatanklosko/groupifier>
- Documentación de grupos: <https://github.com/jonatanklosko/groupifier/blob/master/docs/groups.md>
- Lógica de grupos: <https://github.com/jonatanklosko/groupifier/blob/master/src/logic/groups.js>
- Fórmulas: <https://github.com/jonatanklosko/groupifier/blob/master/src/logic/formulas.js>

Ideas que estamos tomando de Groupifier:

- reparto `balanced` y `symmetric`;
- distribución de personas rápidas entre grupos;
- priorización de mezcladores por resultados;
- sugerencia de tamaño de grupo a partir de las estaciones;
- sugerencia aproximada de un mezclador por cada cinco estaciones;
- respeto de conflictos y carga previa de trabajo;
- propuesta automática que sigue siendo editable.

En Groupifier, de forma resumida:

- `ranks` ordena usando rankings oficiales;
- `balanced` utiliza rankings oficiales en determinadas pruebas y, en otras, distribuye a los mejores competidores para asegurar capacidad de mezcla;
- `symmetric` reparte de forma simétrica a las personas mejor clasificadas en todas las pruebas.

No hay que copiar ciegamente esos algoritmos. Son una referencia para construir reglas explicables y presets con nombres comprensibles.

### Delegate Dashboard

- Repositorio: <https://github.com/coder13/delegateDashboard>

Es la principal referencia para la pantalla de revisión. El patrón deseado es una matriz:

- una persona por fila;
- datos como nombre, edad y seed a la izquierda;
- una columna por grupo;
- códigos directamente en las celdas (`C`, `J`, `S/M`, `R`);
- colores por tipo de asignación;
- selección rápida mediante clic y teclado;
- resumen de carga de personal a la derecha;
- posibilidad de filtrar y ordenar.

La aplicación ya tiene una primera versión de esta matriz. Debe evolucionar hacia selección múltiple, operaciones por bloques, filtros y validaciones inline.

### CompScript

- Repositorio: <https://github.com/cubingusa/compscript>
- Scripts reales de campeonatos de CubingUSA: <https://github.com/cubingusa/nats-scripts>

CompScript es la referencia para el techo de personalización. Está pensado para campeonatos grandes y permite expresar reglas complejas mediante un lenguaje propio.

Capacidades relevantes detectadas en su código:

- crear salas y escenarios;
- crear grupos y actividades;
- conjuntos de personas con filtros diferentes;
- preasignaciones manuales;
- asignación y exclusión de estaciones;
- restricciones de equilibrio y límites;
- asignación de tareas por cantidades y elegibilidad;
- preferencias por trabajo previo, trabajo consecutivo o tarea repetida;
- preferencias basadas en velocidad;
- incompatibilidades de horarios;
- periodos de indisponibilidad;
- competidores destacados para stream;
- importación y exportación WCIF;
- informes y comprobaciones de asignaciones.

El objetivo no es exponer CompScript dentro de la UI. Hay que traducirlo a decisiones humanas, por ejemplo:

- «Esta persona solo puede trabajar por la mañana».
- «Necesito dos mezcladores experimentados por grupo».
- «Mantén a este equipo en el escenario principal».
- «No pongas a esta persona en grupos consecutivos».
- «Reparte a los competidores del stream entre estos grupos».
- «Conserva, si es posible, la misma estación».

La configuración avanzada debería presentarse mediante reglas visuales y presets guardables. Un editor técnico o modo experto podría añadirse mucho más adelante, pero no debe ser el flujo principal.

### Iconos de pruebas

- Repositorio: <https://github.com/cubing/icons>
- Demostración: <https://icons.cubing.net>
- Paquete: `@cubing/icons`

La dependencia ya está instalada. Los IDs de pruebas del WCIF se traducen directamente a clases como `event-333`, `event-pyram` o `event-clock`.

### WCIF y WCA

- Especificación oficial WCIF: <https://github.com/thewca/wcif>
- Documento de la especificación: <https://github.com/thewca/wcif/blob/stable/specification.md>
- Ayuda de la API WCA: <https://www.worldcubeassociation.org/help/api>
- Gestión de aplicaciones OAuth: <https://www.worldcubeassociation.org/oauth/applications>
- Código de la web WCA: <https://github.com/thewca/worldcubeassociation.org>

La versión estable actual que usa el proyecto es WCIF 1.2. Los códigos oficiales de asignación que interesan inicialmente son:

- `competitor`
- `staff-judge`
- `staff-scrambler`
- `staff-runner`
- `staff-dataentry`
- `staff-announcer`

## 5. Estado actual del producto

Último commit al redactar este documento: `960561f` (`Replace assignment form with group matrix`).

### 5.1. Implementado y funcional

- Aplicación Next.js con TypeScript.
- Inicio de sesión OAuth contra la WCA.
- Scopes OAuth `public manage_competitions`.
- Sesión JWT de NextAuth con duración de dos horas.
- Listado de competiciones administradas por la persona conectada.
- Importación del WCIF autorizado de una competición.
- Almacenamiento del WCIF completo en IndexedDB del navegador.
- Selección de competición importada.
- Lectura de competidores aceptados, pruebas, rondas, salas y personal bests.
- Configuración global de estaciones y número de salas.
- Modos «Puestos fijos» y «Sala de espera».
- Activación y desactivación de rondas.
- Ajuste del número de grupos por ronda.
- Configuración de mezcladores por grupo.
- Presets iniciales:
  - Open sencillo.
  - Mezcladores garantizados.
  - Personalizado.
- Selección manual de personal de confianza.
- Indicador básico de si hay experiencia suficiente para cubrir mezcladores.
- Generación real de una propuesta en memoria.
- Reparto simétrico inicial por personal best.
- Priorización de personal de confianza para mezclar.
- Preferencia por no trabajar justo antes del grupo propio cuando existen alternativas.
- Asignación inicial de juez, mezclador y runner.
- Estaciones automáticas en modo de puestos fijos.
- Revisión mediante matriz estilo Delegate Dashboard.
- Varias tareas por persona dentro de una ronda.
- Edición por clic y teclado.
- Atajos actuales:
  - `C`: competir en la celda seleccionada.
  - `J`: juez.
  - `M` o `S`: mezclador/scrambler.
  - `R`: runner.
  - `0`: limpiar tarea.
  - flechas: mover la selección.
- Borradores guardados en `localStorage` y restaurados al abrir la competición.
- Tema claro y oscuro persistente.
- Iconos oficiales/comunitarios de `cubing/icons`.
- Diseño responsive básico.

### 5.2. Implementado como primera aproximación, no como solución final

El generador de `lib/group-generator.ts` es deliberadamente sencillo:

1. filtra competidores aceptados inscritos en la prueba;
2. ordena por mejor average y después mejor single;
3. los reparte con un patrón serpenteante entre grupos;
4. asigna estaciones secuenciales si hay puestos fijos;
5. selecciona mezcladores dando prioridad al personal de confianza, evitando si puede la tarea inmediatamente anterior a competir y usando después el personal best;
6. distribuye el resto de tareas entre grupos con menor carga.

Este algoritmo sirve para demostrar el flujo completo y producir datos editables. **No es todavía un optimizador fiable para producción.**

Limitaciones principales:

- no utiliza un solver de restricciones;
- no modela todas las actividades y solapamientos del horario;
- no valida descansos mínimos entre tareas;
- el reparto de jueces/runners es muy básico;
- no asegura todavía el número exacto de jueces necesario por estación;
- no considera la carga acumulada entre rondas;
- no trata de forma especial FMC, Multi-Blind o pruebas a ciegas;
- no gestiona bien rondas posteriores sin resultados;
- no soporta todavía diferentes reglas por sala/escenario;
- la definición de buen mezclador es provisional;
- las advertencias no están integradas todavía dentro de la matriz.

### 5.3. Todavía no implementado

- Crear o actualizar actividades de grupo dentro del WCIF.
- Convertir la propuesta a `Person.assignments` oficiales.
- Enviar un `PATCH` del WCIF a la WCA.
- Vista previa del diff antes de publicar.
- Revertir una publicación.
- Motor de validación completo.
- Asignaciones simultáneas en varias salas/escenarios.
- Restricciones de disponibilidad por persona.
- Personal dedicado que no compite.
- Roles adicionales como data entry o announcer.
- Stream y competidores destacados.
- Selección múltiple y edición masiva en la matriz.
- Copiar/pegar desde hojas de cálculo.
- Deshacer/rehacer.
- Historial de cambios del borrador.
- Exportación a PDF/CSV.
- Tests automatizados.
- Internacionalización.

## 6. Flujo de usuario deseado

### Paso 1 — Conectar e importar

1. Entrar con la cuenta WCA.
2. Ver únicamente las competiciones que administra.
3. Importar una competición.
4. Guardar el WCIF localmente.

### Paso 2 — Describir el recinto

1. Confirmar salas o escenarios detectados en el horario.
2. Indicar estaciones por sala.
3. Elegir puestos fijos o sala de espera.
4. Permitir sobrescribir estos valores para pruebas concretas.

### Paso 3 — Elegir una estrategia

Para competiciones pequeñas debería bastar con escoger un preset y generar:

- Open sencillo.
- Equilibrado.
- Simétrico.
- Mezcladores garantizados.

Para competiciones grandes debe existir «Personalizar reglas», con complejidad progresiva y explicaciones en lenguaje natural.

### Paso 4 — Generar

El sistema construye una propuesta, explica las decisiones relevantes y muestra advertencias. Nunca debe afirmar que una restricción se ha garantizado si solo se ha usado como preferencia.

### Paso 5 — Revisar en matriz

La pantalla debe parecer una herramienta de operaciones, no un formulario convencional:

- filas densas pero legibles;
- metadatos fijos a la izquierda;
- grupos como columnas;
- código y color en cada celda;
- cabeceras y primera columna sticky;
- edición rápida con teclado;
- filtros por ronda, grupo, rol, conflicto o persona;
- selección múltiple y acciones por lotes;
- total de tareas por persona y por grupo;
- conflictos visibles dentro de las celdas.

### Paso 6 — Validar

Antes de publicar debe existir una lista accionable de problemas:

- persona que compite y trabaja en el mismo grupo;
- dos actividades solapadas;
- grupo sin suficientes jueces;
- grupo sin suficientes mezcladores válidos;
- estación duplicada;
- competidor sin grupo;
- demasiadas tareas consecutivas;
- restricción manual incumplida;
- actividad WCIF inexistente o incompatible.

### Paso 7 — Publicar

1. Mostrar qué campos WCIF van a cambiar.
2. Confirmación explícita del usuario.
3. Guardar mediante el endpoint autorizado.
4. Volver a descargar el WCIF y verificar que lo publicado coincide.

## 7. Dirección visual

El usuario rechazó explícitamente una estética genérica de «dashboard hecho por IA». La dirección actual es:

- herramienta operativa sobria;
- tipografía del sistema, clara y suficientemente grande;
- pocas tarjetas y cápsulas;
- bordes discretos;
- jerarquía mediante espacio, tamaño y peso, no mediante decoraciones;
- texto en español natural y directo;
- modo oscuro diseñado, no una simple inversión automática;
- iconos de pruebas reconocibles;
- alta densidad solo donde aporta valor, especialmente en la matriz;
- controles avanzados ocultos hasta que sean necesarios.

Evitar:

- gradientes decorativos;
- textos diminutos;
- exceso de badges;
- docenas de tarjetas independientes;
- frases grandilocuentes de marketing;
- botones que prometen una acción no implementada;
- modales gigantes si una vista completa resulta más usable.

## 8. Arquitectura actual

### Tecnologías

- Next.js `16.4.2`, App Router.
- React `19.3.1`.
- TypeScript `5.6.3`.
- NextAuth `4.24.15`.
- `@cubing/icons` `^3.0.5`.
- CSS manual, sin framework de componentes.
- IndexedDB para WCIF importados.
- `localStorage` para tema y borradores de asignaciones.

### Archivos principales

- `app/page.tsx`: entrada y login.
- `app/dashboard/page.tsx`: competiciones administradas.
- `app/competition/[competitionId]/page.tsx`: abre el espacio de trabajo.
- `app/api/auth/[...nextauth]/route.ts`: ruta de NextAuth.
- `app/api/wca/competitions/[competitionId]/route.ts`: proxy autenticado para descargar el WCIF.
- `components/competition-list.tsx`: importación y apertura de competiciones.
- `components/group-workspace.tsx`: configuración de recinto, presets y rondas.
- `components/group-review.tsx`: matriz editable de asignaciones.
- `components/event-icon.tsx`: iconos de pruebas.
- `components/theme-toggle.tsx`: tema persistente.
- `lib/auth.ts`: proveedor OAuth WCA y sesión.
- `lib/wca.ts`: cliente servidor para la API WCA.
- `lib/competition-store.ts`: almacenamiento IndexedDB y tipos WCIF parciales.
- `lib/group-generator.ts`: algoritmo provisional de generación.
- `app/globals.css` y `app/product.css`: estilos globales y del producto.

### Persistencia actual

- El WCIF importado se guarda en la base IndexedDB `wca-easy-groups`, object store `competitions`.
- Los borradores se guardan bajo `wca-easy-groups:draft:{competitionId}` en `localStorage`.
- El tema se guarda bajo `wca-easy-groups-theme`.
- No existe base de datos de servidor.

Esto mantiene los datos de la competición en el dispositivo, pero tiene consecuencias:

- el borrador no se comparte entre dispositivos;
- no hay colaboración multiusuario;
- limpiar los datos del navegador borra el trabajo;
- hay que diseñar exportación/importación de borradores antes de depender de este enfoque en producción.

## 9. OAuth y configuración local

Variables necesarias en `.env.local`:

```env
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
WCA_CLIENT_ID=
WCA_CLIENT_SECRET=
WCA_BASE_URL=https://www.worldcubeassociation.org
```

Callback local:

```text
http://localhost:3000/api/auth/callback/wca
```

Scopes:

```text
public manage_competitions
```

Comandos:

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

La aplicación se abre en <http://localhost:3000>.

### Seguridad

`.env.local` está ignorado por Git y no debe subirse. En una conversación anterior se compartió un client secret de OAuth. Antes de cualquier despliegue o uso real debe revocarse y generarse uno nuevo en la WCA. Este documento no contiene ninguna credencial.

## 10. Próximos pasos recomendados

### Prioridad 1 — Hacer fiable la matriz

- Añadir selección múltiple con `Shift` y `Ctrl/Cmd`.
- Pintar varias celdas arrastrando o mediante acción masiva.
- Añadir deshacer/rehacer.
- Permitir ordenar por seed, nombre, grupo, carga y conflictos.
- Filtros: todos, inscritos, sin grupo, sin tarea, mezcladores, conflictos.
- Totales por columna: competidores, jueces, mezcladores y runners.
- Totales globales por persona a través de todas las rondas.
- Mantener navegación completa por teclado.
- Añadir un panel lateral de detalles para la persona seleccionada.

### Prioridad 2 — Modelo de restricciones

Separar claramente:

- restricciones duras: jamás se pueden incumplir;
- preferencias: se intenta cumplirlas y se muestra si no fue posible;
- objetivos de equilibrio: se optimizan globalmente.

Ejemplos de restricciones duras:

- no competir y trabajar en actividades solapadas;
- exactamente un grupo de competición por ronda;
- estación única dentro del grupo;
- persona disponible en la franja horaria.

Ejemplos de preferencias:

- no trabajar justo antes de competir;
- conservar estación;
- no repetir demasiadas veces la misma tarea;
- equilibrar carga;
- priorizar personal de confianza.

Considerar un solver o un optimizador con función de coste en vez de seguir ampliando reglas greedy independientes.

### Prioridad 3 — Actividades WCIF

- Leer la estructura real del horario y sus rooms.
- Crear child activities `{eventId}-r{round}-g{group}` con tiempos válidos.
- Asociarlas a la sala correcta.
- Conservar extensiones WCIF desconocidas.
- Mapear la matriz a assignments oficiales.
- Construir un diff de `schedule`, `events` y `persons`.
- Validar contra la especificación antes de publicar.

### Prioridad 4 — Publicación segura

- Endpoint servidor autenticado para `PATCH` del WCIF.
- Pantalla de confirmación con resumen de cambios.
- Dry run local.
- Publicación explícita.
- Relectura y verificación después del `PATCH`.
- Copia exportable del WCIF anterior para recuperación.

### Prioridad 5 — Campeonatos grandes

- Configuración distinta por escenario.
- Varias actividades simultáneas.
- Personal dedicado.
- Indisponibilidades.
- Stream y featured competitors.
- Reglas por subconjuntos de personas.
- Presets guardables y reutilizables.
- Importación opcional desde CSV/Google Sheets.

## 11. Criterios de calidad para continuar

Antes de considerar una función terminada:

1. debe hacer lo que indica el botón o texto de la interfaz;
2. debe tener estado vacío, error y carga;
3. debe funcionar en tema claro y oscuro;
4. debe ser utilizable con teclado;
5. debe verificarse con una competición pequeña y otra grande;
6. no debe modificar la WCA sin confirmación explícita;
7. debe distinguir garantías de preferencias;
8. debe conservar campos y extensiones WCIF que no entienda;
9. `npm run typecheck` y `npm run build` deben pasar;
10. los cambios deben probarse visualmente, no solo compilar.

## 12. Petición concreta para el siguiente agente

Continuar desde el repositorio existente, sin rehacer la aplicación desde cero. Mantener la dirección visual sobria y la matriz como superficie principal de revisión.

La siguiente entrega ideal sería:

1. selección múltiple y edición por lotes en la matriz;
2. totales y validaciones por grupo visibles en las cabeceras;
3. conflictos inline;
4. modelo formal de restricciones duras, preferencias y puntuaciones;
5. tests unitarios del generador con varios tamaños de competición;
6. preparación del mapeo a actividades y assignments WCIF, todavía sin publicar automáticamente.

Antes de implementar el `PATCH` a la WCA, revisar en profundidad la especificación WCIF, probar con datos reales y presentar al usuario una vista previa exacta de los cambios.
