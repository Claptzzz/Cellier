# Orden de ejecución en el arranque y el enrutado

- **Ámbito:** `frontend/src/app`, enrutado y guards
- **Actualizado:** 2026-09-06

Tres trampas de orden de ejecución de Angular. Las tres produjeron bugs reales en el
Incremento 3 y ninguna la detectó un test unitario, porque todas dependen de *cuándo* corre
cada cosa y los tests unitarios montan el router vacío.

Es el equivalente frontend de la sección de orden de bloqueos del backend: una piedra
conocida, escrita donde se va a tropezar con ella. **Si escribes un guard nuevo o una
redirección nueva, lee esto antes.**

La lista completa de comprobaciones, con cuándo ejecutar cada una, está en
`docs/frontend-verificacion.md`. Para lo de este documento: `verify-routing.mjs` para el
enrutado, `verify-startup.mjs` para el arranque, `verify-member-menu.mjs` para los paneles
anclados y `verify-reachability.mjs` para las pantallas huérfanas. Todos navegan la
aplicación real con el backend simulado.

## 0. «Vacío» y «todavía no lo sé» son estados distintos

La regla general de la que las tres trampas siguientes son casos particulares.

Una colección vacía puede significar dos cosas opuestas:

- **«Lo cargué y no hay nada».** Es un hecho sobre el dominio.
- **«Todavía no lo he cargado».** Es un hecho sobre la aplicación, y no dice nada del dominio.

Un `readonly items: T[] = []` no distingue las dos, así que quien lo lea acabará **tomando
una decisión sobre información que aún no existe**. Y el fallo no se ve: el código parece
correcto, los tipos cuadran, y la pantalla equivocada se pinta con toda naturalidad.

Ya costó dos bugs con `households`, ambos en el mismo campo:

- La redirección de la raíz mandaba a «crea tu primer hogar» a alguien con dos hogares,
  porque el arranque aún no había traído el perfil.
- Cuando ese arranque **fallaba**, la misma redirección decidía lo mismo, y el reintento
  posterior obedecía un destino que se había fijado sin datos.

**Cómo se evita.** Modela el estado desconocido de forma explícita y hazlo imposible de
ignorar: `null` frente a `[]`, un `status: 'idle' | 'loading' | 'ready' | 'error'`, o una
señal separada. `MyJoinRequestsService` guarda `readonly items = signal<T[] | null>(null)`
justo por esto, y `loaded()` es lo que distingue «cargado y vacío» de «sin cargar».

**Dónde va a volver a aparecer.** En el Incremento 6, con la despensa: una lista vacía
significa «este hogar no tiene productos» o «aún no cargó», y **la pantalla que se pinta es
distinta** —un estado vacío diseñado, con su llamada a la acción, frente a un skeleton—.
Enseñar «tu despensa está vacía» mientras los datos vienen en camino es decirle al usuario
que perdió sus cosas. Lo mismo valdrá para el catálogo, las plantillas y las recetas.

## 1. Las redirecciones funcionales corren ANTES que los guards

```ts
{ path: 'pantry', redirectTo: () => decidirDestino() }   // ← corre en el reconocimiento
{ path: '',       canActivate: [authGuard], … }          // ← corre después
```

Angular evalúa `redirectTo`, también en su forma de función, durante el **reconocimiento de
la URL**. Eso ocurre antes de que se ejecute ningún `canActivate`. Cargar en un guard el
estado del que depende una redirección llega tarde por construcción.

**Qué pasó.** El perfil se cargaba en `authGuard` y la raíz redirigía al hogar de arranque.
La redirección leía `households` cuando todavía estaba vacío, así que mandaba a la pantalla
de bienvenida a un usuario con dos hogares. Cuatro de trece casos fallaban.

**La regla.** El estado del que dependa una redirección se carga en `provideAppInitializer`,
no en un guard. Hoy eso es el perfil del usuario y, cuando no tiene hogares, sus solicitudes
pendientes.

**El corolario que cuesta ver.** No basta con cargarlo: hay que distinguir «lo cargué y está
vacío» de «no pude cargarlo». Si el arranque falla, `households` también está vacío, y una
redirección que no mire esa diferencia manda a la bienvenida a alguien que sí tiene hogares
—y el reintento posterior obedecerá ese destino equivocado—. Por eso `toActiveHousehold`
comprueba primero `auth.user() === null` y desvía a reconectar.

