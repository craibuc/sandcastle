/**
 * JSON Schemas for the product routes. Fastify uses these both for runtime
 * request/response validation and to generate the Swagger/OpenAPI document.
 */

export const productSchema = {
  $id: 'Product',
  type: 'object',
  required: ['id', 'name', 'price', 'description'],
  properties: {
    id: { type: 'integer', description: 'Unique identifier' },
    name: { type: 'string', description: 'Product name' },
    price: { type: 'number', description: 'Unit price' },
    description: { type: 'string', description: 'Product description' },
  },
} as const;

export const productInputSchema = {
  $id: 'ProductInput',
  type: 'object',
  required: ['name', 'price', 'description'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, description: 'Product name' },
    price: { type: 'number', minimum: 0, description: 'Unit price' },
    description: { type: 'string', description: 'Product description' },
  },
} as const;

export const productPatchSchema = {
  $id: 'ProductPatch',
  type: 'object',
  additionalProperties: false,
  minProperties: 0,
  properties: {
    name: { type: 'string', minLength: 1, description: 'Product name' },
    price: { type: 'number', minimum: 0, description: 'Unit price' },
    description: { type: 'string', description: 'Product description' },
  },
} as const;

const idParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'integer', description: 'Product id' },
  },
} as const;

const productRef = { $ref: 'Product#' };
const errorRef = { $ref: 'Error#' };

const listProductsQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 20,
      description: 'Maximum number of rows to return',
    },
    offset: {
      type: 'integer',
      minimum: 0,
      default: 0,
      description: 'Number of rows to skip',
    },
    name: {
      type: 'string',
      minLength: 1,
      description: 'Filter by partial, case-insensitive name match',
    },
    sort: {
      type: 'string',
      enum: ['id', 'name', 'price'],
      default: 'id',
      description: 'Field to sort by',
    },
    order: {
      type: 'string',
      enum: ['asc', 'desc'],
      default: 'asc',
      description: 'Sort direction',
    },
  },
} as const;

export const listProductsSchema = {
  tags: ['products'],
  summary: 'List products (paginated, filterable by name)',
  querystring: listProductsQuery,
  response: {
    200: {
      type: 'array',
      items: productRef,
      headers: {
        'X-Total-Count': {
          type: 'integer',
          description: 'Total number of products matching the filter, ignoring pagination',
        },
        Link: {
          type: 'string',
          description: 'RFC 5988 pagination links (first/prev/next/last) preserving the filter',
        },
      },
    },
    400: errorRef,
  },
} as const;

export const getProductSchema = {
  tags: ['products'],
  summary: 'Get a product by id',
  params: idParams,
  response: {
    200: productRef,
    404: errorRef,
  },
} as const;

export const createProductSchema = {
  tags: ['products'],
  summary: 'Create a product',
  body: { $ref: 'ProductInput#' },
  response: {
    201: productRef,
    400: errorRef,
  },
} as const;

export const updateProductSchema = {
  tags: ['products'],
  summary: 'Replace a product',
  params: idParams,
  body: { $ref: 'ProductInput#' },
  response: {
    200: productRef,
    400: errorRef,
    404: errorRef,
  },
} as const;

export const patchProductSchema = {
  tags: ['products'],
  summary: 'Partially update a product',
  params: idParams,
  body: { $ref: 'ProductPatch#' },
  response: {
    200: productRef,
    400: errorRef,
    404: errorRef,
  },
} as const;

export const deleteProductSchema = {
  tags: ['products'],
  summary: 'Delete a product',
  params: idParams,
  response: {
    204: { type: 'null', description: 'No content' },
    404: errorRef,
  },
} as const;
