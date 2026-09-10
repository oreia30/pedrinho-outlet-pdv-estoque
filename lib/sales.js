const { SCHEMA } = require('./migrate');

// Devolve ao estoque as quantidades de um pedido e remove o lançamento de
// caixa ligado a ele. Usado tanto para cancelar quanto para editar uma venda
// (edição = devolve o efeito antigo e aplica o novo, dentro da mesma transação).
// `client` já deve estar dentro de uma transação (BEGIN) aberta pelo chamador.
async function reverseOrderStockAndCash(client, order) {
  const items = Array.isArray(order.items) ? order.items : [];
  for (const item of items) {
    if (!item.product_id) continue;
    await client.query(`UPDATE ${SCHEMA}.products SET quantity = quantity + $1 WHERE id = $2`, [
      item.quantity,
      item.product_id,
    ]);
  }
  await client.query(`DELETE FROM ${SCHEMA}.cash_transactions WHERE ref_type = 'order' AND ref_id = $1`, [order.id]);
}

// Valida estoque disponível, debita a quantidade de cada produto e calcula
// subtotal/desconto/total. Lança erro (e a transação do chamador deve dar
// ROLLBACK) se algum item não tiver estoque suficiente.
// items: [{ productId, quantity }]
// discountInput: { type: 'valor'|'percentual', value } ou null/undefined
async function computeAndApplyItems(client, items, discountInput) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Adicione ao menos um produto à venda.');
  }

  let subtotalCents = 0;
  const orderItems = [];

  for (const cartItem of items) {
    const { rows } = await client.query(
      `SELECT id, name, price, quantity FROM ${SCHEMA}.products WHERE id = $1 FOR UPDATE`,
      [cartItem.productId]
    );
    const product = rows[0];
    if (!product) {
      throw new Error('Produto não encontrado (pode ter sido removido do catálogo).');
    }
    const qty = Number(cartItem.quantity) || 0;
    if (qty <= 0) {
      throw new Error(`Quantidade inválida para "${product.name}".`);
    }
    if (Number(product.quantity) < qty) {
      throw new Error(`Estoque insuficiente para "${product.name}" (disponível: ${product.quantity}).`);
    }

    const unitPriceCents = Math.round(Number(product.price) * 100);
    subtotalCents += unitPriceCents * qty;
    orderItems.push({
      product_id: product.id,
      name: product.name,
      quantity: qty,
      unit_price: unitPriceCents / 100,
    });

    await client.query(`UPDATE ${SCHEMA}.products SET quantity = quantity - $1 WHERE id = $2`, [qty, product.id]);
  }

  const subtotal = subtotalCents / 100;

  let discountAmount = 0;
  if (discountInput && discountInput.value) {
    const val = Number(discountInput.value) || 0;
    discountAmount = discountInput.type === 'percentual' ? subtotal * (val / 100) : val;
  }
  if (!(discountAmount > 0)) discountAmount = 0;
  if (discountAmount > subtotal) discountAmount = subtotal;
  discountAmount = Math.round(discountAmount * 100) / 100;

  const total = Math.round((subtotal - discountAmount) * 100) / 100;

  return { orderItems, subtotal, discountAmount, total };
}

module.exports = { reverseOrderStockAndCash, computeAndApplyItems };
