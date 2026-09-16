# Reglas del módulo de hogares

- **Ámbito:** `com.cellier.household`, migración `V3__household.sql` (Incremento 3)
- **Actualizado:** 2026-09-03

Este documento es la referencia de las invariantes del módulo de hogares. No describe los
endpoints —eso está en OpenAPI— sino las reglas que ningún camino del código puede violar,
con el estado de su implementación.

El módulo importa más allá de sí mismo: **la membresía en un hogar es el núcleo de
autorización de todo Cellier**. Despensa, catálogo, plantillas y recetas cuelgan de un
`householdId`, y cada uno de esos módulos empieza sus casos de uso llamando a
`HouseholdAccessService`. Un error aquí no se queda aquí.

## Las reglas

| | Regla | Estado |
|---|---|---|
| **R1** | Quien crea el hogar queda como `ADMIN` automáticamente, en la misma transacción. | Implementada · PR 1 |
| **R2** | El `join_code` tiene 8 caracteres alfanuméricos en mayúscula, sin ambiguos (`0`, `O`, `1`, `I`, `L`), generado con `SecureRandom` y con reintento ante colisión. | Implementada · PR 1 |
| **R3** | Ingresar un código **no da acceso**: crea una solicitud `PENDING`. Solo un `ADMIN` la aprueba, y solo entonces nace el `household_member`. | Implementada · PR 3 |
| **R4** | Un hogar tiene **siempre** al menos un `ADMIN`. No se puede degradar al último, ni expulsarlo, ni dejar que se salga. Devuelve `409`. | Implementada · PR 2 |
| **R5** | Un usuario que ya es miembro y envía el código recibe `409`, no una solicitud duplicada. | Implementada · PR 3 |
| **R6** | Un miembro puede salirse solo, borrando su propia membresía, respetando R4. | Implementada · PR 2 |
| **R7** | Eliminar un hogar borra en cascada todo su contenido, y solo lo puede hacer un `ADMIN`. | Implementada · PR 1 |
| **R8** | Un usuario **no puede darse de baja** si es el único `ADMIN` de algún hogar. La baja responde `409` **listando los hogares bloqueantes**, para que el cliente pueda explicarle que debe traspasar la administración o eliminar esos hogares primero. | Pendiente · Incremento 11 |

### Cómo se sostiene R4

R4 no es una condición sobre la fila que se escribe, sino sobre el conjunto de miembros del
hogar: «que quede al menos un `ADMIN`». Ningún bloqueo optimista sobre la membresía la
protege, porque dos administradores que se degradan a la vez modifican **filas distintas** y
no chocan entre sí; ambos leerían «quedan 2», ambos pasarían la comprobación y el hogar
acabaría con cero administradores.

Por eso todos los casos de uso que tocan la membresía toman antes un bloqueo pesimista sobre
la fila del hogar: `HouseholdRepository.findByIdForUpdate`.

**Por qué la fila del hogar y no la del miembro.** Los dos administradores del ejemplo
modifican filas **distintas** de `household_members`. No colisionan entre sí, así que ningún
mecanismo que vigile la fila escrita —un `@Version` optimista sobre `HouseholdMember`, o un
`FOR UPDATE` sobre esas dos filas— vería nada anómalo: cada uno actualizaría la suya sin
conflicto. Lo que hay que serializar no son las escrituras, sino la **lectura del recuento y
la escritura que depende de ella**, y eso exige un punto común a todas las membresías del
hogar. La fila del hogar es el único que existe sin inventar un candado artificial.

**Coste.** Despreciable. Los cambios de membresía son raros y el bloqueo solo excluye a otros
cambios de membresía del mismo hogar: no afecta a las lecturas ni a los demás hogares.

**Cómo se comprueba.** `HouseholdMembershipIntegrationTest.degradacionesSimultaneasNoVacianElHogar`
lanza el escenario con dos hilos en transacciones distintas, **repetido 25 veces**. Si se
retira `lockHousehold`, falla con «el hogar se quedó sin administrador ([ok, ok])».

Las repeticiones no son decorativas y no se pueden bajar sin pensarlo: **con una sola tirada
el test pasaba igual con el bloqueo y sin él**, porque la ventana entre contar administradores
y confirmar la transacción dura microsegundos. Un test de concurrencia que pasa en ambos casos
es peor que no tenerlo, porque da confianza falsa. Si alguien lo toca, la comprobación de que
sigue sirviendo es quitar el bloqueo y verlo fallar.

### Expulsar al último administrador es inalcanzable

