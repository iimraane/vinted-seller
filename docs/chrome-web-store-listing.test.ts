import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

describe('Chrome Web Store listing', () => {
  it('explains the independent, read-only valuation and its data flow in French', async () => {
    const listing = await readFile(resolve(root, 'docs/chrome-web-store-listing.fr.md'), 'utf8');

    expect(listing).toContain('Vinted Phone Margin');
    expect(listing).toContain('extension indépendante');
    expect(listing).toContain('lecture seule sur Vinted');
    expect(listing).toContain('iPhone et certains Samsung Galaxy');
    expect(listing).toContain('Easy Cash et de Cash Express');
    expect(listing).toContain('estimations publiques de reprise');
    expect(listing).toContain('non contractuelles');
    expect(listing).toContain('données de compte Vinted, les données de paiement, les coordonnées de contact ni le contenu des messages Vinted');
    expect(listing).toContain("Aucun champ public de support ou de confidentialité n'est renseigné");
  });

  it('includes a Store-sized live extension screenshot and matching disclosure checklist', async () => {
    const screenshot = await readFile(resolve(root, 'docs/store-assets/vinted-listing-margin.png'));
    const checklist = await readFile(resolve(root, 'docs/store-assets/submission-checklist.md'), 'utf8');

    expect(screenshot.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(screenshot.readUInt32BE(16)).toBe(1280);
    expect(screenshot.readUInt32BE(20)).toBe(800);
    expect(screenshot.subarray(-8, -4).toString('ascii')).toBe('IEND');
    expect(checklist).toContain('24 hours');
    expect(checklist).toContain('Easy Cash and Cash Express');
  });
});
