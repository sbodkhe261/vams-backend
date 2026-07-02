import { Controller, Post, Body, Get, UseGuards, UseInterceptors, Patch, Param } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { TenantInterceptor } from '../common/interceptors/tenant.interceptor';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@ApiTags('Companies & Tenant Settings')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new tenant company (Public)' })
  create(@Body() data: CreateCompanyDto) {
    return this.companiesService.create(data.name);
  }

  @Get('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(TenantInterceptor)
  @Roles(UserRole.COMPANY_ADMIN, UserRole.FACTORY_MANAGER)
  @ApiOperation({ summary: 'Retrieve settings (sounds, grace period) for the company' })
  getSettings(@TenantId() companyId: string) {
    return this.companiesService.getSettings(companyId);
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(TenantInterceptor)
  @Roles(UserRole.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update sound profiles and configuration parameters' })
  updateSettings(@TenantId() companyId: string, @Body() data: UpdateSettingsDto) {
    return this.companiesService.updateSettings(companyId, data);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get company details by ID (Public)' })
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Get(':companyId/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Get all users in the company (Company Admin only)' })
  findUsers(@Param('companyId') companyId: string) {
    return this.companiesService.findUsers(companyId);
  }
}
