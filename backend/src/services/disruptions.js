// Disruption engine: every live-test scenario is preview -> commit.
// preview() reads state and computes impact WITHOUT writing.
// commit() recomputes, then writes inside runCommand (audited).

import * as M from '../models/index.js';
import {
  loadState,
  accommodationRun,
  scheduleRun,
  foodRun,
  activePlan,
} from './state.js';
import { checkRisk, runCommand } from './command.js';
import { buildSchedulePlan } from './plans.js';
import { issueMerch } from './merch.js';
import {
  parseIST,
  fmtIST,
  overlaps,
  addMinutes,
} from '../utils/time.js';
import {
  badRequest,
  conflict,
  notFound,
} from '../utils/errors.js';
import { DISRUPTION_COMMITTERS } from '../shared/roles.js';
import { templateExplanation } from './explain.js';
import {
  arrivalAfterDelay,
  assertDisruptionTransactionsSupported,
  validateDisruptionParams,
} from './disruptionValidation.js';
import { supportsTransactions } from '../config/db.js';

const money = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const jsonSafe = (value) => JSON.parse(JSON.stringify(value));

// ---------- Helpers

function withClosure(list, key, closure) {
  return list.map((x) =>
    key(x)
      ? { ...x, closures: [...(x.closures || []), closure] }
      : x
  );
}

async function currentAccommodation(session) {
  const plan = await activePlan('accommodation', session);

  if (!plan) {
    throw badRequest(
      'No active accommodation plan. Generate and activate one first.'
    );
  }

  const query = M.Allocation.find({
    planId: plan.planId,
    status: { $ne: 'released' },
  });

  if (session) query.session(session);

  const allocs = await query.lean();

  return { plan, allocs };
}

const placedOnly = (allocations) =>
  allocations.filter(
    (allocation) =>
      allocation.bed?.kind && allocation.status !== 'unplaced'
  );

async function claimForCommit(disruptionId, session) {
  const disruption = await M.Disruption.findOneAndUpdate(
    {
      disruptionId,
      status: 'previewed',
    },
    {
      status: 'committing',
    },
    {
      new: true,
      session,
    }
  );

  if (disruption) {
    return { disruption };
  }

  const current = await M.Disruption
    .findOne({ disruptionId })
    .session(session)
    .lean();

  if (current?.status === 'committed') {
    return { replay: current.result };
  }

  throw conflict(
    `Disruption cannot be committed while it is ${
      current?.status || 'unavailable'
    }`
  );
}

// ---------- 1. Hostel closure (pipe burst, power failure)

