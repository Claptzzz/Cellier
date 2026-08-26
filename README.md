# Cellier

Web app monolítica para administrar la despensa compartida de un hogar.

Backend Spring Boot y frontend Angular viven en el mismo repositorio y se empaquetan en **un
único JAR**: el backend sirve la API REST y también los estáticos de la SPA.

```
.
├── backend/     Spring Boot 4.1.1 · Java 25 · Maven
├── frontend/    Angular 22 · standalone · signals · zoneless · TailwindCSS v4
├── docs/        ADRs y documentación de diseño
└── docker-compose.yml
```

## Requisitos

| Herramienta | Versión | Nota |
|---|---|---|
| JDK | 25 o superior | el backend compila con `--release 25` |
| Node.js | 22 o superior | solo para trabajar el frontend en dev |
| Docker + Compose | reciente | para la base de datos |
| Maven | — | no hace falta instalarlo: usa `./mvnw` |

## Puesta en marcha

### 1. Variables de entorno (primer paso, antes de todo lo demás)

```bash
cp .env.example .env
```

Este paso no es opcional ni se puede posponer: **`.env` es la única fuente de
configuración local**, y la leen tanto Docker Compose como el backend. Sin él, Compose y
Spring caen a sus valores por defecto y, aunque hoy coinciden, cualquier ajuste que hagas
después sólo llegaría a la mitad del sistema.

Edita `.env` y pon una contraseña real en `DB_PASSWORD`. El archivo está en `.gitignore` y
no se versiona nunca.

#### El client id de Google va aquí, y solo aquí

`GOOGLE_CLIENT_ID` en `.env` es la **única fuente** del client id. El backend lo lee de ahí
y lo exige como `aud` de cada ID token; el frontend lo obtiene del mismo sitio porque
`npm start`, `npm run build` y `npm test` ejecutan antes `sync-env`, que genera
`frontend/src/environments/environment.development.ts` y `environment.prod.ts` a partir de
`.env`.

Esos dos archivos están en `.gitignore` y **nunca se editan a mano**: son artefactos
generados. Sus plantillas versionadas (`environment.development.example.ts` y
`environment.prod.example.ts`) documentan la forma del archivo por si prefieres escribirlo
tú. `environment.ts`, que sí se versiona, lleva el client id vacío a propósito: un valor con
pinta de real se copia a producción y nadie se entera hasta que el login devuelve 401.

Si backend y frontend usaran client ids distintos, el login fallaría con un 401 sin más
pista, porque el backend rechazaría el token por audiencia. Derivarlo de `.env` hace que esa
divergencia no pueda ocurrir.

> Un client id de OAuth para aplicación web **es público**: viaja en el bundle del navegador
> por diseño. Lo secreto es el *client secret*, que Cellier no usa ni necesita, porque valida
> el ID token contra el JWKS de Google en vez de hacer un intercambio de código.

> **Ojo con cambiar `DB_PASSWORD` después de haber levantado la base.** PostgreSQL fija la
> contraseña sólo la primera vez que inicializa su volumen. Si la cambias más tarde, el
> contenedor conserva la antigua y el backend fallará al conectar. Para aplicarla hay que
> recrear el volumen: `docker compose down -v && docker compose up -d`, lo que borra los
> datos.

### 2. Base de datos

```bash
docker compose up -d
```

Levanta PostgreSQL 16 con un volumen nombrado (`cellier-pgdata`), de modo que los datos
sobreviven a `docker compose down`. Para comprobar que está lista:

```bash
docker compose ps          # debe decir "healthy"
```

Para borrar también los datos: `docker compose down -v`.

#### Por qué el puerto es 5433 y no 5432

Postgres se publica en el host en **5433**, no en el 5432 de costumbre. Es deliberado: en
muchas máquinas de desarrollo ya hay un PostgreSQL instalado en el sistema escuchando en
5432, y el choque no se manifiesta como un conflicto de puertos sino como un error de
credenciales desconcertante:

```
FATAL: role "cellier" does not exist
```

