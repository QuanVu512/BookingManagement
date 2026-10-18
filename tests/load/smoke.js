import http from 'k6/http';
import { check } from 'k6';

const baseUrl = __ENV.API_BASE_URL || 'http://localhost:3000';

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  const response = http.get(`${baseUrl}/`);
  check(response, {
    'API responds with HTTP 200': (result) => result.status === 200,
  });
}
