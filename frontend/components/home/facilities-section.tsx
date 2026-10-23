interface FacilityItem {
  index: string;
  title: string;
  description: string;
  tag: string;
}

const FACILITIES: FacilityItem[] = [
  {
    index: '01',
    title: 'Mặt sân',
    description: 'Không gian dành cho tập luyện và thi đấu Pickleball tiêu chuẩn.',
    tag: 'Cushion Acrylic',
  },
  {
    index: '02',
    title: 'Hệ thống chiếu sáng',
    description: 'Hỗ trợ tầm nhìn tối ưu khi chơi vào chiều tối với ánh sáng đồng đều.',
    tag: 'Đèn LED chống chói',
  },
  {
    index: '03',
    title: 'Khu thay đồ',
    description: 'Thay trang phục, chuẩn bị trước và sau buổi chơi trong không gian sạch sẽ.',
    tag: 'Locker an toàn',
  },
  {
    index: '04',
    title: 'Nước uống',
    description: 'Bổ sung nước và khoáng chất trong suốt thời gian tập luyện.',
    tag: 'Miễn phí tại sân',
  },
  {
    index: '05',
    title: 'Khu nghỉ ngơi',
    description: 'Dừng chân, thư giãn và giao lưu giữa các lượt chơi gay cấn.',
    tag: 'Lounge thư giãn',
  },
  {
    index: '06',
    title: 'Bãi đỗ xe',
    description: 'Khu vực để phương tiện thuận tiện, rộng rãi và an toàn khi đến sân.',
    tag: 'Camera an ninh',
  },
];

export function FacilitiesSection() {
  return (
    <section id="facilities" className="arena-facilities arena-wide">
      <div className="arena-section-heading">
        <div>
          <h2>
            HỆ THỐNG TIỆN ÍCH <span className="arena-live">Dịch vụ tại sân</span>
          </h2>
          <p>
            Trang thiết bị hiện đại và không gian tiện nghi đồng hành cùng mọi
            trận đấu
          </p>
        </div>
      </div>
      <div className="arena-facilities-grid">
        {FACILITIES.map((facility) => (
          <div key={facility.title} className="arena-facility-card">
            <div className="arena-facility-header">
              <span className="arena-facility-index">{facility.index}</span>
              <span className="arena-facility-tag">{facility.tag}</span>
            </div>
            <h3>{facility.title}</h3>
            <p>{facility.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
