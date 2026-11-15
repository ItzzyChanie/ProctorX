import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermission,
} from '../auth/guards/permissions.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { RetentionService, retentionDays } from './retention.service';

@Controller('dean/security/retention')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class RetentionController {
  constructor(private retention: RetentionService) {}

  @Get()
  @Roles(Role.DEAN)
  @RequirePermission('MANAGE_SECURITY')
  policy() {
    return {
      retentionDays: retentionDays(),
      appliesTo: ['Screen recordings', 'Incident evidence clips'],
      kept: ['Scores and submissions', 'Proctoring events', 'Audit logs'],
      lastRunAt: this.retention.lastRunAt,
      lastResult: this.retention.lastResult,
    };
  }
}
