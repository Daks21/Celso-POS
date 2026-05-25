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
      bodyWhenEmpty: 'All your products will appear here once you add them. The rows below show what they\'ll look like.',
      position: 'top',
      preview: {
        selector: 'tbody',
        when:     'empty',
        html:
          '<tr class="onb-preview-row"><td>Pandesal</td><td>Bakery</td><td>₱8.00</td><td>₱5.00</td><td></td></tr>' +
          '<tr class="onb-preview-row"><td>Coca-Cola 1.5L</td><td>Beverages</td><td>₱85.00</td><td>₱72.00</td><td></td></tr>' +
          '<tr class="onb-preview-row"><td>Lucky Me Pancit Canton</td><td>Noodles</td><td>₱18.00</td><td>₱14.50</td><td></td></tr>',
      },
    },
  ],

  inventory: [
    {
      target:   '#inventory-summary',
      title:    'Your Stock at a Glance',
      body:     'These four cards show total products, items in stock, low-stock items, and out-of-stock items.',
      bodyWhenEmpty: 'These four cards will track your stock — total items, products, low stock, and out of stock. The example numbers below show how they\'ll look.',
      position: 'bottom',
      preview: [
        { selector: '.summary-card:nth-child(1) .summary-value', when: 'empty', html: '<span class="onb-preview">142</span>' },
        { selector: '.summary-card:nth-child(2) .summary-value', when: 'empty', html: '<span class="onb-preview">24</span>'  },
        { selector: '.summary-card:nth-child(3) .summary-value', when: 'empty', html: '<span class="onb-preview">3</span>'   },
        { selector: '.summary-card:nth-child(4) .summary-value', when: 'empty', html: '<span class="onb-preview">1</span>'   },
      ],
    },
    {
      target:   '#inventory-table',
      title:    'Your Stock Levels',
      body:     'This shows how much stock you have for each product.',
      bodyWhenEmpty: 'Once you add products, your stock counts will appear here. The example rows below show how they\'ll look.',
      position: 'top',
      preview: {
        selector: 'tbody',
        when:     'empty',
        html:
          '<tr class="onb-preview-row">' +
            '<td>Pandesal</td><td>Bakery</td><td>42</td>' +
            '<td><span class="stock-dot" style="background:var(--stock-color-ok);"></span></td><td></td>' +
          '</tr>' +
          '<tr class="onb-preview-row">' +
            '<td>Coca-Cola 1.5L</td><td>Beverages</td><td>6</td>' +
            '<td><span class="stock-dot" style="background:var(--stock-color-low);"></span></td><td></td>' +
          '</tr>' +
          '<tr class="onb-preview-row">' +
            '<td>Lucky Me Pancit Canton</td><td>Noodles</td><td>0</td>' +
            '<td><span class="stock-dot" style="background:var(--stock-color-out);"></span></td><td></td>' +
          '</tr>',
      },
    },
    {
      // .action-btn — querySelector returns the first restock button in the table.
      // For new users (no products yet), the tour engine auto-skips this step.
      target:   '.action-btn',
      title:    'Restock a Product',
      body:     'Tap Restock to add stock to a product. Always do this before selling.',
      position: 'left',
    },
    {
      // .stock-dot — querySelector returns the first status indicator in the table.
      // Auto-skipped for new users (no rows = no dots).
      target:   '.stock-dot',
      title:    'Stock Status Colors',
      body:     'Green means enough stock. Yellow means running low. Red means out of stock. You can change these colors in Account Settings.',
      position: 'right',
    },
  ],

  order: [
    {
      target:   '#pos-product-grid',
      title:    'Pick What to Sell',
      body:     'Tap any product here to add it to the cart.',
      bodyWhenEmpty: 'Once you add products, they\'ll appear here as tiles you can tap to add to a cart.',
      position: 'right',
    },
    {
      // data-onb-id added to <aside class="pos-cart"> in order.html.
      // On mobile the cart panel fills ~70% of viewport, so spotlight just
      // the items list instead — leaves room for the tooltip to anchor.
      target:       '[data-onb-id="cart-panel"]',
      mobileTarget: '#cart-items',
      title:        'Your Cart',
      body:         'Items you select appear here. You can adjust quantities before checkout.',
      bodyWhenEmpty: 'Items you tap will appear here. The example below shows what a cart looks like before checkout.',
      position:     'left',
      preview: {
        selector: '#cart-items',
        when:     'empty',
        html:
          '<div class="onb-preview" style="padding:8px 12px;">' +
            '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--color-border);">' +
              '<span>Pandesal &times; 5</span><span>₱40.00</span>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--color-border);">' +
              '<span>Coca-Cola 1.5L &times; 1</span><span>₱85.00</span>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;padding:8px 0;">' +
              '<span>Pancit Canton &times; 2</span><span>₱36.00</span>' +
            '</div>' +
          '</div>',
      },
    },
    {
      target:   '#payment-amount',
      title:    'Enter Payment & See Change',
      body:     "Type the customer's payment here — the change shows instantly below.",
      position: 'top',
    },
    {
      target:   '#complete-sale-button',
      title:    'Complete the Sale',
      body:     'When the cart is ready, tap Checkout to record the sale and print a receipt.',
      position: 'top',
    },
  ],

  finance: [
    {
      target:   '.summary-card--balance',
      title:    'Your Net Balance',
      body:     'This is your all-time money — capital you put in, sales, and withdrawals combined.',
      bodyWhenEmpty: 'This is your all-time money — capital, sales, and withdrawals combined. The example below shows what it will look like once you start logging entries.',
      position: 'bottom',
      preview: {
        selector: '.summary-value',
        when:     'empty',
        html:     '<span class="onb-preview">₱12,450.00</span>',
      },
    },
    {
      // Position 'bottom' (not 'left') — the chart card is the rightmost
      // summary card, so anchoring left would push the tooltip across the
      // other cards on desktop. Bottom keeps it out of the way.
      target:   '#cashflow-chart-card',
      title:    'Cash Flow Over Time',
      body:     'See how your money moves day-by-day, week-by-week, or by month — it adapts automatically.',
      bodyWhenEmpty: 'See how your money moves over time. The example sparkline below shows what your trend will look like.',
      position: 'bottom',
      preview: {
        selector: '#cashflow-chart-body',
        when:     'empty',
        html:
          '<svg viewBox="0 0 1000 100" preserveAspectRatio="none"' +
              ' style="width:100%;height:100%;display:block;" class="onb-preview">' +
            '<defs><linearGradient id="onb-prev-grad" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.35"/>' +
              '<stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0"/>' +
            '</linearGradient></defs>' +
            '<path d="M0,80 L150,72 L300,58 L450,62 L600,40 L750,32 L900,22 L1000,18 L1000,100 L0,100 Z"' +
                ' fill="url(#onb-prev-grad)"/>' +
            '<polyline points="0,80 150,72 300,58 450,62 600,40 750,32 900,22 1000,18"' +
                ' fill="none" stroke="var(--color-primary)" stroke-width="3"' +
                ' stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg>',
      },
    },
    {
      // Hidden for non-admin users; the tour engine now auto-skips this
      // step when the button is display:none.
      target:   '#add-entry-button',
      title:    'Log Capital or Withdrawals',
      body:     'Tap here to log money you put in (capital) or take out (withdrawal, debt payment).',
      position: 'bottom',
    },
    {
      target:   '#finance-table',
      title:    'Sales Appear Automatically',
      body:     'Sales and restock costs show up here on their own. You only need to manually log capital and withdrawals.',
      bodyWhenEmpty: 'Sales and restock costs will show up here automatically. The rows below are examples of what your entries will look like.',
      position: 'top',
      preview: {
        selector: 'tbody',
        when:     'empty',
        html:
          '<tr class="onb-preview-row"><td>Today</td><td>Daily Sale</td><td>+₱2,400.00</td><td>&mdash;</td><td></td></tr>' +
          '<tr class="onb-preview-row"><td>Today</td><td>Capital In</td><td>+₱5,000.00</td><td>Starting fund</td><td></td></tr>' +
          '<tr class="onb-preview-row"><td>Yesterday</td><td>Withdrawal</td><td>-₱1,000.00</td><td>Owner draw</td><td></td></tr>',
      },
    },
  ],

  dashboard: [
    {
      target:   '.summary-cards',
      title:    'Your Store at a Glance',
      body:     "These numbers show today's revenue, total orders, and products that need restocking.",
      bodyWhenEmpty: "These cards will show today's revenue, your products, stock alerts, and transactions. The example numbers below show how they'll look once you start selling.",
      position: 'bottom',
      preview: [
        { selector: '#total-sales-today', when: 'empty', html: '<span class="onb-preview">₱5,400.00</span>' },
        { selector: '#total-products',    when: 'empty', html: '<span class="onb-preview">24</span>'       },
        { selector: '#low-stock-items',   when: 'empty', html: '<span class="onb-preview">3</span>'        },
        { selector: '#transactions-today', when: 'empty', html: '<span class="onb-preview">12</span>'      },
      ],
    },
    {
      target:   '#stock-alert-section',
      title:    'Low Stock Alerts',
      body:     'Products running low appear here so you can restock before you run out.',
      bodyWhenEmpty: 'Products running low will appear here so you can restock before you run out. Example rows shown below.',
      position: 'top',
      preview: {
        selector: '#stock-alert-list',
        when:     'empty',
        html:
          '<tr class="onb-preview-row"><td>Coca-Cola 1.5L</td><td>6</td><td>Running low</td></tr>' +
          '<tr class="onb-preview-row"><td>Lucky Me Pancit Canton</td><td>2</td><td>Almost out</td></tr>' +
          '<tr class="onb-preview-row"><td>Marlboro Red</td><td>0</td><td>Out of stock</td></tr>',
      },
    },
  ],

};
