import { Body, Controller, Delete, ForbiddenException, Get, Headers, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { TermsService } from './terms.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CreateTermsSectionDto, UpdateTermsSectionDto } from './dto/terms-section.dto';

@Controller('terms')
export class TermsController {
  constructor(private readonly termsService: TermsService) {}

  @Get('public')
  async getPublicSections(@Headers('accept-language') acceptLanguage?: string) {
    return this.termsService.getPublicSections(acceptLanguage || 'en');
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard)
  async getAllSections(@Req() req: any) {
    if (req.user?.role !== 'admin') throw new ForbiddenException();
    return this.termsService.getAllSections();
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard)
  async createSection(@Body() dto: CreateTermsSectionDto, @Req() req: any) {
    if (req.user?.role !== 'admin') throw new ForbiddenException();
    return this.termsService.createSection(dto, req.user?.id);
  }

  @Patch('admin/:id')
  @UseGuards(JwtAuthGuard)
  async updateSection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTermsSectionDto,
    @Req() req: any,
  ) {
    if (req.user?.role !== 'admin') throw new ForbiddenException();
    return this.termsService.updateSection(id, dto, req.user?.id);
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard)
  async deleteSection(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    if (req.user?.role !== 'admin') throw new ForbiddenException();
    await this.termsService.deleteSection(id);
    return { success: true };
  }
}
