import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppErrorCode } from '../../enums/app.enum.js';

export interface PaginationParams {
  page: number;
  limit: number;
  totalItems: number;
}

/**
 * Metadata thông tin phân trang cho danh sách dữ liệu
 */
export class PaginationMeta {
  @ApiProperty({ description: 'Trang hiện tại (bắt đầu từ 1)', example: 1 })
  readonly page: number;

  @ApiProperty({ description: 'Số lượng phần tử trên mỗi trang', example: 10 })
  readonly limit: number;

  @ApiProperty({ description: 'Tổng số lượng bản ghi', example: 100 })
  readonly totalItems: number;

  @ApiProperty({ description: 'Tổng số trang', example: 10 })
  readonly totalPages: number;

  @ApiProperty({ description: 'Có trang tiếp theo hay không', example: true })
  readonly hasNextPage: boolean;

  @ApiProperty({ description: 'Có trang trước đó hay không', example: false })
  readonly hasPrevPage: boolean;

  constructor(params: PaginationParams) {
    this.page = Math.max(1, params.page);
    this.limit = Math.max(1, params.limit);
    this.totalItems = Math.max(0, params.totalItems);
    this.totalPages = Math.ceil(this.totalItems / this.limit) || 1;
    this.hasNextPage = this.page < this.totalPages;
    this.hasPrevPage = this.page > 1;
  }
}

/**
 * Chi tiết từng lỗi cụ thể (ví dụ lỗi validate form hoặc field con)
 */
export class ApiErrorDetail {
  @ApiProperty({
    description: 'Mã định danh lỗi chi tiết',
    example: 'VALIDATION_FAILED',
  })
  readonly code: string;

  @ApiPropertyOptional({
    description: 'Tên trường dữ liệu bị lỗi nếu có',
    example: 'phone',
  })
  readonly field?: string;

  @ApiProperty({
    description: 'Mô tả chi tiết nguyên nhân lỗi',
    example: 'Số điện thoại không hợp lệ',
  })
  readonly message: string;

  constructor(code: string, message: string, field?: string) {
    this.code = code;
    this.message = message;
    this.field = field;
  }
}

/**
 * Kiểu chuẩn dữ liệu trả về cho toàn bộ API hệ thống
 */
export class ApiResponse<T> {
  @ApiProperty({
    description: 'Trạng thái thành công của yêu cầu',
    example: true,
  })
  readonly success: boolean;

  @ApiProperty({ description: 'Mã HTTP trạng thái', example: 200 })
  readonly statusCode: number;

  @ApiProperty({
    description: 'Thông điệp phản hồi',
    example: 'Thao tác thành công',
  })
  readonly message: string;

  @ApiProperty({ description: 'Dữ liệu trả về' })
  readonly data: T;

  @ApiProperty({
    description: 'Thời điểm tạo phản hồi (ISO 8601)',
    example: '2026-10-11T06:50:00.000Z',
  })
  readonly timestamp: string;

  @ApiPropertyOptional({
    description: 'Đường dẫn endpoint yêu cầu',
    example: '/api/v1/courts',
  })
  readonly path?: string;

  protected constructor(
    data: T,
    message = 'Thành công',
    statusCode = 200,
    path?: string,
  ) {
    this.success = statusCode >= 200 && statusCode < 300;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.timestamp = new Date().toISOString();
    this.path = path;
  }

  static success<TData>(
    data: TData,
    message = 'Thành công',
    statusCode = 200,
    path?: string,
  ): ApiResponse<TData> {
    return new ApiResponse(data, message, statusCode, path);
  }

  static paginated<TItem>(
    items: TItem[],
    paginationParams: PaginationParams,
    message = 'Lấy danh sách thành công',
    statusCode = 200,
    path?: string,
  ): PaginatedResponse<TItem> {
    const pagination = new PaginationMeta(paginationParams);
    return new PaginatedResponse(items, pagination, message, statusCode, path);
  }

  static error(
    message: string,
    statusCode = 400,
    errorCode: AppErrorCode = AppErrorCode.BAD_REQUEST,
    errors?: ApiErrorDetail[],
    path?: string,
  ): ApiErrorResponse {
    return new ApiErrorResponse(message, statusCode, errorCode, errors, path);
  }
}

/**
 * Cấu trúc trả về cho danh sách có phân trang
 */
export class PaginatedResponse<T> extends ApiResponse<T[]> {
  @ApiProperty({
    description: 'Metadata phân trang',
    type: () => PaginationMeta,
  })
  readonly pagination: PaginationMeta;

  constructor(
    data: T[],
    pagination: PaginationMeta,
    message = 'Thành công',
    statusCode = 200,
    path?: string,
  ) {
    super(data, message, statusCode, path);
    this.pagination = pagination;
  }
}

/**
 * Cấu trúc trả về khi API gặp lỗi
 */
export class ApiErrorResponse {
  @ApiProperty({ description: 'Trạng thái thất bại', example: false })
  readonly success = false;

  @ApiProperty({ description: 'Mã HTTP trạng thái', example: 400 })
  readonly statusCode: number;

  @ApiProperty({
    description: 'Thông điệp lỗi chính',
    example: 'Yêu cầu không hợp lệ',
  })
  readonly message: string;

  @ApiProperty({
    description: 'Mã định danh lỗi hệ thống',
    example: 'BAD_REQUEST',
  })
  readonly errorCode: string;

  @ApiProperty({
    description: 'Thời điểm xảy ra lỗi (ISO 8601)',
    example: '2026-10-11T06:50:00.000Z',
  })
  readonly timestamp: string;

  @ApiPropertyOptional({
    description: 'Danh sách lỗi chi tiết nếu có',
    type: () => [ApiErrorDetail],
  })
  readonly errors?: ApiErrorDetail[];

  @ApiPropertyOptional({
    description: 'Đường dẫn endpoint yêu cầu',
    example: '/api/v1/bookings',
  })
  readonly path?: string;

  constructor(
    message: string,
    statusCode = 400,
    errorCode: string = AppErrorCode.BAD_REQUEST,
    errors?: ApiErrorDetail[],
    path?: string,
  ) {
    this.statusCode = statusCode;
    this.message = message;
    this.errorCode = errorCode;
    this.errors = errors;
    this.timestamp = new Date().toISOString();
    this.path = path;
  }
}
