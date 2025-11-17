import { ErrorLogger, ErrorLogData } from '../../lib/errorLogger';
import { prisma } from '../../lib/prisma';

// Mock dependencies
jest.mock('../../lib/prisma', () => ({
  prisma: {
    errorLog: {
      create: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Mock console.error to avoid noise in tests but still track calls
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('ErrorLogger', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.ERROR_LOGGING_VERBOSE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('logError', () => {
    const mockErrorData: ErrorLogData = {
      error: 'Test error message',
      errorType: 'test_error',
      stackTrace: 'Error: Test error\n    at test.js:10:5',
      userAgent: 'Mozilla/5.0 (Test Browser)',
      url: 'http://localhost:3000/test',
      additionalData: { testKey: 'testValue' },
      userId: 'user-123',
    };

    it('should successfully log error to database', async () => {
      (mockPrisma.errorLog.create as jest.Mock).mockResolvedValue({
        id: '1',
        error: mockErrorData.error,
        errorType: mockErrorData.errorType,
        stackTrace: mockErrorData.stackTrace,
        userAgent: mockErrorData.userAgent,
        url: mockErrorData.url,
        additionalData: mockErrorData.additionalData,
        userId: mockErrorData.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ErrorLogger.logError(mockErrorData);

      expect(mockPrisma.errorLog.create).toHaveBeenCalledWith({
        data: {
          error: mockErrorData.error,
          errorType: mockErrorData.errorType,
          stackTrace: undefined, // Not verbose by default
          userAgent: mockErrorData.userAgent,
          url: mockErrorData.url,
          additionalData: mockErrorData.additionalData,
          userId: mockErrorData.userId,
        },
      });
    });

    it('should handle database errors gracefully', async () => {
      (mockPrisma.errorLog.create as jest.Mock).mockRejectedValue(new Error('Database error'));

      await ErrorLogger.logError(mockErrorData);

      expect(mockConsoleError).toHaveBeenCalledWith(
        'Failed to log error to database:',
        expect.any(Error)
      );
    });
  });

  describe('Verbose Mode', () => {
    it('should include stack trace when verbose mode is enabled', async () => {
      process.env.ERROR_LOGGING_VERBOSE = 'true';

      const mockErrorData: ErrorLogData = {
        error: 'Verbose error',
        errorType: 'test_error',
        stackTrace: 'Error: Verbose error\n    at test.js:10:5',
        userAgent: 'Mozilla/5.0',
        url: 'http://localhost:3000/test',
        userId: 'user-123',
      };

      (mockPrisma.errorLog.create as jest.Mock).mockResolvedValue({
        id: '1',
        ...mockErrorData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ErrorLogger.logError(mockErrorData);

      expect(mockPrisma.errorLog.create).toHaveBeenCalledWith({
        data: {
          error: mockErrorData.error,
          errorType: mockErrorData.errorType,
          stackTrace: mockErrorData.stackTrace, // Included in verbose mode
          userAgent: mockErrorData.userAgent,
          url: mockErrorData.url,
          additionalData: mockErrorData.additionalData,
          userId: mockErrorData.userId,
        },
      });
    });

    it('should exclude stack trace when verbose mode is disabled', async () => {
      process.env.ERROR_LOGGING_VERBOSE = 'false';

      const mockErrorData: ErrorLogData = {
        error: 'Non-verbose error',
        errorType: 'test_error',
        stackTrace: 'Error: Non-verbose error\n    at test.js:10:5',
        userAgent: 'Mozilla/5.0',
        url: 'http://localhost:3000/test',
        userId: 'user-123',
      };

      (mockPrisma.errorLog.create as jest.Mock).mockResolvedValue({
        id: '1',
        ...mockErrorData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ErrorLogger.logError(mockErrorData);

      expect(mockPrisma.errorLog.create).toHaveBeenCalledWith({
        data: {
          error: mockErrorData.error,
          errorType: mockErrorData.errorType,
          stackTrace: undefined, // Excluded in non-verbose mode
          userAgent: mockErrorData.userAgent,
          url: mockErrorData.url,
          additionalData: mockErrorData.additionalData,
          userId: mockErrorData.userId,
        },
      });
    });

    it('should include additional environment data in verbose mode for API errors', async () => {
      process.env.ERROR_LOGGING_VERBOSE = 'true';

      const mockRequest = new Request('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Test Agent',
        },
      });

      (mockPrisma.errorLog.create as jest.Mock).mockResolvedValue({
        id: '1',
        error: 'API error',
        errorType: 'api_error',
        stackTrace: 'Error stack',
        userAgent: 'Test Agent',
        url: 'http://localhost:3000/api/test',
        additionalData: null,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ErrorLogger.logAPIError(
        new Error('API error'),
        'api_error',
        mockRequest,
        { customKey: 'customValue' }
      );

      expect(mockPrisma.errorLog.create).toHaveBeenCalled();
      const callArgs = (mockPrisma.errorLog.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.data.additionalData).toHaveProperty('verbose', true);
      expect(callArgs.data.additionalData).toHaveProperty('environment');
      expect(callArgs.data.additionalData).toHaveProperty('request');
      expect(callArgs.data.additionalData.customKey).toBe('customValue');
    });
  });

  describe('Sanitization', () => {
    it('should sanitize sensitive data from additional data', async () => {
      const sensitiveData = {
        username: 'testuser',
        password: 'secret123',
        apiKey: 'key-123',
        token: 'token-456',
        email: 'test@example.com',
      };

      (mockPrisma.errorLog.create as jest.Mock).mockResolvedValue({
        id: '1',
        error: 'Test error',
        errorType: 'test_error',
        stackTrace: null,
        userAgent: null,
        url: null,
        additionalData: null,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ErrorLogger.logAPIError(
        'Test error',
        'test_error',
        undefined,
        sensitiveData
      );

      expect(mockPrisma.errorLog.create).toHaveBeenCalled();
      const callArgs = (mockPrisma.errorLog.create as jest.Mock).mock.calls[0][0];
      const additionalData = callArgs.data.additionalData;

      expect(additionalData.username).toBe('testuser');
      expect(additionalData.password).toBe('[REDACTED]');
      expect(additionalData.apiKey).toBe('[REDACTED]');
      expect(additionalData.token).toBe('[REDACTED]');
      expect(additionalData.email).toBe('test@example.com');
    });

    it('should sanitize nested sensitive data', async () => {
      const nestedSensitiveData = {
        user: {
          name: 'Test User',
          credentials: {
            password: 'secret',
            apiKey: 'key-123',
          },
        },
        metadata: {
          source: 'test',
        },
      };

      (mockPrisma.errorLog.create as jest.Mock).mockResolvedValue({
        id: '1',
        error: 'Test error',
        errorType: 'test_error',
        stackTrace: null,
        userAgent: null,
        url: null,
        additionalData: null,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ErrorLogger.logAPIError(
        'Test error',
        'test_error',
        undefined,
        nestedSensitiveData
      );

      expect(mockPrisma.errorLog.create).toHaveBeenCalled();
      const callArgs = (mockPrisma.errorLog.create as jest.Mock).mock.calls[0][0];
      const additionalData = callArgs.data.additionalData;

      expect(additionalData.user.name).toBe('Test User');
      expect(additionalData.user.credentials).toBe('[REDACTED]');
      expect(additionalData.metadata.source).toBe('test');
    });

    it('should sanitize sensitive headers from request', async () => {
      process.env.ERROR_LOGGING_VERBOSE = 'true';

      const mockRequest = new Request('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer secret-token',
          'cookie': 'session=abc123',
          'user-agent': 'Test Agent',
        },
      });

      (mockPrisma.errorLog.create as jest.Mock).mockResolvedValue({
        id: '1',
        error: 'API error',
        errorType: 'api_error',
        stackTrace: 'Error stack',
        userAgent: 'Test Agent',
        url: 'http://localhost:3000/api/test',
        additionalData: null,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ErrorLogger.logAPIError(
        new Error('API error'),
        'api_error',
        mockRequest
      );

      expect(mockPrisma.errorLog.create).toHaveBeenCalled();
      const callArgs = (mockPrisma.errorLog.create as jest.Mock).mock.calls[0][0];
      const headers = callArgs.data.additionalData.request.headers;

      expect(headers['content-type']).toBe('application/json');
      expect(headers['authorization']).toBe('[REDACTED]');
      expect(headers['cookie']).toBe('[REDACTED]');
      expect(headers['user-agent']).toBe('Test Agent');
    });
  });

  describe('logClientError', () => {
    it('should log client error with Error object', async () => {
      const testError = new Error('Client error');

      (mockPrisma.errorLog.create as jest.Mock).mockResolvedValue({
        id: '1',
        error: 'Client error',
        errorType: 'client_error',
        stackTrace: testError.stack || null,
        userAgent: null,
        url: null,
        additionalData: null,
        userId: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ErrorLogger.logClientError(testError, 'client_error', 'user-123');

      expect(mockPrisma.errorLog.create).toHaveBeenCalled();
      const callArgs = (mockPrisma.errorLog.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.data.error).toBe('Client error');
      expect(callArgs.data.errorType).toBe('client_error');
      expect(callArgs.data.userId).toBe('user-123');
    });

    it('should log client error with string', async () => {
      (mockPrisma.errorLog.create as jest.Mock).mockResolvedValue({
        id: '1',
        error: 'String error',
        errorType: 'client_error',
        stackTrace: null,
        userAgent: null,
        url: null,
        additionalData: null,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ErrorLogger.logClientError('String error', 'client_error');

      expect(mockPrisma.errorLog.create).toHaveBeenCalled();
      const callArgs = (mockPrisma.errorLog.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.data.error).toBe('String error');
      expect(callArgs.data.stackTrace).toBeUndefined();
    });
  });

  describe('logAPIError', () => {
    it('should log API error with Error object and request', async () => {
      const testError = new Error('API error');
      const mockRequest = new Request('http://localhost:3000/api/test', {
        method: 'GET',
        headers: {
          'user-agent': 'Test Agent',
        },
      });

      (mockPrisma.errorLog.create as jest.Mock).mockResolvedValue({
        id: '1',
        error: 'API error',
        errorType: 'api_error',
        stackTrace: testError.stack || null,
        userAgent: 'Test Agent',
        url: 'http://localhost:3000/api/test',
        additionalData: null,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ErrorLogger.logAPIError(testError, 'api_error', mockRequest);

      expect(mockPrisma.errorLog.create).toHaveBeenCalled();
      const callArgs = (mockPrisma.errorLog.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.data.error).toBe('API error');
      expect(callArgs.data.userAgent).toBe('Test Agent');
      expect(callArgs.data.url).toBe('http://localhost:3000/api/test');
    });

    it('should log API error without request', async () => {
      (mockPrisma.errorLog.create as jest.Mock).mockResolvedValue({
        id: '1',
        error: 'API error',
        errorType: 'api_error',
        stackTrace: null,
        userAgent: null,
        url: null,
        additionalData: null,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await ErrorLogger.logAPIError('API error', 'api_error');

      expect(mockPrisma.errorLog.create).toHaveBeenCalled();
      const callArgs = (mockPrisma.errorLog.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.data.error).toBe('API error');
      expect(callArgs.data.userAgent).toBeUndefined();
      expect(callArgs.data.url).toBeUndefined();
    });
  });
});
