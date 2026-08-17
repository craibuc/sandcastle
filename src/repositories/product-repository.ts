import {
  DummyMssqlDatabase,
  PRODUCT_SORTABLE_COLUMNS,
  SQL,
  type ProductRow,
  type SortDirection,
} from '../db/dummy-mssql.js';
import type { ListProductsOptions, Product, ProductInput, ProductPatch } from '../types.js';

const toProduct = (row: ProductRow): Product => ({
  id: row.Id,
  name: row.Name,
  price: row.Price,
  description: row.Description,
});

/**
 * Data access for products. Talks to a {@link DummyMssqlDatabase} using the same
 * `request().input().query()` calls the real `mssql` driver exposes, so the
 * only change needed to hit a real SQL Server is the injected database.
 */
export class ProductRepository {
  constructor(private readonly db: DummyMssqlDatabase) {}

  /**
   * Lists products, newest-id last, with an optional name filter and a
   * pagination window. Defaults to the first 20 rows.
   */
  async findAll(options: ListProductsOptions = {}): Promise<Product[]> {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const name = options.name ? `%${options.name}%` : null;
    const column = PRODUCT_SORTABLE_COLUMNS[options.sort ?? 'id'];
    const direction: SortDirection = options.order === 'desc' ? 'DESC' : 'ASC';
    const { recordset } = await this.db
      .request()
      .input('name', name)
      .input('offset', offset)
      .input('limit', limit)
      .query<ProductRow>(SQL.listProducts(column, direction));
    return recordset.map(toProduct);
  }

  /**
   * Counts products matching an optional name filter, ignoring any pagination
   * options. Lets callers report the full result size (e.g. an
   * `X-Total-Count` header) independently of the returned page.
   */
  async count(options: ListProductsOptions = {}): Promise<number> {
    const name = options.name ? `%${options.name}%` : null;
    const { recordset } = await this.db
      .request()
      .input('name', name)
      .query<{ Total: number }>(SQL.countProducts);
    return recordset[0].Total;
  }

  async findById(id: number): Promise<Product | null> {
    const { recordset } = await this.db
      .request()
      .input('id', id)
      .query<ProductRow>(SQL.selectProductById);
    return recordset.length > 0 ? toProduct(recordset[0]) : null;
  }

  async create(input: ProductInput): Promise<Product> {
    const { recordset } = await this.db
      .request()
      .input('name', input.name)
      .input('price', input.price)
      .input('description', input.description)
      .query<ProductRow>(SQL.insertProduct);
    return toProduct(recordset[0]);
  }

  async update(id: number, input: ProductInput): Promise<Product | null> {
    const { recordset, rowsAffected } = await this.db
      .request()
      .input('id', id)
      .input('name', input.name)
      .input('price', input.price)
      .input('description', input.description)
      .query<ProductRow>(SQL.updateProduct);
    return rowsAffected[0] > 0 ? toProduct(recordset[0]) : null;
  }

  /**
   * Applies a partial update: reads the current row, merges the provided
   * fields over it, then reuses {@link update}. Returns `null` if no product
   * with `id` exists.
   */
  async patch(id: number, changes: ProductPatch): Promise<Product | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    return this.update(id, {
      name: changes.name ?? existing.name,
      price: changes.price ?? existing.price,
      description: changes.description ?? existing.description,
    });
  }

  async remove(id: number): Promise<boolean> {
    const { rowsAffected } = await this.db.request().input('id', id).query(SQL.deleteProduct);
    return rowsAffected[0] > 0;
  }
}
