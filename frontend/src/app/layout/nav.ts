import type { IconName } from '../shared/ui/icon.data';

export interface NavDestination {
  readonly path: string;
  readonly label: string;
  readonly icon: IconName;
}

/**
 * Los cuatro destinos de la navegación inferior.
 *
 * "Hogar" y no "Gestión": nombra lo que la persona reconoce, no el subsistema.
 * "Gestión" además sugiere acceso sólo de administrador, y esta pantalla la ven
 * todos los miembros; lo que se condiciona por rol son las acciones de dentro.
 *
 * Ajustes NO está aquí. Con cinco destinos las áreas táctiles bajan de 44px en
 * 375, así que vive en el menú de la cuenta (móvil) y en el pie del sidebar.
 */
export const NAV_DESTINATIONS: readonly NavDestination[] = [
  { path: '/pantry', label: 'Despensa', icon: 'package' },
  { path: '/templates', label: 'Plantillas', icon: 'list-checks' },
  { path: '/recipes', label: 'Recetas', icon: 'fork-knife' },
  { path: '/home', label: 'Hogar', icon: 'house' },
];

export const SETTINGS_DESTINATION: NavDestination = {
  path: '/settings',
  label: 'Ajustes',
  icon: 'gear',
};
