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
