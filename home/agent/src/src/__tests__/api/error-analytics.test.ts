import { NextRequest } from 'next/server';
import { GET } from '../../app/api/error-analytics/route';
import { prisma } from '../../lib/prisma';
import { getServerSession } from 'next-auth';
import { ErrorLogger } from '../../lib/errorLogger';

// Mock dependencies
jest.mock('../../lib/prisma', () => ({
  prisma: {
    errorLog: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));
jest.mock('next-auth');
jest.mock('../../lib/errorLogger');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockErrorLogger = ErrorLogger as jest.Mocked<typeof ErrorLogger>;

describe('/api/error-analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/error-analytics', () => {
    it('should return 401 for unauthenticated users', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/error-analytics');
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
      expect(mockPrisma.errorLog.count).not.toHaveBeenCalled();
    });

    it('should return analytics for regular user (only their errors)', async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com', name: 'Test User', role: 'user' },
      });

      // Mock all the database calls
      (mockPrisma.errorLog.count as jest.Mock)
        .mockResolvedValueOnce(100) // totalErrors
        .mockResolvedValueOnce(10)  // errorsToday
        .mockResolvedValueOnce(30); // errorsThisWeek

      (mockPrisma.errorLog.groupBy as jest.Mock)
        .mockResolvedValueOnce([
          { userId: 'user-123', _count: 100 },
        ]) // affectedUsers
        .mockResolvedValueOnce([
          { errorType: 'client_error', _count: 60 },
          { errorType: 'api_error', _count: 40 },
        ]) // errorsByType
        .mockResolvedValueOnce([
          { error: 'Error 1', _count: 50, _max: { createdAt: new Date('2023-01-01') } },
          { error: 'Error 2', _count: 30, _max: { createdAt: new Date('2023-01-02') } },
        ]); // topErrors

      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([
        { date: new Date('2023-01-01'), count: BigInt(5) },
        { date: new Date('2023-01-02'), count: BigInt(8) },
      ]); // errorsByDay

      (mockPrisma.errorLog.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'error-1',
          error: 'Test error',
          errorType: 'client_error',
          url: 'http://localhost:3000/test',
          createdAt: new Date('2023-01-01'),
        },
      ]); // recentErrors

      const req = new NextRequest('http://localhost:3000/api/error-analytics');
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('summary');
      expect(data.summary).toEqual({
        totalErrors: 100,
        errorsToday: 10,
        errorsThisWeek: 30,
        affectedUsers: 1,
        mostCommonType: 'client_error',
      });
      expect(data).toHaveProperty('byType');
      expect(data.byType).toHaveLength(2);
      expect(data.byType[0]).toEqual({
        errorType: 'client_error',
        count: 60,
        percentage: 60,
      });
      expect(data).toHaveProperty('byDay');
      expect(data).toHaveProperty('topErrors');
      expect(data).toHaveProperty('recentErrors');

      // Verify user-specific filtering was applied
      expect(mockPrisma.errorLog.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: 'user-123' }),
      });
    });

    it('should return analytics for admin user (all errors)', async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'admin-123', email: 'admin@example.com', name: 'Admin', role: 'admin' },
      });

      // Mock database calls
      (mockPrisma.errorLog.count as jest.Mock)
        .mockResolvedValueOnce(500)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(150);

      (mockPrisma.errorLog.groupBy as jest.Mock)
        .mockResolvedValueOnce([
          { userId: 'user-1', _count: 100 },
          { userId: 'user-2', _count: 200 },
          { userId: null, _count: 200 },
        ])
        .mockResolvedValueOnce([
          { errorType: 'api_error', _count: 300 },
          { errorType: 'client_error', _count: 200 },
        ])
        .mockResolvedValueOnce([
          { error: 'Common error', _count: 150, _max: { createdAt: new Date('2023-01-01') } },
        ]);

      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([
        { date: new Date('2023-01-01'), count: BigInt(10) },
      ]);

      (mockPrisma.errorLog.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'error-1',
          error: 'Admin view error',
          errorType: 'api_error',
          url: 'http://localhost:3000/api/test',
          createdAt: new Date('2023-01-01'),
          userId: 'user-1',
          user: {
            id: 'user-1',
            name: 'User One',
            email: 'user1@example.com',
          },
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/error-analytics');
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.summary.totalErrors).toBe(500);
      expect(data.summary.affectedUsers).toBe(2); // Excludes null userId

      // Admin should see all errors, not filtered by userId
      expect(mockPrisma.errorLog.count).toHaveBeenCalledWith({
        where: expect.not.objectContaining({ userId: expect.anything() }),
      });

      // Admin should see user information in recent errors
      expect(data.recentErrors[0]).toHaveProperty('userId');
      expect(data.recentErrors[0]).toHaveProperty('user');
    });

    it('should filter by errorType when provided', async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com', name: 'Test User', role: 'user' },
      });

      // Mock database calls
      (mockPrisma.errorLog.count as jest.Mock).mockResolvedValue(50);
      (mockPrisma.errorLog.groupBy as jest.Mock)
        .mockResolvedValue([])
        .mockResolvedValue([]);
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      (mockPrisma.errorLog.findMany as jest.Mock).mockResolvedValue([]);

      const req = new NextRequest(
        'http://localhost:3000/api/error-analytics?errorType=client_error'
      );
      const response = await GET(req);

      expect(response.status).toBe(200);
      expect(mockPrisma.errorLog.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: 'user-123',
          errorType: 'client_error',
        }),
      });
    });

    it('should filter by date range when provided', async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com', name: 'Test User', role: 'user' },
      });

      // Mock database calls
      (mockPrisma.errorLog.count as jest.Mock).mockResolvedValue(25);
      (mockPrisma.errorLog.groupBy as jest.Mock)
        .mockResolvedValue([])
        .mockResolvedValue([]);
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      (mockPrisma.errorLog.findMany as jest.Mock).mockResolvedValue([]);

      const req = new NextRequest(
        'http://localhost:3000/api/error-analytics?startDate=2023-01-01&endDate=2023-01-31'
      );
      const response = await GET(req);

      expect(response.status).toBe(200);
      expect(mockPrisma.errorLog.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: 'user-123',
          createdAt: {
            gte: new Date('2023-01-01'),
            lte: new Date('2023-01-31'),
          },
        }),
      });
    });

    it('should handle empty results gracefully', async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com', name: 'Test User', role: 'user' },
      });

      // Mock empty results
      (mockPrisma.errorLog.count as jest.Mock).mockResolvedValue(0);
      (mockPrisma.errorLog.groupBy as jest.Mock)
        .mockResolvedValue([])
        .mockResolvedValue([])
        .mockResolvedValue([]);
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      (mockPrisma.errorLog.findMany as jest.Mock).mockResolvedValue([]);

      const req = new NextRequest('http://localhost:3000/api/error-analytics');
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.summary).toEqual({
        totalErrors: 0,
        errorsToday: 0,
        errorsThisWeek: 0,
        affectedUsers: 0,
        mostCommonType: 'N/A',
      });
      expect(data.byType).toEqual([]);
      expect(data.byDay).toEqual([]);
      expect(data.topErrors).toEqual([]);
      expect(data.recentErrors).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com', name: 'Test User', role: 'user' },
      });

      (mockPrisma.errorLog.count as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      mockErrorLogger.logAPIError.mockResolvedValue();

      const req = new NextRequest('http://localhost:3000/api/error-analytics');
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch error analytics' });
      expect(mockErrorLogger.logAPIError).toHaveBeenCalled();
    });

    it('should calculate percentages correctly', async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: 'user-123', email: 'user@example.com', name: 'Test User', role: 'user' },
      });

      (mockPrisma.errorLog.count as jest.Mock)
        .mockResolvedValueOnce(200)
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(60);

      (mockPrisma.errorLog.groupBy as jest.Mock)
        .mockResolvedValueOnce([{ userId: 'user-123', _count: 200 }])
        .mockResolvedValueOnce([
          { errorType: 'client_error', _count: 100 },
          { errorType: 'api_error', _count: 60 },
          { errorType: 'validation_error', _count: 40 },
        ])
        .mockResolvedValueOnce([]);

      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      (mockPrisma.errorLog.findMany as jest.Mock).mockResolvedValue([]);

      const req = new NextRequest('http://localhost:3000/api/error-analytics');
      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.byType[0]).toEqual({
        errorType: 'client_error',
        count: 100,
        percentage: 50,
      });
      expect(data.byType[1]).toEqual({
        errorType: 'api_error',
        count: 60,
        percentage: 30,
      });
      expect(data.byType[2]).toEqual({
        errorType: 'validation_error',
        count: 40,
        percentage: 20,
      });
    });
  });
});
