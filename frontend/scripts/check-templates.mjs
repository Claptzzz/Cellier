/**
 * Busca acentos graves dentro de los `template` y `styles` de los componentes.
 *
 *   node scripts/check-templates.mjs
 *
 * Esos bloques SON template literals: un acento grave dentro de un comentario cierra la
 * cadena y el decorador @Component se rompe con un error que no menciona el comentario.
 * Ha pasado tres veces escribiendo cosas como «no uses `position: fixed`».
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const ficheros = globSync('src/**/*.ts');
let fallos = 0;

for (const fichero of ficheros) {
  const contenido = readFileSync(fichero, 'utf8');
  // Cada bloque template:`…` o styles:`…`, delimitado por el acento grave de cierre que
  // va seguido de coma y salto de linea.
  const bloques = contenido.matchAll(/(template|styles):\s*`([\s\S]*?)`,\n/g);
  for (const bloque of bloques) {
    if (bloque[2].includes('`')) {
      const linea = contenido.slice(0, bloque.index).split('\n').length;
      console.error(`${fichero}:${linea}  acento grave dentro del bloque ${bloque[1]}`);
      fallos++;
    }
  }
}

console.log(fallos === 0
  ? `Sin acentos graves sueltos en ${ficheros.length} ficheros.`
  : `${fallos} bloque(s) con acentos graves.`);
process.exit(fallos === 0 ? 0 : 1);
