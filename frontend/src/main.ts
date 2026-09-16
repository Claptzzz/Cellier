import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

// La huella del arbol de fuentes, visible en el DOM. El arnes la compara con la del disco
// antes de capturar: si no coinciden, el servidor esta sirviendo una compilacion vieja y
// las capturas no valen nada. Ver la seccion de frescura en docs/frontend-verificacion.md.
document.documentElement.dataset['build'] = environment.buildStamp;

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