R4 enumera tres vías: degradar, expulsar y salir. En la práctica **la expulsión nunca puede
llegar a violarla**, y por eso no existe un mensaje de error para ese caso.

Para expulsar a otra persona hay que ser administrador. Si el objetivo es el último
administrador del hogar, entonces quien llama no lo es, y la petición muere antes con un
`403`. Las dos condiciones no pueden darse a la vez. Solo quedan dos caminos reales hasta el
`409`: quitarse el rol y salirse.

Escribir un mensaje para la expulsión habría añadido una rama que ningún test podría cubrir,
del mismo tipo que un estado del esquema que ningún endpoint produce.

### Por qué R8 existe

R4 protege al último administrador de las tres vías que pasan por el propio módulo de
hogares: degradarlo, expulsarlo y que se salga. Pero hay una cuarta vía que no pasa por aquí
y que R4 no ve: **que el usuario desaparezca por el lado de `identity`**.

La columna `users.deleted_at` existe desde `V2__identity.sql` y hoy no la escribe ningún
endpoint. El día que exista la baja de cuenta, dar de baja al único `ADMIN` de un hogar lo
dejaría sin administrador posible: nadie podría renombrarlo, borrarlo, aprobar solicitudes ni
promover a nadie, y el hogar quedaría congelado para siempre con sus miembros dentro.

R4 no lo cubre porque R4 mira transiciones de rol, no la existencia del usuario. Por eso R8 es
una regla aparte y **se escribe antes** que el endpoint que la necesita: una invariante que se
descubre al implementar la baja de cuenta ya llega tarde, porque para entonces la baja ya se
diseñó sin ella.

El `409` lista los hogares bloqueantes en lugar de limitarse a negar la baja porque el usuario
necesita saber **qué** desbloquear. Un `409` sin esa lista obliga al cliente a recorrer
`GET /households` y filtrar por su cuenta lo que el servidor ya sabía.

## `DELETE /join-requests/{id}` no estaba en la especificación original

La especificación del módulo enumeraba catorce endpoints. Este es el decimoquinto, y se
añadió al implementar el PR 3.

**Por qué faltaba.** El esquema ya declaraba el estado `CANCELLED` en el `CHECK` de
`join_requests`, pero ninguno de los catorce endpoints podía producirlo: era un valor
inalcanzable. Al revisar por qué, apareció el hueco funcional que lo explicaba.

**Qué se rompía sin él.** Quien teclea mal un código deja una solicitud pendiente en una casa
ajena. El índice único parcial `uq_join_requests_pending` le impide entonces solicitar otra vez
al hogar correcto si resulta ser el mismo, y su solicitud errónea espera a que la rechace un
administrador que probablemente no la mire nunca, porque no conoce a esa persona. El usuario
queda bloqueado sin ninguna acción a su alcance.

**Cómo quedó acotado.**

- **Solo cancela quien la envió.** Un administrador no cancela solicitudes ajenas: las
  *rechaza*, que es una acción distinta y deja otra huella en el historial. Quién cerró la
  solicitud se guarda en `resolved_by`, y en una cancelación es el propio solicitante.
- **Solo se cancela lo pendiente.** Sobre una solicitud ya `APPROVED`, `REJECTED` o
  `CANCELLED`, responde `409`.
- **La solicitud de otra persona responde `404`, no `403`**, por el mismo motivo que un hogar
  ajeno: quien pregunta no debe poder averiguar que existe.
- Cancelar libera el índice único parcial, así que se puede volver a solicitar en ese mismo
  hogar. Hay un test explícito de ese ciclo: solicitar → cancelar → volver a solicitar → `201`.

> El frontend tiene su propia lista de trampas de orden de ejecución, con guards y
> redirecciones en vez de bloqueos: `docs/frontend-orden-de-ejecucion.md`.

## Orden de adquisición de bloqueos

Dos casos de uso toman hoy el bloqueo pesimista de la fila del hogar, y esta lista existe para
que un tercero no lo tome al revés. **Antes de añadir un caso de uso que bloquee algo, añádelo
aquí.**

| Caso de uso | Recursos, en el orden en que se toman |
|---|---|
| `HouseholdMembershipService.changeRole` | `household_members` (lectura del guardia, sin bloqueo) → **`households` FOR UPDATE** → `household_members` (lectura y escritura) |
| `HouseholdMembershipService.remove` | `household_members` (lectura del guardia, sin bloqueo) → **`households` FOR UPDATE** → `household_members` (lectura y borrado) |
| `JoinRequestService.approve` | `household_members` (guardia) → **`households` FOR UPDATE** → `join_requests` (lectura y escritura) → `household_members` (alta) |
| `JoinRequestService.reject` | `household_members` (guardia) → **`households` FOR UPDATE** → `join_requests` (lectura y escritura) |
| `HouseholdService.delete` | `household_members` (guardia) → **`households`**, bloqueada de forma implícita por el `DELETE` → hijas, borradas por la cascada de la base |

