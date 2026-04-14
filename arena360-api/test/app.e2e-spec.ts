import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from './../src/app.controller';
import { AppService } from './../src/app.service';
import { PrismaService } from './../src/common/prisma.service';
import { StorageService } from './../src/common/storage.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const prismaMock = {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };
  const storageMock = {} as StorageService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: StorageService,
          useValue: storageMock,
        },
      ],
    })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      version: '0.0.1',
      fingerprint: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('/ready (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/ready')
      .expect(200);

    expect(prismaMock.$queryRaw).toHaveBeenCalled();
    expect(response.body).toMatchObject({
      status: 'ready',
      database: 'connected',
      storage: 'initialized',
      timestamp: expect.any(String),
    });
  });
});
