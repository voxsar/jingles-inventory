import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { createApp } from '../../server';

describe('POS client error reports', () => {
  const originalLogPath = process.env.JINGLES_POS_CLIENT_ERROR_LOG_PATH;
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jingles-central-errors-'));
  const logPath = path.join(tempDirectory, 'pos-client-errors.jsonl');

  beforeAll(() => {
    process.env.JINGLES_POS_CLIENT_ERROR_LOG_PATH = logPath;
  });

  afterAll(() => {
    if (typeof originalLogPath === 'undefined') delete process.env.JINGLES_POS_CLIENT_ERROR_LOG_PATH;
    else process.env.JINGLES_POS_CLIENT_ERROR_LOG_PATH = originalLogPath;
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  it('accepts an unauthenticated sanitized report and appends JSONL', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/pos/client-errors')
      .send({
        message: 'Backend returned Bearer abc.def.ghi',
        stack: 'Error: token=secret',
        source: 'api.response',
        route: '/shifts/open?token=secret',
        method: 'POST',
        status: 500,
        terminalId: 'terminal-a',
        context: { statusText: 'Internal Server Error', authorization: 'do-not-store' },
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ accepted: true, reportId: expect.any(String) });
    const lines = fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/);
    const entry = JSON.parse(lines[lines.length - 1] ?? '{}');
    expect(entry.message).toBe('Backend returned Bearer [REDACTED]');
    expect(entry.stack).toBe('Error: token=[REDACTED]');
    expect(entry.route).toBe('/shifts/open');
    expect(entry.context).toEqual({ statusText: 'Internal Server Error' });
  });
});
