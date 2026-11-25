export const testDatabaseUrl = (): string =>
  process.env.TEST_DATABASE_URL ?? 'postgres:///tickbook_test?host=/tmp';
