import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpResponse = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((data: unknown) => ({
        code: httpResponse.statusCode,
        message: 'Success',
        data,
      })),
    );
  }
}
