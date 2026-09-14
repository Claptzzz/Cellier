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
import com.cellier.pantry.dto.PageResponse;
import com.cellier.pantry.dto.StockMovementResponse;
import com.cellier.shared.error.ConflictException;
import com.cellier.shared.error.NotFoundException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
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

    /** Tamaño de página del historial si no se pide otro, y tope para el que se pida. */
    static final int PAGINA_POR_DEFECTO = 20;
    static final int PAGINA_MAXIMA = 100;
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
     * La despensa del hogar, filtrada y ordenada <strong>en el servidor</strong>.
     *
     * <p>No se pagina: una despensa doméstica es corta y crece despacio. Sí se ordena y se
     * filtra aquí, para que el cliente no tenga que traerse todo y rehacer el trabajo en
     * cada pantalla.
     *
     * <p>Sale en una sola sentencia. El grafo de entidad del repositorio trae el producto
     * junto al artículo; sin él, construir cada respuesta pediría su nombre y su unidad por
     * separado.
     */
    @Transactional(readOnly = true)
    public List<PantryItemResponse> list(UUID householdId, String search, String category, PantrySort sort) {
        access.requireMember(currentUserId(), householdId);

        Specification<PantryItem> filtro = PantryItemSpecifications.inHousehold(householdId);
        String texto = blankToNull(search);
        if (texto != null) {
            filtro = filtro.and(PantryItemSpecifications.nameContains(texto));
        }
        String categoria = blankToNull(category);
        if (categoria != null) {
            filtro = filtro.and(PantryItemSpecifications.hasCategory(categoria));
        }

        return items.findAll(filtro, sort.orden()).stream().map(PantryService::toResponse).toList();
    }

    /**
     * El historial de un artículo, de lo más reciente a lo más antiguo.
     *
     * <p>Esto sí se pagina, al revés que la despensa: el historial sólo crece, y el de un
     * producto que se compra cada semana llega a miles de filas en un par de años.
     */
    @Transactional(readOnly = true)
    public PageResponse<StockMovementResponse> movements(UUID householdId, UUID itemId, int page, int size) {
        access.requireMember(currentUserId(), householdId);
        // El artículo se resuelve dentro del hogar antes de leer nada: de otro modo, el
        // historial de un artículo ajeno se alcanzaría sabiendo su identificador.
        requireItem(householdId, itemId);

        int tamano = Math.clamp(size <= 0 ? PAGINA_POR_DEFECTO : size, 1, PAGINA_MAXIMA);
        return PageResponse.of(movements.findPageFor(itemId, PageRequest.of(Math.max(page, 0), tamano)));
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

        // La versión llega sólo si el cliente edita a partir de algo que el usuario leyó.
        // Comprobarla ANTES de tocar nada es lo que impide que una cantidad escrita a mano
        // pise, sin decir nada, lo que otro miembro cambió mientras tanto. Sin esto el
        // @Version sólo cazaría dos transacciones en el mismo instante, que casi nunca pasa:
        // el caso real es alguien editando en el súper mientras otro descuenta en casa.
        if (request.version() != null && request.version() != item.getVersion()) {
            throw new StaleWriteException(item.getVersion(), item.getQuantity());
        }

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

    /** Los órdenes que ofrece el listado, con el criterio de desempate de cada uno. */
    public enum PantrySort {

        /** Alfabético. El desempate por identificador evita que dos homónimos bailen. */
        NAME(Sort.by(Sort.Order.asc("product.name"), Sort.Order.asc("id"))),

        /**
         * De menos a más. Ascendente a propósito: en una despensa lo que se mira es qué se
         * está acabando, no qué sobra.
         */
        QUANTITY(Sort.by(Sort.Order.asc("quantity"), Sort.Order.asc("product.name"))),

        /**
         * Lo que vence antes, primero. Los artículos sin fecha van al final: no tener
         * vencimiento no es vencer muy pronto ni muy tarde, es no estar en esa lista.
         */
        EXPIRY(Sort.by(Sort.Order.asc("expiresAt").nullsLast(), Sort.Order.asc("product.name")));

        private final Sort orden;

        PantrySort(Sort orden) {
            this.orden = orden;
        }

        Sort orden() {
            return orden;
        }
    }

    /** Un filtro en blanco es un filtro que no se envió. */
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
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
