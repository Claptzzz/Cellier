import type { TemplateReport } from '../../core/templates/report.models';
import { groupByCategory } from '../../core/templates/report.models';
import { formatQuantity, unitLabel } from '../../core/pantry/pantry.models';

/**
 * El reporte como texto plano, para copiar o compartir.
 *
 * <p>Se escribe con la misma estructura que la pantalla —categorías y faltantes— porque quien
 * lo pega en un mensaje lo va a leer en el súper igual que leería la pantalla. Un volcado
 * plano sin agrupar obligaría a recorrer el pasillo dos veces.
 *
 * <p>Sólo lo que falta. Lo cubierto no se lleva al súper.
 */
export function reportAsText(report: TemplateReport): string {
  const faltantes = report.items.filter((item) => item.status === 'MISSING');

  if (faltantes.length === 0) {
    return `${report.templateName}\nNo falta nada.`;
  }

  const lineas: string[] = [report.templateName, ''];
  for (const grupo of groupByCategory(faltantes)) {
    lineas.push(`${grupo.category}:`);
    for (const item of grupo.items) {
      lineas.push(
        `- ${item.productName}: ${formatQuantity(item.missingQuantity)} ${unitLabel(item.unit)}`);
    }
    lineas.push('');
  }
  return lineas.join('\n').trimEnd();
}
