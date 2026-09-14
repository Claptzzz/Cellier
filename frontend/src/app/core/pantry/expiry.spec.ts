import { daysUntil, expiryLabel, expiryState } from './expiry';

/** Un jueves cualquiera, a media tarde: la hora no debe influir en nada de esto. */
const HOY = new Date(2026, 8, 12, 16, 40);

describe('expiry', () => {
  describe('daysUntil', () => {
    it('cuenta días de calendario, no horas', () => {
      // Faltan 7 horas para mañana, pero mañana es 1 día, no 0.
      expect(daysUntil('2026-09-13', new Date(2026, 8, 12, 23, 30))).toBe(1);
      expect(daysUntil('2026-09-12', HOY)).toBe(0);
      expect(daysUntil('2026-09-11', HOY)).toBe(-1);
    });

    it('cruza el cambio de mes y de año', () => {
      expect(daysUntil('2026-10-01', new Date(2026, 8, 30))).toBe(1);
      expect(daysUntil('2027-01-01', new Date(2026, 11, 31))).toBe(1);
    });
  });

  describe('expiryState', () => {
    it('sin fecha no hay nada que avisar', () => {
      expect(expiryState(undefined, HOY)).toBe('none');
    });

    it('el borde está entre hoy y ayer', () => {
      expect(expiryState('2026-09-12', HOY)).toBe('soon');
      expect(expiryState('2026-09-11', HOY)).toBe('expired');
    });

    it('avisa hasta tres días y calla al cuarto', () => {
      expect(expiryState('2026-09-15', HOY)).toBe('soon');
      expect(expiryState('2026-09-16', HOY)).toBe('none');
    });
  });

  describe('expiryLabel', () => {
    it('dice cada caso con palabras distintas, no sólo con otro color', () => {
      expect(expiryLabel('2026-09-12', HOY)).toBe('Vence hoy');
      expect(expiryLabel('2026-09-13', HOY)).toBe('Vence mañana');
      expect(expiryLabel('2026-09-14', HOY)).toBe('Vence en 2 días');
      expect(expiryLabel('2026-09-11', HOY)).toBe('Venció ayer');
      expect(expiryLabel('2026-09-09', HOY)).toBe('Venció hace 3 días');
    });

    it('calla cuando aún queda margen', () => {
      expect(expiryLabel('2026-10-20', HOY)).toBe('');
      expect(expiryLabel(undefined, HOY)).toBe('');
    });

    it('«vence hoy» y «venció ayer» no comparten texto', () => {
      // Es el par donde confundirse tiene consecuencias, y donde los dos tonos son más
      // parecidos en escala de grises. El texto es lo que de verdad los separa.
      expect(expiryLabel('2026-09-12', HOY)).not.toBe(expiryLabel('2026-09-11', HOY));
    });
  });
});
