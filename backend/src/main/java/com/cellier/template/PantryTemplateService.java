package com.cellier.template;

import com.cellier.catalog.ProductRepository;
import com.cellier.catalog.domain.Product;
import com.cellier.household.HouseholdAccessService;
import com.cellier.household.domain.Household;
import com.cellier.identity.CurrentUserService;
import com.cellier.identity.domain.User;
import com.cellier.shared.error.BadRequestException;
import com.cellier.shared.error.ConflictException;
import com.cellier.shared.error.NotFoundException;
import com.cellier.template.domain.PantryTemplate;
import com.cellier.template.domain.TemplateItem;
import com.cellier.template.dto.CreateTemplateRequest;
import com.cellier.template.dto.RenameTemplateRequest;
import com.cellier.template.dto.ReplaceItemsRequest;
import com.cellier.template.dto.TemplateItemRequest;
import com.cellier.template.dto.TemplateItemResponse;
import com.cellier.template.dto.TemplateResponse;
import com.cellier.template.dto.TemplateSummaryResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Las plantillas de despensa de un hogar.
 *
 * <p><strong>No es una acción de administrador.</strong> Cualquier miembro crea, edita y
 * borra plantillas: son de la casa, no de quien las escribió. Por eso aquí sólo se comprueba
 * membresía, nunca rol.
 */
@Service
public class PantryTemplateService {

    static final String TEMPLATE_NOT_FOUND = "No existe esa plantilla en este hogar.";

    private final PantryTemplateRepository templates;
    private final ProductRepository products;
    private final HouseholdAccessService access;
    private final CurrentUserService currentUserService;

    public PantryTemplateService(PantryTemplateRepository templates,
                                 ProductRepository products,
                                 HouseholdAccessService access,
                                 CurrentUserService currentUserService) {
        this.templates = templates;
        this.products = products;
        this.access = access;
        this.currentUserService = currentUserService;
    }

    @Transactional(readOnly = true)
    public List<TemplateSummaryResponse> list(UUID householdId) {
        access.requireMember(currentUserId(), householdId);
        return templates.findAllOf(householdId);
    }

    @Transactional(readOnly = true)
    public TemplateResponse get(UUID householdId, UUID templateId) {
        access.requireMember(currentUserId(), householdId);
        return toResponse(requireDetail(householdId, templateId));
    }

    @Transactional
    public TemplateResponse create(UUID householdId, CreateTemplateRequest request) {
        User actor = currentUserService.requireCurrentUser();
        Household household = access.requireMember(actor.getId(), householdId).getHousehold();

        String name = request.name().trim();
        requireNameFree(householdId, name, null);

        PantryTemplate template = PantryTemplate.create(household, name, actor);
        template.replaceItems(resolveItems(householdId, template, request.items()));

        return toResponse(templates.save(template));
    }

    @Transactional
    public TemplateResponse rename(UUID householdId, UUID templateId, RenameTemplateRequest request) {
        access.requireMember(currentUserId(), householdId);
        PantryTemplate template = requireDetail(householdId, templateId);

        String name = request.name().trim();
        requireNameFree(householdId, name, templateId);
        template.rename(name);

        return toResponse(template);
    }

    @Transactional
    public void delete(UUID householdId, UUID templateId) {
        access.requireMember(currentUserId(), householdId);
        templates.delete(requireTemplate(householdId, templateId));
    }

    /**
     * Reemplaza la lista entera.
     *
     * <p>Se valida **todo antes de escribir nada**. Un reemplazo a medias deja la plantilla en
     * un estado que nadie pidió: ni el anterior ni el que se mandó. Y aunque la clave foránea
     * compuesta rechazaría igualmente un producto de otro hogar, ese rechazo llegaría como
     * una violación de integridad —un 500 sin nada accionable dentro— en vez de un mensaje
     * que dice qué línea sobra.
     */
    @Transactional
    public TemplateResponse replaceItems(UUID householdId, UUID templateId, ReplaceItemsRequest request) {
        access.requireMember(currentUserId(), householdId);
        PantryTemplate template = requireDetail(householdId, templateId);

        template.replaceItems(resolveItems(householdId, template, request.items()));
        return toResponse(template);
    }

