import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    UseGuards,
    Request,
    UseInterceptors,
    UploadedFile,
    Body,
    BadRequestException,
    Res
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UploadFileDto } from './dto/upload-file.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class FilesController {
    constructor(private readonly filesService: FilesService) { }

    // === CLIENT FILES ===

    @Get('clients/:clientId/files')
    listClientFiles(@Request() req: any, @Param('clientId') clientId: string) {
        return this.filesService.listClientFiles(clientId, req.user);
    }

    @Post('clients/:clientId/files')
    @UseInterceptors(FileInterceptor('file'))
    async uploadClientFile(
        @Request() req: any,
        @Param('clientId') clientId: string,
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: UploadFileDto
    ) {
        if (!file) {
            throw new BadRequestException('No file provided');
        }
        return this.filesService.uploadClientFile(
            clientId,
            req.user,
            file,
            dto.category,
            dto.visibility,
            dto.displayName
        );
    }

    @Get('clients/:clientId/files/:fileId/download')
    async downloadClientFile(
        @Request() req: any,
        @Param('clientId') clientId: string,
        @Param('fileId') fileId: string
    ) {
        const signedUrl = await this.filesService.downloadClientFile(clientId, fileId, req.user, true);
        return { url: signedUrl };
    }

    @Get('clients/:clientId/files/:fileId/view')
    async viewClientFile(
        @Request() req: any,
        @Param('clientId') clientId: string,
        @Param('fileId') fileId: string
    ) {
        const signedUrl = await this.filesService.downloadClientFile(clientId, fileId, req.user);
        return { url: signedUrl };
    }

    @Delete('clients/:clientId/files/:fileId')
    async deleteClientFile(
        @Request() req: any,
        @Param('clientId') clientId: string,
        @Param('fileId') fileId: string
    ) {
        await this.filesService.deleteClientFile(clientId, fileId, req.user);
        return { message: 'File deleted successfully' };
    }

    // === PROJECT FILES ===
    // ... (omitted same for projects for now unless needed)

    @Get('projects/:projectId/files')
    listProjectFiles(@Request() req: any, @Param('projectId') projectId: string) {
        return this.filesService.listProjectFiles(projectId, req.user);
    }

    @Post('projects/:projectId/files')
    @UseInterceptors(FileInterceptor('file'))
    async uploadProjectFile(
        @Request() req: any,
        @Param('projectId') projectId: string,
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: UploadFileDto
    ) {
        if (!file) {
            throw new BadRequestException('No file provided');
        }
        return this.filesService.uploadProjectFile(
            projectId,
            req.user,
            file,
            dto.category,
            dto.visibility,
            dto.displayName
        );
    }

    @Get('projects/:projectId/files/:fileId/download')
    async downloadProjectFile(
        @Request() req: any,
        @Param('projectId') projectId: string,
        @Param('fileId') fileId: string
    ) {
        const signedUrl = await this.filesService.downloadProjectFile(projectId, fileId, req.user, true);
        return { url: signedUrl };
    }

    @Get('projects/:projectId/files/:fileId/view')
    async viewProjectFile(
        @Request() req: any,
        @Param('projectId') projectId: string,
        @Param('fileId') fileId: string
    ) {
        const signedUrl = await this.filesService.downloadProjectFile(projectId, fileId, req.user, false);
        return { url: signedUrl };
    }

    @Delete('projects/:projectId/files/:fileId')
    async deleteProjectFile(
        @Request() req: any,
        @Param('projectId') projectId: string,
        @Param('fileId') fileId: string
    ) {
        await this.filesService.deleteProjectFile(projectId, fileId, req.user);
        return { message: 'File deleted successfully' };
    }

    // === FINDING FILES ===


    @Get('findings/:findingId/files')
    listFindingFiles(@Request() req: any, @Param('findingId') findingId: string) {
        return this.filesService.listFindingFiles(findingId, req.user);
    }

    @Post('findings/:findingId/files')
    @UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: 50 * 1024 * 1024 } // 50MB
    }))
    async uploadFindingFile(
        @Request() req: any,
        @Param('findingId') findingId: string,
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: UploadFileDto
    ) {
        if (!file) {
            throw new BadRequestException('No file provided');
        }
        return this.filesService.uploadFindingFile(
            findingId,
            req.user,
            file,
            dto.visibility
        );
    }

    @Get('findings/:findingId/files/:fileId/download')
    async downloadFindingFile(
        @Request() req: any,
        @Param('findingId') findingId: string,
        @Param('fileId') fileId: string
    ) {
        const signedUrl = await this.filesService.downloadFindingFile(findingId, fileId, req.user, true);
        return { url: signedUrl };
    }

    @Get('findings/:findingId/files/:fileId/view')
    async viewFindingFile(
        @Request() req: any,
        @Param('findingId') findingId: string,
        @Param('fileId') fileId: string,
        @Res() res: Response
    ) {
        const signedUrl = await this.filesService.downloadFindingFile(findingId, fileId, req.user);
        return res.redirect(signedUrl);
    }

    @Delete('findings/:findingId/files/:fileId')
    async deleteFindingFile(
        @Request() req: any,
        @Param('findingId') findingId: string,
        @Param('fileId') fileId: string
    ) {
        await this.filesService.deleteFindingFile(findingId, fileId, req.user);
        return { message: 'Finding evidence deleted successfully' };
    }

    // === TEMP UPLOAD (for discussion attachments) ===

    @Post('files/upload-temp')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
    async uploadTempFile(
        @Request() req: any,
        @UploadedFile() file: Express.Multer.File
    ) {
        if (!file) throw new BadRequestException('No file provided');
        const url = await this.filesService.uploadTempFile(req.user, file);
        return { url, filename: file.originalname };
    }
}
