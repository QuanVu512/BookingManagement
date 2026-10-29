export class QuotaExceededError extends Error {
  constructor() {
    super('AI_QUOTA_EXCEEDED');
    this.name = 'QuotaExceededError';
  }
}

export class AiPayloadTooLargeError extends Error {
  constructor() {
    super('AI_PAYLOAD_TOO_LARGE');
    this.name = 'AiPayloadTooLargeError';
  }
}

export class AiDisabledError extends Error {
  constructor() {
    super('AI_DISABLED');
    this.name = 'AiDisabledError';
  }
}
