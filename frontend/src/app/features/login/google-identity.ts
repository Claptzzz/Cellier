/**
 * Tipos mínimos de Google Identity Services y carga del script bajo demanda.
 *
 * No hay paquete npm oficial para GIS: Google exige cargar el script desde su
 * dominio para poder rotar la implementación. Se carga sólo al entrar en /login,
 * no en el arranque, para no pagarlo en cada visita.
 */

export interface GoogleCredentialResponse {
  readonly credential: string;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
}

interface GoogleGlobal {
  readonly accounts: { readonly id: GoogleAccountsId };
}

declare global {
  interface Window {
    google?: GoogleGlobal;
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let loader: Promise<GoogleGlobal> | null = null;

export function loadGoogleIdentity(): Promise<GoogleGlobal> {
  if (window.google) {
    return Promise.resolve(window.google);
  }
  if (loader) {
    return loader;
  }

  loader = new Promise<GoogleGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google) {
        resolve(window.google);
      } else {
        reject(new Error('Google Identity Services cargó sin exponer window.google'));
      }
    };
    script.onerror = () => {
      loader = null;
      reject(new Error('No se pudo cargar Google Identity Services'));
    };
    document.head.appendChild(script);
  });

  return loader;
}
