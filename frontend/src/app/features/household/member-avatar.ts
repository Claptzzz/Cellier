import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Retrato de una persona del hogar. Con foto si la cuenta de Google la tiene; si no, sus
 * iniciales, que es información real y no un icono genérico repetido en cada fila.
 */
@Component({
  selector: 'app-member-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (avatarUrl(); as url) {
      <img
        [src]="url"
        alt=""
        aria-hidden="true"
        referrerpolicy="no-referrer"
        class="h-10 w-10 flex-none rounded-full object-cover" />
    } @else {
      <span
        class="flex h-10 w-10 flex-none items-center justify-center rounded-full
               bg-accent-weak text-[13px] font-semibold text-accent"
        aria-hidden="true">
        {{ initials() }}
      </span>
    }
  `,
  styles: `:host { display: contents; }`,
})
export class MemberAvatar {
  readonly displayName = input.required<string>();
  readonly avatarUrl = input<string | null>(null);

  protected readonly initials = computed(() =>
    this.displayName()
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join(''),
  );
}
