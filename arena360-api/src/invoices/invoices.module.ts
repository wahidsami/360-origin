import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../common/prisma.service';
import { AutomationModule } from '../automation/automation.module';
import { SlaModule } from '../sla/sla.module';

@Module({
    imports: [AutomationModule, SlaModule],
    controllers: [InvoicesController],
    providers: [InvoicesService, PrismaService],
    exports: [InvoicesService],
})
export class InvoicesModule { }
