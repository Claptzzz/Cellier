package com.cellier.identity.web;

import com.cellier.identity.AuthService;
import com.cellier.identity.dto.UpdateProfileRequest;
import com.cellier.identity.dto.UserProfileResponse;
import com.cellier.shared.config.OpenApiConfig;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
@Tag(name = "Me", description = "Perfil del usuario autenticado.")
@SecurityRequirement(name = OpenApiConfig.BEARER_SCHEME)
public class MeController {

    private static final String EXAMPLE_PROFILE = """
            {
              "id": "3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73",
              "email": "ana.rivas@gmail.com",
              "displayName": "Ana Rivas",
              "avatarUrl": "https://lh3.googleusercontent.com/a/ACg8ocK",
              "locale": "es-CL",
              "themePreference": "SYSTEM",
              "createdAt": "2026-08-24T20:15:30Z",
              "households": [
                {
                  "id": "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98",
                  "name": "Casa Rivas",
                  "role": "ADMIN",
                  "memberCount": 3
                }
              ]
            }""";

    private static final String EXAMPLE_PROFILE_UPDATED = """
            {
              "id": "3f1c9a2e-5b7d-4a10-9c88-2f0e6b4d1a73",
              "email": "ana.rivas@gmail.com",
              "displayName": "Ana R.",
              "avatarUrl": "https://lh3.googleusercontent.com/a/ACg8ocK",
              "locale": "es-CL",
              "themePreference": "DARK",
              "createdAt": "2026-08-24T20:15:30Z",
              "households": [
                {
                  "id": "8c2b7e14-9a3d-4f60-b1c5-0d7e2a6f4b98",
                  "name": "Casa Rivas",
                  "role": "ADMIN",
                  "memberCount": 3
                }
              ]
            }""";

    private static final String EXAMPLE_UNAUTHORIZED = """
            {
              "type": "https://cellier.app/problems/unauthorized",
              "title": "No autenticado",
              "status": 401,
              "detail": "Se requiere un access token válido.",
              "instance": "/api/v1/me"
            }""";

    private static final String EXAMPLE_VALIDATION = """
            {
              "type": "https://cellier.app/problems/bad-request",
              "title": "Datos inválidos",
              "status": 400,
              "detail": "Uno o más campos del cuerpo de la petición no son válidos.",
              "instance": "/api/v1/me",
              "errors": { "locale": "El locale debe tener el formato BCP 47, por ejemplo es-CL" }
            }""";

    private final AuthService authService;

    public MeController(AuthService authService) {
        this.authService = authService;
    }

    @Operation(
            summary = "Obtener el perfil propio",
            description = """
                    Devuelve el perfil del usuario que acredita el access token, junto con los
                    hogares a los que pertenece y su rol en cada uno.

                    La lista de hogares se relee en cada respuesta: una lista vacía significa
                    que el usuario aún no pertenece a ninguno.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Perfil del usuario autenticado.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = UserProfileResponse.class),
                            examples = @ExampleObject(name = "perfil", value = EXAMPLE_PROFILE))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED)))
    })
    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public UserProfileResponse me() {
        return authService.currentProfile();
    }

    @Operation(
            summary = "Actualizar el perfil propio",
            description = """
                    Actualización parcial: los campos que no se envíen se dejan intactos.

                    El correo y el avatar no se editan aquí, porque los gobierna la cuenta de
                    Google y se refrescan en cada inicio de sesión.
                    """)
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Perfil actualizado.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = UserProfileResponse.class),
                            examples = @ExampleObject(name = "perfilActualizado", value = EXAMPLE_PROFILE_UPDATED))),
            @ApiResponse(responseCode = "400", description = "Algún campo enviado no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "localeInvalido", value = EXAMPLE_VALIDATION))),
            @ApiResponse(responseCode = "401", description = "Falta el access token, o no es válido.",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(implementation = ProblemDetail.class),
                            examples = @ExampleObject(name = "sinToken", value = EXAMPLE_UNAUTHORIZED)))
    })
    @PatchMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public UserProfileResponse updateMe(@Valid @RequestBody UpdateProfileRequest request) {
        return authService.updateCurrentProfile(request);
    }
}
