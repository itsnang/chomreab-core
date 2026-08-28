import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

const SENSITIVE_FIELDS = new Set<string>([
  'password',
  'new_password',
  'current_password',
  'old_password',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'reset_token',
  'api_key',
  'apikey',
  'secret',
  'client_secret',
  'authorization',
  'otp',
  'pin',
]);

function sanitizeUrl(url: string): string {
  const qIdx = url.indexOf('?');
  if (qIdx === -1) return url;
  const path = url.slice(0, qIdx);
  const params = new URLSearchParams(url.slice(qIdx + 1));
  for (const key of Array.from(params.keys())) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) params.set(key, '[REDACTED]');
  }
  return `${path}?${params.toString()}`;
}

function sanitizeBody(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeBody);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE_FIELDS.has(k.toLowerCase()) ? '[REDACTED]' : sanitizeBody(v),
      ]),
    );
  }
  return value;
}

@Injectable()
export class HttpLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpLogger');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const traceId = randomUUID();
    const requestTime = new Date().toISOString();
    const ip =
      (request.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ??
      request.ip ??
      request.socket.remoteAddress ??
      'unknown';

    this.logger.log(
      JSON.stringify({
        type: 'request',
        trace_id: traceId,
        method: request.method,
        url: sanitizeUrl(request.url),
        ip_address: ip,
        request_body: sanitizeBody(request.body),
        request_time: requestTime,
      }),
    );

    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: (responseBody: unknown) => {
          this.logger.log(
            JSON.stringify({
              type: 'response',
              trace_id: traceId,
              response_body: sanitizeBody(responseBody),
              response_time: new Date().toISOString(),
              duration_ms: Date.now() - start,
            }),
          );
        },
        error: (err: Error) => {
          this.logger.error(
            JSON.stringify({
              type: 'response',
              trace_id: traceId,
              error: err.message,
              response_time: new Date().toISOString(),
              duration_ms: Date.now() - start,
            }),
          );
        },
      }),
    );
  }
}
