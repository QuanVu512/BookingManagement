/* Standalone DOM interactions. Pricing and selection functions are injected from lib/court-booking.ts. */
let selection = createBookingSelection(getLocalDate());
const select = (selector) => document.querySelector(selector);
const moneyRow = (label, value) =>
  `<div class="cb-order-row"><span>${label}</span><b>${formatMoney(value)}</b></div>`;

function updateSlotButtons() {
  document.querySelectorAll('[data-slot-id]').forEach((button) => {
    const isSelected = selection.slotIds.includes(button.dataset.slotId);
    button.classList.toggle('cb-slot-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
    const slot = config.slots.find((item) => item.id === button.dataset.slotId);
    button.querySelector('small').textContent = slot.isBooked
      ? 'Không khả dụng'
      : isSelected
        ? 'Đã chọn'
        : slot.isPrime
          ? 'Giờ vàng'
          : '1 giờ thi đấu';
  });
}

function updateQuantities() {
  config.products.forEach((product) => {
    const quantity = selection.quantities[product.id] ?? 0;
    select(`[data-product-quantity="${product.id}"]`).textContent = quantity;
    select(`[data-product-minus="${product.id}"]`).disabled = quantity === 0;
    select(`[data-product-plus="${product.id}"]`).disabled =
      quantity >= config.maximumQuantity;
  });
}

function updateSummaryLines(order) {
  select('[data-summary-date]').textContent = formatBookingDate(selection.date);
  select('[data-summary-slots]').innerHTML = order.slots.length
    ? order.slots
        .map((slot) =>
          moneyRow(`${slot.start} – ${slot.end}`, getSlotPrice(court, slot)),
        )
        .join('')
    : '<p>Chưa chọn khung giờ</p>';
  select('[data-summary-addons]').innerHTML = order.lines.length
    ? order.lines
        .map(
          (line) =>
            `<div class="cb-order-line"><span class="cb-order-qty">${line.quantity}x</span><span>${line.product.name}</span><b>${formatMoney(line.total)}</b></div>`,
        )
        .join('')
    : '<p class="cb-empty">Chưa thêm đồ đi kèm.</p>';
}

function updateOrderTotals(order) {
  for (const [selector, value] of [
    ['data-court-total', order.courtTotal],
    ['data-addon-total', order.addonTotal],
    ['data-order-total', order.total],
  ])
    select(`[${selector}]`).textContent = formatMoney(value);
  select('[data-discount]').textContent = `−${formatMoney(order.discount)}`;
  select('[data-cart-count]').textContent = order.itemCount;
  select('.cb-cart').setAttribute(
    'aria-label',
    `Đơn hàng: ${order.itemCount} mục`,
  );
}

function updateOrderMessages(order) {
  select('[data-checkout]').disabled = order.slots.length === 0;
  select('[data-checkout-message]').textContent = selection.checkoutMessage;
  select('[data-voucher-message]').textContent = selection.voucherMessage;
  select('[data-voucher-message]').className = selection.appliedVoucher
    ? 'cb-message-success'
    : 'cb-message-error';
}

function updateBlueprint() {
  const order = calculateBookingOrder(court, selection);
  updateSlotButtons();
  updateQuantities();
  updateSummaryLines(order);
  updateOrderTotals(order);
  updateOrderMessages(order);
}

document.querySelectorAll('[data-slot-id]').forEach((button) =>
  button.addEventListener('click', () => {
    selection = toggleBookingSlot(selection, button.dataset.slotId);
    updateBlueprint();
  }),
);
document
  .querySelectorAll('[data-product-plus],[data-product-minus]')
  .forEach((button) =>
    button.addEventListener('click', () => {
      const productId =
        button.dataset.productPlus ?? button.dataset.productMinus;
      selection = changeAddonQuantity(
        selection,
        productId,
        button.dataset.productPlus ? 1 : -1,
      );
      updateBlueprint();
    }),
  );
select('[data-booking-date]').addEventListener('change', (event) => {
  if (event.target.value)
    selection = {
      ...selection,
      date: event.target.value,
      slotIds: [],
      checkoutMessage: '',
    };
  else event.target.value = selection.date;
  updateBlueprint();
});
select('[data-voucher-input]').addEventListener('input', (event) => {
  selection = {
    ...selection,
    voucherInput: event.target.value,
    appliedVoucher: '',
    voucherMessage: '',
    checkoutMessage: '',
  };
  updateBlueprint();
});
select('[data-voucher-form]').addEventListener('submit', (event) => {
  event.preventDefault();
  selection = applyBookingVoucher(selection);
  updateBlueprint();
});
select('[data-checkout]').addEventListener('click', () => {
  selection = {
    ...selection,
    checkoutMessage: getCheckoutMessage(
      calculateBookingOrder(court, selection),
    ),
  };
  updateBlueprint();
});

const galleryPhotos = [
  select('[data-gallery-main]'),
  ...document.querySelectorAll('[data-gallery-index] img'),
].map((image) => ({ src: image.src, alt: image.alt }));
let galleryIndex = 0;
function showGallery(index) {
  galleryIndex = (index + galleryPhotos.length) % galleryPhotos.length;
  const image = select('[data-gallery-main]');
  image.src = galleryPhotos[galleryIndex].src;
  image.alt = galleryPhotos[galleryIndex].alt;
  select('[data-gallery-caption]').textContent =
    config.gallery[galleryIndex].caption;
  document
    .querySelectorAll('[data-gallery-index]')
    .forEach((button) =>
      button.setAttribute(
        'aria-pressed',
        String(Number(button.dataset.galleryIndex) === galleryIndex),
      ),
    );
}
select('[data-gallery-prev]').addEventListener('click', () =>
  showGallery(galleryIndex - 1),
);
select('[data-gallery-next]').addEventListener('click', () =>
  showGallery(galleryIndex + 1),
);
document
  .querySelectorAll('[data-gallery-index]')
  .forEach((button) =>
    button.addEventListener('click', () =>
      showGallery(Number(button.dataset.galleryIndex)),
    ),
  );
document.querySelectorAll('a[href="/"],a[href^="/#"]').forEach((anchor) => {
  anchor.href = '#booking-slots';
});
updateBlueprint();
