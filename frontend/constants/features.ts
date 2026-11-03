export const COURT_DETAILS_ENABLED =
  process.env.NEXT_PUBLIC_COURT_DETAILS_ENABLED !== 'false';

/**
 * FE-PAY-DEMO — Hiển thị nút mô phỏng showcase. Mặc định TẮT; server vẫn là
 * authority (endpoint trả 404 khi cờ server tắt). Chỉ bật ở web demo.
 */
export const PAYMENT_SIMULATION_ENABLED =
  process.env.NEXT_PUBLIC_PAYMENT_SIMULATION_ENABLED === 'true';
