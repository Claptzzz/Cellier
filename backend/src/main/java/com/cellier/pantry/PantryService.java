package com.cellier.pantry;

import com.cellier.catalog.ProductRepository;
import com.cellier.catalog.domain.Product;
import com.cellier.household.HouseholdAccessService;
import com.cellier.household.domain.Household;
import com.cellier.identity.CurrentUserService;
import com.cellier.identity.domain.User;
import com.cellier.pantry.domain.MovementType;
import com.cellier.pantry.domain.PantryItem;
import com.cellier.pantry.domain.StockMovement;
import com.cellier.pantry.dto.CreatePantryItemRequest;
import com.cellier.pantry.dto.PantryItemResponse;
import com.cellier.pantry.dto.PantryProductResponse;
import com.cellier.pantry.dto.UpdatePantryItemRequest;
import com.cellier.shared.error.ConflictException;
import com.cellier.shared.error.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * La despensa de un hogar: qué hay, cuánto, y el rastro de cada cambio.
 *
 * <p>Toda modificación deja un movimiento, y la <strong>suma de los movimientos de un
 * artículo es su cantidad actual</strong>. Ese invariante es lo que hace que el historial
 * sirva para algo: si consumir registrara lo que se pidió en vez de lo que había, o si un
 * ajuste sin cambio escribiera una fila de cero, el historial dejaría de explicar la cifra.
 */
@Service
public class PantryService {

    static final String ITEM_NOT_FOUND = "No existe ese artículo en la despensa de este hogar.";
    static final String PRODUCT_NOT_FOUND = "No existe ese producto en este hogar.";

    private final PantryItemRepository items;
    private final StockMovementRepository movements;
    private final ProductRepository products;
    private final HouseholdAccessService access;
    private final CurrentUserService currentUserService;

    public PantryService(PantryItemRepository items,
                         StockMovementRepository movements,
                         ProductRepository products,
                         HouseholdAccessService access,
                         CurrentUserService currentUserService) {
        this.items = items;
        this.movements = movements;
        this.products = products;
        this.access = access;
        this.currentUserService = currentUserService;
    }

    /**
     * Mete un producto en la despensa, creándolo en el catálogo si hacía falta.
     *
     * <p>Todo ocurre en una transacción: si el artículo no se puede crear, el producto
     * tampoco queda suelto en el catálogo.
     */
    @Transactional
    public PantryItemResponse create(UUID householdId, CreatePantryItemRequest request) {
        User actor = currentUserService.requireCurrentUser();
        Household household = access.requireMember(actor.getId(), householdId).getHousehold();

        Product product = resolveProduct(household, request);

        items.findByHouseholdIdAndProductId(householdId, product.getId()).ifPresent((existing) -> {
            throw new ConflictException(
                    "«" + product.getName() + "» ya está en la despensa. Usa reponer para sumar "
                            + "a lo que hay, o edítalo para corregir la cantidad.");
        });

        // El artículo se arma entero ANTES de guardarlo. Guardarlo y luego rellenarlo
        // provocaba un INSERT seguido de un UPDATE, y el artículo nacía en la versión 1:
        // un recién creado que ya parecía modificado por alguien.
        PantryItem item = PantryItem.of(household, product, request.quantity());
        item.setExpiresAt(request.expiresAt());
        item.setParLevel(request.parLevel());
        item.setStorageLocation(request.storageLocation());
        items.save(item);

        // El alta con cantidad es una entrada de producto como cualquier otra. Registrarla
        // mantiene el invariante: la suma de los movimientos es la cantidad.
        if (item.getQuantity().signum() > 0) {
            movements.save(StockMovement.of(item, MovementType.PURCHASE, item.getQuantity(), actor));
        }

        return flushAndRespond(item);
    }

    @Transactional
    public PantryItemResponse update(UUID householdId, UUID itemId, UpdatePantryItemRequest request) {
        User actor = currentUserService.requireCurrentUser();
        access.requireMember(actor.getId(), householdId);
        PantryItem item = requireItem(householdId, itemId);

        if (request.quantity() != null) {
            BigDecimal delta = item.adjustTo(request.quantity());
            // Null significa que la cantidad no cambió: un ajuste que no ajusta nada no es
            // un movimiento, y la base lo rechazaría con ck_stock_movements_sign.
            if (delta != null) {
                movements.save(StockMovement.of(item, MovementType.ADJUSTMENT, delta, actor));
            }
        }
        if (request.expiresAt() != null) {
            item.setExpiresAt(request.expiresAt());
        }
        if (request.parLevel() != null) {
            item.setParLevel(request.parLevel());
        }
        if (request.storageLocation() != null) {
            item.setStorageLocation(request.storageLocation());
        }

        return flushAndRespond(item);
    }

