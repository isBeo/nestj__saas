import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const errorResponse = {
      statusCode: status,
      message:
        typeof exceptionResponse === 'object' && 'message' in exceptionResponse
          ? (exceptionResponse as any).message
          : exception.message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    this.logger.error(`Error ${status}: ${errorResponse.message}`);

    response.status(status).json(errorResponse);
  }
}