async function previewHostelClosure(state, p, _user, session) {
  const from = p.from
    ? parseIST(p.from)
    : parseIST(state.assumptions.festWindow.start);

  const to = p.to
    ? parseIST(p.to)
    : parseIST(state.assumptions.festWindow.end);

  if (!from || !to) {
    throw badRequest('from/to must be "YYYY-MM-DD HH:mm" IST');
  }

  const target = (room) =>
    p.roomId
      ? room.roomId === p.roomId
      : p.block
        ? room.block === p.block
        : false;

  const roomIds = new Set(
    state.rooms.filter(target).map((room) => room.roomId)
  );

  if (!roomIds.size) {
    throw notFound('No room matches that roomId or block');
  }

  const closure = {
    start: from,
    end: to,
    reason: 'Closed by Hospitality',
    disruptionId: p.__id || 'pending',
  };

  const rooms = withClosure(state.rooms, target, closure);

  const { plan, allocs } = await currentAccommodation(session);

  const displaced = placedOnly(allocs).filter(
    (allocation) =>
      allocation.bed.kind === 'hostel' &&
      roomIds.has(allocation.bed.roomId) &&
      overlaps(
        allocation.checkIn,
        allocation.checkOut,
        from,
        to
      )
  );

  const displacedIds = new Set(
    displaced.map((allocation) => allocation.participantId)
  );

  const pinned = placedOnly(allocs).filter(
    (allocation) => !displacedIds.has(allocation.participantId)
  );

  const people = state.people.filter((person) =>
    displacedIds.has(person.participantId)
  );

  const run = accommodationRun(state, {
    pinned,
    people,
    rooms,
    budgetMode: 'respect',
  });

  const newPlaced = run.allocations.filter(
    (allocation) => allocation.status !== 'unplaced'
  );

  const newUnplaced = run.allocations.filter(
    (allocation) => allocation.status === 'unplaced'
  );

  const oldCost = displaced.reduce(
    (sum, allocation) => sum + (allocation.cost || 0),
    0
  );

  const newCost = newPlaced.reduce(
    (sum, allocation) => sum + (allocation.cost || 0),
    0
  );

  const pinnedCost = pinned.reduce(
    (sum, allocation) => sum + (allocation.cost || 0),
    0
  );

  const totalAfter =
    pinnedCost +
    newCost +
    run.kept.reduce(
      (sum, allocation) => sum + (allocation.cost || 0),
      0
    ) * 0;

  const budget = state.assumptions.externalBudgetINR;
  const overBudget = totalAfter > budget;

  const relaxed = newPlaced.filter((allocation) =>
    (allocation.reasonCodes || []).includes('EXTERNAL_COST')
  ).length;

  return {
    risk: overBudget ? 'high' : 'medium',

    summary: {
      roomsClosed: [...roomIds],
      window: {
        from: fmtIST(from),
        to: fmtIST(to),
      },
      displaced: displaced.length,
      rehoused: newPlaced.length,
      unplaced: newUnplaced.length,
      externalPlacements: relaxed,
      costDeltaINR: newCost - oldCost,
      externalCostAfterINR: totalAfter,
      budgetINR: budget,
      overBudget,

      unplacedReasons: newUnplaced.reduce((map, allocation) => {
        allocation.reasonCodes.forEach((code) => {
          map[code] = (map[code] || 0) + 1;
        });

        return map;
      }, {}),

      displacedSample: displaced.slice(0, 5).map((allocation) => ({
        participantId: allocation.participantId,
        from: allocation.bed.roomId,
        contingentId: allocation.contingentId,
      })),
    },

    changes: {
      type: 'hostel_closure',
      closure,
      roomIds: [...roomIds],
      displacedIds: [...displacedIds],
      newAllocations: run.allocations,
      planId: plan.planId,
    },
  };
}

async function applyHostelClosure(session, c, user) {
  await M.Room.updateMany(
    { roomId: { $in: c.roomIds } },
    { $push: { closures: c.closure } },
    { session }
  );

  await M.Allocation.updateMany(
    {
      planId: c.planId,
      participantId: { $in: c.displacedIds },
      status: { $ne: 'released' },
    },
    {
      status: 'released',
      overrideReason: 'Released by hostel closure',
    },
    { session }
  );

  await M.Allocation.insertMany(
    c.newAllocations.map((allocation) => ({
      ...allocation,
      planId: c.planId,
      status:
        allocation.status === 'unplaced'
          ? 'unplaced'
          : 'proposed',
      overrideReason: null,
    })),
    { session }
  );

  return {
    summary: {
      roomIds: c.roomIds,
      displaced: c.displacedIds.length,
    },
  };
}

// ---------- 2. Late contingent (bus delayed)

