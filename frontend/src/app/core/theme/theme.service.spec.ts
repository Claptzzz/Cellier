import { TestBed } from '@angular/core/testing';

import { installLocalStorage } from '../../../testing/local-storage';
import { CELLIER_THEME_STORAGE_KEY, ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    TestBed.resetTestingModule();
  });


  it('arranca en modo sistema cuando no hay nada guardado', () => {
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode()).toBe('system');
  });

  it('respeta el modo guardado en localStorage', () => {
    localStorage.setItem(CELLIER_THEME_STORAGE_KEY, 'dark');
    const theme = TestBed.inject(ThemeService);

    expect(theme.mode()).toBe('dark');
    expect(theme.isDark()).toBe(true);
  });

  it('ignora un valor corrupto y cae a sistema', () => {
    localStorage.setItem(CELLIER_THEME_STORAGE_KEY, 'purpura');
    expect(TestBed.inject(ThemeService).mode()).toBe('system');
  });

  it('aplica la clase .dark en <html> y la quita al volver a claro', () => {
    const theme = TestBed.inject(ThemeService);

    theme.set('dark');
    TestBed.tick();
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    theme.set('light');
    TestBed.tick();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('persiste el modo elegido', () => {
    const theme = TestBed.inject(ThemeService);

    theme.set('dark');
    TestBed.tick();

    expect(localStorage.getItem(CELLIER_THEME_STORAGE_KEY)).toBe('dark');
  });

  it('cicla claro, oscuro y sistema en ese orden', () => {
    const theme = TestBed.inject(ThemeService);
    theme.set('light');

    theme.cycle();
    expect(theme.mode()).toBe('dark');
    theme.cycle();
    expect(theme.mode()).toBe('system');
    theme.cycle();
    expect(theme.mode()).toBe('light');
  });
});