## 2. Las señales alimentadas por `NavigationEnd` están obsoletas dentro de un guard

`HouseholdContextService` deriva el hogar activo del parámetro de la ruta, y actualiza su
señal al recibir `NavigationEnd`. Ese evento llega **cuando la navegación ya terminó**, es
decir después de los `canActivate`. Dentro de un guard, la señal todavía describe la
navegación *anterior*.

**Qué pasó.** `householdAdminGuard` preguntaba `context.isAdmin()`. Al entrar a
`/h/{casa}/manage` siendo administradora, el hogar activo aún era `null`, así que el guard
rebotaba a `/home` a quien tenía todo el derecho a pasar.

**Lo peor no fue el fallo, fue el test.** El caso del `MEMBER` pasaba en verde: daba «no
admin» porque el hogar activo era `null`, no porque el rol fuera `MEMBER`. Un test que
confirmaba el comportamiento correcto por el motivo equivocado, y que habría seguido pasando
con el guard roto.

**La regla.**

| Dónde | Qué usar |
|---|---|
| Guards | `context.roleIn(route.paramMap.get('householdId'))` — por el id de **su propia ruta** |
| Plantillas y componentes | `context.household()`, `context.myRole()`, `context.isAdmin()` |

Para cuando una plantilla renderiza, la navegación ya terminó y las señales son correctas.
En un guard no, nunca.

## 3. `provideAppInitializer` bloquea el primer pintado

Cargar la sesión antes de enrutar resuelve la trampa 1, pero abre otra: hasta que ese
initializer no resuelve, **Angular no arranca y la página está en blanco**.

**Qué pasó, medido:** con el backend caído, seis segundos de pantalla en blanco y luego un
bucle de redirección entre `/login` y `/`; con el servidor colgado, blanco indefinido y
`<app-root>` sin un solo hijo. El bucle venía de que `guestGuard` y `authGuard` usaban dos
definiciones distintas de «tiene sesión»: uno miraba el refresh token, el otro exigía perfil.

**Las cuatro piezas que lo cierran:**

1. **Estado de carga previo al arranque**, dentro de `<app-root>` en `index.html`. Angular
   reemplaza ese contenido al montar. Aparece con 350 ms de retraso para que un arranque
   rápido no parpadee.
2. **Timeout** (`PROFILE_LOAD_TIMEOUT_MS`, 10 s). Un servidor que no responde no produce
   ningún error: la petición se queda colgada y con ella el arranque. `catchError` no cubre
   ese caso porque no hay error que capturar.
3. **Memoria del fallo** (`isProfileUnreachable`). Sin ella el guard reintentaría y el
   usuario esperaría el timeout dos veces seguidas antes de ver nada.
4. **`/reconnect`, sin guards.** Es el punto de corte del bucle: cualquier guard que exigiera
   el perfil devolvería aquí a quien ya está aquí.

**La distinción que hay que respetar:** sin perfil hay dos causas y no se tratan igual.

- **La sesión sigue en pie** → el problema es el servidor. A `/reconnect`, con reintento.
  Mandar a `/login` sería mentir, y además reabre el bucle.
- **La sesión ya no está** → el interceptor la limpió tras un refresco fallido. A `/login`.

Un 502 no invalida una sesión. Borrar el refresh token por una caída del servidor obligaría
a volver a entrar con Google cuando la sesión nunca dejó de ser válida.

## 4. `position: fixed` dentro del top layer vuelve a mirar a sus ancestros

No es orden de ejecución, pero es de la misma familia: **un componente que funciona en
`/dev/ui` y falla en el chasis**, sin que nada en su código cambie.

`BottomSheet` es un `<dialog>` abierto con `showModal()`, así que vive en el top layer y su
bloque contenedor debería ser el viewport. Llevaba además `position: fixed; inset: 0`, y ahí
está la trampa: **declarar `fixed` explícitamente reintroduce la búsqueda de bloque
contenedor entre los ancestros**, y cualquiera con `transform`, `filter` o `backdrop-filter`
se lo queda.

La cabecera del chasis lleva `backdrop-blur`. Resultado medido, en 375 px:

```
dialogo  { x: 0, y: 0, w: 375, h: 0 }        ← se resolvió contra la cabecera
panel    { x: 0, y: -266, w: 375, h: 266 }   ← fuera de la pantalla, por arriba
culpable HEADER · backdrop-filter: blur(8px)
```

