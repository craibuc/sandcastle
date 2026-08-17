import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { DuplicateEmailError, UserRepository } from '../repositories/user-repository.js';
import type { DummyMssqlDatabase } from '../db/dummy-mssql.js';
import type { ListUsersOptions, UserInput, UserPatch } from '../types.js';
import { buildLinkHeader } from './pagination.js';
import {
  listUsersSchema,
  getUserSchema,
  createUserSchema,
  updateUserSchema,
  patchUserSchema,
  deleteUserSchema,
} from './user-schemas.js';

interface UserRoutesOptions {
  database: DummyMssqlDatabase;
}

interface IdParams {
  id: number;
}

const notFound = (reply: FastifyReply, message: string): FastifyReply =>
  reply.code(404).send({ statusCode: 404, error: 'Not Found', message });

const conflict = (reply: FastifyReply, message: string): FastifyReply =>
  reply.code(409).send({ statusCode: 409, error: 'Conflict', message });

/** Registers CRUD routes for the `users` resource. */
export const userRoutes: FastifyPluginAsync<UserRoutesOptions> = async (fastify, opts) => {
  const repo = new UserRepository(opts.database);

  fastify.get<{ Querystring: ListUsersOptions }>('/users', { schema: listUsersSchema }, async (request, reply) => {
    const [users, total] = await Promise.all([repo.findAll(request.query), repo.count(request.query)]);
    reply.header('X-Total-Count', total);
    const { limit = 20, offset = 0, name, sort, order } = request.query;
    const link = buildLinkHeader({ path: '/users', limit, offset, total, query: { name, sort, order } });
    if (link) reply.header('Link', link);
    return users;
  });

  fastify.get<{ Params: IdParams }>('/users/:id', { schema: getUserSchema }, async (request, reply) => {
    const { id } = request.params;
    const user = await repo.findById(id);
    if (!user) return notFound(reply, `User ${id} not found`);
    return user;
  });

  fastify.post<{ Body: UserInput }>('/users', { schema: createUserSchema }, async (request, reply) => {
    try {
      const user = await repo.create(request.body);
      return reply.code(201).header('Location', `/users/${user.id}`).send(user);
    } catch (err) {
      if (err instanceof DuplicateEmailError) return conflict(reply, err.message);
      throw err;
    }
  });

  fastify.put<{ Params: IdParams; Body: UserInput }>(
    '/users/:id',
    { schema: updateUserSchema },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const user = await repo.update(id, request.body);
        if (!user) return notFound(reply, `User ${id} not found`);
        return user;
      } catch (err) {
        if (err instanceof DuplicateEmailError) return conflict(reply, err.message);
        throw err;
      }
    },
  );

  fastify.patch<{ Params: IdParams; Body: UserPatch }>(
    '/users/:id',
    { schema: patchUserSchema },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const user = await repo.patch(id, request.body);
        if (!user) return notFound(reply, `User ${id} not found`);
        return user;
      } catch (err) {
        if (err instanceof DuplicateEmailError) return conflict(reply, err.message);
        throw err;
      }
    },
  );

  fastify.delete<{ Params: IdParams }>('/users/:id', { schema: deleteUserSchema }, async (request, reply) => {
    const { id } = request.params;
    const removed = await repo.remove(id);
    if (!removed) return notFound(reply, `User ${id} not found`);
    return reply.code(204).send();
  });
};
