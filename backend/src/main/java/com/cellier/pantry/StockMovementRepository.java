package com.cellier.pantry;

import com.cellier.pantry.domain.StockMovement;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface StockMovementRepository extends JpaRepository<StockMovement, UUID> {

    long countByItemId(UUID itemId);
}
