import { prisma } from './prisma';

export interface ErrorLogData {
  error: string;
  errorType: string;
  stackTrace?: string;
  userAgent?: string;
  url?: string;
  additionalData?: any;
  userId?: string;
}

export class ErrorLogger {
  /**
   * Check if verbose logging mode is enabled
   */
  private static isVerboseMode(): boolean {
    return process.env.ERROR_LOGGING_VERBOSE === 'true';
  }

  /**
   * Sanitize data to remove sensitive information
   */
  private static sanitizeData(data: any): any {
    if (!data) return data;
    
    if (typeof data === 'string') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }

    if (typeof data === 'object') {
      const sensitiveKeys = [
        'password',
        'token',
        'apikey',
        'api_key',
        'secret',
        'authorization',
        'cookie',
        'session',
        'sessiontoken',
        'accesstoken',
        'refreshtoken',
        'auth',
        'credentials',
        'privatekey',
        'private_key',
      ];

      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = this.sanitizeData(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }

    return data;
  }

  /**
   * Sanitize request headers to remove sensitive information
   */
  private static sanitizeHeaders(headers: Headers): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];

    headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (sensitiveHeaders.includes(lowerKey)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    });

    return sanitized;
  }

  /**
   * Prepare additional data based on verbose mode
   */
  private static prepareAdditionalData(
    additionalData: any,
    req?: Request
  ): any {
    const verbose = this.isVerboseMode();
    
    if (!verbose) {
      // In non-verbose mode, only include user-provided additional data (sanitized)
      return additionalData ? this.sanitizeData(additionalData) : undefined;
    }

    // In verbose mode, include much more detail
    const verboseData: any = {
      ...this.sanitizeData(additionalData || {}),
      verbose: true,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
        timestamp: new Date().toISOString(),
      },
    };

    // Add request details if available
    if (req) {
      verboseData.request = {
        method: req.method,
        url: req.url,
        headers: this.sanitizeHeaders(req.headers),
      };
    }

    return verboseData;
  }

  static async logError(data: ErrorLogData): Promise<void> {
    try {
      const verbose = this.isVerboseMode();
      
      await prisma.errorLog.create({
        data: {
          error: data.error,
          errorType: data.errorType,
          stackTrace: verbose ? data.stackTrace : undefined,
          userAgent: data.userAgent,
          url: data.url,
          additionalData: data.additionalData,
          userId: data.userId,
        },
      });
    } catch (dbError) {
      console.error('Failed to log error to database:', dbError);
    }
  }

  static async logClientError(
    error: Error | string,
    errorType: string,
    userId?: string,
    additionalData?: any
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    const stackTrace = error instanceof Error ? error.stack : undefined;
    
    const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : undefined;
    const url = typeof window !== 'undefined' ? window.location.href : undefined;

    await this.logError({
      error: errorMessage,
      errorType,
      stackTrace,
      userAgent,
      url,
      additionalData: this.prepareAdditionalData(additionalData),
      userId,
    });
  }

  static async logAPIError(
    error: Error | string,
    errorType: string,
    req?: Request,
    additionalData?: any
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    const stackTrace = error instanceof Error ? error.stack : undefined;
    
    const userAgent = req?.headers.get('user-agent') || undefined;
    const url = req?.url || undefined;

    await this.logError({
      error: errorMessage,
      errorType,
      stackTrace,
      userAgent,
      url,
      additionalData: this.prepareAdditionalData(additionalData, req),
    });
  }
}
