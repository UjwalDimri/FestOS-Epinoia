import { MealLog, Vendor, VendorIncident } from '../models/index.js';
import { runCommand } from './command.js';
import { conflict, badRequest, notFound } from '../utils/errors.js';
import { vendorLabelConflicts } from '../import/normalize.js';
import { foodRun } from './state.js';
import { parseIST } from '../utils/time.js';

const SETTLEMENTS = ['pending', 'advance_paid', 'partially_paid', 'settled', 'on_hold'];
const money = (value, field, { nullable = true } = {}) => {
  if ((value == null || value === '') && nullable) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw badRequest(`${field} must be a non-negative amount`);
  return parsed;
};
function list(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[;,]/);
  return [...new Set(values.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}
function dateOrNull(value, field) {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseIST(`${value} 23:59`) : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw badRequest(`${field} must be a valid date`);
  return parsed;
}
function vendorInput(body, current = {}) {
  const vendorId = String(body.vendorId ?? current.vendorId ?? '').trim();
  const name = String(body.name ?? current.name ?? '').trim();
  const menu = String(body.menu ?? current.menu ?? '').trim();
  if (!vendorId || !name || !menu) throw badRequest('vendorId, name and menu are required');
  const open = String(body.hours?.open ?? current.hours?.open ?? '').trim();
  const close = String(body.hours?.close ?? current.hours?.close ?? '').trim();
  const timeRx = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!timeRx.test(open) || !timeRx.test(close) || open >= close) throw badRequest('hours.open and hours.close must be valid HH:mm times, with close after open');
  const capacity = Number(body.capacity ?? current.capacity);
  if (!Number.isInteger(capacity) || capacity < 0) throw badRequest('capacity must be a non-negative whole number per meal service');
  const certExpiry = dateOrNull(body.certExpiry ?? current.certExpiry, 'certExpiry');
  const ratePerMealINR = money(body.ratePerMealINR ?? current.ratePerMealINR, 'ratePerMealINR');
  const contractedMealsRaw = body.contractedMeals ?? current.contractedMeals;
  const contractedMeals = contractedMealsRaw == null || contractedMealsRaw === '' ? null : Number(contractedMealsRaw);
  if (contractedMeals != null && (!Number.isInteger(contractedMeals) || contractedMeals < 0)) throw badRequest('contractedMeals must be a non-negative whole number');
  const minimumRaw = body.minimumGuaranteeMeals ?? current.minimumGuaranteeMeals;
  const minimumGuaranteeMeals = minimumRaw == null || minimumRaw === '' ? null : Number(minimumRaw);
  if (minimumGuaranteeMeals != null && (!Number.isInteger(minimumGuaranteeMeals) || minimumGuaranteeMeals < 0)) throw badRequest('minimumGuaranteeMeals must be a non-negative whole number');
  const contractAmountINR = money(body.contractAmountINR ?? current.contractAmountINR ?? (ratePerMealINR != null && contractedMeals != null ? ratePerMealINR * contractedMeals : null), 'contractAmountINR');
  const advancePaidINR = money(body.advancePaidINR ?? current.advancePaidINR ?? 0, 'advancePaidINR', { nullable: false });
  const amountPaidINR = money(body.amountPaidINR ?? current.amountPaidINR ?? advancePaidINR, 'amountPaidINR', { nullable: false });
  if (amountPaidINR < advancePaidINR) throw badRequest('amountPaidINR cannot be less than advancePaidINR');
  if (contractAmountINR != null && amountPaidINR > contractAmountINR) throw badRequest('amountPaidINR cannot exceed contractAmountINR');
  let settlementStatus = body.settlementStatus ?? current.settlementStatus;
  if (!settlementStatus || (body.amountPaidINR != null && body.settlementStatus == null)) {
    settlementStatus = contractAmountINR != null && amountPaidINR >= contractAmountINR ? 'settled'
      : amountPaidINR > 0 ? (advancePaidINR > 0 ? 'advance_paid' : 'partially_paid') : 'pending';
  }
  if (!SETTLEMENTS.includes(settlementStatus)) throw badRequest(`settlementStatus must be one of ${SETTLEMENTS.join(', ')}`);
  if (settlementStatus === 'pending' && amountPaidINR > 0) throw badRequest('Choose advance_paid or partially_paid when money has been paid');
  if (settlementStatus === 'advance_paid' && (advancePaidINR <= 0 || (contractAmountINR != null && amountPaidINR >= contractAmountINR))) throw badRequest('advance_paid requires a recorded advance below the full contract amount');
  if (settlementStatus === 'partially_paid' && (contractAmountINR == null || amountPaidINR <= 0 || amountPaidINR >= contractAmountINR)) throw badRequest('partially_paid requires a contract amount and a paid amount below the total');
  if (settlementStatus === 'settled' && (contractAmountINR == null || amountPaidINR < contractAmountINR)) throw badRequest('A vendor can be marked settled only after the contract amount is fully paid');
  const menuItems = body.menuItems ?? current.menuItems ?? [];
  if (!Array.isArray(menuItems)) throw badRequest('menuItems must be an array');
  const cleanMenuItems = menuItems.map((item) => {
    const itemName = String(item.name || '').trim();
    if (!itemName) throw badRequest('Every menu item needs a name');
    return { name: itemName, dietaryTags: list(item.dietaryTags), allergens: list(item.allergens), notes: String(item.notes || '').trim() };
  });
  if (body.active != null && typeof body.active !== 'boolean') throw badRequest('active must be true or false');
  return {
    vendorId, name, menu, menuItems: cleanMenuItems,
    dietaryTags: list(body.dietaryTags ?? current.dietaryTags), active: body.active ?? current.active ?? true,
    certificateNumber: String(body.certificateNumber ?? current.certificateNumber ?? '').trim(), certExpiry,
    hours: { open, close }, capacity, paymentTermsRaw: String(body.paymentTermsRaw ?? current.paymentTermsRaw ?? '').trim(),
    paymentTerms: list(body.paymentTerms ?? current.paymentTerms), ratePerMealINR, contractedMeals, minimumGuaranteeMeals,
    advancePaidINR, contractAmountINR, amountPaidINR, settlementStatus,
    settlementNotes: String(body.settlementNotes ?? current.settlementNotes ?? '').trim(),
    settledAt: settlementStatus === 'settled' ? (current.settledAt || new Date()) : null,
  };
}

