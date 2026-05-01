// apps/api/src/common/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// // apps/api/src/common/decorators/public.decorator.ts
// import { SetMetadata } from '@nestjs/common';

// export const IS_PUBLIC_KEY = 'isPublic';
// export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// apps/api/src/common/decorators/current-user.decorator.ts
// import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// export const CurrentUser = createParamDecorator(
//   (data: string | undefined, ctx: ExecutionContext) => {
//     const request = ctx.switchToHttp().getRequest();
//     const user = request.user;
//     return data ? user?.[data] : user;
//   },
// );