async function previewLateContingent(state, p, _user, session) {
  const cid = p.contingentId;
  const newArrival = parseIST(p.newArrival);

  if (!newArrival) {
    throw badRequest('newArrival must be "YYYY-MM-DD HH:mm" IST');
  }

  const members = state.people.filter(
    (person) =>
      person.contingentId === cid &&
      person.personType === 'participant' &&
      !person.quarantined
  );

  if (!members.length) {
    throw notFound(`No participants in ${cid}`);
  }

  // Preserve each participant's arrival unless the new arrival is later.
  const shift = (person) => ({
    ...person,
    arrivalDateTime: arrivalAfterDelay(person.arrivalDateTime, newArrival),
  });

  const moved = members.map(shift);

  const movedIds = new Set(
    moved.map((person) => person.participantId)
  );

  const { plan, allocs } = await currentAccommodation(session);

  const pinned = placedOnly(allocs).filter(
    (allocation) => !movedIds.has(allocation.participantId)
  );

  const affectedAllocs = allocs.filter(
    (allocation) => movedIds.has(allocation.participantId)
  );

  const run = accommodationRun(state, {
    pinned,
    people: moved.filter(
      (person) => person.accommodationRequested
    ),
    budgetMode: 'respect',
  });

  const people = state.people.map((person) =>
    movedIds.has(person.participantId)
      ? shift(person)
      : person
  );

  const ready = state.assumptions.arrivalReadyMinutes ?? 60;

  const sched = scheduleRun(state, {
    participants: people,
  });

  const current = await activePlan('schedule', session);

  const slotQuery = current
    ? M.Slot.find({
        planId: current.planId,
        participantIds: { $in: [...movedIds] },
      })
    : null;

  if (slotQuery && session) {
    slotQuery.session(session);
  }

  const slots = slotQuery ? await slotQuery.lean() : [];

  const lateSlots = slots.filter(
    (slot) =>
      new Date(slot.start) < addMinutes(newArrival, ready)
  );

  return {
    risk: 'medium',

    summary: {
      contingentId: cid,
      members: members.length,
      newArrival: fmtIST(newArrival),

      bedsReleased: affectedAllocs.filter(
        (allocation) => allocation.bed?.kind
      ).length,

      rehoused: run.allocations.filter(
        (allocation) => allocation.status !== 'unplaced'
      ).length,

      unplaced: run.allocations.filter(
        (allocation) => allocation.status === 'unplaced'
      ).length,

      slotsAffected: lateSlots.length,

      slotsAffectedSample: lateSlots.slice(0, 6).map((slot) => ({
        slotId: slot.slotId,
        start: fmtIST(slot.start),
      })),

      scheduleAfter: sched.summary,
    },

    changes: {
      type: 'late_contingent',
      contingentId: cid,
      newArrival,

      memberArrivals: moved.map(
        ({ participantId, arrival }) => ({
          participantId,
          arrival,
        })
      ),

      releasedAllocIds: affectedAllocs.map(
        (allocation) => allocation._id
      ),

      newAllocations: run.allocations,
      planId: plan.planId,
    },
  };
}

async function applyLateContingent(session, c) {
  // Persist each participant's individually calculated arrival time.
  for (const member of c.memberArrivals) {
    await M.Participant.updateOne(
      { participantId: member.participantId },
      {
        $set: {
          arrivalDateTime: member.arrivalDateTime,
        },
      },
      { session }
    );
  }

  await M.Allocation.updateMany(
    { _id: { $in: c.releasedAllocIds } },
    {
      status: 'released',
      overrideReason: 'Released: arrival changed',
    },
    { session }
  );

  await M.Allocation.insertMany(
    c.newAllocations.map((allocation) => ({
      ...allocation,
      planId: c.planId,
      overrideReason: null,
    })),
    { session }
  );

  return {
    summary: {
      contingentId: c.contingentId,
      members: c.memberArrivals.length,
    },
  };
}

// ---------- 3. Duplicate record (merge, keep audit)