    /**
     * Gasta producto. Nunca deja la cantidad en negativo: consumir más de lo que hay la deja
     * en cero y registra lo que había, que es lo único que se pudo gastar.
     */
    @Transactional
    public PantryItemResponse consume(UUID householdId, UUID itemId, BigDecimal amount) {
        User actor = currentUserService.requireCurrentUser();
        access.requireMember(actor.getId(), householdId);
        PantryItem item = requireItem(householdId, itemId);

        BigDecimal delta = item.consume(amount);
        if (delta.signum() != 0) {
            movements.save(StockMovement.of(item, MovementType.CONSUMPTION, delta, actor));
        }
        return flushAndRespond(item);
    }

    @Transactional
    public PantryItemResponse restock(UUID householdId, UUID itemId, BigDecimal amount) {
        User actor = currentUserService.requireCurrentUser();
        access.requireMember(actor.getId(), householdId);
        PantryItem item = requireItem(householdId, itemId);

        movements.save(StockMovement.of(item, MovementType.PURCHASE, item.restock(amount), actor));
        return flushAndRespond(item);
    }

    /** Saca el producto de la despensa. Su historial se va con él, por la cascada de la base. */
    @Transactional
    public void delete(UUID householdId, UUID itemId) {
        access.requireMember(currentUserId(), householdId);
        items.delete(requireItem(householdId, itemId));
    }

    /**
     * Resuelve el producto del alta: el que se indica por id, el que ya existe con ese
     * nombre, o uno nuevo.
     */
    private Product resolveProduct(Household household, CreatePantryItemRequest request) {
        UUID householdId = household.getId();

        if (request.productId() != null) {
            return products.findByIdAndHouseholdId(request.productId(), householdId)
                    .orElseThrow(() -> new NotFoundException(PRODUCT_NOT_FOUND));
        }

        String name = request.productName() == null ? "" : request.productName().trim();
        if (name.isEmpty() || request.unit() == null) {
            throw new ConflictException(
                    "Indica productId, o bien productName y unit para crear el producto.");
        }

        return products.findByHouseholdIdAndNameIgnoreCase(householdId, name)
                .map((existing) -> reuse(existing, request))
                .orElseGet(() -> products.save(Product.create(household, name, request.unit(), null)));
    }

    /**
     * Reutiliza el producto que ya existe con ese nombre… salvo que la unidad no cuadre.
     *
     * <p>Sin conversión de unidades, la unidad es parte de la identidad del producto. Si
     * alguien escribe «Leche» en litros y en el catálogo está en gramos, reutilizarlo en
     * silencio guardaría «2 L» como 2 G, y ese dato falso se propagaría al reporte de
     * compras y a la disponibilidad de recetas sin que nadie lo notara.
     */
    private static Product reuse(Product existing, CreatePantryItemRequest request) {
        if (existing.getUnit() != request.unit()) {
            throw new ConflictException(
                    "«" + existing.getName() + "» ya existe en este hogar medido en "
                            + existing.getUnit() + ", y lo estás enviando en " + request.unit()
                            + ". Usa " + existing.getUnit()
                            + ", o crea un producto con otro nombre.");
        }
        return existing;
    }

    private PantryItem requireItem(UUID householdId, UUID itemId) {
        return items.findByIdAndHouseholdId(itemId, householdId)
                .orElseThrow(() -> new NotFoundException(ITEM_NOT_FOUND));
    }

    /**
     * Vuelca los cambios antes de construir la respuesta.
     *
     * <p>Dos motivos. El primero, que la versión que se devuelve sea la de después de
     * escribir: Hibernate la incrementa al volcar, así que sin esto el cliente recibiría la
     * anterior. El segundo, que una colisión optimista salte aquí dentro y no al confirmar
     * la transacción, donde ya no hay contexto de qué se estaba haciendo.
     */
    private PantryItemResponse flushAndRespond(PantryItem item) {
        items.flush();
        return toResponse(item);
    }

    private static PantryItemResponse toResponse(PantryItem item) {
        Product product = item.getProduct();
        return new PantryItemResponse(
                item.getId(),
                new PantryProductResponse(product.getId(), product.getName(), product.getUnit(),
                        product.getCategory()),
                item.getQuantity(),
                item.getExpiresAt(),
                item.getParLevel(),
                item.getStorageLocation(),
                item.getVersion());
    }

    private UUID currentUserId() {
        return currentUserService.requirePrincipal().userId();
    }
}
