package com.cellier.identity.web;

import com.cellier.identity.AuthService;
import com.cellier.identity.dto.AuthResponse;
import com.cellier.identity.dto.GoogleLoginRequest;
import com.cellier.identity.dto.LogoutRequest;
import com.cellier.identity.dto.RefreshRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Auth", description = """
        Inicio de sesión con Google y gestión de las credenciales propias de Cellier.

        El cliente obtiene un ID token de Google Identity Services y lo canjea aquí. El ID
        token de Google **no** sirve como credencial de la API: Cellier emite su propio par
        access/refresh y solo acepta esos.
        """)
public class AuthController {

    private static final String EXAMPLE_AUTH_RESPONSE = """
            {
              "accessToken": "eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJjZWxsaWVyIiwic3ViIjoiM2YxYzlhMmUtNWI3ZC00YTEwLTljODgtMmYwZTZiNGQxYTczIn0.firma",
              "refreshToken": "Yk9sM3RQb1JmVGpXd0hxTmJHc0ttWnhEdkFlUnVMY1E",
              "expiresIn": 900,
              "user": {
                "id": "3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73",
                "email": "ana.rivas@gmail.com",
                "displayName": "Ana Rivas",
                "avatarUrl": "https://lh3.googleusercontent.com/a/ACg8ocK",
                "locale": "es-CL",
                "themePreference": "SYSTEM",
                "createdAt": "2026-08-24T20:15:30Z"
              }
            }""";

    private static final String EXAMPLE_INVALID_TOKEN = """
            {
              "type": "https://cellier.app/problems/unauthorized",
              "title": "No autenticado",
              "status": 401,
              "detail": "El ID token de Google no es válido.",
              "instance": "/api/v1/auth/google"
            }""";

    private static final String EXAMPLE_INVALID_REFRESH = """
            {
              "type": "https://cellier.app/problems/unauthorized",
              "title": "No autenticado",
              "status": 401,
              "detail": "El refresh token no es válido.",
              "instance": "/api/v1/auth/refresh"
            }""";

    private static final String EXAMPLE_VALIDATION = """
            {
              "type": "https://cellier.app/problems/bad-request",
              "title": "Datos inválidos",
              "status": 400,
              "detail": "Uno o más campos del cuerpo de la petición no son válidos.",
              "instance": "/api/v1/auth/google",
              "errors": { "idToken": "El idToken es obligatorio" }
            }""";

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @Operation(
            summary = "Iniciar sesión con Google",
            description = """
                    Valida el ID token contra el JWKS de Google (firma, emisor, audiencia,
                    vigencia y correo verificado) y devuelve credenciales de Cellier.

                    El usuario se identifica por el claim `sub` de Google: si ya existe se le
                    actualizan nombre, avatar y correo; si no, se crea la cuenta.

                    Endpoint público: no requiere `Authorization`.
                    """,
            security = {})
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Sesión iniciada.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = AuthResponse.class),
                            examples = @ExampleObject(name = "sesionIniciada", value = EXAMPLE_AUTH_RESPONSE))),
            @ApiResponse(responseCode = "400", description = "Falta el idToken o el cuerpo no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "faltaIdToken", value = EXAMPLE_VALIDATION))),
            @ApiResponse(responseCode = "401", description = "El ID token de Google no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "tokenInvalido", value = EXAMPLE_INVALID_TOKEN)))
    })
    @PostMapping(path = "/google",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public AuthResponse loginWithGoogle(@Valid @RequestBody GoogleLoginRequest request) {
        return authService.loginWithGoogle(request.idToken());
    }

    @Operation(
            summary = "Renovar el par de tokens",
            description = """
                    Canjea un refresh token vigente por un par nuevo.

                    **Los refresh token rotan**: el que se presenta queda revocado en la misma
                    operación. Reutilizar uno ya gastado devuelve 401 y, por precaución, revoca
                    todas las sesiones vivas del usuario, porque indica que el token circula
                    fuera del cliente legítimo.

                    Endpoint público: se autentica con el propio refresh token, no con `Authorization`.
                    """,
            security = {})
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Par de tokens renovado.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = AuthResponse.class),
                            examples = @ExampleObject(name = "renovado", value = EXAMPLE_AUTH_RESPONSE))),
            @ApiResponse(responseCode = "400", description = "Falta el refreshToken.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class))),
            @ApiResponse(responseCode = "401", description = "El refresh token no existe, ya se usó, se revocó o caducó.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "refreshInvalido", value = EXAMPLE_INVALID_REFRESH)))
    })
    @PostMapping(path = "/refresh",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public AuthResponse refresh(@Valid @RequestBody RefreshRequest request) {
        return authService.refresh(request.refreshToken());
    }

    @Operation(
            summary = "Cerrar sesión",
            description = """
                    Revoca el refresh token indicado. El access token que siga vivo caduca por
                    su cuenta en cuestión de minutos.

                    Es idempotente: cerrar sesión con un token ya inválido responde igualmente
                    204, para no revelar si ese token existió alguna vez.

                    Endpoint público: se identifica por el propio refresh token.
                    """,
            security = {})
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Sesión cerrada.", content = @Content),
            @ApiResponse(responseCode = "400", description = "Falta el refreshToken.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class)))
    })
    @PostMapping(path = "/logout", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Void> logout(@Valid @RequestBody LogoutRequest request) {
        authService.logout(request.refreshToken());
        return ResponseEntity.noContent().build();
    }
}
