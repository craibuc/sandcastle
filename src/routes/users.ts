import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { UserRepository } from '../repositories/user-repository.js';
import type { DummyMssqlDatabase } from '../db/dummy-mssql.js';
import type { UserInput } from '../types.js';
import {
  listUsersSchema,
  getUserSchema,
  createUserSchema,
  updateUserSchema,
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

/** Registers CRUD routes for the `users` resource. */
export const userRoutes: FastifyPluginAsync<UserRoutesOptions> = async (fastify, opts) => {
  const repo = new UserRepository(opts.database);

  fastify.get('/users', { schema: listUsersSchema }, async () => {
    return repo.findAll();
  });

  fastify.get<{ Params: IdParams }>('/users/:id', { schema: getUserSchema }, async (request, reply) => {
    const { id } = request.params;
    const user = await repo.findById(id);
    if (!user) return notFound(reply, `User ${id} not found`);
    return user;
  });

  fastify.post<{ Body: UserInput }>('/users', { schema: createUserSchema }, async (request, reply) => {
    const user = await repo.create(request.body);
    return reply.code(201).header('Location', `/users/${user.id}`).send(user);
  });

  fastify.put<{ Params: IdParams; Body: UserInput }>(
    '/users/:id',
    { schema: updateUserSchema },
    async (request, reply) => {
      const { id } = request.params;
      const user = await repo.update(id, request.body);
      if (!user) return notFound(reply, `User ${id} not found`);
      return user;
    },
  );

  fastify.delete<{ Params: IdParams }>('/users/:id', { schema: deleteUserSchema }, async (request, reply) => {
    const { id } = request.params;
    const removed = await repo.remove(id);
    if (!removed) return notFound(reply, `User ${id} not found`);
    return reply.code(204).send();
  });
};