El mensaje engaña porque el contenedor sí tiene ese rol. Lo que ocurre es que el backend
nunca llegó al contenedor: se conectó al Postgres del sistema, que obviamente no conoce a
`cellier`. Usar 5433 evita el solapamiento de raíz.

El valor está alineado en los tres sitios que lo mencionan (`.env.example`,
`docker-compose.yml` y el perfil `dev` de `application.yml`), y todos lo leen de la misma
variable `DB_PORT`. Si 5433 también está ocupado en tu máquina, cámbialo **sólo en `.env`**
y los tres lo seguirán.

### 3. Backend en desarrollo

```bash
cd backend
./mvnw spring-boot:run
```

Arranca en <http://localhost:8080> con el perfil `dev`. No hay que exportar nada a mano:
el backend lee `.env` por su cuenta mediante `spring-dotenv`, que lo carga como
PropertySource antes de crear la fuente de datos.

Detalles que conviene conocer:

- **Las variables reales del entorno mandan sobre `.env`.** La biblioteca inserta su
  PropertySource justo después de `systemEnvironment`, así que un `DB_PORT` exportado en la
  shell, o inyectado por el CI, gana. `.env` es el valor por defecto local, no una
  imposición.
- **`spring-boot:run` arranca con la raíz del repositorio como directorio de trabajo**
  (`workingDirectory` en el `pom.xml`), que es donde viven `.env` y `docker-compose.yml`.
  Por eso `./mvnw spring-boot:run` desde `backend/` y `java -jar` desde la raíz encuentran
  el mismo archivo.
- **Los tests no cargan `.env`.** Su base de datos la provee Testcontainers, y dejar que el
  archivo local se colara haría que las pruebas dependieran de la máquina.
- Si `.env` no existe, la aplicación arranca igual con los valores por defecto de
  `application.yml` (`ignore-if-missing`). En producción lo normal es no tener archivo y
  pasar variables de entorno reales.

Puntos de entrada:

| URL | Qué es |
|---|---|
| <http://localhost:8080/swagger-ui.html> | **Swagger UI**, documentación interactiva de la API |
| <http://localhost:8080/v3/api-docs> | Documento OpenAPI en JSON |
| <http://localhost:8080/api/v1/health> | Sondeo público: `{"status":"UP","service":"cellier"}` |
| <http://localhost:8080/actuator/health> | Sonda de Actuator |

### 4. Frontend en desarrollo

En otra terminal, con el backend ya corriendo:

```bash
cd frontend
npm install     # solo la primera vez
npm start
```

`npm start` ejecuta `sync-env` antes de levantar el servidor, así que el client id de Google
se toma del `.env` de la raíz sin ningún paso manual. Si aún no lo has configurado, la
aplicación arranca igual y `/login` avisa de que falta.

Sirve en <http://localhost:4200>. Las llamadas a `/api` se redirigen a
`http://localhost:8080` mediante `proxy.conf.json`, así que no hay CORS que configurar.

La pantalla inicial es un marcador de posición: consulta `/api/v1/health` y muestra si
alcanza al backend. Sirve para confirmar que el proxy funciona.

## Construir el JAR único

```bash
cd backend
./mvnw -Pfrontend clean package
```

El perfil `frontend` instala una toolchain de Node aislada (en `backend/.frontend-toolchain`,
sin tocar el Node del sistema), ejecuta `npm ci` y el build de producción de Angular, y copia
el resultado a `target/classes/static`.

```bash
java -jar target/cellier-0.0.1-SNAPSHOT.jar
```

Con eso, <http://localhost:8080> sirve la SPA y la API desde el mismo proceso. Las rutas del
router de Angular funcionan al recargar la página: las rutas desconocidas se reenvían a
`index.html`, sin interceptar `/api/**`, `/swagger-ui/**`, `/v3/api-docs/**` ni `/actuator/**`.

Sin el perfil `-Pfrontend`, `./mvnw clean package` construye solo el backend (más rápido para
iterar en la API).

