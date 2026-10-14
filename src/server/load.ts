import "server-only";
import { notFound } from "next/navigation";
import { AppError } from "./services/errors";

/** Runs a service read and turns "not found / no access" into Next's 404 page. */
export async function loadOr404<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
}
