package com.cellier.pantry;

import com.cellier.pantry.domain.StockMovement;
import com.cellier.pantry.dto.StockMovementResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface StockMovementRepository extends JpaRepository<StockMovement, UUID> {

    long countByItemId(UUID itemId);

    /**
     * El historial de un artículo, de lo más reciente a lo más antiguo y paginado.
     *
     * <p>El {@code left join} con el autor va en la misma sentencia: sin él, cada fila
     * pediría su usuario por separado al construir la respuesta. Es un {@code left} y no un
     * {@code join} a secas porque un movimiento puede no tener autor, y con el segundo esas
     * filas desaparecerían del historial.
     *
     * <p>La consulta de recuento se escribe a mano porque la derivada de una expresión de
     * constructor no es fiable.
     */
    @Query(value = """
            select new com.cellier.pantry.dto.StockMovementResponse(
                       m.id, m.type, m.delta, m.performedAt, autor.id, autor.displayName)
              from StockMovement m
              left join m.performedBy autor
             where m.item.id = :itemId
             order by m.performedAt desc, m.id desc
            """,
            countQuery = "select count(m) from StockMovement m where m.item.id = :itemId")
    Page<StockMovementResponse> findPageFor(@Param("itemId") UUID itemId, Pageable pageable);
}
