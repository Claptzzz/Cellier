package com.cellier.template;

import com.cellier.household.HouseholdAccessService;
import com.cellier.identity.CurrentUserService;
import com.cellier.shared.error.NotFoundException;
import com.cellier.template.domain.PantryTemplate;
import com.cellier.template.dto.ReportItemStatus;
import com.cellier.template.dto.TemplateReportItemResponse;
import com.cellier.template.dto.TemplateReportResponse;
import com.cellier.template.dto.TemplateReportRow;
import com.cellier.template.dto.TemplateReportSummary;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.util.List;
import java.util.UUID;

/**
 * El reporte de compras: la plantilla menos la despensa.
 *
 * <p><strong>Se calcula al vuelo y no se guarda.</strong> Una lista de la compra almacenada
 * empieza a mentir en cuanto alguien abre la nevera, y entonces hay que decidir cuándo
 * recalcularla, qué hacer con la vieja y cuál manda. Calculándola cada vez, el reporte es
 * cierto en el instante que declara y no pretende serlo después.
 *
 * <p><strong>Qué NO usa este cálculo: {@code par_level}.</strong> El nivel objetivo de la
 * despensa y la cantidad deseada de una plantilla responden preguntas distintas —«¿voy bien
 * de esto, siempre?» contra «¿cuánto quiere ESTA lista?»— y ninguna se deriva de la otra.
 * Ver {@code docs/reglas-plantillas.md}.
 */
@Service
public class TemplateReportService {

    /** Dos decimales, como el ejemplo del enunciado: 8 de 12 es 0,67 y no 0,6666666667. */
    private static final int RATE_SCALE = 2;

    /**
     * Tres decimales, los mismos que la despensa y las plantillas.
     *
     * <p>No es cosmética: sin fijarlo, un producto ausente sale con «0» y uno presente a cero
     * con «0.000», porque uno viene del `coalesce` y el otro de la columna. Son el mismo
     * número y tienen que escribirse igual, o el cliente acabará formateando dos casos.
     */
    private static final int QUANTITY_SCALE = 3;

    private final PantryTemplateRepository templates;
    private final HouseholdAccessService access;
    private final CurrentUserService currentUserService;
    private final Clock clock;

    public TemplateReportService(PantryTemplateRepository templates,
                                 HouseholdAccessService access,
                                 CurrentUserService currentUserService,
                                 Clock clock) {
        this.templates = templates;
        this.access = access;
        this.currentUserService = currentUserService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public TemplateReportResponse of(UUID householdId, UUID templateId) {
        access.requireMember(currentUserService.requireCurrentUser().getId(), householdId);

        PantryTemplate template = templates.findByIdAndHouseholdId(templateId, householdId)
                .orElseThrow(() -> new NotFoundException(PantryTemplateService.TEMPLATE_NOT_FOUND));

        List<TemplateReportItemResponse> items = templates.reportOf(templateId, householdId).stream()
                .map(TemplateReportService::toItem)
                .toList();

        return new TemplateReportResponse(
                template.getId(),
                template.getName(),
                clock.instant(),
                summarize(items),
                items);
    }

    /**
     * La resta, escrita una sola vez.
     *
     * <p>El faltante se recorta en cero: tener de más no es tener que devolver, y un número
     * negativo en una lista de la compra no significa nada que alguien pueda hacer.
     */
    private static TemplateReportItemResponse toItem(TemplateReportRow row) {
        BigDecimal desired = scaled(row.desiredQuantity());
        BigDecimal available = scaled(row.availableQuantity());
        BigDecimal missing = scaled(desired.subtract(available).max(BigDecimal.ZERO));

        return new TemplateReportItemResponse(
                row.productId(),
                row.productName(),
                row.unit(),
                row.category(),
                desired,
                available,
                missing,
                missing.signum() == 0 ? ReportItemStatus.COMPLETE : ReportItemStatus.MISSING);
    }

    private static BigDecimal scaled(BigDecimal value) {
        return value.setScale(QUANTITY_SCALE, RoundingMode.HALF_UP);
    }

    private static TemplateReportSummary summarize(List<TemplateReportItemResponse> items) {
        int total = items.size();
        int missing = (int) items.stream()
                .filter((item) -> item.status() == ReportItemStatus.MISSING)
                .count();

        // Una plantilla vacía vale cero, no uno. Proclamar «100% cubierto» de una lista sin
        // líneas es afirmar algo sobre un conjunto vacío, y quien lo lea entenderá que ya
        // tiene todo lo que quería tener.
        BigDecimal rate = total == 0
                ? BigDecimal.ZERO.setScale(RATE_SCALE)
                : BigDecimal.valueOf((long) total - missing)
                        .divide(BigDecimal.valueOf(total), RATE_SCALE, RoundingMode.HALF_UP);

        return new TemplateReportSummary(total, missing, rate);
    }
}
