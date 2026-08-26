/**
 * Genera src/app/shared/ui/icon.data.ts a partir de los SVG de @phosphor-icons/core.
 * Los trazados son los del paquete: aqui no se dibuja ningun icono a mano.
 *
 *   node scripts/build-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WEIGHT = 'regular';
const SRC = join('node_modules', '@phosphor-icons', 'core', 'assets', WEIGHT);

const ICONS = [
  'package', 'list-checks', 'fork-knife', 'house', 'gear',
  'sun', 'moon', 'desktop', 'caret-down', 'caret-up-down',
  'plus', 'minus', 'x', 'magnifying-glass', 'check',
  'warning', 'warning-circle', 'info', 'sign-out', 'dots-three',
  'arrow-left', 'funnel', 'tray', 'google-logo', 'trash', 'pencil-simple',
  // Estados del Badge. Se eligen por SILUETA, no por relleno: triangulo (warn)
  // frente a circulo con aspa (danger) frente a marca de verificacion sin
  // contorno (ok). Asi el estado se lee sin depender del tono.
  'x-circle',
];

const entries = ICONS.map((name) => {
  const svg = readFileSync(join(SRC, `${name}.svg`), 'utf8');
  const body = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  if (!body) throw new Error(`SVG vacio: ${name}`);
  return `  '${name}': '${body.replace(/'/g, "\\'")}',`;
});

const out = `// GENERADO por scripts/build-icons.mjs. No editar a mano.
// Trazados de @phosphor-icons/core (${WEIGHT}), MIT.
// Para anadir un icono: incluyelo en ICONS dentro del script y vuelve a ejecutarlo.

export const ICON_PATHS = {
${entries.join('\n')}
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** Todos los iconos usan el lienzo de 256 de Phosphor. */
export const ICON_VIEW_BOX = '0 0 256 256';
`;

writeFileSync(join('src', 'app', 'shared', 'ui', 'icon.data.ts'), out);
console.log(`icon.data.ts generado con ${ICONS.length} iconos`);