**Y no parecía roto: parecía abierto.** El `::backdrop` sí se pinta a pantalla completa, así
que el fondo se atenuaba como cuando la hoja se abre de verdad. `checkVisibility()` devolvía
`true` —el elemento no está oculto, sólo está fuera de vista—, de modo que una comprobación
automática de visibilidad tampoco lo habría cazado. Se vio mirando la captura.

**El arreglo:** quitar `position: fixed` y dejar que el top layer haga su trabajo, dando al
diálogo `width: 100vw; height: 100dvh; margin: 0`. Medido después: `y: 546, bottom: 812` en
un viewport de 812. Anclado abajo, dentro de vista.

**La regla.** Un elemento del top layer no necesita `position: fixed`, y ponérselo lo
devuelve al sistema de coordenadas de sus ancestros. Si un diálogo o una hoja se coloca mal,
lo primero que hay que mirar es qué ancestro tiene `transform`, `filter`, `backdrop-filter` o
`contain`, no el CSS del propio diálogo.

## 5. Un panel anclado dentro de una fila se sale por abajo

La misma familia que la trampa 4, con otro mecanismo. `Menu` se coloca con
`position: absolute` respecto del disparador, así que **crece hacia abajo desde donde
esté**. Abierto en la primera fila de una lista no pasa nada; abierto en la última, el
panel queda fuera de la pantalla.

Medido en 1440 px, con el disparador a 25 px del borde inferior y el volteo desactivado:

```
panel  { top: 765, bottom: 869 }   viewport: 812   → 57px fuera
dentroDeVista: false · alFrente: false
```

**Y otra vez no está oculto, está fuera de vista.** Un elemento así devuelve `true` en
`checkVisibility()` y pasa cualquier comprobación automática de visibilidad. Solo se caza
midiendo la geometría contra el viewport.

**El arreglo:** `Menu` decide arriba o abajo **midiendo** el sitio que queda, no con una
regla fija. En móvil el problema ni se plantea porque las acciones salen en hoja inferior,
que se ancla al borde de la pantalla por definición.

**Cómo medirlo bien.** Costó tres intentos, y los dos primeros pasaban sin probar nada:

1. `scrollIntoViewIfNeeded` **centra** la fila. El disparador quedaba a 453 px del borde:
   el caso cómodo.
2. Desplazar al fondo de la página tampoco vale: **debajo de la lista hay otra sección**,
   así que la última fila seguía a media altura.
3. Lo que funciona es calcular el desplazamiento a mano para dejar el disparador pegado al
   borde inferior.

`frontend/scripts/verify-member-menu.mjs` hace eso, y comprueba dos cosas y no una: que el
panel esté **dentro de vista** y que `elementFromPoint` en su centro devuelva el propio
panel. Lo segundo caza el caso de estar tapado por otra capa, que la geometría sola no ve.

**La regla.** Si un panel se ancla a un elemento que puede estar en cualquier punto de la
página, su posición es un cálculo, no una constante. Y la prueba tiene que colocar el
disparador **en el peor sitio posible**, no donde sea cómodo llegar.

## 6. Una pantalla sin camino de navegación

No es geometría ni orden de ejecución, pero se descubre igual: **no leyendo el código, sino
recorriendo la aplicación**.

Una ruta puede estar perfectamente declarada, con su guard y su componente, y no tener
ningún enlace ni botón que lleve a ella. Funciona escribiendo la URL, así que en desarrollo
—donde siempre se llega escribiendo la URL— parece terminada.

Aparecieron cuatro:

| Pantalla | Por qué era inalcanzable |
|---|---|
| `/h/:id/manage` | Ningún enlace. El distintivo de solicitudes vivía sobre «Hogar», y esa pantalla no ofrecía el camino a resolverlas |
| `/settings` | Su único enlace estaba en el pie de la barra lateral, oculta por debajo de 1024 px |
| Cerrar sesión | `AuthService.logout()` no lo llamaba **nadie** en toda la aplicación |
| `/onboarding/pending` | El enlace sólo aparecía con solicitudes pendientes, y el servicio ni siquiera se cargaba para quien ya tenía un hogar |

`frontend/scripts/verify-reachability.mjs` recorre la aplicación desde la raíz pulsando
enlaces y botones visibles —saltándose los destructivos— y anota a dónde lleva cada uno.
Una ruta declarada que nunca aparece como destino es una pantalla huérfana.

