export function estimateTextTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.max(1, Math.ceil(Buffer.byteLength(text, 'utf8') / 4));
}

export function historyPayloadBytes(
  history: Array<{ content: string }>,
): number {
  return history.reduce(
    (total, item) => total + Buffer.byteLength(item.content, 'utf8'),
    0,
  );
}
