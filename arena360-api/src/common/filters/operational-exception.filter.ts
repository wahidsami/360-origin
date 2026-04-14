import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { OperationalAlertsService } from '../operational-alerts.service';

@Catch()
export class OperationalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(OperationalExceptionFilter.name);

  constructor(private readonly alerts: OperationalAlertsService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { user?: { orgId?: string; id?: string } }>();
    const response = ctx.getResponse<Response>();

    const httpException = exception instanceof HttpException ? exception : null;
    const status = httpException?.getStatus() ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      httpException?.message ||
      (exception instanceof Error ? exception.message : 'Unexpected server error');

    if (status >= 500) {
      const orgId = request.user?.orgId;
      if (orgId) {
        await this.alerts.alertOrg(orgId, 'Unhandled API failure', `${request.method} ${request.originalUrl || request.url} failed: ${message}`, {
          source: 'http-exception',
          entityType: 'api-error',
          metadata: {
            method: request.method,
            url: request.originalUrl || request.url,
            status,
          },
        });
      } else {
        this.logger.warn(`Unhandled API failure without org context: ${request.method} ${request.originalUrl || request.url} -> ${message}`);
      }
    }

    response.status(status).json(
      httpException?.getResponse?.() || {
        statusCode: status,
        message,
      },
    );
  }
}