**Ejecútalo al añadir una pantalla.** Es la comprobación que separa «la ruta existe» de
«se puede llegar».

## 7. Dentro de un `<form>`, `ngModel` llega un tick tarde

El mismo `ui-input`, con el mismo enlace, se comporta distinto según dónde esté:

```html
<form>
  <ui-input [ngModel]="valor()" (ngModelChange)="valor.set($event)" />  <!-- llega tarde -->
</form>
<ui-input [ngModel]="suelto()" (ngModelChange)="suelto.set($event)" />  <!-- llega ya -->
```

Medido con una sonda, tecleando en los dos a la vez y leyendo las señales acto seguido:

```
{ domForm: 'dentro del form', enForm: '', suelto: 'suelto' }
```

El DOM tiene lo tecleado en ambos; el modelo, sólo en el de fuera. Dentro de un `<form>`,
`NgModel` se registra en el `NgForm` y **aplaza** el paso de vista a modelo a una microtarea,
porque el registro del control también es diferido.

**Cómo se ve el fallo.** No como un error: el campo muestra lo que escribes, y lo que cuelga
del valor —un buscador con debounce, un botón que se habilita— sencillamente no reacciona a
tiempo. En un navegador se disimula porque los ticks van y vienen; en un test se ve seco.

**Cómo se evita.** Si el estado del formulario son señales propias y del `<form>` sólo quieres
el envío con Enter, declara los controles `standalone`:

```html
<ui-input [ngModelOptions]="{ standalone: true }" [ngModel]="…" (ngModelChange)="…" />
```

Así no hay registro en el `NgForm` que aplazar. Si de verdad usas el modelo del formulario
—validación, `pristine`, `reset()`— entonces el aplazamiento es parte del trato y lo que hay
que arreglar es el test, esperando la microtarea.

**Dónde apareció.** En `AddItemPanel`, el buscador del catálogo no pedía nada al teclear. Se
tardó una sonda en verlo porque el campo sí mostraba el texto.

## 8. Un efecto depende de TODO lo que lee, incluidas sus guardas

```ts
effect(() => {
  if (this.open() && this.item()) {
    this.load(0);          // load() empieza con: if (this.loading()) return;
  }
});
```

Parece que el efecto depende de `open` y de `item`. Depende también de **`loading`**, porque
`load` la lee y la lectura ocurre dentro del efecto. Y `load` la escribe. El efecto se
redispara con su propia escritura, y la petición sale una y otra vez sin parar.

**Cómo se ve el fallo.** No como un error: la pantalla se queda en los esqueletos para
siempre, porque `loading` nunca llega a false más de un instante. Con el servidor real es una
tormenta de peticiones; en un test se ve como un `expectOne` que encaja pero una vista que no
cambia.

**Cómo se evita.** Aislar el cuerpo con `untracked`, dejando fuera sólo lo que de verdad debe
disparar el efecto:

```ts
effect(() => {
  const item = this.item();
  const open = this.open();
  if (open && item) {
    untracked(() => { this.reset(); this.load(0); });
  }
});
```

La regla general: **lo que se lee para decidir va fuera del `untracked`; lo que se lee para
trabajar va dentro.** Escribir señales dentro de un efecto no crea dependencia; leerlas sí, y
una guarda es una lectura.

**Dónde apareció.** En `ItemDetailPanel`, al abrir el historial de un artículo.

## 9. La igualdad decide si algo ocurre (tres caras del mismo fallo)

Angular no sabe que «pasó algo». Sabe que **un valor es distinto del que vio la última vez**,
comparando con `Object.is`. Cuando la intención es «ocurrió un evento» pero el valor resulta
igual, no ocurre nada, y el código parece correcto porque lo es: lo que falla es la
suposición de que igualdad y ausencia de suceso son lo mismo.

Ha aparecido **tres veces** en este proyecto, con tres disfraces distintos:

| Dónde | Lo que se esperaba | Lo que pasó |
|---|---|---|
| `[value]="algo()"` en un `<input>` | Que el campo enseñe siempre `algo()` | El usuario teclea, Angular anota ese mismo texto como visto; al volver la señal a lo que ya había, no hay cambio que escribir y el campo se queda con lo tecleado |
| `writeValue` en un ControlValueAccessor | Que escribir desde fuera actualice el control | Actualizaba la señal, pero el DOM sólo cambia si la interpolación ve una diferencia |
| `computed(() => this.householdId())` como disparador | Que subir un contador de recarga vuelva a pedir | El contador cambia, el `computed` recalcula **al mismo valor**, y un `computed` que no cambia no notifica |

