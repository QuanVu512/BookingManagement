import { parseTimeRequest } from './time-request-parser.js';

const NOW = new Date('2026-10-28T10:00:00Z');

describe('parseTimeRequest', () => {
  test('19h tối mai chơi 2 tiếng ra window đầy đủ', () => {
    const result = parseTimeRequest('đặt sân 19h tối mai, chơi 2 tiếng', NOW);
    expect(result.kind).toBe('window');
    if (result.kind === 'window') {
      expect(result.window.startsAt).toBe('2026-10-29T19:00:00+07:00');
      expect(result.window.endsAt).toBe('2026-10-29T14:00:00.000Z');
    }
  });

  test('chỉ nói 19h tối mai thì yêu cầu hỏi lại thời lượng', () => {
    const result = parseTimeRequest('19h tối mai còn sân không?', NOW);
    expect(result).toEqual({
      kind: 'needs-duration',
      dateLabel: 'ngày mai',
      timeLabel: '19h',
    });
  });

  test('câu không có thời gian thì bỏ qua tool', () => {
    expect(parseTimeRequest('chính sách hủy sân thế nào?', NOW)).toEqual({
      kind: 'none',
    });
  });

  test('giờ không hợp lệ thì bỏ qua tool', () => {
    expect(parseTimeRequest('đặt sân 99h tối mai 2 tiếng', NOW)).toEqual({
      kind: 'none',
    });
  });
});
