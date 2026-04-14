import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
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
    get: jest.fn(),
  };

  const controller = new AuthController(authServiceMock as any, ssoServiceMock as any, configMock as any);

  beforeEach(() => {
    jest.clearAllMocks();
    configMock.get.mockImplementation((key: string) => {
      if (key === 'FRONTEND_URL') return 'http://frontend.local';
      if (key === 'API_URL') return 'http://api.local';
      return undefined;
    });
  });

  it('logs in valid users through the auth service', async () => {
    authServiceMock.validateUser.mockResolvedValue({ id: 'user-1', email: 'admin@arena360.com' });
    authServiceMock.login.mockResolvedValue({ accessToken: 'token-123' });

    await expect(controller.login({ email: 'admin@arena360.com', password: 'secret' } as any)).resolves.toEqual({
      accessToken: 'token-123',
    });

    expect(authServiceMock.validateUser).toHaveBeenCalledWith('admin@arena360.com', 'secret');
    expect(authServiceMock.login).toHaveBeenCalledWith({ id: 'user-1', email: 'admin@arena360.com' });
  });

  it('rejects invalid login attempts', async () => {
    authServiceMock.validateUser.mockResolvedValue(null);

    await expect(controller.login({ email: 'admin@arena360.com', password: 'wrong' } as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('redirects missing-org google SSO requests back to login', async () => {
    const res = { redirect: jest.fn() };

    await controller.googleSsoStart('', res as any);

    expect(res.redirect).toHaveBeenCalledWith('http://frontend.local/#/login?error=missing_org');
  });

  it('starts google SSO with the configured org payload', async () => {
    const res = { redirect: jest.fn() };
    ssoServiceMock.getGoogleConfigByOrg.mockResolvedValue({
      org: { id: 'org-123' },
      config: { clientId: 'google-client-1' },
    });

    await controller.googleSsoStart('arena', res as any);

    const redirectUrl = res.redirect.mock.calls[0][0] as string;
    expect(redirectUrl).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(redirectUrl).toContain('client_id=google-client-1');
    expect(redirectUrl).toContain('state=org-123');
    expect(redirectUrl).toContain(encodeURIComponent('http://api.local/auth/sso/google/callback'));
  });

  it('finishes SAML login and returns the auth callback redirect', async () => {
    const res = { redirect: jest.fn() };
    ssoServiceMock.validateSamlResponse.mockResolvedValue({
      orgId: 'org-456',
      nameId: 'user@example.com',
      attributes: { email: 'user@example.com' },
    });
    ssoServiceMock.findOrCreateUserFromSaml.mockResolvedValue({ id: 'user-456', email: 'user@example.com' });
    authServiceMock.login.mockResolvedValue({ accessToken: 'saml-token-1' });

    await controller.samlCallback({ SAMLResponse: 'payload' } as any, res as any);

    expect(ssoServiceMock.validateSamlResponse).toHaveBeenCalledWith('http://api.local', { SAMLResponse: 'payload' });
    expect(authServiceMock.login).toHaveBeenCalledWith({ id: 'user-456', email: 'user@example.com' });
    expect(res.redirect).toHaveBeenCalledWith('http://frontend.local/#/auth/callback?token=saml-token-1');
  });
});
