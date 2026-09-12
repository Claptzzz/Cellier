import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeService } from './core/theme/theme.service';
import { ToastHost } from './shared/ui/toast-host';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ToastHost],
  /**
   * El host de avisos vive aquí y no en el chasis. Estando dentro del chasis, todo lo
   * que pasa fuera de él —entrar, la bienvenida, la pantalla de reconexión— lanzaba
   * avisos que nadie podía ver: el componente que los pinta no estaba montado.
   */
  template: `
    <router-outlet />
    <ui-toast-host />
  `,
  styles: `:host { display: block; min-height: 100dvh; }`,
})
export class App {
  // Se inyecta en el arranque para que el effect que sincroniza la clase .dark
  // quede activo desde el primer render, no en el primer componente que lo use.
  private readonly theme = inject(ThemeService);
}
