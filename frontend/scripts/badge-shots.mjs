import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = new URL('../../docs/ui-shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
for (const theme of ['light', 'dark']) {
  for (const mode of ['color', 'grayscale', 'deuteranopia']) {
    const ctx = await b.newContext({ viewport: { width: 620, height: 220 }, deviceScaleFactor: 3, colorScheme: theme });
    const p = await ctx.newPage();
    await p.route('**/api/v1/me', r => r.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({id:'1',email:'a@b.cl',displayName:'Ana Rivas',avatarUrl:null,locale:'es-CL',themePreference:'SYSTEM',createdAt:'2026-08-24T20:15:30Z'}) }));
    await p.addInitScript((t) => {
      localStorage.setItem('cellier.theme', t);
      localStorage.setItem('cellier.refreshToken', 'shot');
    }, theme);
    await p.goto('http://localhost:4200/dev/ui', { waitUntil: 'networkidle' });

    const section = p.locator('section').filter({ hasText: 'Etiquetas' }).first();
    await section.scrollIntoViewIfNeeded();

    if (mode === 'grayscale') {
      await p.evaluate(() => { document.body.style.filter = 'grayscale(1)'; });
    } else if (mode === 'deuteranopia') {
      await p.evaluate(() => {
        const d = document.createElement('div');
        d.innerHTML = "<svg xmlns='http://www.w3.org/2000/svg' style='position:absolute;width:0;height:0'><filter id='deu'><feColorMatrix type='matrix' values='0.625 0.375 0 0 0 0.70 0.30 0 0 0 0 0.30 0.70 0 0 0 0 0 1 0'/></filter></svg>";
        document.body.appendChild(d);
        document.body.style.filter = 'url(#deu)';
      });
    }
    await p.waitForTimeout(300);
    await section.screenshot({ path: `${OUT}badge-${mode}-${theme}.png` });
    await ctx.close();
  }
}
await b.close();
console.log('capturas de badge listas');