La regla que todos cumplen, y que hay que seguir cumpliendo:

> **La fila de `households` se toma primero, y siempre antes de escribir cualquier fila que
> cuelgue de ese hogar.**

Nada más se bloquea explícitamente. Las lecturas previas del guardia son `SELECT` normales:
bajo MVCC no bloquean a nadie, así que no entran en el orden y no pueden participar en un ciclo.

`HouseholdService.delete` no llama a `findByIdForUpdate`, pero no es una excepción: su `DELETE`
sobre `households` adquiere el mismo bloqueo de fila, y lo adquiere antes de que la cascada
toque las hijas. Respeta el orden sin declararlo.

### Si algún día hace falta bloquear dos hogares

Ningún caso de uso lo necesita hoy, y si aparece uno —mover contenido de un hogar a otro,
fusionarlos— es donde el abrazo mortal deja de ser teórico: dos operaciones simétricas que
tomen A y B en orden opuesto se bloquean para siempre, y PostgreSQL matará una con
`deadlock detected` en producción, no en las pruebas.

**Regla para ese caso: bloquear los hogares en orden ascendente de UUID, siempre, sin importar
cuál sea el origen y cuál el destino.** Un orden total y arbitrario sobre los recursos es lo
que hace imposible el ciclo; que el criterio sea el identificador y no el papel que juega cada
hogar en la operación es justamente lo que garantiza que dos llamadas inversas tomen los
candados en la misma secuencia.

### Lo que el bloqueo no cubre

El guardia se resuelve **antes** de bloquear, así que entre la comprobación de rol y la
escritura hay una ventana en la que ese rol podría cambiar: una administradora a la que
degradan justo después de que su petición pasara por `requireAdmin` completaría esa acción.

Es una ventana de milisegundos, y la consecuencia se limita a una acción administrativa de más
por parte de alguien que lo era al empezar la petición. No es escalada de privilegios ni fuga
de datos: R4 —que sí se comprueba con el bloqueo tomado— sigue garantizada, y el hogar no puede
quedarse sin administrador por esta vía. Se acepta a sabiendas. Cerrarla del todo sería releer
la membresía de quien llama después del bloqueo, a cambio de una consulta más en cada operación.

## Dos cosas que no son fuente de autorización

Ambas son datos legítimos que se leen mal con facilidad. La única fuente de verdad de la
autorización es la tabla `household_members`, y nada más.

### `join_requests` nunca dice quién es miembro

Una solicitud en `APPROVED` **sobrevive a la expulsión del miembro que creó**. Expulsar borra
la fila de `household_members` sin dejar rastro, y la solicitud aprobada que dio origen a esa
membresía se queda ahí, en su estado final, porque describe un hecho histórico que ocurrió de
verdad: aquel día un administrador aprobó aquella solicitud.

Consultar `join_requests` para decidir si alguien pertenece hoy a un hogar da falsos positivos
por cada persona que entró y salió. Y como el índice único parcial solo restringe las
`PENDING`, el mismo usuario puede acumular varias solicitudes resueltas para el mismo hogar,
así que ni siquiera hay una fila por relación.

Esto importa en dos sitios concretos:

- **PR 3**, al aprobar y al rechazar: comprobar si el solicitante ya es miembro se hace contra
  `household_members`, nunca buscando una `APPROVED` previa.
- **Incremento 9**, en los filtros de recetas: cualquier consulta que restrinja resultados
  «a los hogares del usuario» parte de `household_members`. Un `join` con `join_requests`
  filtrando por `APPROVED` devolvería recetas de hogares de los que ya lo echaron.

### `households.created_by` es procedencia, no propiedad

Registra quién creó el hogar y nunca cambia. **No autoriza nada, ni siquiera como atajo.**

El creador puede acabar fuera de su propio hogar: en cuanto exista R4/PR 2, otro administrador
puede expulsarlo mientras quede algún `ADMIN`, y también puede salirse por su cuenta. A partir
de ese momento `created_by` apunta a alguien que no es miembro. Usarlo para conceder permisos
—«el creador siempre puede borrar el hogar»— abriría exactamente el agujero que el `404` del
guardia cierra.

No existe ningún endpoint que transfiera `created_by`, y no debe existir: no es propiedad, es
historia.

