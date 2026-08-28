import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function toSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function transformKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(transformKeys);
  // Values with their own `toJSON` (Date, and anything else that defines one)
  // already know how to serialize themselves — recursing into their internal
  // representation via Object.entries would corrupt them (e.g. a Date has no
  // own enumerable properties, so it would turn into `{}`). Let them pass
  // through untouched; JSON.stringify calls toJSON() for us downstream.
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { toJSON?: unknown }).toJSON === 'function'
  ) {
    return value;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        toSnake(k),
        transformKeys(v),
      ]),
    );
  }
  return value;
}

@Injectable()
export class SnakeCaseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(transformKeys));
  }
}
