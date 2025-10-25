import type { AreaDetail } from '../src/api';
import { normalizeAreaGeometry } from '../src/utils/geometry';

describe('normalizeAreaGeometry', () => {
  it('normalises tables and landmarks into the SeatMap viewport', () => {
    const area: AreaDetail = {
      id: 'area-1',
      name: 'Panorama Terrace',
      tables: [
        {
          id: 'table-1',
          name: 'T1',
          capacity: 4,
          position: [200, 400],
          footprint: [
            [180, 380],
            [220, 380],
            [220, 420],
            [180, 420],
          ],
        },
        {
          id: 'table-2',
          name: 'T2',
          capacity: 2,
          position: [640, 820],
        },
      ],
      landmarks: [
        {
          id: 'bar',
          label: 'Signature Bar',
          type: 'bar',
          position: [720, 510],
          footprint: [
            [700, 490],
            [740, 490],
            [740, 530],
            [700, 530],
          ],
        },
      ],
    };

    const clonedOriginalFirstTable = area.tables[0]?.position && [...area.tables[0].position];

    const normalized = normalizeAreaGeometry(area);

    // Original input is not mutated.
    expect(area.tables[0]?.position).toEqual(clonedOriginalFirstTable);

    // Normalised area is a new object with tables/landmarks inside viewport bounds.
    expect(normalized).not.toBe(area);
    normalized.tables?.forEach((table) => {
      if (table.position) {
        expect(table.position[0]).toBeGreaterThanOrEqual(8);
        expect(table.position[0]).toBeLessThanOrEqual(92);
        expect(table.position[1]).toBeGreaterThanOrEqual(8);
        expect(table.position[1]).toBeLessThanOrEqual(92);
      }
      table.footprint?.forEach((point) => {
        expect(point[0]).toBeGreaterThanOrEqual(8);
        expect(point[0]).toBeLessThanOrEqual(92);
        expect(point[1]).toBeGreaterThanOrEqual(8);
        expect(point[1]).toBeLessThanOrEqual(92);
      });
    });

    expect(normalized.landmarks?.length).toBe(1);
    const landmark = normalized.landmarks?.[0];
    expect(landmark?.position?.[0]).toBeGreaterThanOrEqual(8);
    expect(landmark?.position?.[0]).toBeLessThanOrEqual(92);
    expect(landmark?.footprint?.[0]?.[1]).toBeGreaterThanOrEqual(8);
    expect(landmark?.footprint?.[0]?.[1]).toBeLessThanOrEqual(92);

    // Relative ordering is preserved.
    const [first, second] = normalized.tables ?? [];
    if (first?.position && second?.position) {
      expect(first.position[0]).toBeLessThan(second.position[0]);
      expect(first.position[1]).toBeLessThan(second.position[1]);
    }
  });

  it('falls back to centred coordinates when all points overlap', () => {
    const area: AreaDetail = {
      id: 'area-flat',
      name: 'Chef Counter',
      tables: [
        {
          id: 'single-table',
          name: 'C1',
          capacity: 4,
          position: [500, 500],
        },
      ],
    };

    const normalized = normalizeAreaGeometry(area);
    const [table] = normalized.tables ?? [];
    expect(table?.position).toEqual([50, 50]);
  });
});
