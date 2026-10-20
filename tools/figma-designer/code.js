// Smash Arena - Complete Booking & Payment UI Designer for Figma
// Replicates 100% of the 5 full journey screens from Codebase & Database Architecture:
// 1. Trang Chủ & Tra cứu sân (/)
// 2. Chi Tiết Sân & Báo Giá Thực Tế (/courts/[courtId])
// 3. Thanh Toán VietQR PayOS & Countdown 5 Phút (/checkout/[bookingId])
// 4. Vé Điện Tử E-Ticket & QR Check-in (/bookings/[bookingId])
// 5. Modal Quote Hủy Sân & Hoàn Tiền Minh Bạch (Phạt 10%)

(async function main() {
  try {
    // 1. Safe Font Loader with Multi-Level Fallbacks
    let regularFont = { family: "Inter", style: "Regular" };
    let boldFont = { family: "Inter", style: "Bold" };
    let mediumFont = { family: "Inter", style: "Medium" };
    let semiBoldFont = { family: "Inter", style: "Semi Bold" };

    try {
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    } catch (e) {
      const fallback = { family: "Roboto", style: "Regular" };
      try {
        await figma.loadFontAsync(fallback);
        regularFont = fallback;
      } catch (e2) {}
    }

    try {
      await figma.loadFontAsync({ family: "Inter", style: "Bold" });
    } catch (e) {
      boldFont = regularFont;
    }

    try {
      await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    } catch (e) {
      mediumFont = regularFont;
    }

    try {
      await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
    } catch (e) {
      semiBoldFont = boldFont;
    }

    function getFont(weight) {
      if (weight === "Bold") return boldFont;
      if (weight === "Semi Bold" || weight === "SemiBold") return semiBoldFont;
      if (weight === "Medium") return mediumFont;
      return regularFont;
    }

    // 2. Exact Theme Tokens from globals.css
    const BG_DARK = { r: 0.027, g: 0.039, b: 0.067 };        // #070a11
    const BG_PRIMARY = { r: 0.043, g: 0.059, b: 0.098 };     // #0b0f19
    const BG_SECONDARY = { r: 0.067, g: 0.094, b: 0.153 };   // #111827
    const BG_CARD = { r: 0.082, g: 0.114, b: 0.180 };        // #151d2e
    const BG_CARD_HOVER = { r: 0.110, g: 0.153, b: 0.239 };  // #1c273d
    const ACCENT_LIME = { r: 0.518, g: 0.800, b: 0.086 };    // #84cc16
    const ACCENT_VOLT = { r: 0.639, g: 0.902, b: 0.208 };    // #a3e635
    const TEXT_PRIMARY = { r: 0.973, g: 0.980, b: 0.988 };   // #f8fafc
    const TEXT_SECONDARY = { r: 0.580, g: 0.639, b: 0.722 }; // #94a3b8
    const TEXT_MUTED = { r: 0.392, g: 0.455, b: 0.545 };     // #64748b
    const BORDER_SUBTLE = { r: 0.140, g: 0.180, b: 0.260 };
    const STATUS_SUCCESS = { r: 0.290, g: 0.871, b: 0.502 }; // #4ade80
    const STATUS_WARNING = { r: 0.984, g: 0.573, b: 0.235 }; // #fb923c
    const STATUS_ERROR = { r: 0.937, g: 0.267, b: 0.267 };   // #ef4444
    const STATUS_INFO = { r: 0.220, g: 0.741, b: 0.973 };    // #38bdf8

    function solid(color, opacity) {
      return [{
        type: "SOLID",
        color: { r: color.r, g: color.g, b: color.b },
        opacity: opacity !== undefined ? opacity : 1
      }];
    }

    function text(content, size, weight, color, align, maxW) {
      const t = figma.createText();
      t.fontName = getFont(weight);
      t.characters = String(content != null ? content : "");
      t.fontSize = size || 14;
      t.fills = solid(color);
      if (align) t.textAlignHorizontal = align;
      if (maxW) {
        t.textAutoResize = "HEIGHT";
        t.resize(maxW, 20);
      }
      return t;
    }

    function badge(label, bgColor, textColor) {
      const f = figma.createFrame();
      f.name = "Badge";
      f.layoutMode = "HORIZONTAL";
      f.paddingLeft = 12;
      f.paddingRight = 12;
      f.paddingTop = 6;
      f.paddingBottom = 6;
      f.cornerRadius = 9999;
      f.fills = solid(bgColor);
      f.appendChild(text(label, 12, "Medium", textColor));
      return f;
    }

    function button(label, variant, width) {
      const btn = figma.createFrame();
      btn.name = "Button - " + variant;
      btn.layoutMode = "HORIZONTAL";
      btn.primaryAxisAlignItems = "CENTER";
      btn.counterAxisAlignItems = "CENTER";
      btn.paddingLeft = 20;
      btn.paddingRight = 20;
      btn.paddingTop = 10;
      btn.paddingBottom = 10;
      btn.cornerRadius = 8;
      
      if (variant === "primary") {
        btn.fills = solid(ACCENT_VOLT);
        btn.appendChild(text(label, 14, "Bold", BG_DARK));
      } else if (variant === "danger") {
        btn.fills = solid(STATUS_ERROR);
        btn.appendChild(text(label, 14, "Bold", TEXT_PRIMARY));
      } else {
        btn.fills = solid(BG_CARD);
        btn.strokes = solid(BORDER_SUBTLE);
        btn.strokeWeight = 1;
        btn.appendChild(text(label, 14, "Medium", TEXT_PRIMARY));
      }

      if (width) {
        btn.resize(width, 42);
      }
      return btn;
    }

    function createHeader(activeTab) {
      const header = figma.createFrame();
      header.name = "SportyHeader";
      header.layoutMode = "VERTICAL";
      header.resize(1440, 116);
      header.fills = solid(BG_DARK);

      // Top Announcement Bar
      const topBar = figma.createFrame();
      topBar.name = "Top Announcement Bar";
      topBar.layoutMode = "HORIZONTAL";
      topBar.primaryAxisAlignItems = "CENTER";
      topBar.counterAxisAlignItems = "CENTER";
      topBar.resize(1440, 32);
      topBar.fills = solid({ r: 0.08, g: 0.35, b: 0.18 });
      topBar.appendChild(text("Khám phá sân Pickleball tại Phù Đổng — xem tiện ích, lịch sân và chọn khung giờ phù hợp với bạn.", 12, "Medium", TEXT_PRIMARY));
      header.appendChild(topBar);

      // Site Header Row
      const navRow = figma.createFrame();
      navRow.name = "Site Header Row";
      navRow.layoutMode = "HORIZONTAL";
      navRow.primaryAxisAlignItems = "SPACE_BETWEEN";
      navRow.counterAxisAlignItems = "CENTER";
      navRow.resize(1440, 84);
      navRow.paddingLeft = 60;
      navRow.paddingRight = 60;
      navRow.fills = solid(BG_DARK);
      navRow.strokes = solid(BORDER_SUBTLE);
      navRow.strokeWeight = 1;

      // Brand Logo
      const logoBlock = figma.createFrame();
      logoBlock.layoutMode = "HORIZONTAL";
      logoBlock.itemSpacing = 12;
      logoBlock.counterAxisAlignItems = "CENTER";
      logoBlock.fills = [];
      
      const logoIcon = figma.createFrame();
      logoIcon.resize(40, 40);
      logoIcon.cornerRadius = 8;
      logoIcon.fills = solid(ACCENT_VOLT);
      logoIcon.layoutMode = "HORIZONTAL";
      logoIcon.primaryAxisAlignItems = "CENTER";
      logoIcon.counterAxisAlignItems = "CENTER";
      logoIcon.appendChild(text("🎾", 18, "Regular", BG_DARK));

      const brandText = figma.createFrame();
      brandText.layoutMode = "VERTICAL";
      brandText.fills = [];
      brandText.itemSpacing = 2;
      brandText.appendChild(text("SÂN THỂ THAO PHÙ ĐỔNG", 16, "Bold", TEXT_PRIMARY));
      brandText.appendChild(text("CẦU TRẠC, HÀ NỘI • EST. 2024", 10, "Semi Bold", ACCENT_LIME));

      logoBlock.appendChild(logoIcon);
      logoBlock.appendChild(brandText);
      navRow.appendChild(logoBlock);

      // Nav Links
      const links = figma.createFrame();
      links.layoutMode = "HORIZONTAL";
      links.itemSpacing = 28;
      links.counterAxisAlignItems = "CENTER";
      links.fills = [];
      links.appendChild(text("Danh sách sân", 14, activeTab === "courts" ? "Bold" : "Medium", activeTab === "courts" ? ACCENT_VOLT : TEXT_SECONDARY));
      links.appendChild(text("Tiện ích cơ sở", 14, activeTab === "facilities" ? "Bold" : "Medium", activeTab === "facilities" ? ACCENT_VOLT : TEXT_SECONDARY));
      links.appendChild(text("Cửa hàng mở rộng", 14, activeTab === "store" ? "Bold" : "Medium", activeTab === "store" ? ACCENT_VOLT : TEXT_SECONDARY));
      navRow.appendChild(links);

      // Actions
      const actions = figma.createFrame();
      actions.layoutMode = "HORIZONTAL";
      actions.itemSpacing = 12;
      actions.counterAxisAlignItems = "CENTER";
      actions.fills = [];
      actions.appendChild(button("Booking của tôi", "secondary"));
      actions.appendChild(button("Đăng nhập", "primary"));
      navRow.appendChild(actions);

      header.appendChild(navRow);
      return header;
    }

    function createFooter() {
      const footer = figma.createFrame();
      footer.name = "SportyFooter";
      footer.layoutMode = "VERTICAL";
      footer.resize(1440, 220);
      footer.paddingLeft = 60;
      footer.paddingRight = 60;
      footer.paddingTop = 48;
      footer.paddingBottom = 32;
      footer.itemSpacing = 24;
      footer.fills = solid(BG_DARK);
      footer.strokes = solid(BORDER_SUBTLE);
      footer.strokeWeight = 1;

      const row = figma.createFrame();
      row.layoutMode = "HORIZONTAL";
      row.primaryAxisAlignItems = "SPACE_BETWEEN";
      row.resize(1320, 100);
      row.fills = [];

      const col1 = figma.createFrame();
      col1.layoutMode = "VERTICAL";
      col1.itemSpacing = 8;
      col1.fills = [];
      col1.appendChild(text("SÂN THỂ THAO PHÙ ĐỔNG", 16, "Bold", TEXT_PRIMARY));
      col1.appendChild(text("Điểm hẹn thể thao năng động, kết nối đam mê Pickleball.", 13, "Regular", TEXT_MUTED));
      col1.appendChild(text("📍 Thôn Phù Đổng, Gia Lâm, Hà Nội • Hotline: 0987 654 321", 13, "Regular", TEXT_SECONDARY));
      row.appendChild(col1);

      const col2 = figma.createFrame();
      col2.layoutMode = "VERTICAL";
      col2.itemSpacing = 8;
      col2.fills = [];
      col2.appendChild(text("GIỜ HOẠT ĐỘNG", 13, "Bold", ACCENT_LIME));
      col2.appendChild(text("06:00 — 23:00 tất cả các ngày trong tuần", 13, "Medium", TEXT_PRIMARY));
      col2.appendChild(text("Giữ chỗ trực tuyến 5 phút • Giãn cách vệ sinh 15 phút", 13, "Regular", TEXT_MUTED));
      row.appendChild(col2);

      footer.appendChild(row);
      footer.appendChild(text("© 2026 Sân Thể Thao Phù Đổng. Bảo lưu mọi quyền.", 12, "Regular", TEXT_MUTED));
      return footer;
    }

    // 3. Clean up any previous broken/stuck frames from prior runs
    const existing = figma.currentPage.children.filter(n => 
      n.name.includes("Page 1") || 
      n.name.includes("Page 2") || 
      n.name.includes("Page 3") || 
      n.name.includes("Page 4") || 
      n.name.includes("Page 5") || 
      n.name.includes("CourtCatalogView") ||
      (n.type === "FRAME" && n.name === "Frame")
    );
    existing.forEach(n => {
      try { n.remove(); } catch (e) {}
    });

    const screens = [];

    // =========================================================================
    // PAGE 1: TRANG CHỦ (Home Page /)
    // =========================================================================
    const homeScreen = figma.createFrame();
    homeScreen.name = "Page 1 - Trang Chủ (Home Page)";
    homeScreen.resize(1440, 2400);
    homeScreen.x = 0;
    homeScreen.y = 0;
    homeScreen.fills = solid(BG_DARK);
    homeScreen.layoutMode = "VERTICAL";
    homeScreen.itemSpacing = 0;

    homeScreen.appendChild(createHeader("courts"));

    // 1. HeroSection
    const hero = figma.createFrame();
    hero.name = "HeroSection";
    hero.layoutMode = "VERTICAL";
    hero.primaryAxisAlignItems = "CENTER";
    hero.resize(1440, 480);
    hero.paddingTop = 64;
    hero.paddingBottom = 52;
    hero.itemSpacing = 18;
    hero.fills = solid(BG_PRIMARY);
    hero.strokes = solid(BORDER_SUBTLE);
    hero.strokeWeight = 1;

    hero.appendChild(badge("Sân Thể Thao Phù Đổng — Cầu Trạc, Hà Nội", BG_CARD, ACCENT_VOLT));
    hero.appendChild(text("Chinh phục từng pha bóng cùng Pickleball Phù Đổng", 36, "Bold", TEXT_PRIMARY, "CENTER"));
    hero.appendChild(text("Mặt sân đạt chuẩn thi đấu, ánh sáng ban đêm tối ưu và không gian thể thao tràn đầy năng lượng cho mọi người chơi tại Cầu Trạc, Hà Nội.", 15, "Regular", TEXT_SECONDARY, "CENTER", 820));

    const statsRow = figma.createFrame();
    statsRow.layoutMode = "HORIZONTAL";
    statsRow.itemSpacing = 20;
    statsRow.fills = [];

    const stats = [
      { title: "4 Sân tiêu chuẩn", sub: "Mặt sân Cushion Pro êm ái" },
      { title: "06:00 — 23:00", sub: "Mở cửa các ngày trong tuần" },
      { title: "15 Phút giãn cách", sub: "Vệ sinh sau mỗi lượt chơi" }
    ];
    stats.forEach(s => {
      const sc = figma.createFrame();
      sc.layoutMode = "VERTICAL";
      sc.paddingLeft = 20;
      sc.paddingRight = 20;
      sc.paddingTop = 14;
      sc.paddingBottom = 14;
      sc.cornerRadius = 10;
      sc.fills = solid(BG_CARD);
      sc.strokes = solid(BORDER_SUBTLE);
      sc.itemSpacing = 4;
      sc.appendChild(text(s.title, 15, "Bold", ACCENT_VOLT));
      sc.appendChild(text(s.sub, 12, "Regular", TEXT_MUTED));
      statsRow.appendChild(sc);
    });
    hero.appendChild(statsRow);
    homeScreen.appendChild(hero);

    // 2. CourtCatalogView
    const catalog = figma.createFrame();
    catalog.name = "CourtCatalogView";
    catalog.layoutMode = "VERTICAL";
    catalog.resize(1440, 680);
    catalog.paddingLeft = 60;
    catalog.paddingRight = 60;
    catalog.paddingTop = 56;
    catalog.paddingBottom = 56;
    catalog.itemSpacing = 32;
    catalog.fills = solid(BG_PRIMARY);

    const catHeader = figma.createFrame();
    catHeader.layoutMode = "HORIZONTAL";
    catHeader.primaryAxisAlignItems = "SPACE_BETWEEN";
    catHeader.counterAxisAlignItems = "MAX";
    catHeader.resize(1320, 70);
    catHeader.fills = [];

    const catTitleBlock = figma.createFrame();
    catTitleBlock.layoutMode = "VERTICAL";
    catTitleBlock.itemSpacing = 6;
    catTitleBlock.fills = [];
    catTitleBlock.appendChild(badge("Danh mục sân thi đấu", BG_CARD, ACCENT_LIME));
    catTitleBlock.appendChild(text("Danh sách sân Pickleball Phù Đổng", 24, "Bold", TEXT_PRIMARY));
    catTitleBlock.appendChild(text("So sánh mặt sân, tiện ích và giá thuê theo giờ. Chọn sân phù hợp để xem lịch trống.", 13, "Regular", TEXT_SECONDARY));
    catHeader.appendChild(catTitleBlock);
    catHeader.appendChild(text("Hiển thị: 4 sân thi đấu", 13, "Medium", TEXT_MUTED));
    catalog.appendChild(catHeader);

    const grid = figma.createFrame();
    grid.layoutMode = "HORIZONTAL";
    grid.itemSpacing = 24;
    grid.resize(1320, 440);
    grid.fills = [];

    const courtData = [
      { name: "Sân 01 (Tiêu chuẩn)", type: "🎾 Sân Pickleball trong nhà Cushion Pro", price: "100.000", tag: "✓ Vệ sinh 15 phút sau lượt chơi" },
      { name: "Sân 02 (Tiêu chuẩn)", type: "🎾 Sân Pickleball ngoài trời phủ Acrylic", price: "100.000", tag: "✓ Vệ sinh 15 phút sau lượt chơi" },
      { name: "Sân 03 (VIP - Mái che)", type: "🎾 Sân VIP mái che cách nhiệt", price: "150.000", tag: "✓ Ghế nghỉ riêng & Khăn lạnh" },
      { name: "Sân 04 (VIP - Mái che)", type: "🎾 Sân VIP trung tâm thi đấu", price: "150.000", tag: "✓ Khán đài mini & Đèn cao cấp" },
    ];

    courtData.forEach((c) => {
      const card = figma.createFrame();
      card.name = "CourtCard - " + c.name;
      card.layoutMode = "VERTICAL";
      card.resize(312, 440);
      card.cornerRadius = 14;
      card.fills = solid(BG_CARD);
      card.strokes = solid(BORDER_SUBTLE);
      card.strokeWeight = 1;

      const img = figma.createFrame();
      img.resize(312, 190);
      img.fills = solid(BG_CARD_HOVER);
      img.layoutMode = "VERTICAL";
      img.primaryAxisAlignItems = "CENTER";
      img.counterAxisAlignItems = "CENTER";
      img.appendChild(text("ẢNH SÂN THỰC TẾ", 13, "Bold", TEXT_MUTED));
      card.appendChild(img);

      const body = figma.createFrame();
      body.layoutMode = "VERTICAL";
      body.paddingLeft = 18;
      body.paddingRight = 18;
      body.paddingTop = 16;
      body.paddingBottom = 16;
      body.itemSpacing = 10;
      body.resize(312, 250);
      body.fills = [];

      body.appendChild(text(c.name, 16, "Bold", TEXT_PRIMARY));
      body.appendChild(text(c.type, 12, "Medium", ACCENT_VOLT));
      body.appendChild(badge(c.tag, BG_PRIMARY, TEXT_SECONDARY));

      const priceRow = figma.createFrame();
      priceRow.layoutMode = "HORIZONTAL";
      priceRow.primaryAxisAlignItems = "SPACE_BETWEEN";
      priceRow.counterAxisAlignItems = "CENTER";
      priceRow.resize(276, 50);
      priceRow.fills = [];

      const pblock = figma.createFrame();
      pblock.layoutMode = "VERTICAL";
      pblock.fills = [];
      pblock.appendChild(text("Giá từ trong ngày", 11, "Regular", TEXT_MUTED));
      pblock.appendChild(text(c.price + " đ/h", 16, "Bold", TEXT_PRIMARY));
      priceRow.appendChild(pblock);
      priceRow.appendChild(button("Đặt sân ngay", "primary"));

      body.appendChild(priceRow);
      card.appendChild(body);
      grid.appendChild(card);
    });
    catalog.appendChild(grid);
    homeScreen.appendChild(catalog);

    // 3. FacilitiesSection
    const facSection = figma.createFrame();
    facSection.name = "FacilitiesSection";
    facSection.layoutMode = "VERTICAL";
    facSection.resize(1440, 520);
    facSection.paddingLeft = 60;
    facSection.paddingRight = 60;
    facSection.paddingTop = 56;
    facSection.paddingBottom = 56;
    facSection.itemSpacing = 28;
    facSection.fills = solid(BG_DARK);
    facSection.strokes = solid(BORDER_SUBTLE);

    const facHeader = figma.createFrame();
    facHeader.layoutMode = "VERTICAL";
    facHeader.primaryAxisAlignItems = "CENTER";
    facHeader.resize(1320, 60);
    facHeader.itemSpacing = 6;
    facHeader.fills = [];
    facHeader.appendChild(badge("Dịch vụ tại sân", BG_CARD, ACCENT_LIME));
    facHeader.appendChild(text("Tiện Ích & Dịch Vụ Tại Cơ Sở", 24, "Bold", TEXT_PRIMARY, "CENTER"));
    facSection.appendChild(facHeader);

    const facGrid = figma.createFrame();
    facGrid.layoutMode = "HORIZONTAL";
    facGrid.itemSpacing = 16;
    facGrid.resize(1320, 320);
    facGrid.fills = [];

    const facList = [
      { icon: "🏟️", title: "Mặt sân thi đấu", desc: "Mặt sân giảm chấn chuyên dụng, độ nảy chuẩn xác, chống trơn trượt." },
      { icon: "💡", title: "Đèn LED thể thao", desc: "Chiếu sáng chống chói góc rộng đạt chuẩn thi đấu buổi tối." },
      { icon: "🚿", title: "Phòng thay đồ", desc: "Khu vực thay đồ sạch sẽ, ngăn nắp với tủ locker an toàn." },
      { icon: "🚗", title: "Bãi đỗ xe rộng", desc: "Khu vực gửi ô tô & xe máy thuận tiện, bảo vệ trực 24/7." },
    ];
    facList.forEach(f => {
      const fc = figma.createFrame();
      fc.name = "Facility - " + f.title;
      fc.layoutMode = "VERTICAL";
      fc.resize(318, 160);
      fc.paddingLeft = 20;
      fc.paddingRight = 20;
      fc.paddingTop = 20;
      fc.paddingBottom = 20;
      fc.cornerRadius = 12;
      fc.fills = solid(BG_CARD);
      fc.strokes = solid(BORDER_SUBTLE);
      fc.itemSpacing = 8;
      fc.appendChild(text(f.icon + "  " + f.title, 15, "Bold", TEXT_PRIMARY));
      fc.appendChild(text(f.desc, 13, "Regular", TEXT_MUTED));
      facGrid.appendChild(fc);
    });
    facSection.appendChild(facGrid);
    homeScreen.appendChild(facSection);

    // 4. ScaleupStorePreview
    const store = figma.createFrame();
    store.name = "ScaleupStorePreview";
    store.layoutMode = "VERTICAL";
    store.resize(1440, 360);
    store.paddingLeft = 60;
    store.paddingRight = 60;
    store.paddingTop = 48;
    store.paddingBottom = 48;
    store.itemSpacing = 24;
    store.fills = solid(BG_PRIMARY);

    const storeHeader = figma.createFrame();
    storeHeader.layoutMode = "VERTICAL";
    storeHeader.primaryAxisAlignItems = "CENTER";
    storeHeader.resize(1320, 50);
    storeHeader.itemSpacing = 6;
    storeHeader.fills = [];
    storeHeader.appendChild(badge("Kế hoạch mở rộng", BG_CARD, ACCENT_VOLT));
    storeHeader.appendChild(text("Cửa Hàng Trang Thiết Bị Thể Thao (Sắp ra mắt)", 22, "Bold", TEXT_PRIMARY, "CENTER"));
    store.appendChild(storeHeader);

    const storeGrid = figma.createFrame();
    storeGrid.layoutMode = "HORIZONTAL";
    storeGrid.itemSpacing = 20;
    storeGrid.resize(1320, 160);
    storeGrid.fills = [];

    const storeItems = [
      { icon: "🏓", title: "Vợt Carbon T700", sub: "Chuẩn USA Pickleball Approved" },
      { icon: "🎾", title: "Bóng 40 Lỗ Ngoài Trời", sub: "Độ nảy chuẩn xác, độ bền cao" },
      { icon: "👕", title: "Trang Phục Pro Aero", sub: "Thoáng khí, co giãn 4 chiều" },
    ];
    storeItems.forEach(si => {
      const sc = figma.createFrame();
      sc.layoutMode = "HORIZONTAL";
      sc.counterAxisAlignItems = "CENTER";
      sc.resize(426, 90);
      sc.paddingLeft = 20;
      sc.paddingRight = 20;
      sc.cornerRadius = 10;
      sc.fills = solid(BG_CARD);
      sc.strokes = solid(BORDER_SUBTLE);
      sc.itemSpacing = 16;
      sc.appendChild(text(si.icon, 28, "Regular", TEXT_PRIMARY));
      const sb = figma.createFrame();
      sb.layoutMode = "VERTICAL";
      sb.itemSpacing = 4;
      sb.fills = [];
      sb.appendChild(text(si.title, 15, "Bold", TEXT_PRIMARY));
      sb.appendChild(text(si.sub, 12, "Regular", TEXT_MUTED));
      sc.appendChild(sb);
      sc.appendChild(badge("Coming Soon", BG_PRIMARY, ACCENT_VOLT));
      storeGrid.appendChild(sc);
    });
    store.appendChild(storeGrid);
    homeScreen.appendChild(store);

    homeScreen.appendChild(createFooter());
    screens.push(homeScreen);

    // =========================================================================
    // PAGE 2: CHI TIẾT SÂN & GIỮ CHỖ (/courts/[courtId])
    // =========================================================================
    const detailScreen = figma.createFrame();
    detailScreen.name = "Page 2 - Chi Tiết Sân & Giữ Chỗ (/courts/[courtId])";
    detailScreen.resize(1440, 1200);
    detailScreen.x = 1540;
    detailScreen.y = 0;
    detailScreen.fills = solid(BG_DARK);
    detailScreen.layoutMode = "VERTICAL";
    detailScreen.itemSpacing = 0;

    detailScreen.appendChild(createHeader("court-detail"));

    const detailMain = figma.createFrame();
    detailMain.name = "main.container.booking-live";
    detailMain.layoutMode = "VERTICAL";
    detailMain.resize(1440, 960);
    detailMain.paddingLeft = 240;
    detailMain.paddingRight = 240;
    detailMain.paddingTop = 32;
    detailMain.paddingBottom = 64;
    detailMain.itemSpacing = 20;
    detailMain.fills = solid(BG_DARK);

    const breadcrumbs = figma.createFrame();
    breadcrumbs.layoutMode = "HORIZONTAL";
    breadcrumbs.itemSpacing = 12;
    breadcrumbs.fills = [];
    breadcrumbs.appendChild(text("← Danh sách sân", 14, "Medium", ACCENT_VOLT));
    breadcrumbs.appendChild(text("·", 14, "Regular", TEXT_MUTED));
    breadcrumbs.appendChild(text("Booking của tôi", 14, "Medium", TEXT_SECONDARY));
    detailMain.appendChild(breadcrumbs);

    const cInfo = figma.createFrame();
    cInfo.name = "CourtInfoCard";
    cInfo.layoutMode = "VERTICAL";
    cInfo.itemSpacing = 6;
    cInfo.fills = [];
    cInfo.appendChild(text("Sân 01 (Tiêu chuẩn)", 32, "Bold", TEXT_PRIMARY));
    cInfo.appendChild(text("Chi nhánh Phù Đổng · Thôn Phù Đổng, Gia Lâm, Hà Nội", 14, "Regular", TEXT_SECONDARY));
    cInfo.appendChild(text("🎾 Sân Pickleball trong nhà Cushion Pro", 13, "Medium", ACCENT_LIME));
    detailMain.appendChild(cInfo);

    const panel = figma.createFrame();
    panel.name = "LiveBookingPanel (.booking-panel)";
    panel.layoutMode = "VERTICAL";
    panel.resize(960, 680);
    panel.paddingLeft = 32;
    panel.paddingRight = 32;
    panel.paddingTop = 28;
    panel.paddingBottom = 28;
    panel.itemSpacing = 24;
    panel.cornerRadius = 16;
    panel.fills = solid(BG_CARD);
    panel.strokes = solid(BORDER_SUBTLE);
    panel.strokeWeight = 1;

    const fieldset = figma.createFrame();
    fieldset.name = "Time Fields";
    fieldset.layoutMode = "HORIZONTAL";
    fieldset.itemSpacing = 20;
    fieldset.resize(896, 80);
    fieldset.fills = [];

    const fStart = figma.createFrame();
    fStart.layoutMode = "VERTICAL";
    fStart.resize(438, 76);
    fStart.itemSpacing = 8;
    fStart.fills = [];
    fStart.appendChild(text("Bắt đầu", 13, "Medium", TEXT_PRIMARY));
    const inpStart = figma.createFrame();
    inpStart.resize(438, 44);
    inpStart.cornerRadius = 8;
    inpStart.paddingLeft = 14;
    inpStart.paddingRight = 14;
    inpStart.layoutMode = "HORIZONTAL";
    inpStart.counterAxisAlignItems = "CENTER";
    inpStart.fills = solid(BG_PRIMARY);
    inpStart.strokes = solid(BORDER_SUBTLE);
    inpStart.appendChild(text("2026-10-20 17:30", 14, "Regular", TEXT_PRIMARY));
    fStart.appendChild(inpStart);
    fieldset.appendChild(fStart);

    const fEnd = figma.createFrame();
    fEnd.layoutMode = "VERTICAL";
    fEnd.resize(438, 76);
    fEnd.itemSpacing = 8;
    fEnd.fills = [];
    fEnd.appendChild(text("Kết thúc", 13, "Medium", TEXT_PRIMARY));
    const inpEnd = figma.createFrame();
    inpEnd.resize(438, 44);
    inpEnd.cornerRadius = 8;
    inpEnd.paddingLeft = 14;
    inpEnd.paddingRight = 14;
    inpEnd.layoutMode = "HORIZONTAL";
    inpEnd.counterAxisAlignItems = "CENTER";
    inpEnd.fills = solid(BG_PRIMARY);
    inpEnd.strokes = solid(BORDER_SUBTLE);
    inpEnd.appendChild(text("2026-10-20 19:00", 14, "Regular", TEXT_PRIMARY));
    fEnd.appendChild(inpEnd);
    fieldset.appendChild(fEnd);

    panel.appendChild(fieldset);

    const quoteSec = figma.createFrame();
    quoteSec.name = "section[aria-label=Báo giá từ máy chủ]";
    quoteSec.layoutMode = "VERTICAL";
    quoteSec.resize(896, 260);
    quoteSec.paddingLeft = 24;
    quoteSec.paddingRight = 24;
    quoteSec.paddingTop = 20;
    quoteSec.paddingBottom = 20;
    quoteSec.itemSpacing = 12;
    quoteSec.cornerRadius = 10;
    quoteSec.fills = solid(BG_PRIMARY);
    quoteSec.strokes = solid(BORDER_SUBTLE);

    quoteSec.appendChild(text("Khoảng sân đang trống", 18, "Bold", STATUS_SUCCESS));
    quoteSec.appendChild(text("• 17:30 → 18:00: 50.000 đ (Thời lượng 30 phút • Giá 100.000 đ/h)", 13, "Regular", TEXT_SECONDARY));
    quoteSec.appendChild(text("• 18:00 → 19:00: 100.000 đ (Thời lượng 60 phút • Giá 100.000 đ/h)", 13, "Regular", TEXT_SECONDARY));
    quoteSec.appendChild(text("Tổng tiền sân: 150.000 đ", 16, "Bold", TEXT_PRIMARY));
    quoteSec.appendChild(text("Vệ sinh thêm 15 phút, không tính phí. Khóa lịch đến 19:15.", 13, "Regular", TEXT_MUTED));
    quoteSec.appendChild(text("Lịch có thể thay đổi trước khi tạo giữ chỗ.", 12, "Regular", TEXT_MUTED));
    panel.appendChild(quoteSec);

    const consent = figma.createFrame();
    consent.layoutMode = "HORIZONTAL";
    consent.itemSpacing = 10;
    consent.counterAxisAlignItems = "CENTER";
    consent.fills = [];
    consent.appendChild(text("☑", 16, "Bold", ACCENT_VOLT));
    consent.appendChild(text("Tôi đồng ý giữ chỗ 5 phút; chưa có thanh toán.", 13, "Regular", TEXT_PRIMARY));
    panel.appendChild(consent);

    const btnRow = figma.createFrame();
    btnRow.layoutMode = "HORIZONTAL";
    btnRow.itemSpacing = 16;
    btnRow.fills = [];
    btnRow.appendChild(button("Kiểm tra lại báo giá", "secondary"));
    btnRow.appendChild(button("Tạo yêu cầu giữ chỗ 5 phút", "primary"));
    panel.appendChild(btnRow);

    detailMain.appendChild(panel);
    detailScreen.appendChild(detailMain);
    detailScreen.appendChild(createFooter());
    screens.push(detailScreen);

    // =========================================================================
    // PAGE 3: THANH TOÁN VIETQR PAYOS & COUNTDOWN 5 PHÚT (/checkout/[bookingId])
    // =========================================================================
    function createFinderPattern(x, y) {
      const outer = figma.createRectangle();
      outer.resize(46, 46);
      outer.x = x;
      outer.y = y;
      outer.fills = solid({ r: 0.05, g: 0.1, b: 0.2 });
      outer.cornerRadius = 6;

      const middle = figma.createRectangle();
      middle.resize(32, 32);
      middle.x = x + 7;
      middle.y = y + 7;
      middle.fills = solid({ r: 1, g: 1, b: 1 });
      middle.cornerRadius = 4;

      const inner = figma.createRectangle();
      inner.resize(18, 18);
      inner.x = x + 14;
      inner.y = y + 14;
      inner.fills = solid({ r: 0.05, g: 0.1, b: 0.2 });
      inner.cornerRadius = 3;

      return [outer, middle, inner];
    }

    function createRealisticQRBox() {
      const qrContainer = figma.createFrame();
      qrContainer.name = "PayOS Realistic VietQR Card";
      qrContainer.layoutMode = "VERTICAL";
      qrContainer.primaryAxisAlignItems = "CENTER";
      qrContainer.counterAxisAlignItems = "CENTER";
      qrContainer.resize(340, 430);
      qrContainer.paddingTop = 20;
      qrContainer.paddingBottom = 20;
      qrContainer.paddingLeft = 20;
      qrContainer.paddingRight = 20;
      qrContainer.itemSpacing = 16;
      qrContainer.cornerRadius = 16;
      qrContainer.fills = solid({ r: 1, g: 1, b: 1 });
      qrContainer.strokes = solid({ r: 0.85, g: 0.89, b: 0.95 });
      qrContainer.strokeWeight = 2;

      const qrTopRow = figma.createFrame();
      qrTopRow.layoutMode = "HORIZONTAL";
      qrTopRow.primaryAxisAlignItems = "SPACE_BETWEEN";
      qrTopRow.counterAxisAlignItems = "CENTER";
      qrTopRow.resize(300, 36);
      qrTopRow.fills = [];

      const vietqrLogo = figma.createFrame();
      vietqrLogo.layoutMode = "HORIZONTAL";
      vietqrLogo.primaryAxisSizingMode = "AUTO";
      vietqrLogo.counterAxisSizingMode = "AUTO";
      vietqrLogo.itemSpacing = 4;
      vietqrLogo.fills = [];
      vietqrLogo.appendChild(text("Viet", 18, "Bold", { r: 0.05, g: 0.35, b: 0.75 }));
      vietqrLogo.appendChild(text("QR", 18, "Bold", { r: 0.85, g: 0.15, b: 0.15 }));
      qrTopRow.appendChild(vietqrLogo);

      const napasBadge = figma.createFrame();
      napasBadge.layoutMode = "HORIZONTAL";
      napasBadge.paddingLeft = 8;
      napasBadge.paddingRight = 8;
      napasBadge.paddingTop = 4;
      napasBadge.paddingBottom = 4;
      napasBadge.cornerRadius = 4;
      napasBadge.fills = solid({ r: 0.92, g: 0.95, b: 0.99 });
      napasBadge.appendChild(text("napas 247", 11, "Bold", { r: 0.05, g: 0.35, b: 0.65 }));
      qrTopRow.appendChild(napasBadge);

      qrContainer.appendChild(qrTopRow);

      const qrCanvas = figma.createFrame();
      qrCanvas.name = "QR Matrix Canvas";
      qrCanvas.resize(220, 220);
      qrCanvas.fills = solid({ r: 1, g: 1, b: 1 });
      qrCanvas.clipsContent = false;

      const f1 = createFinderPattern(8, 8);
      const f2 = createFinderPattern(166, 8);
      const f3 = createFinderPattern(8, 166);
      [...f1, ...f2, ...f3].forEach(node => qrCanvas.appendChild(node));

      const matrixData = [
        [64, 18], [76, 18], [88, 18], [100, 18], [112, 18], [124, 18], [136, 18], [148, 18],
        [18, 64], [18, 76], [18, 88], [18, 100], [18, 112], [18, 124], [18, 136], [18, 148],
        [64, 64], [72, 64], [84, 64], [104, 64], [120, 64], [136, 64], [148, 64],
        [64, 76], [80, 76], [96, 76], [116, 76], [132, 76], [152, 76],
        [64, 88], [76, 88], [92, 88], [108, 88], [124, 88], [140, 88],
        [64, 128], [76, 128], [88, 128], [100, 128], [112, 128], [128, 128], [144, 128],
        [64, 144], [80, 144], [96, 144], [112, 144], [124, 144], [136, 144], [152, 144],
        [168, 64], [180, 64], [192, 64], [204, 64],
        [168, 76], [188, 76], [200, 76],
        [168, 88], [180, 88], [196, 88], [208, 88],
        [168, 104], [184, 104], [196, 104], [208, 104],
        [168, 120], [180, 120], [192, 120], [204, 120],
        [168, 136], [184, 136], [196, 136],
        [168, 152], [180, 152], [192, 152], [204, 152],
        [168, 168], [184, 168], [196, 168], [208, 168],
        [168, 184], [180, 184], [196, 184], [208, 184],
        [168, 200], [184, 200], [200, 200],
        [64, 168], [76, 168], [88, 168], [100, 168], [116, 168], [132, 168], [148, 168],
        [64, 184], [80, 184], [96, 184], [112, 184], [128, 184], [144, 184],
        [64, 200], [76, 200], [92, 200], [108, 200], [120, 200], [136, 200], [152, 200]
      ];

      matrixData.forEach(pt => {
        const r = figma.createRectangle();
        r.resize(7, 7);
        r.x = pt[0];
        r.y = pt[1];
        r.cornerRadius = 1.5;
        r.fills = solid({ r: 0.08, g: 0.12, b: 0.22 });
        qrCanvas.appendChild(r);
      });

      const centerEmblem = figma.createFrame();
      centerEmblem.name = "QR Center Logo";
      centerEmblem.resize(36, 36);
      centerEmblem.x = 92;
      centerEmblem.y = 92;
      centerEmblem.cornerRadius = 8;
      centerEmblem.fills = solid({ r: 1, g: 1, b: 1 });
      centerEmblem.strokes = solid({ r: 0.85, g: 0.9, b: 0.98 });
      centerEmblem.strokeWeight = 1.5;
      centerEmblem.layoutMode = "HORIZONTAL";
      centerEmblem.primaryAxisAlignItems = "CENTER";
      centerEmblem.counterAxisAlignItems = "CENTER";
      centerEmblem.appendChild(text("⚡", 18, "Bold", { r: 0.05, g: 0.35, b: 0.85 }));
      qrCanvas.appendChild(centerEmblem);

      qrContainer.appendChild(qrCanvas);

      const qrFooter = figma.createFrame();
      qrFooter.layoutMode = "VERTICAL";
      qrFooter.primaryAxisAlignItems = "CENTER";
      qrFooter.counterAxisAlignItems = "CENTER";
      qrFooter.primaryAxisSizingMode = "AUTO";
      qrFooter.counterAxisSizingMode = "AUTO";
      qrFooter.itemSpacing = 4;
      qrFooter.fills = [];
      qrFooter.appendChild(text("SỐ TIỀN THANH TOÁN", 11, "Semi Bold", { r: 0.45, g: 0.55, b: 0.65 }));
      qrFooter.appendChild(text("88.500 đ", 20, "Bold", { r: 0.05, g: 0.35, b: 0.75 }));
      qrFooter.appendChild(text("Chuyển đúng số tiền để được duyệt tự động", 11, "Regular", { r: 0.45, g: 0.55, b: 0.65 }));
      qrContainer.appendChild(qrFooter);

      return qrContainer;
    }

    const checkoutScreen = figma.createFrame();
    checkoutScreen.name = "Page 3 - Thanh Toán VietQR PayOS (/checkout/[bookingId])";
    checkoutScreen.resize(1440, 1420);
    checkoutScreen.x = 3080;
    checkoutScreen.y = 0;
    checkoutScreen.fills = solid(BG_DARK);
    checkoutScreen.layoutMode = "VERTICAL";
    checkoutScreen.itemSpacing = 0;

    checkoutScreen.appendChild(createHeader("checkout"));

    // Sticky Countdown Alert Banner
    const timerBanner = figma.createFrame();
    timerBanner.name = "Sticky Countdown Alert Banner";
    timerBanner.layoutMode = "HORIZONTAL";
    timerBanner.primaryAxisAlignItems = "SPACE_BETWEEN";
    timerBanner.counterAxisAlignItems = "CENTER";
    timerBanner.resize(1440, 54);
    timerBanner.paddingLeft = 80;
    timerBanner.paddingRight = 80;
    timerBanner.fills = solid({ r: 0.14, g: 0.09, b: 0.03 });
    timerBanner.strokes = solid({ r: 0.85, g: 0.52, b: 0.1 });
    timerBanner.strokeWeight = 1;

    const timerLeft = figma.createFrame();
    timerLeft.layoutMode = "HORIZONTAL";
    timerLeft.primaryAxisSizingMode = "AUTO";
    timerLeft.counterAxisSizingMode = "AUTO";
    timerLeft.counterAxisAlignItems = "CENTER";
    timerLeft.itemSpacing = 12;
    timerLeft.fills = [];
    timerLeft.appendChild(text("⏳", 18, "Regular", TEXT_PRIMARY));
    timerLeft.appendChild(text("Thời gian giữ lịch còn lại:", 14, "Semi Bold", TEXT_PRIMARY));

    const timePill = figma.createFrame();
    timePill.layoutMode = "HORIZONTAL";
    timePill.primaryAxisAlignItems = "CENTER";
    timePill.counterAxisAlignItems = "CENTER";
    timePill.paddingLeft = 14;
    timePill.paddingRight = 14;
    timePill.paddingTop = 6;
    timePill.paddingBottom = 6;
    timePill.cornerRadius = 6;
    timePill.fills = solid({ r: 0.88, g: 0.22, b: 0.18 });
    timePill.appendChild(text("04:32", 15, "Bold", TEXT_PRIMARY));
    timerLeft.appendChild(timePill);

    timerLeft.appendChild(text("— Vui lòng hoàn tất thanh toán cọc trong 5 phút để bảo lưu khung giờ.", 13, "Regular", TEXT_SECONDARY));
    timerBanner.appendChild(timerLeft);

    const timerRight = figma.createFrame();
    timerRight.layoutMode = "HORIZONTAL";
    timerRight.primaryAxisSizingMode = "AUTO";
    timerRight.counterAxisSizingMode = "AUTO";
    timerRight.counterAxisAlignItems = "CENTER";
    timerRight.itemSpacing = 10;
    timerRight.fills = [];
    timerRight.appendChild(text("Hạn cọc 5:00", 12, "Medium", STATUS_WARNING));

    const progressTrack = figma.createFrame();
    progressTrack.resize(140, 8);
    progressTrack.cornerRadius = 4;
    progressTrack.fills = solid({ r: 0.2, g: 0.25, b: 0.35 });
    progressTrack.clipsContent = true;

    const progressFill = figma.createRectangle();
    progressFill.resize(105, 8);
    progressFill.fills = solid(STATUS_WARNING);
    progressTrack.appendChild(progressFill);
    timerRight.appendChild(progressTrack);

    timerBanner.appendChild(timerRight);
    checkoutScreen.appendChild(timerBanner);

    // Checkout Body Container (2 columns)
    const checkMain = figma.createFrame();
    checkMain.name = "Checkout Main Content";
    checkMain.layoutMode = "HORIZONTAL";
    checkMain.primaryAxisAlignItems = "SPACE_BETWEEN";
    checkMain.resize(1440, 1020);
    checkMain.paddingLeft = 70;
    checkMain.paddingRight = 70;
    checkMain.paddingTop = 36;
    checkMain.paddingBottom = 36;
    checkMain.itemSpacing = 32;
    checkMain.fills = solid(BG_DARK);

    // Left Col: PayOS VietQR Portal
    const leftPay = figma.createFrame();
    leftPay.name = "PayOS VietQR Card";
    leftPay.layoutMode = "VERTICAL";
    leftPay.resize(760, 948);
    leftPay.paddingLeft = 32;
    leftPay.paddingRight = 32;
    leftPay.paddingTop = 28;
    leftPay.paddingBottom = 28;
    leftPay.cornerRadius = 16;
    leftPay.itemSpacing = 20;
    leftPay.fills = solid(BG_CARD);
    leftPay.strokes = solid(BORDER_SUBTLE);
    leftPay.strokeWeight = 1;

    const payHead = figma.createFrame();
    payHead.layoutMode = "VERTICAL";
    payHead.primaryAxisSizingMode = "AUTO";
    payHead.counterAxisSizingMode = "AUTO";
    payHead.itemSpacing = 6;
    payHead.fills = [];

    const payHeadRow = figma.createFrame();
    payHeadRow.layoutMode = "HORIZONTAL";
    payHeadRow.primaryAxisAlignItems = "SPACE_BETWEEN";
    payHeadRow.counterAxisAlignItems = "CENTER";
    payHeadRow.resize(696, 32);
    payHeadRow.fills = [];
    payHeadRow.appendChild(text("Thanh toán chuyển khoản VietQR", 22, "Bold", TEXT_PRIMARY));

    const bankBadgeRow = figma.createFrame();
    bankBadgeRow.layoutMode = "HORIZONTAL";
    bankBadgeRow.primaryAxisSizingMode = "AUTO";
    bankBadgeRow.counterAxisSizingMode = "AUTO";
    bankBadgeRow.itemSpacing = 8;
    bankBadgeRow.fills = [];
    bankBadgeRow.appendChild(badge("MBBank", BG_PRIMARY, ACCENT_VOLT));
    bankBadgeRow.appendChild(badge("Napas 24/7", BG_PRIMARY, STATUS_INFO));
    bankBadgeRow.appendChild(badge("PayOS", BG_PRIMARY, ACCENT_LIME));
    payHeadRow.appendChild(bankBadgeRow);
    payHead.appendChild(payHeadRow);

    payHead.appendChild(text("Quét mã QR bằng ứng dụng ngân hàng hoặc ví điện tử (MoMo, ZaloPay, VNPay) để thanh toán tức thì.", 13, "Regular", TEXT_SECONDARY));
    leftPay.appendChild(payHead);

    const middlePayRow = figma.createFrame();
    middlePayRow.name = "QR & Transfer Info Row";
    middlePayRow.layoutMode = "HORIZONTAL";
    middlePayRow.primaryAxisAlignItems = "SPACE_BETWEEN";
    middlePayRow.counterAxisAlignItems = "MIN";
    middlePayRow.resize(696, 436);
    middlePayRow.fills = [];

    middlePayRow.appendChild(createRealisticQRBox());

    const bDetails = figma.createFrame();
    bDetails.name = "Bank Account Manual Details";
    bDetails.layoutMode = "VERTICAL";
    bDetails.resize(340, 430);
    bDetails.paddingLeft = 20;
    bDetails.paddingRight = 20;
    bDetails.paddingTop = 18;
    bDetails.paddingBottom = 18;
    bDetails.itemSpacing = 12;
    bDetails.cornerRadius = 14;
    bDetails.fills = solid(BG_PRIMARY);
    bDetails.strokes = solid(BORDER_SUBTLE);
    bDetails.strokeWeight = 1;

    bDetails.appendChild(text("Thông tin tài khoản thụ hưởng", 14, "Bold", TEXT_PRIMARY));

    const rows = [
      { k: "Ngân hàng thụ hưởng:", v: "MBBank (Quân Đội)", c: TEXT_PRIMARY, copy: false },
      { k: "Số tài khoản:", v: "0987 654 321", c: TEXT_PRIMARY, copy: true },
      { k: "Tên chủ tài khoản:", v: "CLB SMASH ARENA PHÙ ĐỔNG", c: TEXT_PRIMARY, copy: false },
      { k: "Số tiền cọc (30%):", v: "88.500 đ", c: ACCENT_VOLT, copy: true },
      { k: "Nội dung chuyển khoản:", v: "BK928371", c: ACCENT_LIME, copy: true },
    ];

    rows.forEach(r => {
      const rw = figma.createFrame();
      rw.layoutMode = "VERTICAL";
      rw.primaryAxisSizingMode = "AUTO";
      rw.counterAxisSizingMode = "AUTO";
      rw.itemSpacing = 4;
      rw.fills = [];
      rw.appendChild(text(r.k, 11, "Regular", TEXT_MUTED));

      const valRow = figma.createFrame();
      valRow.layoutMode = "HORIZONTAL";
      valRow.primaryAxisAlignItems = "SPACE_BETWEEN";
      valRow.counterAxisAlignItems = "CENTER";
      valRow.resize(300, 24);
      valRow.fills = [];
      valRow.appendChild(text(r.v, r.k.includes("Nội dung") ? 15 : 13, "Bold", r.c));

      if (r.copy) {
        const cpBtn = figma.createFrame();
        cpBtn.layoutMode = "HORIZONTAL";
        cpBtn.primaryAxisAlignItems = "CENTER";
        cpBtn.counterAxisAlignItems = "CENTER";
        cpBtn.paddingLeft = 8;
        cpBtn.paddingRight = 8;
        cpBtn.paddingTop = 3;
        cpBtn.paddingBottom = 3;
        cpBtn.cornerRadius = 4;
        cpBtn.fills = solid(BG_CARD);
        cpBtn.strokes = solid(BORDER_SUBTLE);
        cpBtn.strokeWeight = 1;
        cpBtn.appendChild(text("📋 Sao chép", 10, "Medium", TEXT_SECONDARY));
        valRow.appendChild(cpBtn);
      }
      rw.appendChild(valRow);
      bDetails.appendChild(rw);
    });

    middlePayRow.appendChild(bDetails);
    leftPay.appendChild(middlePayRow);

    const radar = figma.createFrame();
    radar.name = "PayOS Live Polling Status";
    radar.layoutMode = "HORIZONTAL";
    radar.primaryAxisAlignItems = "SPACE_BETWEEN";
    radar.counterAxisAlignItems = "CENTER";
    radar.resize(696, 52);
    radar.paddingLeft = 18;
    radar.paddingRight = 18;
    radar.cornerRadius = 10;
    radar.fills = solid({ r: 0.05, g: 0.12, b: 0.08 });
    radar.strokes = solid(STATUS_SUCCESS);
    radar.strokeWeight = 1;

    const radarLeft = figma.createFrame();
    radarLeft.layoutMode = "HORIZONTAL";
    radarLeft.primaryAxisSizingMode = "AUTO";
    radarLeft.counterAxisSizingMode = "AUTO";
    radarLeft.counterAxisAlignItems = "CENTER";
    radarLeft.itemSpacing = 10;
    radarLeft.fills = [];

    const pulseDot = figma.createEllipse();
    pulseDot.resize(10, 10);
    pulseDot.fills = solid(STATUS_SUCCESS);
    radarLeft.appendChild(pulseDot);
    radarLeft.appendChild(text("Đang tự động lắng nghe giao dịch từ cổng thanh toán PayOS...", 13, "Medium", TEXT_PRIMARY));
    radar.appendChild(radarLeft);

    radar.appendChild(badge("Tự động kích hoạt", BG_PRIMARY, STATUS_SUCCESS));
    leftPay.appendChild(radar);

    const callout = figma.createFrame();
    callout.name = "Important Notice Callout";
    callout.layoutMode = "HORIZONTAL";
    callout.counterAxisAlignItems = "CENTER";
    callout.resize(696, 56);
    callout.paddingLeft = 16;
    callout.paddingRight = 16;
    callout.cornerRadius = 8;
    callout.itemSpacing = 12;
    callout.fills = solid({ r: 0.15, g: 0.1, b: 0.04 });
    callout.strokes = solid({ r: 0.5, g: 0.35, b: 0.1 });
    callout.strokeWeight = 1;
    callout.appendChild(text("⚠️", 18, "Regular", STATUS_WARNING));
    callout.appendChild(text("Bắt buộc ghi chính xác nội dung chuyển khoản BK928371. Hệ thống sẽ tự động gạch nợ và cấp Vé QR trong 3 giây. Không chuyển tiền khi đồng hồ hết giờ.", 12, "Regular", STATUS_WARNING, null, 620));
    leftPay.appendChild(callout);

    const stepsRow = figma.createFrame();
    stepsRow.name = "Quick Steps Row";
    stepsRow.layoutMode = "HORIZONTAL";
    stepsRow.primaryAxisAlignItems = "SPACE_BETWEEN";
    stepsRow.resize(696, 42);
    stepsRow.fills = [];

    const steps = [
      "1. Mở App ngân hàng / Ví",
      "2. Quét mã VietQR ở trên",
      "3. Xác nhận chuyển khoản & nhận vé"
    ];
    steps.forEach(st => {
      const stepChip = figma.createFrame();
      stepChip.layoutMode = "HORIZONTAL";
      stepChip.primaryAxisAlignItems = "CENTER";
      stepChip.counterAxisAlignItems = "CENTER";
      stepChip.resize(220, 42);
      stepChip.cornerRadius = 8;
      stepChip.fills = solid(BG_PRIMARY);
      stepChip.strokes = solid(BORDER_SUBTLE);
      stepChip.strokeWeight = 1;
      stepChip.appendChild(text(st, 12, "Medium", TEXT_SECONDARY));
      stepsRow.appendChild(stepChip);
    });
    leftPay.appendChild(stepsRow);

    checkMain.appendChild(leftPay);

    // Right Col: Booking Summary Sidebar
    const rightSum = figma.createFrame();
    rightSum.name = "Booking Summary Sidebar";
    rightSum.layoutMode = "VERTICAL";
    rightSum.resize(500, 948);
    rightSum.paddingLeft = 32;
    rightSum.paddingRight = 32;
    rightSum.paddingTop = 28;
    rightSum.paddingBottom = 28;
    rightSum.cornerRadius = 16;
    rightSum.itemSpacing = 18;
    rightSum.fills = solid(BG_CARD);
    rightSum.strokes = solid(BORDER_SUBTLE);
    rightSum.strokeWeight = 1;

    const sumHead = figma.createFrame();
    sumHead.layoutMode = "HORIZONTAL";
    sumHead.primaryAxisAlignItems = "SPACE_BETWEEN";
    sumHead.counterAxisAlignItems = "CENTER";
    sumHead.resize(436, 32);
    sumHead.fills = [];
    sumHead.appendChild(text("Thông tin đơn giữ chỗ", 20, "Bold", TEXT_PRIMARY));
    sumHead.appendChild(badge("HOLDING • GIỮ CHỖ", { r: 0.4, g: 0.2, b: 0.05 }, STATUS_WARNING));
    rightSum.appendChild(sumHead);

    const refBanner = figma.createFrame();
    refBanner.layoutMode = "HORIZONTAL";
    refBanner.primaryAxisAlignItems = "SPACE_BETWEEN";
    refBanner.counterAxisAlignItems = "CENTER";
    refBanner.resize(436, 38);
    refBanner.paddingLeft = 14;
    refBanner.paddingRight = 14;
    refBanner.cornerRadius = 8;
    refBanner.fills = solid(BG_PRIMARY);
    refBanner.strokes = solid(BORDER_SUBTLE);
    refBanner.strokeWeight = 1;
    refBanner.appendChild(text("Mã booking:", 12, "Medium", TEXT_MUTED));
    refBanner.appendChild(text("#BK-928371", 13, "Bold", ACCENT_VOLT));
    rightSum.appendChild(refBanner);

    const sumLines = [
      { l: "Sân thi đấu:", r: "Sân 01 (Tiêu chuẩn VIP)" },
      { l: "Mặt sân:", r: "Cushion Pro 8 lớp trong nhà" },
      { l: "Khung giờ thi đấu:", r: "17:30 — 19:00 (90 phút)" },
      { l: "Ngày thi đấu:", r: "Thứ Ba, 20/10/2026" },
      { l: "Giãn cách vệ sinh sân:", r: "19:00 — 19:15 (15 phút miễn phí)" },
      { l: "Người đặt sân:", r: "Nguyễn Văn A (0987 654 321)" },
    ];

    sumLines.forEach(sl => {
      const fr = figma.createFrame();
      fr.layoutMode = "HORIZONTAL";
      fr.primaryAxisAlignItems = "SPACE_BETWEEN";
      fr.resize(436, 24);
      fr.fills = [];
      fr.appendChild(text(sl.l, 13, "Regular", TEXT_MUTED));
      fr.appendChild(text(sl.r, 13, "Medium", TEXT_PRIMARY));
      rightSum.appendChild(fr);
    });

    const div1 = figma.createRectangle();
    div1.resize(436, 1);
    div1.fills = solid(BORDER_SUBTLE);
    rightSum.appendChild(div1);

    const pCalc = figma.createFrame();
    pCalc.name = "Price Breakdown Box";
    pCalc.layoutMode = "VERTICAL";
    pCalc.resize(436, 210);
    pCalc.paddingLeft = 20;
    pCalc.paddingRight = 20;
    pCalc.paddingTop = 18;
    pCalc.paddingBottom = 18;
    pCalc.itemSpacing = 12;
    pCalc.cornerRadius = 12;
    pCalc.fills = solid(BG_PRIMARY);
    pCalc.strokes = solid({ r: 0.25, g: 0.38, b: 0.12 });
    pCalc.strokeWeight = 1.5;

    const pRow1 = figma.createFrame();
    pRow1.layoutMode = "HORIZONTAL";
    pRow1.primaryAxisAlignItems = "SPACE_BETWEEN";
    pRow1.resize(396, 20);
    pRow1.fills = [];
    pRow1.appendChild(text("Tiền thuê sân (90 phút):", 13, "Regular", TEXT_SECONDARY));
    pRow1.appendChild(text("150.000 đ", 13, "Medium", TEXT_PRIMARY));
    pCalc.appendChild(pRow1);

    const pRow2 = figma.createFrame();
    pRow2.layoutMode = "HORIZONTAL";
    pRow2.primaryAxisAlignItems = "SPACE_BETWEEN";
    pRow2.resize(396, 20);
    pRow2.fills = [];
    pRow2.appendChild(text("Hình thức thanh toán:", 13, "Regular", TEXT_SECONDARY));
    pRow2.appendChild(text("Đặt cọc 30%", 13, "Bold", ACCENT_LIME));
    pCalc.appendChild(pRow2);

    const dueBox = figma.createFrame();
    dueBox.layoutMode = "VERTICAL";
    dueBox.resize(396, 68);
    dueBox.paddingLeft = 14;
    dueBox.paddingRight = 14;
    dueBox.paddingTop = 10;
    dueBox.paddingBottom = 10;
    dueBox.cornerRadius = 8;
    dueBox.itemSpacing = 4;
    dueBox.fills = solid({ r: 0.08, g: 0.15, b: 0.06 });
    dueBox.strokes = solid(ACCENT_LIME);
    dueBox.strokeWeight = 1;

    const dueRow = figma.createFrame();
    dueRow.layoutMode = "HORIZONTAL";
    dueRow.primaryAxisAlignItems = "SPACE_BETWEEN";
    dueRow.counterAxisAlignItems = "CENTER";
    dueRow.resize(368, 26);
    dueRow.fills = [];
    dueRow.appendChild(text("SỐ TIỀN THANH TOÁN NGAY:", 13, "Bold", TEXT_PRIMARY));
    dueRow.appendChild(text("88.500 đ", 20, "Bold", ACCENT_VOLT));
    dueBox.appendChild(dueRow);

    dueBox.appendChild(text("• Còn lại 61.500 đ thanh toán tại quầy khi check-in", 11, "Regular", TEXT_MUTED));
    pCalc.appendChild(dueBox);

    rightSum.appendChild(pCalc);

    const trustBox = figma.createFrame();
    trustBox.layoutMode = "VERTICAL";
    trustBox.resize(436, 76);
    trustBox.paddingLeft = 14;
    trustBox.paddingRight = 14;
    trustBox.paddingTop = 10;
    trustBox.paddingBottom = 10;
    trustBox.cornerRadius = 8;
    trustBox.itemSpacing = 6;
    trustBox.fills = solid(BG_PRIMARY);
    trustBox.appendChild(text("🔒 Cổng thanh toán bảo mật SSL 256-bit chuẩn PayOS & Napas", 12, "Medium", TEXT_SECONDARY));
    trustBox.appendChild(text("🛡️ Hoàn tiền & đổi lịch minh bạch theo chính sách sân thể thao", 12, "Medium", TEXT_SECONDARY));
    rightSum.appendChild(trustBox);

    const actionBox = figma.createFrame();
    actionBox.layoutMode = "VERTICAL";
    actionBox.primaryAxisSizingMode = "AUTO";
    actionBox.counterAxisSizingMode = "AUTO";
    actionBox.itemSpacing = 10;
    actionBox.fills = [];

    actionBox.appendChild(button("Tôi đã chuyển khoản thành công", "primary", 436));
    actionBox.appendChild(button("Hủy đơn giữ chỗ này", "danger", 436));
    rightSum.appendChild(actionBox);

    const helpRow = figma.createFrame();
    helpRow.layoutMode = "HORIZONTAL";
    helpRow.primaryAxisAlignItems = "CENTER";
    helpRow.resize(436, 20);
    helpRow.fills = [];
    helpRow.appendChild(text("Cần hỗ trợ thanh toán? Hotline 0987 654 321 (24/7)", 12, "Regular", TEXT_MUTED));
    rightSum.appendChild(helpRow);

    checkMain.appendChild(rightSum);
    checkoutScreen.appendChild(checkMain);
    checkoutScreen.appendChild(createFooter());
    screens.push(checkoutScreen);

    // =========================================================================
    // PAGE 4: VÉ ĐIỆN TỬ E-TICKET & QR CHECK-IN (/bookings/[bookingId])
    // =========================================================================
    const ticketScreen = figma.createFrame();
    ticketScreen.name = "Page 4 - Vé Điện Tử & Check-in (/bookings/[bookingId])";
    ticketScreen.resize(1440, 1200);
    ticketScreen.x = 4620;
    ticketScreen.y = 0;
    ticketScreen.fills = solid(BG_DARK);
    ticketScreen.layoutMode = "VERTICAL";
    ticketScreen.itemSpacing = 0;

    ticketScreen.appendChild(createHeader("ticket"));

    const tktMain = figma.createFrame();
    tktMain.name = "Ticket Main Area";
    tktMain.layoutMode = "VERTICAL";
    tktMain.primaryAxisAlignItems = "CENTER";
    tktMain.resize(1440, 860);
    tktMain.paddingTop = 40;
    tktMain.paddingBottom = 40;
    tktMain.itemSpacing = 24;
    tktMain.fills = solid(BG_DARK);

    // Success Heading
    tktMain.appendChild(badge("🎉 ĐẶT SÂN THÀNH CÔNG", solid(STATUS_SUCCESS)[0].color, BG_DARK));
    tktMain.appendChild(text("Lịch thi đấu của bạn đã được đảm bảo", 28, "Bold", TEXT_PRIMARY, "CENTER"));

    // Electronic Pass Card
    const passCard = figma.createFrame();
    passCard.name = "Electronic Pass Card";
    passCard.layoutMode = "VERTICAL";
    passCard.resize(680, 560);
    passCard.paddingLeft = 40;
    passCard.paddingRight = 40;
    passCard.paddingTop = 32;
    passCard.paddingBottom = 32;
    passCard.cornerRadius = 20;
    passCard.itemSpacing = 20;
    passCard.fills = solid(BG_CARD);
    passCard.strokes = solid(BORDER_SUBTLE);

    // Pass Top Row
    const pTop = figma.createFrame();
    pTop.layoutMode = "HORIZONTAL";
    pTop.primaryAxisAlignItems = "SPACE_BETWEEN";
    pTop.counterAxisAlignItems = "CENTER";
    pTop.resize(600, 40);
    pTop.fills = [];
    pTop.appendChild(text("VÉ ĐẶT SÂN • SMASH ARENA", 16, "Bold", ACCENT_VOLT));
    pTop.appendChild(badge("ĐÃ CỌC 30% — CHỜ CHECK-IN", { r: 0.1, g: 0.35, b: 0.2 }, STATUS_SUCCESS));
    passCard.appendChild(pTop);

    // Pass Center Row: QR on Left, Details on Right
    const pCenter = figma.createFrame();
    pCenter.layoutMode = "HORIZONTAL";
    pCenter.itemSpacing = 32;
    pCenter.counterAxisAlignItems = "CENTER";
    pCenter.resize(600, 240);
    pCenter.fills = [];

    // QR Box
    const qrPass = figma.createFrame();
    qrPass.resize(200, 200);
    qrPass.cornerRadius = 12;
    qrPass.fills = solid({ r: 1, g: 1, b: 1 });
    qrPass.layoutMode = "VERTICAL";
    qrPass.primaryAxisAlignItems = "CENTER";
    qrPass.counterAxisAlignItems = "CENTER";
    qrPass.itemSpacing = 6;
    qrPass.appendChild(text("MÃ CHECK-IN", 13, "Bold", { r: 0.05, g: 0.1, b: 0.2 }));
    qrPass.appendChild(text("🏁 [QR VÉ]", 24, "Bold", { r: 0.1, g: 0.4, b: 0.8 }));
    qrPass.appendChild(text("#TKT-928371", 12, "Bold", { r: 0.2, g: 0.2, b: 0.2 }));
    pCenter.appendChild(qrPass);

    // Info Column
    const pInfo = figma.createFrame();
    pInfo.layoutMode = "VERTICAL";
    pInfo.itemSpacing = 8;
    pInfo.resize(368, 220);
    pInfo.fills = [];
    pInfo.appendChild(text("Sân 01 (Tiêu chuẩn) — Cushion Pro", 18, "Bold", TEXT_PRIMARY));
    pInfo.appendChild(text("📍 Chi nhánh Phù Đổng, Gia Lâm, Hà Nội", 13, "Regular", TEXT_MUTED));
    pInfo.appendChild(text("⏰ 17:30 — 19:00 (Thứ Ba, 20/10/2026)", 14, "Bold", ACCENT_LIME));
    pInfo.appendChild(text("👤 Người đặt: Nguyễn Văn A (0987 654 321)", 13, "Regular", TEXT_SECONDARY));
    pInfo.appendChild(text("💰 Đã cọc: 88.500 đ • Còn lại tại quầy: 61.500 đ", 13, "Medium", TEXT_PRIMARY));
    pInfo.appendChild(text("Vui lòng xuất trình mã QR này tại quầy lễ tân trước 10 phút.", 12, "Regular", STATUS_INFO));
    pCenter.appendChild(pInfo);

    passCard.appendChild(pCenter);

    // Pass Action Buttons
    const pBtns = figma.createFrame();
    pBtns.layoutMode = "HORIZONTAL";
    pBtns.itemSpacing = 16;
    pBtns.counterAxisAlignItems = "CENTER";
    pBtns.resize(600, 50);
    pBtns.fills = [];
    pBtns.appendChild(button("Lưu ảnh vé vào máy", "primary"));
    pBtns.appendChild(button("Xem chỉ đường Google Maps", "secondary"));
    pBtns.appendChild(button("Yêu cầu hủy sân & hoàn tiền", "danger"));
    passCard.appendChild(pBtns);

    tktMain.appendChild(passCard);
    ticketScreen.appendChild(tktMain);
    ticketScreen.appendChild(createFooter());
    screens.push(ticketScreen);

    // =========================================================================
    // PAGE 5: MODAL BÁO GIÁ HỦY SÂN & HOÀN TIỀN (Phạt 10% Minh Bạch)
    // =========================================================================
    const cancelScreen = figma.createFrame();
    cancelScreen.name = "Page 5 - Modal Báo Giá Hủy & Hoàn Tiền (10% Penalty)";
    cancelScreen.resize(1440, 1200);
    cancelScreen.x = 6160;
    cancelScreen.y = 0;
    cancelScreen.fills = solid(BG_DARK);
    cancelScreen.layoutMode = "VERTICAL";
    cancelScreen.primaryAxisAlignItems = "CENTER";
    cancelScreen.counterAxisAlignItems = "CENTER";

    // Modal Box (Floating Dialog)
    const modal = figma.createFrame();
    modal.name = "Cancellation Quote Modal";
    modal.layoutMode = "VERTICAL";
    modal.resize(640, 720);
    modal.paddingLeft = 36;
    modal.paddingRight = 36;
    modal.paddingTop = 32;
    modal.paddingBottom = 32;
    modal.cornerRadius = 20;
    modal.itemSpacing = 20;
    modal.fills = solid(BG_CARD);
    modal.strokes = solid(BORDER_SUBTLE);
    modal.strokeWeight = 1;

    // Modal Header
    const mHeader = figma.createFrame();
    mHeader.layoutMode = "HORIZONTAL";
    mHeader.primaryAxisAlignItems = "SPACE_BETWEEN";
    mHeader.counterAxisAlignItems = "CENTER";
    mHeader.resize(568, 36);
    mHeader.fills = [];
    mHeader.appendChild(text("Chính sách hủy sân & Hoàn phí", 20, "Bold", TEXT_PRIMARY));
    mHeader.appendChild(text("✕", 18, "Medium", TEXT_MUTED));
    modal.appendChild(mHeader);

    modal.appendChild(text("Đơn đặt sân #BK-928371 • Sân 01 (17:30 - 19:00, 20/10/2026)", 13, "Regular", TEXT_MUTED));

    // Transparent Financial Breakdown Box
    const fBreakdown = figma.createFrame();
    fBreakdown.name = "Financial Breakdown Box";
    fBreakdown.layoutMode = "VERTICAL";
    fBreakdown.resize(568, 200);
    fBreakdown.paddingLeft = 20;
    fBreakdown.paddingRight = 20;
    fBreakdown.paddingTop = 18;
    fBreakdown.paddingBottom = 18;
    fBreakdown.itemSpacing = 10;
    fBreakdown.cornerRadius = 12;
    fBreakdown.fills = solid(BG_PRIMARY);
    fBreakdown.strokes = solid(BORDER_SUBTLE);

    fBreakdown.appendChild(text("BẢNG TÍNH HOÀN TIỀN MINH BẠCH:", 12, "Bold", TEXT_MUTED));
    
    const bdRows = [
      { l: "Tổng giá trị đơn đặt sân:", r: "150.000 đ" },
      { l: "Số tiền bạn đã thanh toán (Cọc 30%):", r: "88.500 đ" },
      { l: "Phí hủy theo quy định (10% tổng đơn):", r: "-15.000 đ" },
    ];
    bdRows.forEach(b => {
      const brw = figma.createFrame();
      brw.layoutMode = "HORIZONTAL";
      brw.primaryAxisAlignItems = "SPACE_BETWEEN";
      brw.resize(528, 22);
      brw.fills = [];
      brw.appendChild(text(b.l, 13, "Regular", TEXT_SECONDARY));
      brw.appendChild(text(b.r, 13, "Bold", b.r.startsWith("-") ? STATUS_ERROR : TEXT_PRIMARY));
      fBreakdown.appendChild(brw);
    });

    const totalRefundRow = figma.createFrame();
    totalRefundRow.layoutMode = "HORIZONTAL";
    totalRefundRow.primaryAxisAlignItems = "SPACE_BETWEEN";
    totalRefundRow.resize(528, 30);
    totalRefundRow.fills = [];
    totalRefundRow.appendChild(text("SỐ TIỀN THỰC HOÀN VÀO TÀI KHOẢN:", 14, "Bold", TEXT_PRIMARY));
    totalRefundRow.appendChild(text("73.500 đ", 18, "Bold", ACCENT_VOLT));
    fBreakdown.appendChild(totalRefundRow);
    modal.appendChild(fBreakdown);

    // Bank Account Form for Refund
    const bankForm = figma.createFrame();
    bankForm.layoutMode = "VERTICAL";
    bankForm.itemSpacing = 8;
    bankForm.resize(568, 140);
    bankForm.fills = [];
    bankForm.appendChild(text("Thông tin tài khoản nhận tiền hoàn:", 13, "Medium", TEXT_PRIMARY));

    const inpBank = figma.createFrame();
    inpBank.resize(568, 42);
    inpBank.cornerRadius = 8;
    inpBank.paddingLeft = 14;
    inpBank.paddingRight = 14;
    inpBank.layoutMode = "HORIZONTAL";
    inpBank.counterAxisAlignItems = "CENTER";
    inpBank.fills = solid(BG_PRIMARY);
    inpBank.strokes = solid(BORDER_SUBTLE);
    inpBank.appendChild(text("MBBank - 0987 654 321 (NGUYEN VAN A)", 13, "Regular", TEXT_SECONDARY));
    bankForm.appendChild(inpBank);

    const warnConsent = figma.createFrame();
    warnConsent.layoutMode = "HORIZONTAL";
    warnConsent.itemSpacing = 8;
    warnConsent.counterAxisAlignItems = "CENTER";
    warnConsent.fills = [];
    warnConsent.appendChild(text("☑", 15, "Bold", STATUS_WARNING));
    warnConsent.appendChild(text("Tôi hiểu sau khi hủy, lịch sân sẽ được mở lại cho người khác và không thể hoàn tác.", 12, "Regular", TEXT_SECONDARY));
    bankForm.appendChild(warnConsent);

    modal.appendChild(bankForm);

    // Modal Action Buttons
    const mActions = figma.createFrame();
    mActions.layoutMode = "HORIZONTAL";
    mActions.itemSpacing = 16;
    mActions.resize(568, 48);
    mActions.fills = [];
    mActions.appendChild(button("Giữ lại lịch đặt", "secondary", 270));
    mActions.appendChild(button("Xác nhận hủy & Nhận hoàn tiền", "danger", 280));
    modal.appendChild(mActions);

    cancelScreen.appendChild(modal);
    screens.push(cancelScreen);

    // Focus Viewport on all 5 screens and Close Plugin cleanly
    figma.viewport.scrollAndZoomIntoView(screens);
    figma.notify("✓ Đã hoàn tất thiết kế trọn bộ 5 màn hình Booking & Payment lên Figma!", { timeout: 4000 });
    figma.closePlugin();
  } catch (error) {
    console.error("Plugin Error:", error);
    try {
      figma.notify("Lỗi: " + (error.message || String(error)), { error: true, timeout: 8000 });
      figma.closePlugin("Lỗi plugin: " + (error.message || String(error)));
    } catch (e) {
      figma.closePlugin();
    }
  }
})();