    // ---------------------------------------------------------------------------------

    /**
     * Convierte las líneas pedidas en líneas de verdad, o no convierte ninguna.
     *
     * <p>Dos comprobaciones, las dos sobre el conjunto entero y antes de tocar la plantilla:
     * que no venga el mismo producto dos veces, y que todos sean de este hogar.
     */
    private List<TemplateItem> resolveItems(UUID householdId,
                                            PantryTemplate template,
                                            List<TemplateItemRequest> requested) {
        if (requested == null || requested.isEmpty()) {
            return List.of();
        }

        Set<UUID> ids = new LinkedHashSet<>();
        List<UUID> repeated = new ArrayList<>();
        requested.forEach((item) -> {
            if (!ids.add(item.productId())) {
                repeated.add(item.productId());
            }
        });
        if (!repeated.isEmpty()) {
            // El mismo producto dos veces son dos deseos sobre lo mismo, y el reporte tendría
            // que decidir cuál gana. Se rechaza aquí para poder decir cuál se repitió.
            throw new BadRequestException(
                    "Hay productos repetidos en la lista. Cada producto puede aparecer una sola vez: "
                            + nombresDe(householdId, repeated) + ".");
        }

        Map<UUID, Product> byId = products.findAllByIdInAndHouseholdId(ids, householdId).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));

        List<UUID> ajenos = ids.stream().filter((id) -> !byId.containsKey(id)).toList();
        if (!ajenos.isEmpty()) {
            // Se dicen los identificadores y NO los nombres, al revés que en el caso de los
            // repetidos. No es pereza: esos productos no son de este hogar, y nombrarlos
            // contaría qué tiene el catálogo del otro. El identificador lo mandó quien llama,
            // así que le basta para saber qué línea sobra sin enterarse de nada ajeno.
            throw new BadRequestException(
                    "La lista trae " + ajenos.size() + " producto(s) que no son del catálogo de este "
                            + "hogar. Quítalos o créalos antes de guardar la plantilla: " + ajenos + ".");
        }

        return requested.stream()
                .map((item) -> TemplateItem.of(template, byId.get(item.productId()), item.desiredQuantity()))
                .toList();
    }

    /** Los nombres de unos productos, para que el mensaje diga cuáles y no sólo cuántos. */
    private String nombresDe(UUID householdId, List<UUID> ids) {
        return products.findAllByIdInAndHouseholdId(ids, householdId).stream()
                .map(Product::getName)
                .collect(Collectors.joining(", "));
    }

    private void requireNameFree(UUID householdId, String name, UUID ignoring) {
        templates.findByHouseholdIdAndNameIgnoreCase(householdId, name).ifPresent((existing) -> {
            if (!existing.getId().equals(ignoring)) {
                throw new ConflictException(
                        "Ya hay una plantilla llamada «" + existing.getName() + "» en este hogar. "
                                + "Usa otro nombre, o edita la que ya existe.");
            }
        });
    }

    private PantryTemplate requireTemplate(UUID householdId, UUID templateId) {
        return templates.findByIdAndHouseholdId(templateId, householdId)
                .orElseThrow(() -> new NotFoundException(TEMPLATE_NOT_FOUND));
    }

    private PantryTemplate requireDetail(UUID householdId, UUID templateId) {
        return templates.findDetail(templateId, householdId)
                .orElseThrow(() -> new NotFoundException(TEMPLATE_NOT_FOUND));
    }

    private UUID currentUserId() {
        return currentUserService.requireCurrentUser().getId();
    }

    private TemplateResponse toResponse(PantryTemplate template) {
        List<TemplateItemResponse> items = template.getItems().stream()
                .map((item) -> new TemplateItemResponse(
                        item.getId(),
                        item.getProduct().getId(),
                        item.getProduct().getName(),
                        item.getProduct().getUnit(),
                        item.getProduct().getCategory(),
                        item.getDesiredQuantity()))
                .toList();

        User author = template.getCreatedBy();
        return new TemplateResponse(
                template.getId(),
                template.getName(),
                author == null ? null : author.getDisplayName(),
                template.getCreatedAt(),
                template.getUpdatedAt(),
                items);
    }
}