async function previewDuplicateRecord(state, p, _user, session) {
  const keep = state.people.find(
    (person) => person.participantId === p.keepId
  );

  const drop = state.people.find(
    (person) => person.participantId === p.dropId
  );

  if (!keep || !drop) {
    throw notFound('Both participant IDs must exist');
  }

  if (keep.participantId === drop.participantId) {
    throw badRequest('Choose two different records');
  }

  const regs = state.registrations.filter(
    (registration) =>
      registration.participantId === drop.participantId
  );

  const overlapRegs = regs.filter((registration) =>
    state.registrations.some(
      (existing) =>
        existing.participantId === keep.participantId &&
        existing.eventId === registration.eventId
    )
  );

  const merchQuery = M.MerchIssue.find({
    participantId: drop.participantId,
    kind: 'original',
  });

  if (session) {
    merchQuery.session(session);
  }

  const merch = await merchQuery.lean();

  const { plan, allocs } = await currentAccommodation(session);

  const dropAlloc = allocs.find(
    (allocation) =>
      allocation.participantId === drop.participantId &&
      allocation.status !== 'unplaced' &&
      allocation.bed?.kind
  );

  return {
    risk: merch.length ? 'high' : 'medium',

    summary: {
      keep: {
        participantId: keep.participantId,
        name: keep.name,
        contingentId: keep.contingentId,
      },

      drop: {
        participantId: drop.participantId,
        name: drop.name,
        contingentId: drop.contingentId,
      },

      registrationsMoved: regs.length - overlapRegs.length,
      registrationsDeduped: overlapRegs.length,
      bedReleased: Boolean(dropAlloc),

      merchAlreadyIssuedToDrop: merch.map((item) => ({
        item: item.item,
        desk: item.desk,
        issuedAt: item.issuedAt,
      })),

      warning: merch.length
        ? 'The dropped record already received merch. Reconcile before merging; history is kept.'
        : null,
    },

    changes: {
      type: 'duplicate_record',
      keepId: keep.participantId,
      dropId: drop.participantId,
      planId: plan.planId,
      dropAllocId: dropAlloc?._id || null,
    },
  };
}

async function applyDuplicateRecord(session, c) {
  await M.Participant.updateOne(
    { participantId: c.dropId },
    {
      active: false,
      mergedInto: c.keepId,
      checkInStatus: 'absent',
    },
    { session }
  );

  const dropRegs = await M.Registration
    .find({ participantId: c.dropId })
    .session(session)
    .lean();

  for (const registration of dropRegs) {
    const exists = await M.Registration
      .exists({
        participantId: c.keepId,
        eventId: registration.eventId,
      })
      .session(session);

    if (exists) {
      await M.Registration
        .deleteOne({ _id: registration._id })
        .session(session);
    } else {
      await M.Registration
        .updateOne(
          { _id: registration._id },
          { participantId: c.keepId }
        )
        .session(session);
    }
  }

  if (c.dropAllocId) {
    await M.Allocation.updateOne(
      { _id: c.dropAllocId },
      {
        status: 'released',
        overrideReason: `Merged into ${c.keepId}`,
      },
      { session }
    );
  }

  await M.DuplicateCandidate.updateMany(
    {
      $or: [
        { a: c.dropId, b: c.keepId },
        { a: c.keepId, b: c.dropId },
      ],
    },
    {
      status: 'merged',
      'resolution.keepId': c.keepId,
    },
    { session }
  );

  return {
    summary: {
      keepId: c.keepId,
      dropId: c.dropId,
    },
  };
}

// ---------- 4. Equipment failure

async function previewEquipmentFailure(state, p) {
  const qty = Number(p.qty || 1);

  const stock = state.stock.map((item) => ({
    ...item,
  }));

  const avail = stock.find(
    (item) =>
      item.item === p.item &&
      item.state === 'available' &&
      (!p.location || item.location === p.location)
  );

  if (!avail || avail.qty < qty) {
    throw badRequest(
      `Not enough usable ${p.item} to break ${qty}`
    );
  }

  const before = scheduleRun(state).summary;

  avail.qty -= qty;

  const damaged = stock.find(
    (item) =>
      item.item === p.item &&
      item.location === avail.location &&
      item.state === 'damaged'
  );

  const after = scheduleRun(state, {
    stock: stock.concat(
      damaged
        ? []
        : [
            {
              item: p.item,
              location: avail.location,
              state: 'damaged',
              qty,
            },
          ]
    ),
  }).summary;

  return {
    risk: 'medium',

    summary: {
      item: p.item,
      location: avail.location,
      qtyBroken: qty,
      equipmentShortBefore: before.equipmentShortfall,
      equipmentShortAfter: after.equipmentShortfall,
      slotsAfter: after.slots,
    },

    changes: {
      type: 'equipment_failure',
      item: p.item,
      location: avail.location,
      qty,
    },
  };
}

