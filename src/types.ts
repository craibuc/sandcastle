/** Domain model for a user, as exposed by the API (camelCase). */
export interface User {
  id: number;
  name: string;
  email: string;
}

/** Payload accepted when creating or replacing a user. */
export interface UserInput {
  name: string;
  email: string;
}

/** Payload accepted when partially updating a user; every field is optional. */
export type UserPatch = Partial<UserInput>;

/** Field a user list may be sorted by. */
export type UserSortField = 'id' | 'name' | 'email';

/** Sort direction for a user list. */
export type SortOrder = 'asc' | 'desc';

/** Options for listing users: pagination window, name filter and sort. */
export interface ListUsersOptions {
  limit?: number;
  offset?: number;
  name?: string;
  sort?: UserSortField;
  order?: SortOrder;
}

/** Domain model for a product, as exposed by the API (camelCase). */
export interface Product {
  id: number;
  name: string;
  price: number;
  description: string;
}

/** Payload accepted when creating or replacing a product. */
export interface ProductInput {
  name: string;
  price: number;
  description: string;
}

/** Payload accepted when partially updating a product; every field is optional. */
export type ProductPatch = Partial<ProductInput>;

/** Field a product list may be sorted by. */
export type ProductSortField = 'id' | 'name' | 'price';

/** Options for listing products: pagination window, name filter and sort. */
export interface ListProductsOptions {
  limit?: number;
  offset?: number;
  name?: string;
  sort?: ProductSortField;
  order?: SortOrder;
}
