import { calculateLineAmount } from './court-pricing.js';
import { CourtPricingError } from './court-pricing.types.js';

export type ServiceProductKind = 'DRINK' | 'BALL' | 'PADDLE';
export type ServiceBillingMode = 'SALE' | 'HOURLY_RENTAL';

export interface DomainServiceProduct {
  id: string;
  code: string;
  name: string;
  kind: ServiceProductKind;
  billingMode: ServiceBillingMode;
  unit: string;
  unitPrice: number;
  availableQuantity: number;
  imageUrl: string | null;
}

export interface DomainServiceSelection {
  productId: string;
  quantity: number;
}

export interface DomainServiceLine {
  productId: string;
  code: string;
  name: string;
  kind: ServiceProductKind;
  billingMode: ServiceBillingMode;
  unit: string;
  unitPrice: number;
  quantity: number;
  durationMinutes: number;
  amount: number;
}

export const COURT_SERVICE_PRODUCTS: readonly DomainServiceProduct[] = [
  {
    id: 'svc-paddle-carbon',
    code: 'PADDLE-CARBON',
    name: 'Vợt Pickleball Carbon 16mm',
    kind: 'PADDLE',
    billingMode: 'HOURLY_RENTAL',
    unit: 'cây',
    unitPrice: 50_000,
    availableQuantity: 20,
    imageUrl: '/products/paddle-carbon.jpg',
  },
  {
    id: 'svc-ball-franklin-x40',
    code: 'BALL-X40',
    name: 'Bóng thi đấu Franklin X-40',
    kind: 'BALL',
    billingMode: 'SALE',
    unit: 'quả',
    unitPrice: 65_000,
    availableQuantity: 50,
    imageUrl: '/products/franklin-balls.png',
  },
  {
    id: 'svc-drink-pocari',
    code: 'DRINK-POCARI',
    name: 'Pocari Sweat ướp lạnh',
    kind: 'DRINK',
    billingMode: 'SALE',
    unit: 'chai',
    unitPrice: 20_000,
    availableQuantity: 60,
    imageUrl: '/products/pocari.png',
  },
  {
    id: 'svc-drink-aquarius',
    code: 'DRINK-AQUARIUS',
    name: 'Nước khoáng thể thao Aquarius',
    kind: 'DRINK',
    billingMode: 'SALE',
    unit: 'chai',
    unitPrice: 18_000,
    availableQuantity: 60,
    imageUrl: '/products/aquarius.png',
  },
  {
    id: 'svc-drink-dasani',
    code: 'DRINK-DASANI',
    name: 'Nước tinh khiết Dasani 500ml',
    kind: 'DRINK',
    billingMode: 'SALE',
    unit: 'chai',
    unitPrice: 10_000,
    availableQuantity: 80,
    imageUrl: '/products/dasani.png',
  },
];

export function listCourtServiceProducts(): DomainServiceProduct[] {
  return COURT_SERVICE_PRODUCTS.map((product) => ({ ...product }));
}

export function quoteCourtServices(
  selections: readonly DomainServiceSelection[] | undefined,
  durationMinutes: number,
): { items: DomainServiceLine[]; totalAmount: number } {
  if (!selections || selections.length === 0) {
    return { items: [], totalAmount: 0 };
  }

  const seen = new Set<string>();
  const items: DomainServiceLine[] = [];

  for (const selection of selections) {
    if (
      !selection ||
      typeof selection.productId !== 'string' ||
      !Number.isSafeInteger(selection.quantity) ||
      selection.quantity <= 0 ||
      selection.quantity > 99
    ) {
      throw new CourtPricingError(
        'INVALID_SERVICE_SELECTION',
        'Số lượng dịch vụ đã chọn không hợp lệ.',
      );
    }

    if (seen.has(selection.productId)) {
      throw new CourtPricingError(
        'DUPLICATE_SERVICE_SELECTION',
        'Dịch vụ được chọn bị trùng lặp.',
      );
    }
    seen.add(selection.productId);

    const product = COURT_SERVICE_PRODUCTS.find(
      (candidate) => candidate.id === selection.productId,
    );
    if (!product) {
      throw new CourtPricingError(
        'SERVICE_NOT_FOUND',
        'Dịch vụ đã chọn không tồn tại.',
      );
    }

    if (selection.quantity > product.availableQuantity) {
      throw new CourtPricingError(
        'SERVICE_OUT_OF_STOCK',
        `Dịch vụ "${product.name}" vượt quá số lượng khả dụng.`,
      );
    }

    const lineDuration =
      product.billingMode === 'HOURLY_RENTAL' ? durationMinutes : 0;
    const unitAmount =
      product.billingMode === 'HOURLY_RENTAL'
        ? calculateLineAmount(product.unitPrice, durationMinutes)
        : product.unitPrice;
    const amount = unitAmount * selection.quantity;

    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new CourtPricingError(
        'INVALID_TOTAL_AMOUNT',
        'Tổng tiền dịch vụ không hợp lệ.',
      );
    }

    items.push({
      productId: product.id,
      code: product.code,
      name: product.name,
      kind: product.kind,
      billingMode: product.billingMode,
      unit: product.unit,
      unitPrice: product.unitPrice,
      quantity: selection.quantity,
      durationMinutes: lineDuration,
      amount,
    });
  }

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  return { items, totalAmount };
}
