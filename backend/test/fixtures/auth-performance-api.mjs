import { createServer } from 'node:http';

const PORT = 4090;
const state = { mode: 'unauthenticated', loginCalls: 0 };
const user = {
  id: 'benchmark-user',
  username: 'perfuser01',
  fullName: 'Performance User',
  email: 'performance@example.com',
  phone: '+84912345678',
  roles: ['CUSTOMER'],
  primaryRole: 'CUSTOMER',
  isStaffOrAdmin: false,
};

function send(response, status, data) {
  if (response.destroyed) return;
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'http://127.0.0.1:4131',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  response.end(JSON.stringify(data));
}

const server = createServer((request, response) => {
  const path = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`).pathname;
  if (request.method === 'OPTIONS') return send(response, 204, {});
  if (path === '/__metrics') return send(response, 200, state);
  if (path === '/__mode') {
    const mode = new URL(
      request.url,
      `http://127.0.0.1:${PORT}`,
    ).searchParams.get('value');
    if (!['unauthenticated', 'online', 'stalled'].includes(mode))
      return send(response, 400, {});
    state.mode = mode;
    state.loginCalls = 0;
    return send(response, 200, state);
  }
  if (path === '/api/auth/login' || path === '/api/auth/register') {
    state.loginCalls += 1;
    request.resume();
    return setTimeout(
      () =>
        send(response, path.endsWith('register') ? 201 : 200, {
          success: true,
          message: 'Test authentication',
          user,
        }),
      600,
    );
  }
  if (path === '/api/auth/logout')
    return send(response, 200, { success: true });
  const finishRead = () =>
    path === '/api/auth/me'
      ? send(response, state.mode === 'online' ? 200 : 401, {
          success: state.mode === 'online',
          user,
        })
      : send(response, 200, { success: true, data: [] });
  if (state.mode === 'stalled') return setTimeout(finishRead, 10000);
  finishRead();
});
server.listen(PORT, '127.0.0.1', () =>
  console.log(`Test-only memory API ready on ${PORT}; no database or cookies.`),
);
