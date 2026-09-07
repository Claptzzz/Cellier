import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Button } from './button';

@Component({
  imports: [Button],
  template: `
    <ui-button>Guardar cambios</ui-button>
    <ui-button [link]="['/h', 'casa', 'pantry']">Entrar a Casa Rivas</ui-button>
  `,
})
class Host {}

describe('Button', () => {
  function render() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('sin link renderiza un <button>', () => {
    const boton = render().querySelector('button');
    expect(boton).not.toBeNull();
    expect(boton?.textContent?.trim()).toBe('Guardar cambios');
  });

  it('con link renderiza un <a> navegable', () => {
    const enlace = render().querySelector('a');
    expect(enlace).not.toBeNull();
    expect(enlace?.getAttribute('href')).toBe('/h/casa/pantry');
  });

  it('AMBAS variantes muestran su contenido', () => {
    // Con un <ng-content> duplicado en las dos ramas, Angular llena sólo la primera y la
    // otra sale vacía: un botón "Entrar a…" que se renderizaba como una cápsula sin
    // texto. Se ve en una captura, no en un tipo.
    const host = render();

    expect(host.querySelector('button')?.textContent?.trim()).toBe('Guardar cambios');
    expect(host.querySelector('a')?.textContent?.trim()).toBe('Entrar a Casa Rivas');
  });
});
