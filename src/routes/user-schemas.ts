/**
 * JSON Schemas for the user routes. Fastify uses these both for runtime
 * request/response validation and to generate the Swagger/OpenAPI document.
 */

export const userSchema = {
  $id: 'User',
  type: 'object',
  required: ['id', 'name', 'email'],
  properties: {
    id: { type: 'integer', description: 'Unique identifier' },
    name: { type: 'string', description: 'Full name' },
    email: { type: 'string', format: 'email', description: 'Email address' },
  },
} as const;

export const userInputSchema = {
  $id: 'UserInput',
  type: 'object',
  required: ['name', 'email'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, description: 'Full name' },
    email: { type: 'string', format: 'email', description: 'Email address' },
  },
} as const;

export const userPatchSchema = {
  $id: 'UserPatch',
  type: 'object',
  additionalProperties: false,
  minProperties: 0,
  properties: {
    name: { type: 'string', minLength: 1, description: 'Full name' },
    email: { type: 'string', format: 'email', description: 'Email address' },
  },
} as const;

export const errorSchema = {
  $id: 'Error',
  type: 'object',
  required: ['statusCode', 'error', 'message'],
  properties: {
    statusCode: { type: 'integer' },
    error: { type: 'string' },
    message: { type: 'string' },
  },
} as const;

const idParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'integer', description: 'User id' },
  },
} as const;

const userRef = { $ref: 'User#' };
const errorRef = { $ref: 'Error#' };

const listUsersQuery = {
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
  },
} as const;

export const listUsersSchema = {
  tags: ['users'],
  summary: 'List users (paginated, filterable by name)',
  querystring: listUsersQuery,
  response: {
    200: {
      type: 'array',
      items: userRef,
      headers: {
        'X-Total-Count': {
          type: 'integer',
          description: 'Total number of users matching the filter, ignoring pagination',
        },
      },
    },
    400: errorRef,
  },
} as const;

export const getUserSchema = {
  tags: ['users'],
  summary: 'Get a user by id',
  params: idParams,
  response: {
    200: userRef,
    404: errorRef,
  },
} as const;

export const createUserSchema = {
  tags: ['users'],
  summary: 'Create a user',
  body: { $ref: 'UserInput#' },
  response: {
    201: userRef,
    400: errorRef,
  },
} as const;

export const updateUserSchema = {
  tags: ['users'],
  summary: 'Replace a user',
  params: idParams,
  body: { $ref: 'UserInput#' },
  response: {
    200: userRef,
    400: errorRef,
    404: errorRef,
  },
} as const;

export const patchUserSchema = {
  tags: ['users'],
  summary: 'Partially update a user',
  params: idParams,
  body: { $ref: 'UserPatch#' },
  response: {
    200: userRef,
    400: errorRef,
    404: errorRef,
  },
} as const;

export const deleteUserSchema = {
  tags: ['users'],
  summary: 'Delete a user',
  params: idParams,
  response: {
    204: { type: 'null', description: 'No content' },
    404: errorRef,
  },
} as const;
