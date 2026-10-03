# ADR 013 — Credenciales propias de Cellier, no el ID token de Google

- **Estado:** aceptada
- **Fecha:** 2026-10-01
- **Ámbito:** `com.cellier.identity` (`AuthService`, `TokenService`, `JwtAuthenticationFilter`)

## Contexto

Cellier usa Google Sign-In para identificar a la persona: el frontend obtiene un ID token de
Google Identity Services. La pregunta es qué credencial usa la API para las peticiones
siguientes — ¿se reenvía ese mismo ID token en cada llamada, o la API emite las suyas?

El ID token de Google tiene una vigencia corta (en torno a una hora), no se puede revocar del
lado de Cellier, y su `aud` identifica una aplicación cliente de Google, no un conjunto de
permisos ni una sesión propia del sistema.

## Decisión

El ID token de Google **solo sirve para el intercambio inicial**, en
`POST /api/v1/auth/google`. Ahí se valida contra el JWKS de Google (firma, emisor, audiencia,
vigencia, correo verificado) y, si es válido, Cellier emite sus propias credenciales: un
access token JWT (HMAC, 15 minutos) y un refresh token opaco (30 días, solo su hash SHA-256
se persiste). A partir de ahí, toda petición lleva `Authorization: Bearer <accessToken>` de
Cellier, nunca el token de Google.

## Consecuencias

1. **Cellier controla la revocación de sus propias sesiones.** Reutilizar un refresh token ya
   gastado revoca todas las sesiones del usuario; eso no sería posible operando directamente
   sobre tokens de Google, que la API no puede invalidar.
2. **El acceso no depende de que Google esté disponible en cada petición.** Solo se consulta el
   JWKS de Google en el intercambio inicial; validar el access token propio es una operación
   local (verificar una firma HMAC), sin llamada de red.
3. **El sistema no queda atado a un único proveedor de identidad.** Añadir otro método de login
   más adelante significaría sumar otro canje hacia el mismo emisor de credenciales propio, sin
   tocar el resto de la API.
4. **Hay un emisor de JWT adicional que mantener.** Cellier es responsable de su propio secreto
   HMAC, de la rotación del refresh token y de no filtrar el valor en claro (solo se guarda su
   hash) — superficie que no existiría si se delegara por completo en Google.
