import crypto from 'node:crypto';
import * as M from '../../models/index.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';

export const makeId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
export const ACTIVE_RESERVATION = ['active'];

export function summarizeStock(balances = []) {
  const out = { totalUsable: 0, available: 0, reserved: 0, issued: 0, maintenance: 0, damaged: 0, missing: 0, inTransit: 0, needsCheck: 0 };
  const keys = { available:'available', reserved:'reserved', issued:'issued', maintenance:'maintenance', damaged:'damaged', missing:'missing', in_transit:'inTransit', needs_check:'needsCheck', awaiting_return:'issued' };
  for (const b of balances) out[keys[b.state] || 'needsCheck'] += Number(b.qty || 0);
  out.totalUsable = out.available + out.reserved + out.issued;
  return out;
}

export async function itemAvailability(itemId, { locationId, startAt, endAt } = {}) {
  const inventory = await M.InventoryItem.findOne({ itemId }).select('item').lean();
  const keys = inventory?.item && inventory.item !== itemId ? [itemId, inventory.item] : [itemId];
  const q = { item: { $in: keys } };
  if (locationId) q.location = locationId;
  const balances = await M.StockBalance.find(q).lean();
  const summary = summarizeStock(balances);
  const assets = await M.Asset.find({ itemId, ...(locationId ? { locationId } : {}), status: { $in: ['available','reserved','issued','maintenance','damaged','missing'] } }).lean();
  if (assets.length) {
    const count = (status) => assets.filter((a) => a.status === status).length;
    summary.individualAssets = { total: assets.length, available: count('available'), reserved: count('reserved'), issued: count('issued'), maintenance: count('maintenance'), damaged: count('damaged'), missing: count('missing') };
    summary.totalUsable = summary.individualAssets.available + summary.individualAssets.reserved + summary.individualAssets.issued;
    summary.available = summary.individualAssets.available;
  }
  if (startAt && endAt) {
    const active = await M.Reservation.find({ itemId, ...(locationId ? { locationId } : {}), status: 'active', startAt: { $lt: endAt }, endAt: { $gt: startAt } }).lean();
    summary.overlappingReservations = active.length;
    summary.requestedWindowAvailable = Math.max(0, summary.available);
  }
  return summary;
}

export async function changeBalance({ itemId, itemName, locationId, fromState, toState, quantity, user, reason, movementType, session, related = {} }) {
  const n = Number(quantity);
  if (!Number.isInteger(n) || n < 1) throw badRequest('quantity must be a positive integer');
  const balanceKey = itemName || itemId;
  const activeLocation = locationId ? M.Location.findOne({ locationId, status: 'active' }) : null;
  if (activeLocation && session) activeLocation.session(session);
  if (!activeLocation || !await activeLocation) throw badRequest('An active locationId is required');
  if (fromState) {
    const debit = await M.StockBalance.findOneAndUpdate({ item: balanceKey, location: locationId, state: fromState, qty: { $gte: n } }, { $inc: { qty: -n } }, { new: true, ...(session ? { session } : {}) });
    if (!debit) throw conflict(`Insufficient ${fromState} stock for ${itemId} at ${locationId}`, { itemId, locationId, quantity: n });
  }
  if (toState) {
    try {
      await M.StockBalance.findOneAndUpdate({ item: balanceKey, location: locationId, state: toState }, { $inc: { qty: n } }, { upsert: true, new: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) });
    } catch (e) {
      if (e.code !== 11000) throw e;
      await M.StockBalance.updateOne({ item: balanceKey, location: locationId, state: toState }, { $inc: { qty: n } }, session ? { session } : {});
    }
  }
  await M.StockMovement.create([{ movementId: makeId('MOV'), item: itemName || itemId, itemId, qty: n,
    from: fromState ? { location: locationId, state: fromState } : undefined,
    to: toState ? { location: locationId, state: toState } : undefined,
    movementType, by: user?.email || String(user || 'system'), reason, ...related }], session ? { session } : {});
  return { itemId, locationId, quantity: n, fromState, toState };
}

export async function reserveLine({ item, quantity, locationId, startAt, endAt, user, requestId, reason, emergency, session }) {
  const n = Number(quantity);
  if (!Number.isInteger(n) || n < 1) throw badRequest('quantity must be a positive integer');
  const inventory = await M.InventoryItem.findOne({ itemId: item }).lean(); if (!inventory) throw notFound(`No inventory item ${item}`);
  const location = locationId || inventory.location;
  const activeLocation = location ? M.Location.findOne({ locationId: location, status: 'active' }) : null;
  if (activeLocation && session) activeLocation.session(session);
  if (!activeLocation || !await activeLocation) throw badRequest('An active location is required');
  let assetIds = [];
  if (inventory.trackingType === 'individual') {
    assetIds = (await M.Asset.find({ itemId: item, locationId: location, status: 'available' }).sort({ assetTag: 1 }).limit(n).select('assetId').session(session).lean()).map((a) => a.assetId);
    if (assetIds.length < n) throw conflict(`Only ${assetIds.length} available assets for ${item} at ${location}`);
    const updated = await M.Asset.updateMany({ assetId: { $in: assetIds }, status: 'available' }, { status: 'reserved' }, session ? { session } : {});
    if (updated.modifiedCount !== n) throw conflict('Some assets were reserved concurrently; retry with a fresh availability check');
  } else await changeBalance({ itemId: item, itemName: inventory.item, locationId: location, fromState: 'available', toState: 'reserved', quantity: n, user, reason: reason || 'Resource reservation', movementType: 'reservation', session, related: { relatedRequestId: requestId } });
  const reservationId = makeId('RSV');
  const [reservation] = await M.Reservation.create([{ reservationId, requestId, itemId: item, assetIds, locationId: location, quantity: n, startAt, endAt, status: 'active', createdBy: user?.email, reason, emergency: Boolean(emergency) }], session ? { session } : {});
  return reservation;
}

export async function releaseReservation(reservation, user, session, reason = 'Reservation released') {
  if (reservation.status !== 'active') return;
  const inv = await M.InventoryItem.findOne({ itemId: reservation.itemId }).lean();
  if (inv?.trackingType === 'individual') {
    await M.Asset.updateMany({ assetId: { $in: reservation.assetIds }, status: 'reserved' }, { status: 'available' }, session ? { session } : {});
  } else await changeBalance({ itemId: reservation.itemId, itemName: inv?.item, locationId: reservation.locationId, fromState: 'reserved', toState: 'available', quantity: reservation.quantity, user, reason, movementType: 'release', session, related: { relatedRequestId: reservation.requestId } });
  reservation.status = 'cancelled'; await reservation.save(session ? { session } : {});
}
