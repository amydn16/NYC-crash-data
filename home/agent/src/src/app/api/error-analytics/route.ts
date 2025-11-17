import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ErrorLogger } from '@/lib/errorLogger';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const errorType = searchParams.get('errorType');

    // Determine if user is admin to show all errors or just their own
    const isAdmin = session.user.role === 'admin';
    const userId = isAdmin ? undefined : session.user.id;

    // Build where clause
    const where: any = {};
    if (userId) {
      where.userId = userId;
    }
    if (startDate) {
      where.createdAt = { ...where.createdAt, gte: new Date(startDate) };
    }
    if (endDate) {
      where.createdAt = { ...where.createdAt, lte: new Date(endDate) };
    }
    if (errorType) {
      where.errorType = errorType;
    }

    // Get total error count
    const totalErrors = await prisma.errorLog.count({ where });

    // Get errors today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const errorsToday = await prisma.errorLog.count({
      where: {
        ...where,
        createdAt: { gte: todayStart },
      },
    });

    // Get errors this week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);
    const errorsThisWeek = await prisma.errorLog.count({
      where: {
        ...where,
        createdAt: { gte: weekStart },
      },
    });

    // Get affected users count
    const affectedUsersResult = await prisma.errorLog.groupBy({
      by: ['userId'],
      where,
      _count: true,
    });
    const affectedUsers = affectedUsersResult.filter(
      (item) => item.userId !== null
    ).length;

    // Get errors grouped by type
    const errorsByType = await prisma.errorLog.groupBy({
      by: ['errorType'],
      where,
      _count: true,
      orderBy: {
        _count: {
          errorType: 'desc',
        },
      },
    });

    const byType = errorsByType.map((item) => ({
      errorType: item.errorType,
      count: item._count,
      percentage: totalErrors > 0 ? (item._count / totalErrors) * 100 : 0,
    }));

    const mostCommonType = byType.length > 0 ? byType[0].errorType : 'N/A';

    // Get errors by day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const errorsByDay = await prisma.$queryRaw<
      Array<{ date: Date; count: bigint }>
    >`
      SELECT 
        DATE(created_at) as date,
        COUNT(*)::int as count
      FROM "ErrorLog"
      WHERE created_at >= ${thirtyDaysAgo}
        ${userId ? prisma.$queryRaw`AND user_id = ${userId}` : prisma.$queryRaw``}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    const byDay = errorsByDay.map((item) => ({
      date: item.date.toISOString().split('T')[0],
      count: Number(item.count),
    }));

    // Get top error messages
    const topErrorsResult = await prisma.errorLog.groupBy({
      by: ['error'],
      where,
      _count: true,
      _max: {
        createdAt: true,
      },
      orderBy: {
        _count: {
          error: 'desc',
        },
      },
      take: 10,
    });

    const topErrors = topErrorsResult.map((item) => ({
      error: item.error,
      count: item._count,
      lastOccurred: item._max.createdAt,
    }));

    // Get recent errors (last 50)
    const recentErrors = await prisma.errorLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        error: true,
        errorType: true,
        url: true,
        createdAt: true,
        userId: isAdmin ? true : false, // Only include userId for admins
        user: isAdmin
          ? {
              select: {
                id: true,
                name: true,
                email: true,
              },
            }
          : false,
      },
    });

    return NextResponse.json({
      summary: {
        totalErrors,
        errorsToday,
        errorsThisWeek,
        affectedUsers,
        mostCommonType,
      },
      byType,
      byDay,
      topErrors,
      recentErrors,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    await ErrorLogger.logAPIError(error as Error, 'api_error', req);
    return NextResponse.json(
      { error: 'Failed to fetch error analytics' },
      { status: 500 }
    );
  }
}
