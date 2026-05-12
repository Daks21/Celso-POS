const getAll = (req, res) => {
  const products = [
    { id: 1, name: 'Instant Coffee', price: 8,  category: 'Beverages' },
    { id: 2, name: 'Bottled Water',  price: 15, category: 'Drinks'    },
  ];
  res.status(200).json({ success: true, data: products });
};

module.exports = { getAll };
