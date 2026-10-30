# Logistics and Inventory API

The logistics router is mounted in the existing backend at `/api`; routes below therefore use `/api/logistics/...`. Authentication and role checks use the existing middleware and roles. `festival_director` has all permissions; `logistics_head` has `inventory:read`, `inventory:write`, and `inventory:request`; `events_team` can read and submit requests. Read operations generally require `inventory:read`; catalogue and operational mutations require `inventory:write`. Disruption preview/commit routes use the existing `disruptions:*` permissions.

## Data model and stock rules

`InventoryItem` is the existing `InventoryLine` collection with an alias, so existing inventory records remain in place. It stores item metadata. `Asset` stores uniquely tagged individually tracked units. Quantity stock is represented by `StockBalance` rows keyed by item name, location and state; the unique compound index prevents duplicate state rows. `StockMovement` records each stock movement. Categories, locations, requests, reservations, dispatches, return records, incidents, maintenance tasks, transfers, purchase orders, receipts, audits, reorder suggestions and disruption previews have dedicated collections.

For quantity items, available stock is debited atomically with a `qty >= requested` filter before crediting the next state. Negative balances are rejected. Individual assets use guarded status updates. Available, reserved, issued, maintenance, damaged, missing, in-transit and needs-check quantities are reported separately; `totalUsable` is available + reserved + issued. Transfers change location and state without creating new units. Reservation date fields are recorded, but allocation currently reserves stock until cancellation or dispatch; it does not release/reuse stock automatically by date window.

Important stock transitions are recorded in `StockMovement` and critical operations use the shared `runCommand` audit chain where wired. Movements are intended as append-only records. On a MongoDB replica set the shared command wrapper uses transactions; standalone MongoDB uses the existing non-transactional command behavior.

## Endpoint directory

| Method | Path | Purpose |
|---|---|---|
| GET, POST | `/api/logistics/categories` | List and create categories |
| PUT, DELETE | `/api/logistics/categories/:id` | Update or deactivate an unused category |
| GET, POST | `/api/logistics/locations` | List and create storage locations |
| GET, PUT | `/api/logistics/locations/:id` | Read/update a location |
| GET | `/api/logistics/locations/:id/inventory` | Stock/assets at a location |
| GET | `/api/logistics/locations/:id/capacity` | Recorded capacity and occupied stock |
| GET, POST | `/api/logistics/inventory` | Search/list and create items (query: `q`, `categoryId`, `trackingType`, `status`, `page`, `limit`; creation can include `openingQuantity`, `location`) |
| GET, PUT | `/api/logistics/inventory/:id` | Read/update item metadata |
| PATCH | `/api/logistics/inventory/:id/status` | Update item operational status |
| GET | `/api/logistics/inventory/:id/history` | Movement history |
| GET | `/api/logistics/inventory/:id/availability` | State counts; optional `locationId`, `startAt`, `endAt` |
| POST | `/api/logistics/assets` | Register an asset for an individual-tracked item |
| GET | `/api/logistics/assets/scan/:code` | Look up asset by tag, serial, QR, barcode or asset ID |
| GET | `/api/logistics/assets/:id/qr-data` | Get asset scan payload/path |
| GET, POST | `/api/logistics/requests` | List/create resource requests |
| GET | `/api/logistics/requests/pending`, `/by-event/:eventId`, `/by-department/:departmentId`, `/:id` | Request queues and lookup |
| PUT, PATCH | `/api/logistics/requests/:id`, `/:id/submit`, `/:id/approve`, `/:id/reject`, `/:id/cancel` | Request workflow |
| POST | `/api/logistics/reserve`, `/api/logistics/reservations` | Reserve request lines or stock |
| GET | `/api/logistics/reservations`, `/api/logistics/reservations/:id` | List and inspect reservations |
| PATCH | `/api/logistics/reservations/:id/cancel`, `/:id/extend` | Release or extend a reservation |
| GET | `/api/logistics/dispatch`, `/api/logistics/dispatch/:id`, `/overdue`, `/by-event/:eventId`, `/by-custodian/:staffId` | Dispatch directory and views |
| POST | `/api/logistics/dispatch`, `/api/logistics/dispatch/bulk` | Dispatch reserved stock |
| GET, POST | `/api/logistics/returns` | List return records |
| GET | `/api/logistics/returns/pending`, `/overdue`, `/:id`, `/api/logistics/reconciliation` | Return queues and reconciliation exceptions |
| POST | `/api/logistics/return`, `/api/logistics/return/bulk` | Record returned, damaged and missing quantities |
| GET, POST | `/api/logistics/incidents` | List and report damage/loss incidents |
| GET | `/api/logistics/incidents/open`, `/:id` | Incident queues/details |
| PATCH | `/api/logistics/incidents/:id/assign`, `/:id/resolve` | Incident handling |
| GET, POST | `/api/logistics/maintenance` | List/create maintenance tasks |
| GET | `/api/logistics/maintenance/due`, `/overdue`, `/:id` | Maintenance queues/details |
| PATCH | `/api/logistics/maintenance/:id/start`, `/:id/complete` | Maintenance state transitions |
| GET, POST | `/api/logistics/transfers` | List/request a stock transfer |
| GET | `/api/logistics/transfers/:id` | Transfer details |
| PATCH | `/api/logistics/transfers/:id/approve`, `/:id/receive` | Approve and receive transfer |
| GET | `/api/logistics/movements`, `/api/logistics/movements/:id` | Read the stock ledger |
| GET, POST | `/api/logistics/purchase-orders` | List/create purchase orders |
| GET | `/api/logistics/purchase-orders/:id` | Purchase order details |
| PATCH | `/api/logistics/purchase-orders/:id/approve`, `/:id/cancel` | Approval/cancellation |
| GET, POST | `/api/logistics/goods-receipts` | List and record purchase receipts |
| GET, POST | `/api/logistics/audits` | List/start an inventory audit |
| GET | `/api/logistics/audits/:id`, `/:id/discrepancies` | Audit and variance details |
| POST | `/api/logistics/audits/:id/counts`, `/:id/submit` | Enter counts and submit |
| PATCH | `/api/logistics/audits/:id/approve` | Approve with a required reason and post adjustments |
| GET | `/api/logistics/reorder-suggestions`, `/api/logistics/stock-forecast`, `/api/logistics/alerts` | Stock planning and alerts |
| POST | `/api/logistics/reorder-suggestions/:id/approve` | Approve a suggestion (does not auto-create a PO) |
| GET | `/api/logistics/dashboard`, `/api/logistics/analytics/usage`, `/utilization`, `/costs`, `/damage-loss`, `/by-event`, `/by-department` | Operational counts and analytics |
| POST | `/api/logistics/assets/scan/dispatch`, `/api/logistics/assets/scan/return` | Scanned asset checkout/return |
| POST | `/api/logistics/simulate-disruption` | Save a preview without changing live stock |
| GET | `/api/logistics/disruptions`, `/api/logistics/disruptions/:id` | List/read disruption previews |
| POST | `/api/logistics/disruptions/:id/approve`, `/:id/execute` | Approve and execute supported changes |

