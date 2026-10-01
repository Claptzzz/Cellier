# CellierWeb

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.5.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

Las pruebas E2E (`frontend/e2e/`, con [Playwright](https://playwright.dev/)) ejercitan la
aplicación real contra un backend y una base de datos efímeros, nunca contra los de
desarrollo. Hace falta Docker (para el Postgres de pruebas), y `JAVA_HOME` apuntando a un
JDK 25+ en la variable de entorno o el PATH, para que Maven pueda arrancar el backend.

```bash
npm run e2e
```

Esto levanta, en orden, y los apaga todos al terminar:

1. Un Postgres efímero en el puerto `5555` (`docker-compose.e2e.yml` en la raíz del repo),
   sin volumen con nombre: cada corrida empieza de un esquema vacío.
2. El backend Spring Boot, con el perfil `test` activo
   (`SPRING_PROFILES_ACTIVE=test`), apuntando a ese Postgres. Ese perfil activa
   `TestSupportController` (`backend/.../identity/web/TestSupportController.java`), que
   **sólo existe bajo este perfil** —nunca en `dev` ni en `prod`— y ofrece dos rutas bajo
   `/api/v1/auth/test/` sin las que las pruebas no podrían simular el login de Google ni
   aislar cada archivo de test del anterior:
   - `POST .../test/login`: emite credenciales reales de Cellier para un correo
     cualquiera, sin pasar por Google. Crea la cuenta si es la primera vez que se pide.
   - `POST .../test/reset`: vacía el esquema entero, en el orden que exigen las claves
     foráneas (reutiliza `DatabaseCleaner`, la misma clase que usan los tests de
     integración de JUnit).
3. El frontend (`ng serve --port 4300`).
4. `playwright test`, contra dos proyectos: Chromium de escritorio (1440×900) y Mobile
   Safari (iPhone 13, 390×844).

Cada archivo de test siembra sus propios datos llamando a la API real (ver
`frontend/e2e/support/seed.ts`): dos usuarios, un hogar con productos en la despensa, una
plantilla y dos recetas. Lo hace después de pedir un `reset`, así que ningún escenario
hereda estado del anterior — por eso la configuración corre en un solo worker
(`frontend/e2e/playwright.config.ts`): dos archivos compartiendo la misma base efímera en
paralelo se borrarían el trabajo mutuamente a mitad de prueba.

Para depurar un test con la UI de Playwright:

```bash
npm run e2e:ui
```

El reporte HTML de la última corrida queda en `frontend/e2e/playwright-report/`.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
