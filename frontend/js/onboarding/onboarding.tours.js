const OnboardingTours = {

  products: [
    {
      target:   '#add-product-button',
      title:    'Add Your Products',
      body:     'Tap here to add the items you sell in your store.',
      position: 'bottom',
    },
    {
      target:   '#product-search',
      title:    'Find Products Fast',
      body:     'Search by name or filter by category here.',
      position: 'bottom',
    },
    {
      target:   '#products-table',
      title:    'Your Product List',
      body:     'All your products appear here. You can edit or delete them anytime.',
      position: 'top',
    },
  ],

  inventory: [
    {
      target:   '#inventory-table',
      title:    'Your Stock Levels',
      body:     'This shows how much stock you have for each product.',
      position: 'top',
    },
    {
      // .action-btn — querySelector returns the first restock button in the table.
      // Skipped gracefully by the engine if no products exist yet.
      target:   '.action-btn',
      title:    'Restock a Product',
      body:     'Tap Restock to add stock to a product. Always do this before selling.',
      position: 'left',
    },
    {
      // .stock-dot — querySelector returns the first status indicator in the table.
      target:   '.stock-dot',
      title:    'Stock Status Colors',
      body:     'Green means enough stock. Yellow means running low. Red means out of stock.',
      position: 'right',
    },
  ],

  order: [
    {
      target:   '#pos-product-grid',
      title:    'Pick What to Sell',
      body:     'Tap any product here to add it to the cart.',
      position: 'right',
    },
    {
      // data-onb-id added to <aside class="pos-cart"> in order.html
      target:   '[data-onb-id="cart-panel"]',
      title:    'Your Cart',
      body:     'Items you select appear here. You can adjust quantities before checkout.',
      position: 'left',
    },
    {
      target:   '#complete-sale-button',
      title:    'Complete the Sale',
      body:     'When the cart is ready, tap Checkout to record the sale and print a receipt.',
      position: 'top',
    },
  ],

  dashboard: [
    {
      target:   '.summary-cards',
      title:    'Your Store at a Glance',
      body:     "These numbers show today's revenue, total orders, and products that need restocking.",
      position: 'bottom',
    },
    {
      target:   '#stock-alert-table',
      title:    'Low Stock Alerts',
      body:     'Products running low appear here so you can restock before you run out.',
      position: 'top',
    },
  ],

};
