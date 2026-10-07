import { ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AppException } from '../errors';
import { AllExceptionsFilter } from './all-exceptions.filter';

const hostFor = (request: object, response: object): ArgumentsHost =>
  ({
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  }) as unknown as ArgumentsHost;

const responseDouble = (headersSent: boolean) => {
  const response = { headersSent, status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  response.status.mockReturnValue(response);
  return response;
};

describe('AllExceptionsFilter', () => {
  // Core Hub puts the access token in the query of /auth/callback.
  const callback = {
    method: 'GET',
    path: '/auth/callback',
    url: '/auth/callback?access_token=token-that-must-not-be-logged&token_type=Bearer',
  };

  let errors: jest.SpyInstance;

  beforeEach(() => {
    errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errors.mockRestore();
  });

  it('logs a failed request by its path, without the query string', () => {
    const response = responseDouble(false);

    new AllExceptionsFilter().catch(new Error('boom'), hostFor(callback, response));

    expect(JSON.parse(errors.mock.calls[0][0] as string)).toMatchObject({
      event: 'request.unhandled_error',
      path: '/auth/callback',
      status: 500,
    });
    expect(JSON.stringify(errors.mock.calls)).not.toContain('token-that-must-not-be-logged');
    expect(response.status).toHaveBeenCalledWith(500);
  });

  it('sends the Retry-After of a 503 the application raised', () => {
    const response = responseDouble(false);

    new AllExceptionsFilter().catch(
      AppException.serviceUnavailable('Core Hub is unavailable right now', 120),
      hostFor({ method: 'GET', path: '/api/v1/rooms' }, response),
    );

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '120');
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Core Hub is unavailable right now' },
    });
  });

  it.each([
    [HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE'],
    [HttpStatus.TOO_MANY_REQUESTS, 'TOO_MANY_REQUESTS'],
  ])('maps a bare HTTP %d to %s with a default Retry-After', (status, code) => {
    const response = responseDouble(false);

    new AllExceptionsFilter().catch(
      new HttpException('slow down', status),
      hostFor({ method: 'GET', path: '/api/v1/rooms' }, response),
    );

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '30');
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: { code, message: 'slow down' },
    });
  });

  it('sends no Retry-After with other errors', () => {
    const response = responseDouble(false);

    new AllExceptionsFilter().catch(
      AppException.unauthorized(),
      hostFor({ method: 'GET', path: '/api/v1/me' }, response),
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('does not write a second response when the handler already sent one', () => {
    const response = responseDouble(true);

    new AllExceptionsFilter().catch(new Error('late'), hostFor(callback, response));

    expect(errors).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});
