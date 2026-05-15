const model = require('../models/product.model');

const VALID_UNITS = ['piece', 'pack', 'bottle', 'can', 'sachet', 'box', 'kg', 'liter'];

const validate = (body) => {
  const { name, category, price, cost, stock, unit } = body;

  if (!name || typeof name !== 'string' || name.trim() === '')
    return 'Name is required';
  if (name.length > 100)
    return 'Name must be 100 characters or fewer';
  if (!category || typeof category !== 'string' || category.trim() === '')
    return 'Category is required';
  if (price === undefined || typeof price !== 'number' || price <= 0)
    return 'Price must be a number greater than 0';
  if (cost === undefined || typeof cost !== 'number' || cost < 0)
    return 'Cost must be a number of 0 or more';
  if (stock === undefined || !Number.isInteger(stock) || stock < 0)
    return 'Stock must be a whole number of 0 or more';
  if (!unit || !VALID_UNITS.includes(unit))
    return `Unit must be one of: ${VALID_UNITS.join(', ')}`;

  return null;
};

const getAll = async (req, res, next) => {
  try {
    const { search } = req.query;
    const category = req.query.category === 'All' ? undefined : req.query.category;
    const data = await model.getAll({ search, category });
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getOne = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    const product = await model.getById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.status(200).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const error = validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const { name, category, price, cost, stock, unit } = req.body;
    const product = await model.create({ name: name.trim(), category: category.trim(), price, cost, stock, unit });

    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    if (!await model.getById(id)) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const error = validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const { name, category, price, cost, stock, unit } = req.body;
    const product = await model.update(id, { name: name.trim(), category: category.trim(), price, cost, stock, unit });

    res.status(200).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    const deleted = await model.remove(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getOne, create, update, remove };
