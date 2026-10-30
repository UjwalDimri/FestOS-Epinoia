import { getConstraint } from '../constraints/registry.js';
import '../constraints/index.js';
import { badRequest, conflict } from '../utils/errors.js';
import { fmtIST, parseIST } from '../utils/time.js';

const requiredText = (params, key) => {
  if (typeof params[key] !== 'string' || !params[key].trim()) throw badRequest(`${key} is required`);
};

function timeParam(params, key, { optional = false } = {}) {
  const value = params[key];
  if (optional && value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
    throw badRequest(`${key} must be "YYYY-MM-DD HH:mm" IST`);
  }
  const parsed = parseIST(value);
  if (!parsed || fmtIST(parsed) !== value) throw badRequest(`${key} must be a valid "YYYY-MM-DD HH:mm" IST time`);
  return parsed;
}

function windowParams(params) {
  const from = timeParam(params, 'from', { optional: true });
  const to = timeParam(params, 'to', { optional: true });
  if ((from && !to) || (!from && to)) throw badRequest('from and to must be provided together');
  if (from && from >= to) throw badRequest('from must be earlier than to');
}

export function validateDisruptionParams(type, params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw badRequest('params must be an object');
  switch (type) {
    case 'hostel_closure':
      if (Boolean(params.roomId) === Boolean(params.block)) throw badRequest('Provide exactly one of roomId or block');
      windowParams(params);
      break;
    case 'late_contingent':
      requiredText(params, 'contingentId');
      timeParam(params, 'newArrival');
      break;
    case 'duplicate_record':
      requiredText(params, 'keepId'); requiredText(params, 'dropId');
      if (params.keepId === params.dropId) throw badRequest('Choose two different records');
      break;
    case 'equipment_failure':
      requiredText(params, 'item');
      if (params.qty !== undefined && (!Number.isInteger(params.qty) || params.qty <= 0)) throw badRequest('qty must be a positive integer');
      break;
    case 'venue_change':
      requiredText(params, 'venueId'); windowParams(params);
      break;
    case 'vendor_shutdown':
      requiredText(params, 'vendorId'); windowParams(params);
      if (params.reason !== undefined && (typeof params.reason !== 'string' || params.reason.trim().length < 5)) throw badRequest('reason must contain at least 5 characters');
      break;
    case 'duplicate_merch_claim':
      requiredText(params, 'participantId'); requiredText(params, 'item');
      break;
    case 'constraint_change': {
      requiredText(params, 'constraintId');
      if (!getConstraint(params.constraintId)) throw badRequest(`Unknown constraint "${params.constraintId}"`);
      if (typeof params.enabled !== 'boolean') throw badRequest('enabled must be a boolean');
      if (params.params !== undefined && (!params.params || typeof params.params !== 'object' || Array.isArray(params.params))) {
        throw badRequest('params.params must be an object');
      }
      const values = params.params || {};
      if (params.constraintId === 'ACC_MAX_DISTANCE' && values.maxKm !== undefined &&
          (typeof values.maxKm !== 'number' || !Number.isFinite(values.maxKm) || values.maxKm < 0)) {
        throw badRequest('ACC_MAX_DISTANCE params.maxKm must be a non-negative number');
      }
      break;
    }
    default:
      throw badRequest(`Unknown disruption "${type}"`);
  }
  return params;
}

export function arrivalAfterDelay(currentArrival, delayedArrival) {
  return new Date(Math.max(new Date(currentArrival).getTime(), new Date(delayedArrival).getTime()));
}

export function assertDisruptionTransactionsSupported(supported) {
  if (!supported) throw conflict('Disruption commits require MongoDB replica-set transactions; no changes were made.');
}
