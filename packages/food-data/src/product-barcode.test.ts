import { describe, expect, it } from '@rstest/core';
import { normalizeProductBarcode } from './product-barcode.js';

describe('retail product barcode', () => {
  it('accepts worked GS1 check-digit examples and preserves leading zeroes', () => {
    expect(normalizeProductBarcode('96385074')).toBe('96385074');
    expect(normalizeProductBarcode(' 3017620422003 ')).toBe('3017620422003');
    expect(normalizeProductBarcode('10012345000017')).toBe('10012345000017');
  });
  it('uses the same lookup and storage identity for UPC-A and EAN-13', () => {
    expect(normalizeProductBarcode('036000291452')).toBe('0036000291452');
    expect(normalizeProductBarcode('0036000291452')).toBe('0036000291452');
  });
  it('rejects damaged checksums, arbitrary scanner text and all-zero placeholders', () => {
    for (const input of ['3017620422004', '00000000', 'https://example.com', '12345', '3017-620422003', '3017620422003\nX', '１２３４５６７８']) {
      expect(normalizeProductBarcode(input)).toBeNull();
    }
  });
});
