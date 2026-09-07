import type { IconName } from '../shared/ui/icon.data';

export interface NavDestination {
  /**
   * Segmento relativo al hogar activo, sin barra inicial. El enlace completo lo compone
   * el shell con el id de la ruta: no existe "la despensa", existe la despensa DE UN
   * HOGAR, y un destino con ruta absoluta no podría decir de cuál.
   */
  readonly segment: string;
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
  { segment: 'pantry', label: 'Despensa', icon: 'package' },
  { segment: 'templates', label: 'Plantillas', icon: 'list-checks' },
  { segment: 'recipes', label: 'Recetas', icon: 'fork-knife' },
  { segment: 'home', label: 'Hogar', icon: 'house' },
];

/**
 * Ajustes es del usuario y no de un hogar, así que su ruta es absoluta y no se compone
 * con ningún id.
 */
export const SETTINGS_DESTINATION = {
  path: '/settings',
  label: 'Ajustes',
  icon: 'gear',
} as const satisfies { path: string; label: string; icon: IconName };
