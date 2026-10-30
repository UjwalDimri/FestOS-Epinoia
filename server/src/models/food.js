import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const vendorSchema = new Schema({
  vendorId: { type: String, required: true, unique: true },
  name: String,
  menu: String,
  dietaryTags: [String],
  certExpiry: Date,
  hours: { open: String, close: String },
  capacity: Number,
  paymentTermsRaw: String,
  paymentTerms: [String],
  ratePerMealINR: { type: Number, default: null },
  contractedMeals: { type: Number, default: null },
  minimumGuaranteeMeals: { type: Number, default: null },
  advancePaidINR: { type: Number, default: 0 },
  complianceOverride: { until: Date, reason: String, by: String },
});

const vendorIncidentSchema = new Schema({
  vendorId: String,
  start: Date,
  end: Date,
  reason: String,
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
