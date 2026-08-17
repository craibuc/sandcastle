import { describe, it, expect } from 'vitest';
import { buildLinkHeader } from './pagination.js';

describe('buildLinkHeader', () => {
  it('returns undefined when there are no rows to page over', () => {
    expect(buildLinkHeader({ path: '/users', limit: 20, offset: 0, total: 0 })).toBeUndefined();
  });

  it('emits first/last but no prev on the first page, and a next when more rows remain', () => {
    const link = buildLinkHeader({ path: '/users', limit: 2, offset: 0, total: 5 });
    expect(link).toContain('</users?limit=2&offset=0>; rel="first"');
    expect(link).toContain('</users?limit=2&offset=2>; rel="next"');
    expect(link).toContain('</users?limit=2&offset=4>; rel="last"');
    expect(link).not.toContain('rel="prev"');
  });

  it('emits prev but no next on the last page', () => {
    const link = buildLinkHeader({ path: '/users', limit: 2, offset: 4, total: 5 });
    expect(link).toContain('</users?limit=2&offset=2>; rel="prev"');
    expect(link).toContain('</users?limit=2&offset=0>; rel="first"');
    expect(link).toContain('</users?limit=2&offset=4>; rel="last"');
    expect(link).not.toContain('rel="next"');
  });

  it('clamps prev to offset 0 and preserves filter/sort query params', () => {
    const link = buildLinkHeader({
      path: '/users',
      limit: 10,
      offset: 5,
      total: 40,
      query: { name: 'a', sort: 'name', order: 'desc' },
    });
    expect(link).toContain('name=a');
    expect(link).toContain('sort=name');
    expect(link).toContain('order=desc');
    expect(link).toContain('offset=0>; rel="prev"');
    // last page offset = floor((40-1)/10)*10 = 30
    expect(link).toContain('offset=30>; rel="last"');
  });
});