**La regla común:** si lo que quieres es que algo **ocurra**, no lo cuelgues de un valor que
puede repetirse. Tienes tres salidas, según el caso:

1. **Haz que el valor no pueda repetirse.** Un `computed` que devuelve un objeto nuevo
   —`{ householdId, token }`— nunca es `Object.is`-igual al anterior. Es lo que usan
   `PantryStore` y `TemplateStore`.
2. **No dependas de la comparación.** Un `effect` reacciona a la señal, no a lo que Angular
   recuerde haber pintado. Es lo que hace `mirrorToNative` para los tres controles de
   `shared/ui`.
3. **Escribe el efecto tú.** Si hay que tocar el DOM, tócalo, comparando contra el DOM y no
   contra el historial del binding: `if (el.value !== next) el.value = next`.

**Cómo se reconoce en la naturaleza.** Los tres se vieron igual: *«esto debería haber pasado
y no pasó, pero no hay ningún error»*. No hay excepción, no hay log, y el estado interno es
correcto. Si estás depurando algo que «no reacciona» y el valor que miras es el que esperas,
sospecha de esto antes que del framework.


## 10. Un panel absoluto sin ancestro posicionado se ancla al viewport

**Síntoma.** En 1440, el menú de los tres puntos de una fila de `/h/:id/templates` no abría
un panel junto al disparador: abría una banda a todo lo ancho pegada al borde inferior de
la pantalla, encima del sidebar y sin decir sobre qué plantilla actuaba.

**Causa.** `.ui-menu-panel` es `position: absolute`, y el host `ui-menu` es
`display: contents`, así que no genera caja. El bloque contenedor del panel es el ancestro
**posicionado** más cercano. `templates-page` no envolvía disparador y panel en un
`relative` —lo hacen los otros cuatro consumidores— así que ese ancestro pasó a ser el
bloque contenedor inicial, o sea el viewport. Medido: `panel.offsetParent === document.body`.

De ahí salen las dos mitades del desastre, y conviene separarlas:

- **La posición.** `top: calc(100% + 6px)` se resolvía contra el alto del viewport: el panel
  empezaba en y = 906 en una ventana de 900. `align="end"` → `right: 0` lo pegaba al borde
  derecho de la pantalla, no al del botón.
- **El ancho.** `min-width: max(100%, 264px)` se resolvía contra los 1440 px del viewport, y
  **`min-width` gana siempre a `max-width`**: el tope de 340 px no pintaba nada. Esta parte
  habría fallado igual con el `relative` puesto en la fila entera en vez de en un contenedor
  ajustado al botón, porque la fila mide 672 px.

**Arreglo.** Tres capas, porque una sola volvería a fallar en silencio:

1. `<div class="relative shrink-0">` alrededor de disparador y panel, ajustado al botón.
2. `min-width: min(max(100%, 264px), 340px, calc(100vw - 24px))`: el mínimo se acota con su
   propio máximo, así que ningún contenedor puede volver a convertir el panel en una banda.
3. `ui-menu` comprueba en dev su propio `offsetParent` al abrirse y lanza si es el `body`.

**Por qué el arnés no lo vio, que es el hallazgo de verdad.** La escena
`plantillas-acciones` existía desde el primer PR, en 375 y 1440, claro y oscuro. El fallo
**sale en la captura**. Lo que faltaba no era la escena: era la afirmación. Lo único que la
escena medía era `overflowPx`, y un panel de 1440 px de ancho dentro de un viewport de
1440 px **no desborda**. Una captura es una fotografía, no una comprobación; nadie la mira
salvo que algo obligue a mirarla.

Ahora la escena mide, en las dos anchuras: que el panel esté dentro de vista, que
`elementFromPoint` en su centro caiga dentro de él, que se titule con el nombre de la
plantilla, que en 1440 se alinee con el disparador (±4 px) y no se separe de él más de
24 px, y que en 375 sea una hoja modal que tape la navegación de debajo. Todas se
falsificaron quitando el `relative` y cambiando `showModal()` por `show()`.

**Dos agujeros que aparecieron al escribir la propia comprobación** —la moraleja se repite—:

- `document.querySelector('.ui-sheet-panel')` devolvía la hoja **cerrada** del selector de
  hogar, que va antes en el DOM. Hay que anclar en `dialog.ui-sheet[open]`.
