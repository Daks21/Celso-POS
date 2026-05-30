const model = require('../models/product.model');

const VALID_UNITS = ['piece', 'pack', 'bottle', 'can', 'sachet', 'box', 'kg', 'liter'];

const validate = (body) => {
  const { name, category, price, cost, unit } = body;

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

    const { name, category, price, cost, unit, allowDuplicate } = req.body;
    const trimmedName = name.trim();

    // Re-adding a previously archived item? Don't silently spawn a duplicate —
    // it would split this product's sale history across two ids and drop the old
    // history from profit-by-product (which filters is_active = 1). Surface the
    // archived twin so the client can offer Restore (keeps history) vs Add new.
    // `allowDuplicate` is the client's explicit "Add as new instead" override.
    if (!allowDuplicate) {
      const archived = await model.findArchivedByName(trimmedName);
      if (archived) {
        return res.status(409).json({
          success: false,
          archivedMatch: true,
          message: 'You archived a product with this name before.',
          data: archived,
        });
      }
    }

    const product = await model.create({ name: trimmedName, category: category.trim(), price, cost, unit });

    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

const getArchived = async (req, res, next) => {
  try {
    const { search } = req.query;
    const data = await model.getArchived({ search });
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const restore = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    // A bare restore (from the Archived list) sends no body and brings the item
    // back as-is. The re-add "Restore" choice sends the freshly-typed fields, so
    // we validate and apply them — restoring history while refreshing pricing.
    let data = null;
    if (req.body && Object.keys(req.body).length > 0) {
      const error = validate(req.body);
      if (error) {
        return res.status(400).json({ success: false, message: error });
      }
      const { name, category, price, cost, unit } = req.body;
      data = { name: name.trim(), category: category.trim(), price, cost, unit };
    }

    const product = await model.restore(id, data);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Archived product not found' });
    }

    res.status(200).json({ success: true, data: product });
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

    const { name, category, price, cost, unit } = req.body;
    const product = await model.update(id, { name: name.trim(), category: category.trim(), price, cost, unit });

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

module.exports = { getAll, getOne, create, update, remove, getArchived, restore };
