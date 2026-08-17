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
