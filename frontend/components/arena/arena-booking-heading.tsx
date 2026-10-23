import { ArenaIcon } from './arena-icon';

export function ArenaBookingHeading() {
  return (
    <div className="arena-page-heading">
      <p className="arena-eyebrow">
        <ArenaIcon name="calendar" />
        Hệ thống đặt chỗ trực tuyến
      </p>
      <h1>ĐẶT SÂN THEO GIỜ</h1>
      <p>
        Chọn sân, chọn ngày và khung giờ. Kiểm tra giá từ máy chủ trước khi giữ
        chỗ.
      </p>
    </div>
  );
}
