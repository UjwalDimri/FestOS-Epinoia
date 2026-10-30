import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const inventoryLineSchema = new Schema({
  itemId: { type: String, unique: true },
  item: String,
  quantity: Number,
  location: String,
  condition: String,
});

const stockBalanceSchema = new Schema({
  item: String,
  location: String,
  state: { type: String, enum: ['available', 'in_transit', 'needs_check', 'damaged', 'issued', 'awaiting_return'] },
  qty: { type: Number, min: 0 },
});
stockBalanceSchema.index({ item: 1, location: 1, state: 1 }, { unique: true });

const stockMovementSchema = new Schema({
  item: String,
  qty: Number,
  from: { location: String, state: String },
  to: { location: String, state: String },
  by: String,
  reason: String,
  disruptionId: String,
  at: { type: Date, default: Date.now },
});

const merchStockSchema = new Schema({
  item: String,
  size: { type: String, default: '-' },
  quantity: Number,
  reserved: Number,
  issued: { type: Number, default: 0 },
});
merchStockSchema.index({ item: 1, size: 1 }, { unique: true });

const merchIssueSchema = new Schema({
  participantId: String,
  item: String,
  size: { type: String, default: '-' },
  kind: { type: String, enum: ['original', 'replacement'], default: 'original' },
  substitutionFrom: { type: String, default: null },
  desk: String,
  issuedBy: String,
  issuedByRole: String,
  reason: String,
  issuedAt: { type: Date, default: Date.now },
});
// The duplicate-claim guard: one original issue per person per item, enforced by the database.
merchIssueSchema.index({ participantId: 1, item: 1 }, { unique: true, partialFilterExpression: { kind: 'original' } });

export const InventoryLine = model('InventoryLine', inventoryLineSchema);
export const StockBalance = model('StockBalance', stockBalanceSchema);
export const StockMovement = model('StockMovement', stockMovementSchema);
export const MerchStock = model('MerchStock', merchStockSchema);
export const MerchIssue = model('MerchIssue', merchIssueSchema);