export function vendorView(vendor, role) {
  const row = vendor?.toObject ? vendor.toObject() : { ...vendor };
  if (!['festival_director', 'food_coordinator'].includes(role)) {
    delete row.ratePerMealINR; delete row.contractedMeals; delete row.minimumGuaranteeMeals; delete row.advancePaidINR;
    delete row.contractAmountINR; delete row.amountPaidINR; delete row.settlementStatus; delete row.settlementNotes;
    delete row.settledAt; delete row.settlementUpdatedBy;
  } else if (row.contractAmountINR != null) row.amountDueINR = Math.max(0, row.contractAmountINR - (row.amountPaidINR || 0));
  return row;
}

export async function createVendor({ user, body }) {
  const data = vendorInput(body);
  if (await Vendor.exists({ vendorId: data.vendorId })) throw conflict(`Vendor ${data.vendorId} already exists`);
  data.settlementUpdatedBy = user.email;
  return runCommand({ user, action: 'VENDOR_CREATED', entity: { type: 'Vendor', id: data.vendorId }, event: 'vendor.created' }, async (session) => {
    const [vendor] = await Vendor.create([data], session ? { session } : {});
    return { summary: { vendorId: data.vendorId, name: data.name }, result: vendorView(vendor, user.role) };
  });
}

export async function updateVendor({ user, vendorId, body }) {
  const current = await Vendor.findOne({ vendorId }).lean();
  if (!current) throw notFound(`No vendor ${vendorId}`);
  if (body.vendorId && body.vendorId !== vendorId) throw badRequest('vendorId cannot be changed');
  const data = vendorInput({ ...body, vendorId }, current);
  const financeChanged = ['ratePerMealINR', 'contractedMeals', 'minimumGuaranteeMeals', 'advancePaidINR', 'contractAmountINR', 'amountPaidINR', 'settlementStatus', 'settlementNotes'].some((field) => body[field] !== undefined);
  if (financeChanged) data.settlementUpdatedBy = user.email;
  return runCommand({ user, action: 'VENDOR_UPDATED', entity: { type: 'Vendor', id: vendorId }, reason: body.reason, risk: financeChanged ? 'medium' : 'low', event: 'vendor.updated' }, async (session) => {
    const vendor = await Vendor.findOneAndUpdate({ vendorId }, { $set: data }, { new: true, runValidators: true, ...(session ? { session } : {}) });
    return { summary: { vendorId, fields: Object.keys(body).filter((field) => field !== 'vendorId') }, result: vendorView(vendor, user.role) };
  });
}

export async function vendorCompliance(vendorId, state) {
  const vendor = await Vendor.findOne({ vendorId }).lean();
  if (!vendor) throw notFound(`No vendor ${vendorId}`);
  const now = new Date();
  const [incidents, food] = await Promise.all([
    VendorIncident.find({ vendorId, end: { $gte: now } }).sort({ start: 1 }).lean(),
    state ? Promise.resolve(foodRun(state)) : Promise.resolve(null),
  ]);
  const expiry = vendor.certExpiry ? new Date(vendor.certExpiry) : null;
  const overrideActive = vendor.complianceOverride?.until && new Date(vendor.complianceOverride.until) >= now;
  const certificateStatus = !expiry ? 'missing' : expiry >= now ? 'valid' : overrideActive ? 'override' : 'expired';
  const coverage = food?.rows.filter((row) => row.servers.includes(vendorId)).map(({ day, meal, diet, headcount, capacity, covered }) => ({ day, meal, diet, headcount, assignedCapacity: capacity, covered })) || [];
  return { vendorId, certificateNumber: vendor.certificateNumber || '', certExpiry: vendor.certExpiry || null, certificateStatus,
    override: overrideActive ? vendor.complianceOverride : null, active: vendor.active !== false, interruptions: incidents,
    menuConflicts: vendorLabelConflicts(vendor), coverage };
}

export async function recordMeal({ user, vendorId, date, meal, served }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw badRequest('date must use YYYY-MM-DD');
  if (!['breakfast', 'lunch', 'dinner'].includes(meal)) throw badRequest('meal must be breakfast, lunch or dinner');
  const count = Number(served);
  if (!Number.isInteger(count) || count < 0) throw badRequest('served must be a non-negative whole number');
  if (!await Vendor.exists({ vendorId })) throw notFound(`No vendor ${vendorId}`);
  return runCommand({ user, action: 'VENDOR_MEAL_RECORDED', entity: { type: 'Vendor', id: vendorId }, event: 'vendor.meal_recorded' }, async (session) => {
    await MealLog.updateOne({ vendorId, date, meal }, { $set: { served: count, loggedBy: user.email } }, { upsert: true, ...(session ? { session } : {}) });
    return { summary: { vendorId, date, meal, served: count }, result: { logged: true } };
  });
}
