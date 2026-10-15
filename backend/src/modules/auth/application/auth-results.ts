import type { AuthResponseDto } from '../dto/auth-response.dto.js';
export interface LoginResult {
  body: AuthResponseDto;
  accessToken: string;
}
