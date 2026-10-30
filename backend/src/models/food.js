import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const menuItemSchema = new Schema({
  name: { type: String, required: true, trim: true },
  dietaryTags: { type: [String], default: [] },
  allergens: { type: [String], default: [] },
  notes: { type: String, default: '' },
}, { _id: false });

const vendorSchema = new Schema({
  vendorId: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  menu: { type: String, required: true, trim: true },
  menuItems: { type: [menuItemSchema], default: [] },
  dietaryTags: [String],
  active: { type: Boolean, default: true, index: true },
  certificateNumber: { type: String, default: '' },
  certExpiry: Date,
  hours: { open: String, close: String },
  capacity: { type: Number, min: 0 },
  paymentTermsRaw: String,
  paymentTerms: [String],
  ratePerMealINR: { type: Number, default: null },
  contractedMeals: { type: Number, default: null },
  minimumGuaranteeMeals: { type: Number, default: null },
  advancePaidINR: { type: Number, default: 0 },
  contractAmountINR: { type: Number, default: null, min: 0 },
  amountPaidINR: { type: Number, default: 0, min: 0 },
  settlementStatus: { type: String, enum: ['pending', 'advance_paid', 'partially_paid', 'settled', 'on_hold'], default: 'pending', index: true },
  settlementNotes: { type: String, default: '' },
  settledAt: Date,
  settlementUpdatedBy: String,
  complianceOverride: { until: Date, reason: String, by: String },
}, { timestamps: true });

const vendorIncidentSchema = new Schema({
  vendorId: { type: String, required: true, index: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  reason: { type: String, required: true },
  disruptionId: String,
  createdBy: String,
}, { timestamps: true });

const mealLogSchema = new Schema({
  vendorId: String,
  date: String,
  meal: { type: String, enum: ['breakfast', 'lunch', 'dinner'] },
  served: Number,
  loggedBy: String,
}, { timestamps: true });
mealLogSchema.index({ vendorId: 1, date: 1, meal: 1 }, { unique: true });

export const Vendor = model('Vendor', vendorSchema);
export const VendorIncident = model('VendorIncident', vendorIncidentSchema);
export const MealLog = model('MealLog', mealLogSchema);
