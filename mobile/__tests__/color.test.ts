import { hexToRgba } from '../src/utils/color';

describe('hexToRgba', () => {
  it('converts six-character hex codes to rgba', () => {
    expect(hexToRgba('#336699', 0.5)).toBe('rgba(51, 102, 153, 0.5)');
  });

  it('expands shorthand hex codes before converting', () => {
    expect(hexToRgba('#1af', 0.3)).toBe('rgba(17, 170, 255, 0.3)');
  });

  it('returns original value when input is invalid', () => {
    expect(hexToRgba('rgb(0,0,0)', 0.5)).toBe('rgb(0,0,0)');
    expect(hexToRgba('#zzzzzz', 0.5)).toBe('#zzzzzz');
    expect(hexToRgba('', 0.5)).toBe('');
  });
});