- La comprobación de que la hoja tapa la navegación cogía `aside a`, que en 375 existe con
  caja de 0×0. Se contestaba sola. Ahora se coge el primer enlace **visible**, y no
  encontrar ninguno es un fallo, no una omisión.

**Bonus: `align` es un atributo HTML de presentación.** El input se llama `align`, así que
`<ui-menu align="end">` deja un `align="end"` en el DOM y el navegador lo traduce a
`text-align: end` heredado por todo el panel. Llevaba así desde el Incremento 4 y no se veía
porque el contenido eran todo filas flex; el título, que es un bloque, lo sacó a la luz.
`.ui-menu-panel` lleva ahora `text-align: start` explícito.

**Regla.** Un `ui-menu` va siempre dentro de un contenedor `relative` **ajustado al
disparador**, no a la fila. Y toda escena del arnés que abra algo flotante afirma dónde está,
no sólo que no desborda. El caso general —ya van tres— está en la sección 11.

## 11. El bloque contenedor nunca es el que uno supone

Las secciones 4 y 10 y el `ui-dialog` del Incremento 6 son **el mismo fallo tres veces**, con
tres mecanismos distintos. Vale la pena verlos juntos, porque por separado cada uno parece un
detalle de CSS y juntos son una regla.

| Cuándo | Qué se suponía | Qué pasó de verdad | Cómo se vio |
| --- | --- | --- | --- |
| Inc. 4 · `ui-bottom-sheet` | Un `<dialog>` en el top layer se resuelve contra el viewport | `position: fixed` escrito a mano lo devolvió a buscar entre sus ancestros, y la cabecera con `backdrop-filter` se lo quedó. Panel en y = −266 | Mirando una captura |
| Inc. 6 · `ui-dialog` | El navegador centra un modal | Lo centra con `margin: auto`, y el reset de estilos lo había borrado. Pegado a la esquina superior izquierda | Primera captura del componente ABIERTO |
| Inc. 8 · `ui-menu` | Un panel `absolute` se resuelve contra su fila | El host es `display: contents` y la fila no era `relative`: se resolvió contra el viewport. Banda de 1440 px pegada abajo | Una persona usando la aplicación |

**Lo que comparten.** Los tres son elementos que se colocan **respecto de otra cosa**, y en
los tres esa otra cosa resultó no ser la que el componente daba por hecha. Ninguno lanzó un
error. Ninguno estaba oculto: `checkVisibility()` devolvía `true` en los tres, porque estar
fuera de sitio no es estar oculto. En los tres el fondo atenuado o el panel se pintaban, así
que **desde fuera parecían funcionar**.

Y los tres tuvieron un ancestro como culpable, nunca el propio componente:

- `transform`, `filter`, `backdrop-filter`, `contain`, `perspective` o `will-change` en
  cualquier ancestro capturan un descendiente `fixed`.
- Un reset de `margin` global desactiva el centrado nativo de `showModal()`.
- La falta de un ancestro **posicionado** manda un `absolute` al bloque contenedor inicial, y
  `display: contents` en el propio host garantiza que el componente no pueda ser ese ancestro.

**La regla.** Todo componente que posicione algo en absoluto —`absolute`, `fixed`, o un
elemento del top layer que además declare posición— **comprueba su propio `offsetParent` en
dev; no lo supone**. Es una línea al abrirse:

```ts
const padre = panel.offsetParent;
if (isDevMode() && (!padre || padre === document.body)) {
  throw new Error('<componente> no tiene ancestro posicionado: ...');
}
```

`ui-menu` ya la lleva. Los demás componentes que posicionen algo la llevan desde el momento en
que se escriban, y al revisar uno existente se le añade. Dos apuntes prácticos:

- **El canal es la consola, no `pageerror`.** Angular atrapa la excepción con su `ErrorHandler`
  y la reporta como error de consola. Medido: `page.on('pageerror')` no ve nada,
  `page.on('console')` sí. Por eso `shots.mjs` vigila la consola.
- **Una comprobación de geometría no sustituye a ésta.** `elementFromPoint` en el centro del
  panel devolvía un hijo del panel también con el fallo puesto: el panel estaba mal colocado,
  pero era lo más alto en su propio centro. Preguntar por el `offsetParent` es preguntar por la
  causa; medir la caja es preguntar por el síntoma. Hacen falta las dos.
