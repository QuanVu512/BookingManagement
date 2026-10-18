/** @deprecated Legacy static court-detail mockup. Not part of the live route; use frontend/features/courts instead. */
import Image from 'next/image';
import type { CourtAddon } from '../../types/court-booking';
import { BOOKING_CONFIG, formatMoney } from '../../lib/court-booking';
import { MotionValue } from './motion-value';

function ProductPhoto({ product }: { product: CourtAddon }) {
  return (
    <div className="cb-product-photo">
      <span className="cb-product-badge">{product.badge}</span>
      <Image
        src={product.image}
        alt={product.name}
        fill
        sizes="(max-width: 600px) 45vw, 18vw"
      />
    </div>
  );
}

function QuantityControl({
  product,
  quantity,
  onChange,
}: {
  product: CourtAddon;
  quantity: number;
  onChange: (delta: number) => void;
}) {
  return (
    <div
      className="cb-quantity"
      role="group"
      aria-label={`Số lượng ${product.name}`}
    >
      <button
        type="button"
        data-product-minus={product.id}
        aria-label={`Giảm ${product.name}`}
        disabled={quantity === 0}
        onClick={() => onChange(-1)}
      >
        −
      </button>
      <output data-product-quantity={product.id}>
        <MotionValue value={quantity} />
      </output>
      <button
        type="button"
        data-product-plus={product.id}
        aria-label={`Thêm ${product.name}`}
        disabled={quantity >= BOOKING_CONFIG.maximumQuantity}
        onClick={() => onChange(1)}
      >
        +
      </button>
    </div>
  );
}

function AddonCard({
  product,
  quantity,
  onChange,
}: {
  product: CourtAddon;
  quantity: number;
  onChange: (delta: number) => void;
}) {
  return (
    <article className="cb-product">
      <ProductPhoto product={product} />
      <h3>{product.name}</h3>
      <p>{product.description}</p>
      <div className="cb-product-bottom">
        <div>
          <strong>{formatMoney(product.price)}</strong>
          <small>{product.unit}</small>
        </div>
        <QuantityControl
          product={product}
          quantity={quantity}
          onChange={onChange}
        />
      </div>
    </article>
  );
}

export function CourtAddonsList({
  quantities,
  onQuantityChange,
}: {
  quantities: Record<string, number>;
  onQuantityChange: (id: string, delta: number) => void;
}) {
  return (
    <section
      className="cb-panel"
      id="court-addons"
      aria-labelledby="addons-heading"
    >
      <div className="cb-section-heading">
        <div>
          <h2 id="addons-heading">Thêm năng lượng cho trận đấu</h2>
          <p>Nước uống và dụng cụ được chuẩn bị cùng lịch sân bạn chọn.</p>
        </div>
        <span className="cb-section-tag">DỊCH VỤ ĐI KÈM</span>
      </div>
      <div className="cb-products-grid">
        {BOOKING_CONFIG.products.map((product) => (
          <AddonCard
            key={product.id}
            product={product}
            quantity={quantities[product.id] ?? 0}
            onChange={(delta) => onQuantityChange(product.id, delta)}
          />
        ))}
      </div>
      <p className="cb-demo-note">
        Giá đồ đi kèm là giá demo. Cửa hàng thể thao đầy đủ đang được chuẩn bị.
      </p>
    </section>
  );
}
