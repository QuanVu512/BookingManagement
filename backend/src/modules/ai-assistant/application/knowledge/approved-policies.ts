export const APPROVED_DEPOSIT_PERCENT = 0.3;
export const APPROVED_CANCEL_FEE_PERCENT = 0.1;
export const APPROVED_CANCEL_CUTOFF_HOURS = 12;
export const APPROVED_HOTLINE_TEXT =
  'Câu hỏi này nằm ngoài phạm vi tư vấn. Vui lòng liên hệ hotline để được hỗ trợ.';

function includesAny(message: string, keywords: string[]): boolean {
  return keywords.some((keyword) => message.includes(keyword));
}

export function answerApprovedQuestion(message: string): string | null {
  const normalized = message.toLowerCase();
  const mentionsCancel =
    includesAny(normalized, ['hủy', 'huy', 'cancel']) ||
    includesAny(normalized, ['phí', 'phi', 'hoàn', 'hoan']);
  if (mentionsCancel) {
    return (
      'Phí hủy bằng 10% giá thuê sân, trừ vào tiền cọc đã thu và hoàn lại phần còn lại. ' +
      'Ví dụ: sân 1.000.000đ, cọc 300.000đ thì phí hủy là 100.000đ và hoàn 200.000đ. ' +
      'Khóa hủy trong vòng 12 tiếng trước giờ chơi.'
    );
  }
  if (includesAny(normalized, ['cọc', 'coc', 'đặt cọc', 'deposit'])) {
    return 'Mức cọc cố định đúng 30% giá thuê sân theo chính sách đặt chỗ hiện hành.';
  }
  if (
    includesAny(normalized, [
      'giờ',
      'gio',
      'mở cửa',
      'mo cua',
      'buffer',
      'dọn sân',
    ])
  ) {
    return 'Giờ mở cửa và thời gian dọn sân áp dụng theo cấu hình từng chi nhánh/sân, không áp dụng một khung giờ cố định toàn hệ thống.';
  }
  return null;
}