async function applyEquipmentFailure(session, c, user) {
  const bal = await M.StockBalance
    .findOne({
      item: c.item,
      location: c.location,
      state: 'available',
    })
    .session(session);

  bal.qty -= c.qty;

  await bal.save({ session });

  await M.StockBalance.updateOne(
    {
      item: c.item,
      location: c.location,
      state: 'damaged',
    },
    {
      $inc: {
        qty: c.qty,
      },
    },
    {
      upsert: true,
      session,
    }
  );

  await M.StockMovement.create(
    [
      {
        item: c.item,
        qty: c.qty,

        from: {
          location: c.location,
          state: 'available',
        },

        to: {
          location: c.location,
          state: 'damaged',
        },

        by: user.email,
        reason: 'Equipment failure reported',
      },
    ],
    { session }
  );

  return {
    summary: {
      item: c.item,
      qty: c.qty,
    },
  };
}

// ---------- 5. Venue change (rain, closure)

async function previewVenueChange(state, p, _user, session) {
  const from = p.from
    ? parseIST(p.from)
    : parseIST(state.assumptions.festWindow.start);

  const to = p.to
    ? parseIST(p.to)
    : parseIST(state.assumptions.festWindow.end);

  const v = state.venues.find(
    (venue) => venue.venueId === p.venueId
  );

  if (!v) {
    throw notFound(`No venue ${p.venueId}`);
  }

  const venues = withClosure(
    state.venues,
    (venue) => venue.venueId === p.venueId,
    {
      start: from,
      end: to,
      reason: 'Venue change',
      disruptionId: 'pending',
    }
  );

  const before = scheduleRun(state).summary;
  const after = scheduleRun(state, { venues }).summary;

  const current = await activePlan('schedule', session);

  const slotQuery = current
    ? M.Slot.find({
        planId: current.planId,
        venueId: p.venueId,
        start: {
          $gte: from,
          $lt: to,
        },
      })
    : null;

  if (slotQuery && session) {
    slotQuery.session(session);
  }

  const affected = slotQuery ? await slotQuery.lean() : [];

  return {
    risk: 'medium',

    summary: {
      venue: v.name,

      window: {
        from: fmtIST(from),
        to: fmtIST(to),
      },

      slotsInVenueWindow: affected.length,
      before,
      after,

      newUnscheduledRounds:
        after.unscheduledRounds - before.unscheduledRounds,
    },

    changes: {
      type: 'venue_change',
      venueId: p.venueId,
      from,
      to,
    },
  };
}

async function applyVenueChange(session, c) {
  await M.Venue.updateOne(
    { venueId: c.venueId },
    {
      $push: {
        closures: {
          start: c.from,
          end: c.to,
          reason: 'Venue change',
        },
      },
    },
    { session }
  );

  return {
    summary: {
      venueId: c.venueId,
    },
  };
}

// ---------- 6. Vendor shutdown

async function previewVendorShutdown(state, p) {
  const v = state.vendors.find(
    (vendor) => vendor.vendorId === p.vendorId
  );

  if (!v) {
    throw notFound(`No vendor ${p.vendorId}`);
  }

  const from = p.from
    ? parseIST(p.from)
    : parseIST(state.assumptions.festWindow.start);

  const to = p.to
    ? parseIST(p.to)
    : parseIST(state.assumptions.festWindow.end);

  const incident = {
    vendorId: v.vendorId,
    start: from,
    end: to,
    reason: typeof p.reason === 'string' && p.reason.trim() ? p.reason.trim() : 'Shutdown',
  };

  const before = foodRun(state);

  const after = foodRun(state, {
    incidents: [...state.incidents, incident],
  });

  // A cell worsens when its gap becomes more severe,
  // not only when it changes from covered to uncovered.
  const rank = {
    null: 0,
    CAPACITY_SHORT: 1,
    NO_VENDOR: 2,
  };

  const worse = after.rows.filter((row) => {
    const previous = before.rows.find(
      (item) =>
        item.day === row.day &&
        item.meal === row.meal &&
        item.diet === row.diet
    );

    return rank[row.gap] > rank[previous?.gap ?? null];
  });

  const servingLostHeadcount = worse.reduce(
    (sum, row) => sum + row.headcount,
    0
  );

  return {
    risk: 'medium',

    summary: {
      vendor: v.name,
      menu: v.menu,

      window: {
        from: fmtIST(from),
        to: fmtIST(to),
      },

      before: before.summary,
      after: after.summary,

      worsenedCells: worse.length,
      peopleLosingCoverage: servingLostHeadcount,

      worsened: worse.slice(0, 12).map((row) => ({
        day: row.day,
        meal: row.meal,
        diet: row.diet,
        headcount: row.headcount,
        gap: row.gap,
      })),

      onlySourceOf: v.dietaryTags.filter(
        (tag) =>
          state.vendors.filter((vendor) =>
            vendor.dietaryTags.includes(tag)
          ).length === 1
      ),
    },

    changes: {
      type: 'vendor_shutdown',
      incident,
    },
  };
}

