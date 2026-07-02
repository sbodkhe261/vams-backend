import { Injectable, NestInterceptor, ExecutionContext, CallHandler, ForbiddenException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { UserRole } from '@prisma/client';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required for multi-tenant isolation');
    }

    // Super admin is not bound to a specific tenant
    if (user.role === UserRole.SUPER_ADMIN) {
      const headerCompanyId = request.headers['x-company-id'];
      if (headerCompanyId) {
        request.companyId = headerCompanyId;
      }
    } else {
      // Regular user's company is locked to their profile
      request.companyId = user.companyId;
    }

    return next.handle();
  }
}
