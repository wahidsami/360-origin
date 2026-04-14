import { IsString, IsNumber, IsEnum, IsOptional, IsDateString, IsObject, IsIn } from 'class-validator';
import { ContractStatus } from '@prisma/client';

export class CreateContractDto {
    @IsString()
    title: string;

    @IsNumber()
    amount: number;

    @IsOptional()
    @IsString()
    currency?: string;

    @IsDateString()
    startDate: string;

    @IsOptional()
    @IsDateString()
    endDate?: string;

    @IsOptional()
    @IsEnum(ContractStatus)
    status?: ContractStatus;

    @IsOptional()
    @IsString()
    @IsIn(['ar', 'en'])
    agreementLocale?: string;

    @IsOptional()
    @IsObject()
    agreementPayloadJson?: Record<string, unknown>;
}

export class UpdateContractDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsNumber()
    amount?: number;

    @IsOptional()
    @IsString()
    currency?: string;

    @IsOptional()
    @IsDateString()
    startDate?: string;

    @IsOptional()
    @IsDateString()
    endDate?: string;

    @IsOptional()
    @IsEnum(ContractStatus)
    status?: ContractStatus;

    @IsOptional()
    @IsString()
    @IsIn(['ar', 'en'])
    agreementLocale?: string;

    @IsOptional()
    @IsObject()
    agreementPayloadJson?: Record<string, unknown>;
}
