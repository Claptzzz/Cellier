import { inject } from '@angular/core';
import { Router, Routes, UrlTree } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guard';
import { AuthService } from './core/auth/auth.service';
import { HouseholdContextService } from './core/household/household-context.service';
import { householdAdminGuard, householdGuard } from './core/household/household.guard';
import { MyJoinRequestsService } from './core/household/my-join-requests.service';
import { unsavedChangesGuard } from './features/templates/unsaved-changes.guard';
import { environment } from '../environments/environment';

/**
 * Adónde llevar a alguien que pide una sección sin decir de qué hogar.
 *
 * <p>Resuelve con el último hogar usado si sigue siendo suyo, y si no con el primero de
 * su lista. Sin hogares, a la bienvenida —o a la sala de espera si ya tiene una solicitud
 * en marcha—. El valor guardado se valida siempre contra la lista real: si lo expulsaron
 * o el hogar se borró, no sobrevive a la comprobación.
 */
function toActiveHousehold(section: string): () => UrlTree {
  return () => {
    const router = inject(Router);
    const auth = inject(AuthService);
    const context = inject(HouseholdContextService);
    const myRequests = inject(MyJoinRequestsService);

    // «Sin hogares» y «todavía no sé si tiene hogares» no son lo mismo, y aquí se
    // confunden con facilidad porque esta función corre antes que cualquier guard. Si el
    // arranque no pudo traer el perfil, decidir con la lista vacía mandaría a la
    // bienvenida a alguien que tiene hogares, y el reintento obedecería ese destino
    // equivocado. Mientras no se sepa, se va a reconectar.
    if (auth.isAuthenticated() && auth.user() === null) {
      return router.createUrlTree(['/reconnect'], { queryParams: { redirect: `/${section}` } });
    }

    const householdId = context.startupHouseholdId();
    if (householdId) {
      return router.createUrlTree(['/h', householdId, section]);
    }
    // `hasPending` sólo es fiable si algo lo cargó antes; si no, la bienvenida enlaza a
    // la sala de espera de todos modos, así que no se bloquea la navegación por esperar.
    return router.createUrlTree([myRequests.hasPending() ? '/onboarding/pending' : '/onboarding']);
  };
}

/**
 * El kitchen sink sólo existe en desarrollo. Al registrarse condicionalmente y
 * cargarse de forma diferida, el bundle de producción no lo incluye: no hay
 * import estático que lo arrastre.
 */
const devRoutes: Routes = environment.production
  ? []
  : [
      {
        path: 'dev/ui',
        title: 'Sistema de diseño · Cellier',
        loadComponent: () => import('./dev/ui-kitchen-sink').then((m) => m.UiKitchenSink),
      },
    ];

/**
 * Las secciones que viven dentro de un hogar. Se declaran una vez y se montan bajo
 * `/h/:householdId`, de modo que añadir una sección no obliga a tocar el guard.
 */
const householdSections: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'pantry' },
  {
    path: 'pantry',
    title: 'Despensa · Cellier',
    loadComponent: () => import('./features/pantry/pantry-page').then((m) => m.PantryPage),
  },
  {
    path: 'templates',
    title: 'Plantillas · Cellier',
    loadComponent: () => import('./features/templates/templates-page').then((m) => m.TemplatesPage),
  },
  {
    path: 'templates/:templateId',
    title: 'Editar plantilla · Cellier',
    // El guard vive en la ruta y no dentro de la pantalla porque sólo el router sabe que
    // alguien se está yendo. `beforeunload` cubre cerrar la pestaña, no navegar.
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () =>
      import('./features/templates/template-editor-page').then((m) => m.TemplateEditorPage),
  },
  {
    path: 'templates/:templateId/report',
    title: 'Qué falta · Cellier',
    loadComponent: () =>
      import('./features/templates/report-page').then((m) => m.ReportPage),
  },
  {
    path: 'recipes',
    title: 'Recetas · Cellier',
    loadComponent: () => import('./features/recipes/recipes-page').then((m) => m.RecipesPage),
  },
  {
    path: 'home',
    title: 'Hogar · Cellier',
    loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
  },
  {
    path: 'manage',
    title: 'Administrar hogar · Cellier',
    canActivate: [householdAdminGuard],
    loadComponent: () =>
      import('./features/household/manage-household-page').then((m) => m.ManageHouseholdPage),
  },
];

export const routes: Routes = [
  {
    // Sin guards, y tiene que seguir sin tenerlos: es el punto donde se corta el bucle
    // entre "hay sesión" y "no hay perfil". Cualquier guard que exigiera el perfil
    // devolvería aquí a quien ya está aquí.
    path: 'reconnect',
    title: 'Sin conexión · Cellier',
    loadComponent: () => import('./features/reconnect/reconnect-page').then((m) => m.ReconnectPage),
  },
  {
    path: 'login',
    title: 'Entrar · Cellier',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage),
  },

  // La bienvenida vive fuera del shell: no hay hogar activo que enseñar en el selector,
  // ni secciones a las que navegar.
  {
    path: 'onboarding',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        title: 'Crea tu hogar · Cellier',
        loadComponent: () =>
          import('./features/onboarding/onboarding-page').then((m) => m.OnboardingPage),
      },
      {
        // Estado propio y con URL propia: quien envía una solicitud cierra la pestaña y
        // vuelve al día siguiente a ver si le respondieron. Un mensaje efímero tras
        // enviarla no serviría para eso.
        path: 'pending',
        title: 'Solicitudes enviadas · Cellier',
        loadComponent: () =>
          import('./features/onboarding/pending-requests-page').then((m) => m.PendingRequestsPage),
      },
    ],
  },

  {
    // El shell envuelve todo lo autenticado, así que la navegación no se
    // desmonta ni se repinta al cambiar de sección.
    path: '',
    loadComponent: () => import('./layout/app-shell').then((m) => m.AppShell),
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: toActiveHousehold('pantry') },

      {
        path: 'h/:householdId',
        canActivate: [householdGuard],
        children: householdSections,
      },

      {
        // Ajustes es del usuario, no de un hogar: desde aquí se gestionan todos. Meterla
        // dentro de /h/:householdId obligaría a elegir un hogar arbitrario para llegar a
        // una pantalla que no depende de ninguno.
        path: 'settings',
        title: 'Ajustes · Cellier',
        loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage),
      },

      // Rutas de antes de que el hogar viviera en la URL. Se redirigen en vez de
      // borrarse: estuvieron vivas, y un 404 en una URL que alguien pueda tener abierta
      // o guardada no aporta nada.
      { path: 'pantry', redirectTo: toActiveHousehold('pantry') },
      { path: 'templates', redirectTo: toActiveHousehold('templates') },
      { path: 'recipes', redirectTo: toActiveHousehold('recipes') },
      { path: 'home', redirectTo: toActiveHousehold('home') },

      ...devRoutes,
    ],
  },

  { path: '**', redirectTo: '' },
];
