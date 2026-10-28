import { describe, expect, it } from 'vitest';
import { hasSafetyExclusion, parseDevice } from './device';

describe('parseDevice', () => {
  it('recognises supported models and defaults absent attributes', () => {
    expect(parseDevice('Apple iPhone 13')).toEqual({ brand: 'iphone', model: 'iPhone 13', storage: undefined, condition: 'good condition' });
  });
  it('keeps Samsung storage and condition', () => {
    expect(parseDevice('Samsung Galaxy S22 Ultra 256 Go - excellent')).toMatchObject({ brand: 'samsung', storage: 256, condition: 'excellent condition' });
  });
  it('canonicalises current explicit iPhone and Galaxy families', () => {
    expect(parseDevice('iPhone 16 Pro Max 1 TB')).toMatchObject({ brand: 'iphone', model: 'iPhone 16 Pro Max', storage: 1024 });
    expect(parseDevice('Apple iPhone 16e 128 Go')).toMatchObject({ brand: 'iphone', model: 'iPhone 16e', storage: 128 });
    expect(parseDevice('iPhone Air 256 GB')).toMatchObject({ brand: 'iphone', model: 'iPhone Air', storage: 256 });
    expect(parseDevice('Galaxy Z Fold 6 512 Go')).toMatchObject({ brand: 'samsung', model: 'Galaxy Z Fold 6', storage: 512 });
    expect(parseDevice('Samsung Galaxy S25 Edge 256 GB')).toMatchObject({ brand: 'samsung', model: 'Samsung Galaxy S25 Edge', storage: 256 });
    expect(parseDevice('Samsung Galaxy A56 5G 128 GB')).toMatchObject({ brand: 'samsung', model: 'Samsung Galaxy A56 5G', storage: 128 });
  });
  it('does not identify unsupported phones', () => expect(parseDevice('Google Pixel 9 128GB')).toBeUndefined());
  it('does not value phone accessories as phones', () => {
    expect(parseDevice('Boîte iPhone 13')).toBeUndefined();
    expect(parseDevice('Bateria iPhone 6s')).toBeUndefined();
    expect(parseDevice('Tampa traseira iPhone 15 Pro')).toBeUndefined();
  });
  it('does not value empty packaging or a listing that excludes the phone', () => {
    expect(parseDevice('Boîte vide iPhone 13')).toBeUndefined();
    expect(parseDevice('iPhone 13 - téléphone non inclus')).toBeUndefined();
  });
  it('uses description wording only as a safety veto', () => {
    expect(hasSafetyExclusion('Vendu dans sa boîte avec chargeur')).toBe(false);
    expect(hasSafetyExclusion('Boîte vide, téléphone non inclus')).toBe(true);
  });
  it('does not value broken or parts-only phones', () => {
    expect(parseDevice('iPhone 7 sim HS')).toBeUndefined();
    expect(parseDevice('iPhone 11 pour pièces')).toBeUndefined();
  });
});
