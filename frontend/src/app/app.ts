import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeService } from './core/theme/theme.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: `:host { display: block; min-height: 100dvh; }`,
})
export class App {
  // Se inyecta en el arranque para que el effect que sincroniza la clase .dark
  // quede activo desde el primer render, no en el primer componente que lo use.
  private readonly theme = inject(ThemeService);
}
