// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { collectSurfaces, fingerprint, renderMargin } from './vinted-dom';

describe('Vinted DOM rendering', () => {
  it('renders exactly one signed badge on a dynamically-added catalogue card', () => {
    document.body.innerHTML = '<div data-testid="item-box"><span>iPhone 13 128 GB</span><span data-testid="item-price">100,00 €</span></div>';
    const surface = collectSurfaces()[0];
    renderMargin(surface, 120);
    renderMargin(surface, 120);
    expect(surface.host.querySelectorAll('.vpm-margin-badge')).toHaveLength(1);
    expect(surface.host.querySelector('.vpm-margin-badge')?.textContent).toBe('+9 €');
    expect(surface.host.querySelector<HTMLElement>('.vpm-margin-badge')?.dataset.state).toBe('positive');
  });
  it('exposes the buyer that supplied the selected quote on hover', () => {
    const surface = { host: document.body.appendChild(document.createElement('div')), text: '', itemPrice: 100 };
    const badge = renderMargin(surface, 120, 'Cash Express');
    expect(badge.dataset.provider).toBe('Cash Express');
    expect(surface.host.title).toBe('Meilleure offre : Cash Express');
    expect(badge.getAttribute('aria-label')).toContain('offre Cash Express');
    surface.host.dispatchEvent(new MouseEvent('mouseenter'));
    expect(badge.textContent).toBe('+9 € · Cash Express');
    surface.host.dispatchEvent(new MouseEvent('mouseleave'));
    expect(badge.textContent).toBe('+9 €');
  });
  it('uses a grey question badge for an unknown model', () => {
    document.body.innerHTML = '<div data-testid="item-box">Google Pixel 9 <span data-testid="item-price">100 €</span></div>';
    const surface = collectSurfaces()[0];
    renderMargin(surface, undefined);
    expect(surface.host.querySelector<HTMLElement>('.vpm-margin-badge')?.dataset.state).toBe('unknown');
  });
  it('reads current Vinted product cards and their all-in price from the accessible product title', () => {
    document.body.innerHTML = '<div data-testid="product-item-id-42"><img alt="iPhone 14 128GB, Marque: Apple, Modèle: iPhone 14, État: Très bon état, 250.00 €, 263.20 €"><a data-testid="product-item-id-42--overlay-link" title="iPhone 14 128GB, Marque: Apple, Modèle: iPhone 14, État: Très bon état, 250.00 €, 263.20 €"></a></div>';
    const surface = collectSurfaces()[0];
    expect(surface.text).toContain('iPhone 14');
    expect(surface.itemPrice).toBe(250);
    expect(surface.vintedTotal).toBe(263.2);
    renderMargin(surface, 280);
    expect(surface.host.querySelector('.vpm-margin-badge')?.textContent).toBe('+12 €');
  });
  it('uses one outer card for repeated Vinted item-id regions', () => {
    document.body.innerHTML = `<div data-testid="product-item-id-42">
      <div class="new-item-box__image-container"><img alt="iPhone 13, 130 €, 137,20 €"></div>
      <div data-testid="product-item-id-42"><span>iPhone 13</span></div>
      <button data-testid="product-item-id-42">Favourite</button>
      <a data-testid="product-item-id-42--overlay-link" title="iPhone 13, 130 €, 137,20 €"></a>
    </div>`;
    const surfaces = collectSurfaces();
    expect(surfaces).toHaveLength(1);
    renderMargin(surfaces[0], 180);
    expect(document.querySelectorAll('.vpm-margin-badge')).toHaveLength(1);
    expect(surfaces[0].badgeHost?.querySelector('.vpm-margin-badge')).not.toBeNull();
  });
  it('keeps the outer card when an inner repeated id is encountered first', () => {
    document.body.innerHTML = `<div data-testid="product-item-id-42"><div data-testid="product-item-id-42">inner</div>
      <a data-testid="product-item-id-42--overlay-link" title="iPhone 13, 100 €, 108 €"></a></div>`;
    const surface = collectSurfaces()[0];
    expect(surface.host.parentElement).toBe(document.body);
  });
  it('uses the current product-page price and buyer protection', () => {
    history.pushState({}, '', '/items/123-phone');
    document.body.innerHTML = '<main><section><div data-testid="item-price">100 €</div><p data-testid="buyer-protection">Buyer Protection 3 €</p></section><h1>iPhone 13</h1><p>Capacité de stockage 128 Go</p><p>État Neuf avec étiquette</p></main>';
    const surface = collectSurfaces()[0];
    expect(surface.text).toBe('iPhone 13 128 Go Neuf avec étiquette');
    renderMargin(surface, 120);
    expect(surface.host.querySelector('.vpm-margin-badge')?.textContent).toBe('+12 €');
    history.pushState({}, '', '/');
  });
  it('prefers bounded product attributes and mounts the page badge on the gallery', () => {
    history.pushState({}, '', '/items/456-phone');
    document.body.innerHTML = `<main>
      <div data-testid="item-gallery"><img alt="Samsung A32"></div>
      <h1>Samsung A32</h1><div data-testid="item-price">130 €</div>
      <dl data-testid="item-details">Modèle : Galaxy A10\nStockage : 32 Go\nÉtat : Bon état</dl>
    </main>`;
    const surface = collectSurfaces()[0];
    expect(surface.text).toBe('Galaxy A10 32 Go Bon état');
    renderMargin(surface, 210);
    expect(document.querySelector('[data-testid="item-gallery"] .vpm-margin-badge')?.textContent).toBe('+68 €');
    history.pushState({}, '', '/');
  });
  it('uses the item photo and bounded details panel on Vinted’s current product layout', () => {
    history.pushState({}, '', '/items/789-phone');
    document.body.innerHTML = `<main><button data-testid="item-photo-1"></button>
      <section class="item-details"><h1>iPhone 13</h1><div data-testid="item-price">130 €</div>
      <p>Modèle iPhone 13 Capacité de stockage 128 Go État Très bon état</p>
      <p>PAIEMENT VIREMENT BANCAIRE uniquement</p></section>
      <div data-testid="other_user_items-1"><span data-testid="item-price">1 €</span></div></main>`;
    const surface = collectSurfaces()[0];
    expect(surface.text).toBe('iPhone 13 128 Go Très bon état');
    expect(surface.description).toContain('VIREMENT BANCAIRE');
    renderMargin(surface, 210);
    expect(document.querySelector('[data-testid="item-photo-1"] .vpm-margin-badge')?.textContent).toBe('+68 €');
    history.pushState({}, '', '/');
  });
  it('uses the current item pricing block instead of a seller-card all-in price', () => {
    history.pushState({}, '', '/items/790-phone');
    document.body.innerHTML = `<main><div data-testid="total-combined-price">5,95 €</div>
      <section class="item-details"><h1>Samsung Galaxy A10</h1><div class="details-list--pricing">
        <div data-testid="item-price">33 €</div><div data-testid="total-combined-price">35,35 €</div>
      </div></section></main>`;
    expect(collectSurfaces()[0].vintedTotal).toBe(35.35);
    history.pushState({}, '', '/');
  });
  it('renders +68 € from the €210 quote and the €137.20 Vinted all-in total', () => {
    const surface = { host: document.body.appendChild(document.createElement('div')), text: 'iPhone 13', itemPrice: 130, vintedTotal: 137.2 };
    expect(renderMargin(surface, 210).textContent).toBe('+68 €');
  });
  it('prefers dedicated card prices and reads the product all-in total', () => {
    document.body.innerHTML = `<div data-testid="product-item-id-42"><a data-testid="product-item-id-42--overlay-link" title="iPhone 13, 9 €"></a>
      <span data-testid="item-price">130 €</span><span data-testid="price-including">Frais Vinted inclus 137,20 €</span></div>`;
    let surface = collectSurfaces()[0];
    expect(surface.itemPrice).toBe(130);
    expect(surface.vintedTotal).toBe(137.2);
    history.pushState({}, '', '/items/222-phone');
    document.body.innerHTML = '<main><h1>iPhone 13</h1><div data-testid="item-price">130 €</div><div data-testid="total-price">Frais Vinted inclus 137,20 €</div></main>';
    surface = collectSurfaces()[0];
    expect(surface.vintedTotal).toBe(137.2);
    history.pushState({}, '', '/');
  });
  it('includes the displayed all-in total in its fingerprint', () => {
    const base = { host: document.createElement('div'), text: 'iPhone 13', itemPrice: 100, vintedTotal: 108 };
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, vintedTotal: 109 }));
  });
  it('includes safety description changes in its fingerprint', () => {
    const base = { host: document.createElement('div'), text: 'iPhone 13', description: '', itemPrice: 100 };
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, description: 'virement bancaire' }));
  });
});
