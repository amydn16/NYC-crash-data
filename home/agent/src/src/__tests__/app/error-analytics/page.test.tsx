import { render, screen, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ErrorAnalyticsPage from '../../../app/error-analytics/page';

// Mock dependencies
jest.mock('next-auth/react');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock Chart.js components
jest.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="line-chart">Line Chart</div>,
  Bar: () => <div data-testid="bar-chart">Bar Chart</div>,
}));

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe('ErrorAnalyticsPage', () => {
  let mockRouter: { push: jest.Mock };
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockRouter = {
      push: jest.fn(),
    };
    mockUseRouter.mockReturnValue(mockRouter as any);

    // Mock global fetch
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should redirect to home if user is not authenticated', async () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: jest.fn(),
    });

    render(<ErrorAnalyticsPage />);

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/');
    });
  });

  it('should show loading state while fetching data', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-123', email: 'user@example.com', role: 'user' } },
      status: 'authenticated',
      update: jest.fn(),
    });

    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<ErrorAnalyticsPage />);

    expect(screen.getByText('Loading error analytics...')).toBeInTheDocument();
  });

  it('should display analytics for regular user', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-123', email: 'user@example.com', role: 'user' } },
      status: 'authenticated',
      update: jest.fn(),
    });

    const mockAnalytics = {
      summary: {
        totalErrors: 100,
        errorsToday: 10,
        errorsThisWeek: 30,
        affectedUsers: 5,
        mostCommonType: 'client_error',
      },
      byType: [
        { errorType: 'client_error', count: 60, percentage: 60 },
        { errorType: 'api_error', count: 40, percentage: 40 },
      ],
      byDay: [
        { date: '2023-01-01', count: 5 },
        { date: '2023-01-02', count: 8 },
      ],
      topErrors: [
        { error: 'Error 1', count: 50, lastOccurred: '2023-01-01T00:00:00.000Z' },
      ],
      recentErrors: [
        {
          id: 'error-1',
          error: 'Test error',
          errorType: 'client_error',
          url: 'http://localhost:3000/test',
          createdAt: '2023-01-01T00:00:00.000Z',
        },
      ],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockAnalytics,
    });

    render(<ErrorAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Error Analytics')).toBeInTheDocument();
    });

    expect(screen.getAllByText('100')[0]).toBeInTheDocument(); // Total Errors
    expect(screen.getAllByText('10')[0]).toBeInTheDocument(); // Errors Today
    expect(screen.getAllByText('30')[0]).toBeInTheDocument(); // This Week
    expect(screen.getAllByText('5')[0]).toBeInTheDocument(); // Affected Users
    expect(screen.getAllByText('client_error')[0]).toBeInTheDocument(); // Most Common Type

    expect(screen.getByText('Error Trends (Last 30 Days)')).toBeInTheDocument();
    expect(screen.getByText('Errors by Type')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();

    expect(screen.getByText('Viewing your error analytics')).toBeInTheDocument();
  });

  it('should display analytics for admin user with admin indicator', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'admin-123', email: 'admin@example.com', role: 'admin' } },
      status: 'authenticated',
      update: jest.fn(),
    });

    const mockAnalytics = {
      summary: {
        totalErrors: 500,
        errorsToday: 50,
        errorsThisWeek: 150,
        affectedUsers: 10,
        mostCommonType: 'api_error',
      },
      byType: [],
      byDay: [],
      topErrors: [],
      recentErrors: [
        {
          id: 'error-1',
          error: 'Admin error',
          errorType: 'api_error',
          url: 'http://localhost:3000/api/test',
          createdAt: '2023-01-01T00:00:00.000Z',
          userId: 'user-1',
          user: {
            id: 'user-1',
            name: 'User One',
            email: 'user1@example.com',
          },
        },
      ],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockAnalytics,
    });

    render(<ErrorAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Error Analytics.*\(Admin View\)/)).toBeInTheDocument();
    });

    expect(screen.getByText('Viewing error analytics for all users')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument(); // Admin sees user column
  });

  it('should display error message on fetch failure', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-123', email: 'user@example.com', role: 'user' } },
      status: 'authenticated',
      update: jest.fn(),
    });

    mockFetch.mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
    });

    render(<ErrorAnalyticsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to fetch analytics: Internal Server Error/)
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Go Home')).toBeInTheDocument();
  });

  it('should redirect to home on 401 error', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-123', email: 'user@example.com', role: 'user' } },
      status: 'authenticated',
      update: jest.fn(),
    });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    render(<ErrorAnalyticsPage />);

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/');
    });
  });

  it('should display error type breakdown table', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-123', email: 'user@example.com', role: 'user' } },
      status: 'authenticated',
      update: jest.fn(),
    });

    const mockAnalytics = {
      summary: {
        totalErrors: 100,
        errorsToday: 10,
        errorsThisWeek: 30,
        affectedUsers: 5,
        mostCommonType: 'client_error',
      },
      byType: [
        { errorType: 'client_error', count: 60, percentage: 60 },
        { errorType: 'api_error', count: 30, percentage: 30 },
        { errorType: 'validation_error', count: 10, percentage: 10 },
      ],
      byDay: [],
      topErrors: [],
      recentErrors: [],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockAnalytics,
    });

    render(<ErrorAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Error Type Breakdown')).toBeInTheDocument();
    });

    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('30.0%')).toBeInTheDocument();
    expect(screen.getByText('10.0%')).toBeInTheDocument();
  });

  it('should display top errors table', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-123', email: 'user@example.com', role: 'user' } },
      status: 'authenticated',
      update: jest.fn(),
    });

    const mockAnalytics = {
      summary: {
        totalErrors: 200,
        errorsToday: 20,
        errorsThisWeek: 60,
        affectedUsers: 8,
        mostCommonType: 'client_error',
      },
      byType: [],
      byDay: [],
      topErrors: [
        { error: 'Frequent Error 1', count: 75, lastOccurred: '2023-01-01T12:00:00.000Z' },
        { error: 'Frequent Error 2', count: 45, lastOccurred: '2023-01-02T12:00:00.000Z' },
      ],
      recentErrors: [],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockAnalytics,
    });

    render(<ErrorAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Most Frequent Errors')).toBeInTheDocument();
    });

    expect(screen.getByText('Frequent Error 1')).toBeInTheDocument();
    expect(screen.getByText('Frequent Error 2')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
  });

  it('should display recent errors table', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-123', email: 'user@example.com', role: 'user' } },
      status: 'authenticated',
      update: jest.fn(),
    });

    const mockAnalytics = {
      summary: {
        totalErrors: 100,
        errorsToday: 10,
        errorsThisWeek: 30,
        affectedUsers: 5,
        mostCommonType: 'client_error',
      },
      byType: [],
      byDay: [],
      topErrors: [],
      recentErrors: [
        {
          id: 'error-1',
          error: 'Recent error 1',
          errorType: 'client_error',
          url: 'http://localhost:3000/page1',
          createdAt: '2023-01-01T12:00:00.000Z',
        },
        {
          id: 'error-2',
          error: 'Recent error 2',
          errorType: 'api_error',
          url: null,
          createdAt: '2023-01-02T12:00:00.000Z',
        },
      ],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockAnalytics,
    });

    render(<ErrorAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Recent Errors')).toBeInTheDocument();
    });

    expect(screen.getByText('Recent error 1')).toBeInTheDocument();
    expect(screen.getByText('Recent error 2')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:3000/page1')).toBeInTheDocument();
    expect(screen.getByText('N/A')).toBeInTheDocument(); // null URL
  });
});
