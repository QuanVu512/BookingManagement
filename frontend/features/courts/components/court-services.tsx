import Image from 'next/image';
import {
  MAX_SERVICE_QUANTITY,
  type ServiceProduct,
  type ServiceSelection,
} from '../../booking/model/booking';
import { formatVnd } from '../../booking/model/booking-time';

interface CourtServicesProps {
  products: ServiceProduct[];
  selection: ServiceSelection[];
  loading: boolean;
  error: string;
  disabled: boolean;
  onRetry: () => void;
  onChange: (productId: string, quantity: number) => void;
}

interface ServiceCardProps {
  product: ServiceProduct;
  quantity: number;
  disabled: boolean;
  onChange: CourtServicesProps['onChange'];
}

interface QuantityControlProps {
  product: ServiceProduct;
  quantity: number;
  maximum: number;
  disabled: boolean;
  change: (next: number) => void;
}
function QuantityButton({
  direction,
  ...props
}: QuantityControlProps & { direction: -1 | 1 }) {
  const isDecrease = direction === -1;
  return (
    <button
      type="button"
      aria-label={`${isDecrease ? 'Giảm' : 'Tăng'} ${props.product.name}`}
      disabled={
        props.disabled ||
        (isDecrease ? props.quantity <= 0 : props.quantity >= props.maximum)
      }
      onClick={() => props.change(props.quantity + direction)}
    >
      {isDecrease ? '−' : '+'}
    </button>
  );
}
function QuantityInput(props: QuantityControlProps) {
  return (
    <input
      type="number"
      aria-label={`Số lượng ${props.product.name}`}
      inputMode="numeric"
      min="0"
      max={props.maximum}
      step="1"
      value={props.quantity}
      disabled={props.disabled || props.maximum === 0}
      onChange={(event) => props.change(Number(event.target.value))}
    />
  );
}
function ServiceQuantity({
  product,
  quantity,
  disabled,
  onChange,
}: ServiceCardProps) {
  const maximum = Math.min(
    MAX_SERVICE_QUANTITY,
    product.availableQuantity ?? 0,
  );
  const change = (next: number) => {
    if (Number.isInteger(next))
      onChange(product.id, Math.max(0, Math.min(maximum, next)));
  };
  const props = { product, quantity, maximum, disabled, change };
  return (
    <div
      className="service-quantity"
      role="group"
      aria-label={`Số lượng ${product.name}`}
    >
      <QuantityButton {...props} direction={-1} />
      <QuantityInput {...props} />
      <QuantityButton {...props} direction={1} />
    </div>
  );
}
function ProductImage({ product }: { product: ServiceProduct }) {
  return product.imageUrl ? (
    <Image
      src={product.imageUrl}
      width={320}
      height={240}
      sizes="(max-width: 600px) 45vw, 200px"
      alt={product.name}
    />
  ) : null;
}

function ServiceCard(props: ServiceCardProps) {
  const { product } = props;
  const isRental = product.billingMode === 'HOURLY_RENTAL';
  return (
    <article className="court-service-card">
      <ProductImage product={product} />
      <span className="service-billing-mode">
        {isRental ? 'Chỉ cho thuê' : 'Mua'}
      </span>
      <h3>{product.name}</h3>
      <p className="service-product-price">
        {formatVnd(product.unitPrice)} / {product.unit}
        {isRental ? ' / giờ' : ''}
      </p>
      <p className="service-stock">
        {product.availableQuantity
          ? `Còn ${product.availableQuantity} ${product.unit}`
          : 'Hết hàng'}
      </p>
      <ServiceQuantity {...props} />
    </article>
  );
}

function ServiceCatalogStatus({
  loading,
  error,
  products,
  onRetry,
}: CourtServicesProps) {
  if (loading) return <p role="status">Đang tải dịch vụ…</p>;
  if (error)
    return (
      <p role="alert">
        {error}{' '}
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Thử lại dịch vụ
        </button>
      </p>
    );
  return products.length === 0 ? <p>Chưa có dịch vụ đang phục vụ.</p> : null;
}

function ServiceCards(props: CourtServicesProps) {
  return (
    <div className="court-services-grid">
      {props.products.map((product) => (
        <ServiceCard
          key={product.id}
          product={product}
          disabled={props.disabled}
          onChange={props.onChange}
          quantity={
            props.selection.find((item) => item.productId === product.id)
              ?.quantity ?? 0
          }
        />
      ))}
    </div>
  );
}

export function CourtServices(props: CourtServicesProps) {
  return (
    <section
      className="detail-panel"
      id="court-services"
      aria-labelledby="court-services-heading"
    >
      <h2 id="court-services-heading">Nước uống & dụng cụ</h2>
      <p className="detail-muted">
        Chọn số lượng rồi kiểm tra lịch & giá để cập nhật tổng đơn.
      </p>
      <ServiceCatalogStatus {...props} />
      <ServiceCards {...props} />
    </section>
  );
}