## Example workflows

### Create a location and stock item

```http
POST /api/logistics/locations
Content-Type: application/json
Authorization: Bearer <session-token>

{"locationId":"WH-MAIN","name":"Main warehouse","locationType":"main_warehouse","capacity":5000}
```

```http
POST /api/logistics/inventory
Content-Type: application/json

{"itemId":"CABLE-EXT","item":"Extension cable","sku":"CABLE-EXT","unit":"piece","trackingType":"quantity","reorderThreshold":20,"minimumStock":50,"openingQuantity":100,"location":"WH-MAIN"}
```

### Request, approve, dispatch, return

Create a request with `departmentId`, optional `eventId`/`venueId`, and `lines: [{"itemId":"CABLE-EXT","requestedQty":10}]`; submit it with `PATCH /api/logistics/requests/:id/submit`, then an authorized inventory writer approves it. Approval creates reservations. Dispatch with `POST /api/logistics/dispatch` and `{"reservationId":"...","quantity":10,"destinationLocationId":"...","expectedReturnAt":"2026-11-05T10:00:00Z"}`. Record the closeout with `POST /api/logistics/return` and `{"dispatchId":"...","returnedQty":9,"damagedQty":1,"missingQty":0,"inspectionNotes":"One cable damaged"}`.

Individual asset dispatch additionally includes custodian/event/venue context and records asset IDs. Individual returns require `assetIds` equal to `returnedQty`; `damagedAssetIds` identifies damaged units and `missingAssetIds` identifies missing units.

### Purchase and receipt

Create a purchase order with `supplierId`, `deliveryLocationId`, and lines (`itemId`, `quantity`, `unitPrice`). It stays pending until explicitly approved. Record each delivery through `POST /api/logistics/goods-receipts`, including `poNumber`, `idempotencyKey`, and lines with `actualQty`, optional `damagedQty` and `rejectedQty`.

## Integration contracts and limits

- Event and Venue IDs are validated against existing project models when supplied. Requests/dispatches store `eventId` and `venueId` for event-based lookup. Staff custody uses the existing staff identifier as `custodianStaffId`.
- Ripple consumers can subscribe to shared event-bus events such as `logistics.dispatch.created`, `logistics.return.recorded`, and `logistics.disruption.executed`. No duplicate Event, Venue, Staff, Vendor, or Ripple model is introduced.
- Supplier references use `supplierId` as an integration field; the existing vendor directory remains the source for vendor records.
- QR/barcode generation is not bundled: persist a unique `qrCode` or `barcode` on the asset and encode the returned scan path or asset tag in the printed code.
- This branch has not yet been verified against a live MongoDB replica set or concurrency load. Bulk workflow and standalone Mongo behavior should be integration-tested before operational deployment; use a replica set to get the command wrapper's multi-document transactions.
- Some action endpoints in the first implementation are direct model writes and have not all been routed through the central audit wrapper. See code-level audit wiring before treating this as a fully production-hardened module.