async function applyVendorShutdown(session, c) {
  await M.VendorIncident.create(
    [
      {
        ...c.incident,
      },
    ],
    { session }
  );

  return {
    summary: {
      vendorId: c.incident.vendorId,
    },
  };
}

// ---------- 7. Duplicate merch claim

async function previewDuplicateMerch(state, p, _user, session) {
  const query = M.MerchIssue.findOne({
    participantId: p.participantId,
    item: p.item,
    kind: 'original',
  });

  if (session) {
    query.session(session);
  }

  const existing = await query.lean();

  if (!existing) {
    return {
      risk: 'low',

      summary: {
        allowed: true,
        note: 'No prior issue; a normal issue would succeed.',
      },

      changes: {
        type: 'duplicate_merch_claim',
        participantId: p.participantId,
        item: p.item,
        blocked: false,
      },
    };
  }

  return {
    risk: 'medium',

    summary: {
      allowed: false,

      original: {
        issuedAt: fmtIST(existing.issuedAt),
        desk: existing.desk,
        issuedBy: existing.issuedBy,
        size: existing.size,
      },

      rule:
        'One original issue per person per item, enforced by a unique index.',
    },

    changes: {
      type: 'duplicate_merch_claim',
      participantId: p.participantId,
      item: p.item,
      blocked: true,
    },
  };
}

// ---------- 8. Constraint change (curfew, distance, toggles)

async function previewConstraintChange(state, p) {
  const before = accommodationRun(state, {
    budgetMode: 'respect',
  }).metrics;

  const settings = {
    ...state.settings,

    [p.constraintId]: {
      enabled: p.enabled,
      params: p.params || {},
    },
  };

  const after = accommodationRun(
    {
      ...state,
      settings,
    },
    {
      budgetMode: 'respect',
    }
  ).metrics;

  return {
    risk: 'medium',

    summary: {
      constraintId: p.constraintId,
      enabled: p.enabled,
      before: pick(before),
      after: pick(after),
      deltaUnplaced: after.unplaced - before.unplaced,
    },

    changes: {
      type: 'constraint_change',
      constraintId: p.constraintId,
      enabled: p.enabled,
      params: p.params || {},
    },
  };
}

const pick = (metrics) => ({
  placed: metrics.placed,
  unplaced: metrics.unplaced,
  externalCostINR: metrics.externalCostINR,
  splits: metrics.splits,
  unplacedByReason: metrics.unplacedByReason,
});

async function applyConstraintChange(session, c, user) {
  await M.ConstraintSetting.updateOne(
    { constraintId: c.constraintId },
    {
      enabled: c.enabled,
      params: c.params,
      updatedBy: user.email,
    },
    {
      upsert: true,
      session,
    }
  );

  return {
    summary: {
      constraintId: c.constraintId,
      enabled: c.enabled,
    },
  };
}

// ---------- Disruption registry

