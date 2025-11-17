import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ErrorLogger } from '@/lib/errorLogger';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      await ErrorLogger.logAPIError(
        'Email and password are required',
        'registration_validation_error',
        request,
        { email: !!email, password: !!password }
      );
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      await ErrorLogger.logAPIError(
        'Invalid email format',
        'registration_validation_error',
        request,
        { emailProvided: !!email }
      );
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        email: email
      }
    });

    if (existingUser) {
      await ErrorLogger.logAPIError(
        'User already exists',
        'registration_duplicate_user',
        request,
        { email }
      );
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email,
        name: email.split('@')[0], // Use part before @ as display name
        password: hashedPassword,
      },
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    
    return NextResponse.json({
      message: 'User created successfully',
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Registration error:', error);
    await ErrorLogger.logAPIError(
      error as Error,
      'registration_error',
      request
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
