import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { SsoService } from '../src/auth/sso.service';
import { ConfigService } from '@nestjs/config';

describe('Auth routes (e2e)', () => {
  let app: INestApplication<App>;

  const authServiceMock = {
    validateUser: jest.fn(),
    login: jest.fn(),
    verify2faLogin: jest.fn(),
    setup2fa: jest.fn(),
    verify2faSetup: jest.fn(),
    disable2fa: jest.fn(),
    acceptInvite: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    signupOrg: jest.fn(),
  };

  const ssoServiceMock = {
    getGoogleConfigByOrg: jest.fn(),
    findOrCreateUserFromGoogle: jest.fn(),
    getSamlMetadata: jest.fn(),
    getSamlAuthorizeUrl: jest.fn(),
    validateSamlResponse: jest.fn(),
    findOrCreateUserFromSaml: jest.fn(),
  };

  const configMock = {
    get: jest.fn((key: string) => {
      if (key === 'FRONTEND_URL') return 'http://frontend.local';
      if (key === 'API_URL') return 'http://api.local';
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: SsoService, useValue: ssoServiceMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /auth/login returns a token for valid credentials', async () => {
    authServiceMock.validateUser.mockResolvedValue({ id: 'user-1', email: 'admin@arena360.com' });
    authServiceMock.login.mockResolvedValue({ accessToken: 'login-token' });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@arena360.com', password: 'secret' })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({ accessToken: 'login-token' });
      });
  });

  it('POST /auth/login rejects invalid credentials', async () => {
    authServiceMock.validateUser.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@arena360.com', password: 'wrong' })
      .expect(401);
  });

  it('GET /auth/sso/google redirects into Google auth', async () => {
    ssoServiceMock.getGoogleConfigByOrg.mockResolvedValue({
      org: { id: 'org-1' },
      config: { clientId: 'google-client-1' },
    });

    await request(app.getHttpServer())
      .get('/auth/sso/google?org=arena')
      .expect(302)
      .expect(({ headers }) => {
        expect(headers.location).toContain('accounts.google.com/o/oauth2/v2/auth');
      });
  });

  it('POST /auth/sso/saml/callback returns the auth callback redirect', async () => {
    ssoServiceMock.validateSamlResponse.mockResolvedValue({
      orgId: 'org-1',
      nameId: 'user@example.com',
      attributes: { email: 'user@example.com' },
    });
    ssoServiceMock.findOrCreateUserFromSaml.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    authServiceMock.login.mockResolvedValue({ accessToken: 'saml-token' });

    await request(app.getHttpServer())
      .post('/auth/sso/saml/callback')
      .send({ SAMLResponse: 'payload' })
      .expect(302)
      .expect('Location', 'http://frontend.local/#/auth/callback?token=saml-token');
  });
});