const TYPES = {
  hostel_closure: {
    preview: previewHostelClosure,
    apply: applyHostelClosure,
    risk: 'medium',
  },

  late_contingent: {
    preview: previewLateContingent,
    apply: applyLateContingent,
    risk: 'medium',
  },

  duplicate_record: {
    preview: previewDuplicateRecord,
    apply: applyDuplicateRecord,
    risk: 'medium',
  },

  equipment_failure: {
    preview: previewEquipmentFailure,
    apply: applyEquipmentFailure,
    risk: 'medium',
  },

  venue_change: {
    preview: previewVenueChange,
    apply: applyVenueChange,
    risk: 'medium',
  },

  vendor_shutdown: {
    preview: previewVendorShutdown,
    apply: applyVendorShutdown,
    risk: 'medium',
  },

  duplicate_merch_claim: {
    preview: previewDuplicateMerch,
    apply: null,
    risk: 'medium',
  },

  constraint_change: {
    preview: previewConstraintChange,
    apply: applyConstraintChange,
    risk: 'medium',
  },
};

export const DISRUPTION_TYPES = Object.keys(TYPES);

// ---------- Preview disruption

export async function previewDisruption(type, params, user) {
  const t = TYPES[type];

  if (!t) {
    throw badRequest(
      `Unknown disruption "${type}"`,
      { allowed: DISRUPTION_TYPES }
    );
  }

  validateDisruptionParams(type, params || {});

  const state = await loadState();

  const out = await t.preview(
    state,
    params || {},
    user
  );

  const disruptionId =
    `D-${Date.now().toString(36).toUpperCase()}`;

  const doc = await M.Disruption.create({
    disruptionId,
    type,
    params,
    status: 'previewed',
    preview: out.summary,
    requiresRisk: out.risk,

    createdBy: {
      userId: user.userId,
      role: user.role,
    },

    result: {
      changes: out.changes,
    },
  });

  return {
    disruptionId: doc.disruptionId,
    type,
    risk: out.risk,
    summary: out.summary,
    committers: DISRUPTION_COMMITTERS[type] || [],

    explanation: templateExplanation(
      out.summary?.reasonCodes || []
    ),
  };
}

// ---------- Commit disruption

