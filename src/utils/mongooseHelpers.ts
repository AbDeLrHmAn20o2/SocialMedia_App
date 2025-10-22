/**
 * Mongoose Model Type Helpers
 *
 * These helpers resolve TypeScript overload signature issues caused by
 * conditional model exports (mongoose.models.X || mongoose.model())
 */

import {
  Model,
  Document,
  FilterQuery,
  ProjectionType,
  QueryOptions,
} from "mongoose";

/**
 * Type-safe wrapper for Model.findOne() to avoid union type issues
 */
export async function findOneTyped<T>(
  model: any,
  filter: FilterQuery<T>,
  projection?: ProjectionType<T> | null,
  options?: QueryOptions<T>
): Promise<(Document<unknown, {}, T> & T) | null> {
  return await model.findOne(filter, projection, options).exec();
}

/**
 * Type-safe wrapper for Model.find() to avoid union type issues
 */
export async function findTyped<T>(
  model: any,
  filter: FilterQuery<T>,
  projection?: ProjectionType<T> | null,
  options?: QueryOptions<T>
): Promise<Array<Document<unknown, {}, T> & T>> {
  return await model.find(filter, projection, options).exec();
}

/**
 * Chainable query builder wrapper
 */
export function queryTyped<T>(model: any) {
  return model as Model<T>;
}