## Autenticación

Cellier usa Google Sign-In para identificar al usuario, pero **no** reutiliza el token de
Google como credencial de la API:

1. El frontend obtiene un ID token de Google Identity Services.
2. Lo envía a `POST /api/v1/auth/google`.
3. El backend valida ese ID token contra el JWKS de Google (firma, emisor, audiencia,
   vigencia y correo verificado) y emite **credenciales propias**: un access token JWT de
   15 minutos y un refresh token opaco de 30 días.
4. A partir de ahí, cada petición viaja con `Authorization: Bearer <accessToken>`.

Detalles que conviene conocer al integrar el cliente:

- **El refresh token rota.** Cada llamada a `/api/v1/auth/refresh` revoca el token
  presentado y entrega uno nuevo. Guarda siempre el último.
- **Reutilizar un refresh token gastado revoca todas las sesiones del usuario.** Es la
  respuesta a que ese token esté circulando fuera del cliente legítimo.
- En la base de datos solo vive el **SHA-256** del refresh token, nunca el valor en claro.
- Un 401 con detalle `Se requiere un access token válido` significa que no mandaste token;
  uno con `El access token no es válido o ha caducado` significa que toca refrescar.
- Los errores se devuelven como `application/problem+json` (RFC 9457) y nunca incluyen
  trazas de pila.

### Configurar el client id de Google

En la [consola de Google Cloud](https://console.cloud.google.com/apis/credentials) crea una
credencial OAuth 2.0 de tipo *aplicación web*, añade `http://localhost:4200` a los orígenes
autorizados y copia el client id a tu `.env`:

```
GOOGLE_CLIENT_ID=123456789012-ejemplo.apps.googleusercontent.com
JWT_SECRET=$(openssl rand -base64 48)
```

Es el único sitio donde se pone: el frontend lo deriva de ahí (ver
[El client id de Google va aquí, y solo aquí](#el-client-id-de-google-va-aquí-y-solo-aquí)).
Tras cambiarlo, vuelve a arrancar el frontend para que `sync-env` regenere sus archivos.

Sin un `GOOGLE_CLIENT_ID` real, la aplicación arranca igual y el resto de la API funciona,
pero `POST /api/v1/auth/google` rechazará cualquier token con 401.

## Pruebas

```bash
cd backend  && ./mvnw test          # backend (usa Testcontainers: requiere Docker)
cd frontend && npx ng test --watch=false   # frontend
```

## Perfiles de configuración

| Perfil | Cuándo | Comportamiento |
|---|---|---|
| `dev` | por defecto | valores por defecto pensados para el `docker-compose` de este repo; Swagger UI activo |
| `prod` | `SPRING_PROFILES_ACTIVE=prod` | **sin valores por defecto**: si falta una variable, la app no arranca; Swagger UI apagado salvo `SWAGGER_UI_ENABLED=true` |

Todas las variables están documentadas en `.env.example`.

En `prod` las variables se pasan por el entorno real (contenedor, systemd, plataforma). Un
`.env` presente también sirve, porque `spring-dotenv` lo carga en cualquier perfil, pero el
entorno real siempre tiene prioridad sobre el archivo.

## Convenciones del proyecto

- El esquema de base de datos se cambia **solo** con migraciones Flyway nuevas en
  `backend/src/main/resources/db/migration`. Una migración ya aplicada no se edita jamás.
- Las entidades JPA no cruzan la frontera de los controllers: siempre DTOs con Bean Validation.
- Todo endpoint nuevo se documenta con anotaciones OpenAPI en el mismo cambio en que se crea.
- Todo endpoint que recibe un `householdId` valida la membresía del usuario autenticado antes
  de tocar datos. Un hogar ajeno responde `404`, nunca `403`.
- El backend se organiza por feature: `identity`, `household`, `catalog`, `pantry`,
  `template`, `recipe`, más `shared` para lo transversal.

Las decisiones de arquitectura se registran en [`docs/adr/`](docs/adr/).
