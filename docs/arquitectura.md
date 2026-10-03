# Arquitectura

Cellier es un **monolito modular** (ver [ADR 012](adr/012-monolito-modular.md)): un único
proceso Spring Boot, empaquetado junto con la SPA de Angular en un solo JAR, organizado por
dominio en vez de por capa técnica transversal.

## Diagrama de capas

Dentro de cada módulo de dominio, el código se organiza en las mismas tres capas:

```mermaid
flowchart TB
    subgraph web["Capa web"]
        direction LR
        C1["*Controller<br/>(@RestController)"]
        D1["DTOs<br/>(records, Bean Validation)"]
    end

    subgraph app["Capa de aplicación / dominio"]
        direction LR
        S1["*Service<br/>(reglas de negocio, transacciones)"]
        E1["Entidades JPA"]
    end

    subgraph data["Capa de datos"]
        direction LR
        R1["*Repository<br/>(Spring Data JPA)"]
        PG[(PostgreSQL)]
    end

    C1 --> D1
    C1 --> S1
    S1 --> E1
    S1 --> R1
    R1 --> E1
    R1 --> PG

    classDef layer fill:transparent,stroke-dasharray: 3 3;
    class web,app,data layer
```

- Los **controladores** sólo traducen HTTP ↔ DTO y delegan toda regla de negocio al service.
  No hay lógica de dominio en un `@RestController`.
- Las **entidades JPA nunca cruzan la frontera del controlador**: lo que sale y entra por la
  API son siempre DTOs con Bean Validation, mapeados con MapStruct.
- El esquema de base de datos lo gobierna Flyway, no Hibernate (`ddl-auto: validate`, ver
  [ADR 019](adr/019-flyway-ddl-auto-validate.md)): la capa de datos valida contra migraciones
  versionadas, no las genera.

## Diagrama de módulos

```mermaid
flowchart TB
    shared["shared<br/><small>ProblemDetail, OpenApiConfig, filtros, DatabaseCleaner</small>"]

    identity["identity<br/><small>login Google, JWT propio, refresh, cuenta</small>"]
    household["household<br/><small>hogares, membresía, solicitudes de ingreso</small>"]
    catalog["catalog<br/><small>catálogo de productos</small>"]
    pantry["pantry<br/><small>despensa, movimientos de stock</small>"]
    template["template<br/><small>plantillas, reporte de compras</small>"]
    recipe["recipe<br/><small>recetas, disponibilidad</small>"]

    household -. "puerto: UserHouseholdsView<br/>UserHouseholdOffboarding" .-> identity
    catalog --> household
    pantry --> household
    pantry --> catalog
    template --> household
    template --> catalog
    template --> pantry
    recipe --> household
    recipe --> catalog
    recipe --> pantry

    identity --> shared
    household --> shared
    catalog --> shared
    pantry --> shared
    template --> shared
    recipe --> shared
```

**La flecha de `household` hacia `identity` es un puerto, no una dependencia directa.**
`identity` no importa nada de `household`: define interfaces (`UserHouseholdsView`,
`UserHouseholdOffboarding`) que `household` implementa, y las invoca a través de ellas. Así,
dar de baja una cuenta (en `identity`) puede desafiliarla de todos sus hogares (en `household`)
sin que el módulo de más bajo nivel dependa del de más alto nivel.

El resto de flechas son dependencias directas de servicio: por ejemplo, `pantry` consulta
`catalog` para resolver o crear un producto al dar de alta un artículo de despensa.

## Diagrama de despliegue

```mermaid
flowchart TB
    subgraph client["Navegador"]
        spa["SPA Angular<br/>(servida como estáticos)"]
    end

    subgraph host["Host / contenedor de la aplicación"]
        jar["cellier-0.0.1-SNAPSHOT.jar<br/><small>Tomcat embebido · puerto 8080</small>"]
    end

    subgraph db_host["Contenedor Docker"]
        pg[("PostgreSQL 16<br/><small>puerto 5433 → 5432</small>")]
    end

    google["Google Identity Services<br/>(JWKS)"]

    client <-- "HTTPS<br/>/api/**, /, /swagger-ui.html" --> jar
    jar <-- "JDBC" --> pg
    client -. "ID token (login)" .-> google
    jar -. "valida firma del ID token<br/>(JWKS, sin client secret)" .-> google
```

Un único artefacto desplegable: el JAR de Spring Boot sirve tanto la API REST como los
estáticos de la SPA (perfil Maven `frontend`, ver el README). No hay un servidor web separado
para el frontend ni un API Gateway: Tomcat embebido atiende ambos. La única pieza externa es
PostgreSQL, en su propio contenedor. Google sólo interviene en el intercambio inicial de login
(ver [ADR 013](adr/013-jwt-propio-sobre-google.md)); ninguna petición posterior a la API
depende de que Google esté disponible.

## Flujo de autenticación

```mermaid
sequenceDiagram
    actor U as Usuario
    participant SPA as SPA Angular
    participant G as Google Identity Services
    participant API as Cellier API
    participant DB as PostgreSQL

    U->>SPA: Click "Iniciar sesión"
    SPA->>G: Solicita credencial
    G-->>U: Pantalla de cuentas de Google
    U->>G: Elige cuenta
    G-->>SPA: ID token (JWT firmado por Google)

    SPA->>API: POST /api/v1/auth/google { idToken }
    API->>G: Obtiene JWKS (con caché)
    API->>API: Valida firma, issuer, audiencia,<br/>vigencia y correo verificado
    alt ID token inválido
        API-->>SPA: 401 Problem Detail
    else ID token válido
        API->>DB: Busca o crea el usuario por google_sub
        API->>API: Emite access token (JWT, 15 min)<br/>y refresh token (opaco, 30 días)
        API->>DB: Guarda SHA-256(refresh token)
        API-->>SPA: 200 { accessToken, refreshToken, user }
    end

    SPA->>SPA: Guarda ambos tokens

    loop Cada petición autenticada
        SPA->>API: Authorization: Bearer accessToken
        API->>API: Verifica firma HMAC y vigencia<br/>(sin llamar a Google)
        API-->>SPA: Respuesta
    end

    Note over SPA,API: El access token caduca a los 15 minutos

    SPA->>API: POST /api/v1/auth/refresh { refreshToken }
    API->>DB: Verifica hash, no revocado, no caducado
    alt Refresh token ya usado (reutilización)
        API->>DB: Revoca TODAS las sesiones del usuario
        API-->>SPA: 401 Problem Detail
    else Refresh token válido
        API->>DB: Revoca el refresh token presentado
        API->>API: Emite un par nuevo (rotación)
        API->>DB: Guarda SHA-256(refresh token nuevo)
        API-->>SPA: 200 { accessToken, refreshToken }
    end
```

Detalle completo del intercambio y de por qué el ID token de Google no se reutiliza como
credencial de la API en [ADR 013](adr/013-jwt-propio-sobre-google.md).
