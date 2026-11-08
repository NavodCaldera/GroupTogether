/** A user-facing failure: its message is safe to show. */
export class AppError extends Error {}

/** Old name, kept so existing `catch (CartError)` code keeps working. */
export const CartError = AppError;
export type CartError = AppError;