export async function commitDisruption(
  disruptionId,
  user,
  reason
) {
  assertDisruptionTransactionsSupported(supportsTransactions());

  const d = await M.Disruption.findOne({
    disruptionId,
  });

  if (!d) {
    throw notFound('No such disruption');
  }

  const t = TYPES[d.type];

  validateDisruptionParams(
    d.type,
    d.params || {}
  );

  const allowedRoles =
    DISRUPTION_COMMITTERS[d.type] || [];

  if (
    user.role !== 'festival_director' &&
    !allowedRoles.includes(user.role)
  ) {
    const { forbidden } = await import('../utils/errors.js');

    throw forbidden(
      `Only ${
        allowedRoles.join(', ') || 'the Festival Director'
      } may commit ${d.type}`
    );
  }

  checkRisk(
    user,
    d.requiresRisk || 'medium',
    reason
  );

  // Idempotency: do not apply an already committed disruption again.
  if (d.status === 'committed') {
    if (
      d.result?.committed ||
      typeof d.result?.blocked === 'boolean'
    ) {
      return d.result;
    }

    return {
      committed: true,
      summary: d.result?.summary || d.preview,
    };
  }

  if (d.status !== 'previewed') {
    throw badRequest(
      `Disruption is already ${d.status}`
    );
  }

  // Duplicate merchandise claims are rejected and audited,
  // but do not modify inventory.
  if (d.type === 'duplicate_merch_claim') {
    return runCommand(
      {
        user,
        action: 'MERCH_DUP_REJECTED',

        entity: {
          type: 'Participant',
          id: d.params.participantId,
        },

        reason,
        risk: 'medium',
        disruptionId,
      },

      async (session) => {
        const state = await loadState(session);

        const fresh = await t.preview(
          state,
          d.params || {},
          user,
          session
        );

        checkRisk(
          user,
          fresh.risk,
          reason
        );

        const claimed = await claimForCommit(
          disruptionId,
          session
        );

        if (claimed.replay) {
          return {
            skipAudit: true,
            result: claimed.replay,
          };
        }

        const commitDoc = claimed.disruption;

        commitDoc.status = 'committed';

        commitDoc.committedBy = {
          userId: user.userId,
          role: user.role,
        };

        commitDoc.reason = reason;
        commitDoc.committedAt = new Date();

        commitDoc.result = jsonSafe({
          blocked: fresh.summary.allowed === false,
          original: fresh.summary.original || null,
        });

        await commitDoc.save({ session });

        return {
          summary: {
            rejected: true,
          },

          result: commitDoc.result,
        };
      }
    );
  }

  const result = await runCommand(
    {
      user,

      action:
        `DISRUPTION_${d.type.toUpperCase()}`,

      entity: {
        type: 'Disruption',
        id: disruptionId,
      },

      reason,
      risk: d.requiresRisk || 'medium',
      disruptionId,
      event: `disruption.${d.type}`,
    },

    async (session) => {
      // Reload state and recompute the impact before writing.
      const state = await loadState(session);

      const fresh = await t.preview(
        state,
        d.params || {},
        user,
        session
      );

      checkRisk(
        user,
        fresh.risk,
        reason
      );

      const claimed = await claimForCommit(
        disruptionId,
        session
      );

      if (claimed.replay) {
        return {
          skipAudit: true,
          result: claimed.replay,
        };
      }

      const commitDoc = claimed.disruption;

      const out = await t.apply(
        session,
        fresh.changes,
        user
      );

      let replannedSchedule = null;

      // Venue closures and equipment failures trigger schedule replanning.
      if (
        d.type === 'venue_change' ||
        d.type === 'equipment_failure'
      ) {
        let scheduleState = state;

        if (d.type === 'venue_change') {
          const closure = {
            start: fresh.changes.from,
            end: fresh.changes.to,
            reason: 'Venue change',
            disruptionId,
          };

          scheduleState = {
            ...state,

            venues: withClosure(
              state.venues,
              (venue) =>
                venue.venueId === d.params.venueId,
              closure
            ),
          };
        } else {
          const stock = state.stock.map((entry) => ({
            ...entry,
          }));

          const available = stock.find(
            (entry) =>
              entry.item === fresh.changes.item &&
              entry.location === fresh.changes.location &&
              entry.state === 'available'
          );

          available.qty -= fresh.changes.qty;

          const damaged = stock.find(
            (entry) =>
              entry.item === fresh.changes.item &&
              entry.location === fresh.changes.location &&
              entry.state === 'damaged'
          );

          if (damaged) {
            damaged.qty += fresh.changes.qty;
          } else {
            stock.push({
              item: fresh.changes.item,
              location: fresh.changes.location,
              state: 'damaged',
              qty: fresh.changes.qty,
            });
          }

          scheduleState = {
            ...state,
            stock,
          };
        }

        const plan = await buildSchedulePlan({
          user,
          state: scheduleState,
          session,
        });

        await M.Plan.updateMany(
          {
            type: 'schedule',
            status: 'active',
          },
          {
            status: 'superseded',
          },
          { session }
        );

        const schedulePlan = await M.Plan
          .findOne({
            planId: plan.planId,
          })
          .session(session);

        schedulePlan.status = 'active';
        schedulePlan.activatedBy = user.email;
        schedulePlan.activatedAt = new Date();
        schedulePlan.reason =
          `Re-planned after ${d.type}`;

        await schedulePlan.save({ session });

        replannedSchedule = plan.planId;
      }

      commitDoc.status = 'committed';

      commitDoc.committedBy = {
        userId: user.userId,
        role: user.role,
      };

      commitDoc.reason = reason;
      commitDoc.committedAt = new Date();

      commitDoc.result = jsonSafe({
        committed: true,
        summary: fresh.summary,

        ...(replannedSchedule
          ? { replannedSchedule }
          : {}),
      });

      await commitDoc.save({ session });

      return {
        summary: {
          ...out.summary,

          ...(replannedSchedule
            ? { replannedSchedule }
            : {}),
        },

        result: commitDoc.result,

        additionalAudits: replannedSchedule
          ? [
              {
                action: 'PLAN_ACTIVATE',

                entity: {
                  type: 'Plan',
                  id: replannedSchedule,
                },

                reason: `Re-planned after ${d.type}`,
                risk: 'low',

                summary: {
                  planId: replannedSchedule,
                  type: 'schedule',
                },
              },
            ]
          : [],
      };
    }
  );

  return result;
}
