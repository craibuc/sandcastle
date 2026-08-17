import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { ProductRepository } from '../repositories/product-repository.js';
import type { DummyMssqlDatabase } from '../db/dummy-mssql.js';
import type { ListProductsOptions, ProductInput, ProductPatch } from '../types.js';
import { buildLinkHeader } from './pagination.js';
import {
  listProductsSchema,
  getProductSchema,
  createProductSchema,
  updateProductSchema,
  patchProductSchema,
  deleteProductSchema,
} from './product-schemas.js';

interface ProductRoutesOptions {
  database: DummyMssqlDatabase;
}

interface IdParams {
  id: number;
}

const notFound = (reply: FastifyReply, message: string): FastifyReply =>
  reply.code(404).send({ statusCode: 404, error: 'Not Found', message });

/** Registers CRUD routes for the `products` resource. */
export const productRoutes: FastifyPluginAsync<ProductRoutesOptions> = async (fastify, opts) => {
  const repo = new ProductRepository(opts.database);

  fastify.get<{ Querystring: ListProductsOptions }>('/products', { schema: listProductsSchema }, async (request, reply) => {
    const [products, total] = await Promise.all([repo.findAll(request.query), repo.count(request.query)]);
    reply.header('X-Total-Count', total);
    const { limit = 20, offset = 0, name, sort, order } = request.query;
    const link = buildLinkHeader({ path: '/products', limit, offset, total, query: { name, sort, order } });
    if (link) reply.header('Link', link);
    return products;
  });

  fastify.get<{ Params: IdParams }>('/products/:id', { schema: getProductSchema }, async (request, reply) => {
    const { id } = request.params;
    const product = await repo.findById(id);
    if (!product) return notFound(reply, `Product ${id} not found`);
    return product;
  });

  fastify.post<{ Body: ProductInput }>('/products', { schema: createProductSchema }, async (request, reply) => {
    const product = await repo.create(request.body);
    return reply.code(201).header('Location', `/products/${product.id}`).send(product);
  });

  fastify.put<{ Params: IdParams; Body: ProductInput }>(
    '/products/:id',
    { schema: updateProductSchema },
    async (request, reply) => {
      const { id } = request.params;
      const product = await repo.update(id, request.body);
      if (!product) return notFound(reply, `Product ${id} not found`);
      return product;
    },
  );

  fastify.patch<{ Params: IdParams; Body: ProductPatch }>(
    '/products/:id',
    { schema: patchProductSchema },
    async (request, reply) => {
      const { id } = request.params;
      const product = await repo.patch(id, request.body);
      if (!product) return notFound(reply, `Product ${id} not found`);
      return product;
    },
  );

  fastify.delete<{ Params: IdParams }>('/products/:id', { schema: deleteProductSchema }, async (request, reply) => {
    const { id } = request.params;
    const removed = await repo.remove(id);
    if (!removed) return notFound(reply, `Product ${id} not found`);
    return reply.code(204).send();
  });
};
