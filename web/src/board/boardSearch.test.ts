import { describe, expect, it } from 'vitest';
import { matchSterbefallQuery } from './boardSearch';
import type { Sterbefall } from '../types';

describe('matchSterbefallQuery', () => {
  it('findet nach Name und Fall-Nr.', () => {
    const fall = {
      id: '1',
      verstorbenerName: 'Franz Kerschhofer',
      sterbefallId: '260200',
    } as Sterbefall;
    expect(matchSterbefallQuery(fall, 'kerschhofer')).toBe(true);
    expect(matchSterbefallQuery(fall, '260200')).toBe(true);
    expect(matchSterbefallQuery(fall, '260200 kersch')).toBe(true);
    expect(matchSterbefallQuery(fall, 'wolfsberg')).toBe(false);
  });
});