## El perfil lleva los hogares

`UserProfileResponse` incluye `households`, y por tanto lo llevan las tres respuestas que lo
transportan: `GET /api/v1/me`, `POST /api/v1/auth/google` y `POST /api/v1/auth/refresh`. El
elemento es `HouseholdSummary` —`{id, name, role, memberCount}`, sin el código de ingreso—, el
mismo esquema que devuelve `GET /api/v1/households`: una sola definición en OpenAPI,
referenciada desde los cuatro sitios.

**La lista se relee de la base en cada respuesta.** Nunca se copia de lo que se emitió al
iniciar sesión, y esto no es un detalle de implementación: el rol no viaja dentro del access
token precisamente para que no pueda quedarse obsoleto, y la renovación de tokens es el canal
por el que una sesión abierta descubre que a su usuario lo expulsaron de un hogar o lo
ascendieron a administrador. Cachearla aquí reintroduciría por la puerta de atrás el problema
que se evitó al no meter el rol en el token.

**`identity` no depende de `household`.** El módulo de hogares ya depende de identidad
—necesita `User` y `CurrentUserService`—, así que la llamada inversa cerraría el ciclo. La
interfaz `UserHouseholdsView` se declara en `identity`, que es quien la necesita, y la
implementa `HouseholdService`, que es quien sabe responderla. Lo único que identidad toma
prestado es el DTO, que es un tipo de datos y no comportamiento; duplicarlo habría significado
además dos esquemas idénticos en OpenAPI.

## Hasta dónde llega el email

El correo de una persona **viaja en dos DTOs, y solo en dos**:

- el DTO de **miembro del hogar** (`HouseholdMemberResponse`),
- el DTO de **solicitud de ingreso pendiente**, que ve el administrador que la resuelve.

En ambos casos hay una razón concreta: un administrador que aprueba una solicitud necesita
distinguir homónimos, y **aprobar a la persona equivocada da acceso a la despensa de una
casa**. El nombre para mostrar no basta para eso. El riesgo está acotado porque el correo solo
se ve tras haber sido admitido, y un hogar es un grupo de convivientes, no una red abierta.

**Fuera de ahí, el email no sale.** En particular, **no** va en los DTOs de autoría de otros
módulos —el «creado por» de recetas, plantillas o movimientos de stock—: ahí bastan
`displayName` y `avatarUrl`. Esos DTOs se leen muchas veces al día, por todo el hogar, y no
resuelven ninguna decisión que dependa de saber el correo de nadie. Añadirlo ahí sería
repartir un dato personal por toda la aplicación a cambio de nada.

## El guardia

`HouseholdAccessService` es el único punto por el que se decide el acceso a un hogar:

- `requireMember(userId, householdId)` → la membresía, o `404`.
- `requireAdmin(userId, householdId)` → la membresía con rol `ADMIN`, o `404` si no es
  miembro, o `403` si lo es pero sin rol.

**Un `householdId` que existe pero al que el usuario no pertenece responde `404`, nunca
`403`.** Un `403` confirmaría que ese identificador corresponde a un hogar real, y con eso se
puede sondear qué hogares existen. El texto del `404` es idéntico en ambos casos, y hay un
test que lo compara byte a byte: si algún día divergen, el `404` deja de proteger nada.

El `403` se reserva para quien sí es miembro y se queda corto de rol, donde ya no se revela
nada que el usuario no supiera.

Se invoca **al inicio** de cada método de servicio con ámbito de hogar, antes de leer o
escribir un solo dato, en este módulo y en todos los que vengan.

## Deuda conocida

Ninguna abierta ahora mismo.

### ~~Montar un `MEMBER` en pruebas se hace saltándose la aplicación~~ · resuelta en el PR 3

Hasta el PR 3 no existía ningún camino HTTP para llegar a ser `MEMBER`, así que los tests de
los PRs 1 y 2 y la guía manual creaban la membresía con un `INSERT` directo. Era una
instrucción de preparación que montaba un estado por una vía que ningún usuario tiene, y por
tanto no comprobaba que ese estado se alcanzase bien.

Con el PR 3 el camino existe y el atajo se ha retirado: el helper `hacerMiembro` de los dos
ficheros de test pide el código, envía la solicitud como el usuario nuevo y la aprueba como
administrador, todo por HTTP. Queda **una** escritura directa, en el reset del test de
concurrencia de R4, y es de otra naturaleza: no monta un estado inalcanzable —dos
administradores se consiguen promoviendo por la API— sino que restablece uno alcanzable 25
veces dentro del bucle que mide la carrera.
