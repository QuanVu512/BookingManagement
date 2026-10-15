export abstract class SessionTokenSigner {
  abstract sign(userId: string, tokenVersion: number): Promise<string>;
}
