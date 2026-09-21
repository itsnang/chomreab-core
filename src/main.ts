import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { useContainer } from 'class-validator';

interface OpenAPIOperation {
  responses?: Record<string, unknown>;
}
interface OpenAPIResponse {
  description?: string;
  content?: Record<string, { schema?: Record<string, unknown> }>;
}

function wrapSwaggerResponses(document: OpenAPIObject): void {
  const HTTP_METHODS = [
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'options',
    'head',
    'trace',
  ];
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = (pathItem as Record<string, unknown>)[method] as
        | OpenAPIOperation
        | undefined;
      if (!operation?.responses) continue;
      for (const [statusCode, response] of Object.entries(
        operation.responses,
      )) {
        const status = parseInt(statusCode, 10);
        const content = (response as OpenAPIResponse).content?.[
          'application/json'
        ];
        if (status >= 200 && status < 300 && content) {
          const original = content.schema ?? {};
          content.schema = {
            type: 'object',
            properties: {
              code: { type: 'number', example: status },
              message: { type: 'string', example: 'Success' },
              data: original,
            },
          };
        } else if (status >= 400) {
          (response as OpenAPIResponse).content = {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: { type: 'number', example: status },
                  message: {
                    type: 'string',
                    example:
                      (response as OpenAPIResponse).description ?? 'Error',
                  },
                  data: { nullable: true, type: 'object' },
                },
              },
            },
          };
        }
      }
    }
  }
}
import { AppModule } from './app.module';
import { HttpLoggerInterceptor } from './shared/interceptors/http-logger.interceptor';
import { ResponseTransformInterceptor } from './shared/interceptors/response-transform.interceptor';
import { SnakeCaseInterceptor } from './shared/interceptors/snake-case.interceptor';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';

async function bootstrap() {
  // `rawBody: true` stashes the exact, unparsed request body on
  // `request.rawBody` (via a `verify` callback on the existing global body
  // parser) without changing how every other endpoint's `req.body` is
  // parsed. CutLuy's webhook HMACs the raw bytes, not the re-serialized
  // JSON — parsing and re-stringifying can reorder keys or change
  // whitespace, and the signature would never match. Only the webhook
  // controller reads `request.rawBody`; everything else is unaffected.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new HttpLoggerInterceptor(),
    new ResponseTransformInterceptor(),
    new SnakeCaseInterceptor(),
  );
  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  if (process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Attendance API')
      .setDescription('School/tutoring-center attendance system API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    wrapSwaggerResponses(document);
    SwaggerModule.setup('api', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
