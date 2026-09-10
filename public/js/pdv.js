const pdvProductsById = {};
(window.__PDV_PRODUCTS || []).forEach(function (p) {
  pdvProductsById[p.id] = p;
});

let pdvCart = [];

function pdvFormatMoney(n) {
  return 'R$ ' + Number(n).toFixed(2).replace('.', ',');
}

function pdvAddToCart(id) {
  const product = pdvProductsById[id];
  if (!product) return;

  let entry = pdvCart.find((i) => i.id === id);
  const currentQty = entry ? entry.quantity : 0;
  if (currentQty + 1 > Number(product.quantity)) {
    pdvShowMessage(`Estoque insuficiente para "${product.name}" (disponível: ${product.quantity}).`, 'error');
    return;
  }

  if (entry) {
    entry.quantity += 1;
  } else {
    pdvCart.push({ id, quantity: 1 });
  }
  pdvRenderCart();
}

function pdvChangeQty(id, delta) {
  const entry = pdvCart.find((i) => i.id === id);
  if (!entry) return;
  const product = pdvProductsById[id];
  const newQty = entry.quantity + delta;
  if (newQty <= 0) {
    pdvCart = pdvCart.filter((i) => i.id !== id);
  } else if (product && newQty > Number(product.quantity)) {
    pdvShowMessage(`Estoque insuficiente para "${product.name}" (disponível: ${product.quantity}).`, 'error');
    return;
  } else {
    entry.quantity = newQty;
  }
  pdvRenderCart();
}

function pdvRemoveFromCart(id) {
  pdvCart = pdvCart.filter((i) => i.id !== id);
  pdvRenderCart();
}

function pdvCalcTotals() {
  const subtotal = pdvCart.reduce((sum, item) => {
    const product = pdvProductsById[item.id];
    return sum + (product ? Number(product.price) * item.quantity : 0);
  }, 0);

  const discountType = document.getElementById('pdv-discount-type').value;
  const discountValueRaw = Number(document.getElementById('pdv-discount-value').value) || 0;
  let discountAmount = discountType === 'percentual' ? subtotal * (discountValueRaw / 100) : discountValueRaw;
  if (discountAmount < 0) discountAmount = 0;
  if (discountAmount > subtotal) discountAmount = subtotal;

  const total = subtotal - discountAmount;
  return { subtotal, discountAmount, total };
}

function pdvRenderCart() {
  const container = document.getElementById('pdv-cart-items');
  container.innerHTML = '';

  if (!pdvCart.length) {
    container.innerHTML = '<div class="hint" id="pdv-cart-empty">Nenhum item adicionado ainda.</div>';
  } else {
    pdvCart.forEach((item) => {
      const product = pdvProductsById[item.id];
      if (!product) return;
      const row = document.createElement('div');
      row.className = 'pdv-cart-item';
      row.innerHTML = `
        <div class="pdv-cart-item-name">${product.name}</div>
        <div class="pdv-cart-item-qty">
          <button type="button" onclick="pdvChangeQty('${item.id}', -1)">−</button>
          <span>${item.quantity}</span>
          <button type="button" onclick="pdvChangeQty('${item.id}', 1)">+</button>
        </div>
        <div class="pdv-cart-item-total">${pdvFormatMoney(Number(product.price) * item.quantity)}</div>
        <button type="button" class="pdv-cart-item-remove" onclick="pdvRemoveFromCart('${item.id}')">×</button>
      `;
      container.appendChild(row);
    });
  }

  const { subtotal, total } = pdvCalcTotals();
  document.getElementById('pdv-subtotal').textContent = pdvFormatMoney(subtotal);
  document.getElementById('pdv-total').textContent = pdvFormatMoney(total);
}

function pdvShowMessage(text, type) {
  const el = document.getElementById('pdv-msg');
  el.innerHTML = `<div class="${type === 'error' ? 'error-box' : 'success-box'}">${text}</div>`;
  if (type !== 'error') {
    setTimeout(() => { el.innerHTML = ''; }, 4000);
  }
}

async function pdvConfirmarVenda() {
  if (!pdvCart.length) {
    pdvShowMessage('Adicione ao menos um produto antes de confirmar.', 'error');
    return;
  }

  const btn = document.getElementById('pdv-confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Confirmando...';

  const payload = {
    items: pdvCart.map((i) => ({ productId: i.id, quantity: i.quantity })),
    discountType: document.getElementById('pdv-discount-type').value,
    discountValue: Number(document.getElementById('pdv-discount-value').value) || 0,
    paymentMethod: document.getElementById('pdv-payment-method').value,
    customerName: document.getElementById('pdv-customer-name').value,
    note: document.getElementById('pdv-note').value,
  };

  try {
    const res = await fetch('/pdv/api/venda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Não foi possível registrar a venda.');

    pdvShowMessage(`Venda registrada! Total: ${pdvFormatMoney(data.total)}`, 'success');
    pdvCart = [];
    document.getElementById('pdv-discount-value').value = 0;
    document.getElementById('pdv-customer-name').value = '';
    document.getElementById('pdv-note').value = '';
    pdvRenderCart();
    setTimeout(() => window.location.reload(), 1500);
  } catch (err) {
    pdvShowMessage(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar venda';
  }
}

document.getElementById('pdv-discount-type').addEventListener('change', pdvRenderCart);
document.getElementById('pdv-discount-value').addEventListener('input', pdvRenderCart);

document.getElementById('pdv-search').addEventListener('input', function (e) {
  const term = e.target.value.trim().toLowerCase();
  document.querySelectorAll('.pdv-product').forEach((el) => {
    const matches = !term || el.dataset.search.includes(term);
    el.hidden = !matches;
  });
});

pdvRenderCart();
