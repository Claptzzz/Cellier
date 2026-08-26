import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guard';
import { environment } from '../environments/environment';

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

export const routes: Routes = [
  {
    path: 'login',
    title: 'Entrar · Cellier',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'onboarding',
    title: 'Crea tu hogar · Cellier',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/onboarding/onboarding-page').then((m) => m.OnboardingPage),
  },
  {
    // El shell envuelve todo lo autenticado, así que la navegación no se
    // desmonta ni se repinta al cambiar de sección.
    path: '',
    loadComponent: () => import('./layout/app-shell').then((m) => m.AppShell),
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'pantry' },
      {
        path: 'pantry',
        title: 'Despensa · Cellier',
        loadComponent: () => import('./features/pantry/pantry-page').then((m) => m.PantryPage),
      },
      {
        path: 'templates',
        title: 'Plantillas · Cellier',
        loadComponent: () =>
          import('./features/templates/templates-page').then((m) => m.TemplatesPage),
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
        path: 'settings',
        title: 'Ajustes · Cellier',
        loadComponent: () =>
          import('./features/settings/settings-page').then((m) => m.SettingsPage),
      },
      ...devRoutes,
    ],
  },
  { path: '**', redirectTo: '' },
];
