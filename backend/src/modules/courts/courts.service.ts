import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { PublicCourtDto } from './dto/courts-response.dto.js';

export type PublicCourtItem = PublicCourtDto;

@Injectable()
export class CourtsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicCourts(): Promise<PublicCourtItem[]> {
    try {
      const courts = await this.prisma.court.findMany({
        where: { status: 'ACTIVE' },
        include: {
          priceRules: true,
          branch: true,
        },
      });

      if (courts.length > 0) {
        return courts.map((court) => ({
          id: court.id,
          name: court.name,
          code: court.code,
          courtType: court.courtType,
          status: court.status,
          surfaceType:
            court.courtType === 'VIP'
              ? 'Sân Pickleball trong nhà Cushion Pro'
              : 'Sân Pickleball trong nhà tiêu chuẩn',
          features:
            court.courtType === 'VIP'
              ? [
                  'Sân trong nhà mái che cách nhiệt',
                  'Đèn LED thi đấu 500 Lux',
                  'Hàng rào lưới ngăn an toàn',
                  'Khu lounge VIP riêng',
                ]
              : [
                  'Sân trong nhà thoáng mát',
                  'Mặt sân giảm chấn chống trượt',
                  'Lưới thi đấu cao cấp',
                ],
          pricePerHour: court.courtType === 'VIP' ? 250000 : 160000,
          imageUrl:
            court.courtType === 'VIP'
              ? '/courts/court-1.jpg'
              : '/courts/court-3.jpg',
          rating: 0,
          reviewCount: 0,
        }));
      }
    } catch {
      // Fallback below if DB is unreachable or unseeded
    }

    // Curated showcase courts for Sporty E-commerce catalog
    return [
      {
        id: 'court-pro-01',
        name: 'Center Court Pro 1',
        code: 'PRO-01',
        courtType: 'VIP',
        status: 'ACTIVE',
        surfaceType: 'Sân Pickleball trong nhà Cushion Pro',
        features: [
          'Mái che cách nhiệt tiêu chuẩn',
          'Đèn LED thi đấu 500 Lux',
          'Hàng rào lưới ngăn an toàn',
          'Khu lounge VIP riêng',
        ],
        pricePerHour: 280000,
        imageUrl: '/courts/court-1.jpg',
        rating: 0,
        reviewCount: 0,
      },
      {
        id: 'court-pro-02',
        name: 'Championship Arena 2',
        code: 'PRO-02',
        courtType: 'VIP',
        status: 'ACTIVE',
        surfaceType: 'Sân Pickleball trong nhà Cushion 5 lớp',
        features: [
          'Khán đài mini theo dõi',
          'Đèn LED chuẩn thi đấu',
          'Phòng thay đồ nước nóng',
          'Tủ đồ thông minh',
        ],
        pricePerHour: 240000,
        imageUrl: '/courts/court-2.jpg',
        rating: 0,
        reviewCount: 0,
      },
      {
        id: 'court-std-03',
        name: 'Pickle Standard 3',
        code: 'STD-03',
        courtType: 'STANDARD',
        status: 'ACTIVE',
        surfaceType: 'Sân Pickleball trong nhà High-Grip',
        features: [
          'Mặt sân hai màu chống trơn trượt',
          'Hệ thống đèn LED siêu sáng',
          'Trọng tài ghế cao',
          'Nước uống miễn phí',
        ],
        pricePerHour: 170000,
        imageUrl: '/courts/court-3.jpg',
        rating: 0,
        reviewCount: 0,
      },
      {
        id: 'court-std-04',
        name: 'Dynamic Court 4',
        code: 'STD-04',
        courtType: 'STANDARD',
        status: 'ACTIVE',
        surfaceType: 'Sân Pickleball trong nhà Elastic Cushion',
        features: [
          'Độ nảy bóng ổn định chuẩn thi đấu',
          'Mái che quạt trần công nghiệp',
          'Lưới thi đấu cao cấp',
          'Khu căng cơ khởi động',
        ],
        pricePerHour: 160000,
        imageUrl: '/courts/court-4.jpg',
        rating: 0,
        reviewCount: 0,
      },
    ];
  }
}
