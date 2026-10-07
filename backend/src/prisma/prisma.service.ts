import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

/**
 * Connection to the subsystem's OWN database (never the Core Hub database).
 *
 * Prisma 7 connects through a driver adapter; the connection string is this
 * subsystem's DATABASE_URL and nothing else.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // On the server every subsystem shares one PostgreSQL (max_connections 100),
    // so each pool stays small: DATABASE_POOL_MAX, default 5 (deployment.md 4).
    // pg's own default of 10 per subsystem would need 370 connections.
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX) || 5,
    });

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to the Q-Teacher database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
