/**
 * Builds an [RFC 5988](https://datatracker.ietf.org/doc/html/rfc5988) `Link`
 * header for an offset-paginated collection, so clients can walk pages without
 * reconstructing URLs themselves.
 */

export interface LinkParams {
  /** Path of the collection, e.g. `/users`. */
  path: string;
  /** Page size currently in effect. */
  limit: number;
  /** Offset of the current page. */
  offset: number;
  /** Total number of rows matching the query, across all pages. */
  total: number;
  /** Extra query params to preserve on every link (filter, sort, …). */
  query?: Record<string, string | number | undefined>;
}

/**
 * Returns a `Link` header value with `first`/`last` always present and
 * `prev`/`next` included only when such a page exists. Returns `undefined`
 * when there is nothing to page over, so the caller can omit the header.
 */
export function buildLinkHeader({ path, limit, offset, total, query }: LinkParams): string | undefined {
  if (total <= 0) return undefined;

  const lastOffset = Math.floor((total - 1) / limit) * limit;

  const url = (pageOffset: number): string => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    params.set('limit', String(limit));
    params.set('offset', String(pageOffset));
    return `${path}?${params.toString()}`;
  };

  const rels: Array<[rel: string, pageOffset: number]> = [['first', 0]];
  if (offset > 0) rels.push(['prev', Math.max(0, offset - limit)]);
  if (offset + limit < total) rels.push(['next', offset + limit]);
  rels.push(['last', lastOffset]);

  return rels.map(([rel, pageOffset]) => `<${url(pageOffset)}>; rel="${rel}"`).join(', ');
}
