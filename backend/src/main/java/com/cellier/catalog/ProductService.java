package com.cellier.catalog;

import com.cellier.catalog.domain.Product;
import com.cellier.catalog.domain.ProductUnit;
import com.cellier.catalog.dto.CreateProductRequest;
import com.cellier.catalog.dto.ProductResponse;
import com.cellier.catalog.dto.UpdateProductRequest;
import com.cellier.household.HouseholdAccessService;
import com.cellier.household.domain.Household;
import com.cellier.identity.CurrentUserService;
import com.cellier.shared.error.ConflictException;
import com.cellier.shared.error.NotFoundException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/** El catálogo de productos de un hogar. */
@Service
public class ProductService {

    static final String PRODUCT_NOT_FOUND = "No existe ese producto en este hogar.";

    private final ProductRepository products;
    private final HouseholdAccessService access;
    private final CurrentUserService currentUserService;

    public ProductService(ProductRepository products,
                          HouseholdAccessService access,
                          CurrentUserService currentUserService) {
        this.products = products;
        this.access = access;
        this.currentUserService = currentUserService;
    }

    @Transactional(readOnly = true)
    public List<ProductResponse> search(UUID householdId, String search) {
        access.requireMember(currentUserId(), householdId);

        String filtro = blankToNull(search);
        return filtro == null
                ? products.findAllOf(householdId)
                : products.findMatching(householdId, filtro);
    }

    @Transactional
    public ProductResponse create(UUID householdId, CreateProductRequest request) {
        // El guardia ya devuelve la membresía, y de ella cuelga el hogar: pedirlo otra vez
        // al repositorio sería una consulta de más para un dato que ya está en la mano.
        Household household = access.requireMember(currentUserId(), householdId).getHousehold();

        String name = request.name().trim();
        products.findByHouseholdIdAndNameIgnoreCase(householdId, name).ifPresent((existing) -> {
            throw new ConflictException(alreadyExists(existing, name));
        });

        Product created = products.save(
                Product.create(household, name, request.unit(), trimToNull(request.category())));

        return toResponse(created);
    }

    @Transactional
    public ProductResponse update(UUID householdId, UUID productId, UpdateProductRequest request) {
        access.requireMember(currentUserId(), householdId);
        Product product = requireProduct(householdId, productId);

        if (request.name() != null) {
            String name = request.name().trim();
            // Renombrar a un nombre ya ocupado es el mismo choque que crearlo, así que da el
            // mismo error: si no, se podrían fusionar dos productos por la puerta de atrás.
            products.findByHouseholdIdAndNameIgnoreCase(householdId, name)
                    .filter((other) -> !other.getId().equals(productId))
                    .ifPresent((other) -> {
                        throw new ConflictException(alreadyExists(other, name));
                    });
            product.rename(name);
        }

        if (request.category() != null) {
            // Una cadena vacía quita la categoría; nula significa «no la toques».
            product.recategorize(trimToNull(request.category()));
        }

        return toResponse(product);
    }

    /**
     * Borra un producto que no esté en uso.
     *
     * <p>La comprobación previa existe para dar un mensaje concreto —cuántos artículos lo
     * usan—, no para garantizar nada: entre la cuenta y el borrado cabe otra transacción.
     * La garantía la da la clave foránea, y por eso también se captura su violación. Esa
     * red seguirá funcionando cuando lleguen plantillas y recetas sin tocar este método.
     */
    @Transactional
    public void delete(UUID householdId, UUID productId) {
        access.requireMember(currentUserId(), householdId);
        Product product = requireProduct(householdId, productId);

        long usos = products.countPantryUsages(productId);
        if (usos > 0) {
            throw new ConflictException(inUse(product, usos));
        }

        try {
            products.delete(product);
            products.flush();
        } catch (DataIntegrityViolationException ex) {
            // Alguien lo empezó a usar entre la cuenta y el borrado, o lo usa una tabla que
            // este servicio todavía no conoce.
            throw new ConflictException(
                    "No se puede eliminar «" + product.getName() + "»: está en uso en este hogar.");
        }
    }

    private Product requireProduct(UUID householdId, UUID productId) {
        return products.findByIdAndHouseholdId(productId, householdId)
                .orElseThrow(() -> new NotFoundException(PRODUCT_NOT_FOUND));
    }

    /**
     * El choque de nombres menciona la unidad del producto que ya existe, porque es lo que
     * hace falta para decidir: reutilizarlo tal cual, o elegir otro nombre.
     */
    private static String alreadyExists(Product existing, String attempted) {
        return "Ya existe «" + existing.getName() + "» en este hogar, medido en "
                + existing.getUnit() + ". Usa ese producto, o elige otro nombre para «"
                + attempted + "».";
    }

    private static String inUse(Product product, long usos) {
        return "No se puede eliminar «" + product.getName() + "»: está en la despensa"
                + (usos == 1 ? "" : " de " + usos + " artículos")
                + ". Quítalo de la despensa primero.";
    }

    private static ProductResponse toResponse(Product product) {
        return new ProductResponse(product.getId(), product.getName(), product.getUnit(), product.getCategory());
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String trimToNull(String value) {
        return blankToNull(value);
    }

    private UUID currentUserId() {
        return currentUserService.requirePrincipal().userId();
    }
}
