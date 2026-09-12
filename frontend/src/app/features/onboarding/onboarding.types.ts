export type { HouseholdDetail } from '../../core/household/household.models';

/** Lo mínimo que se lee del cuerpo de un error del backend. */
export interface ProblemDetailLike {
  readonly detail?: string;
}
