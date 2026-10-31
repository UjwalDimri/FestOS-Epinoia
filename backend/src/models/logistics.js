import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const inventoryLineSchema = new Schema({
  itemId: { type: String, required: true, unique: true },
  item: String,
  itemName: String,
  sku: { type: String, trim: true, uppercase: true },
  description: String, categoryId: { type: String, index: true }, subcategory: String,
  brand: String, model: String, imageRef: String,
  itemType: { type: String, enum: ['asset','consumable','rental','equipment','furniture','electronic','other'], default: 'equipment' },
  ownership: { type: String, enum: ['owned','rented','borrowed','sponsored'], default: 'owned' },
  trackingType: { type: String, enum: ['quantity','individual'], default: 'quantity' },
  criticality: { type: String, enum: ['low','medium','high','critical'], default: 'medium' },
  unit: { type: String, default: 'unit' },
  quantity: Number,
  location: String,
  condition: String,
  reorderThreshold: { type: Number, min: 0, default: 0 }, minimumStock: { type: Number, min: 0, default: 0 }, maximumStock: { type: Number, min: 0 },
  unitPurchaseCost: { type: Number, min: 0, default: 0 }, replacementCost: { type: Number, min: 0, default: 0 }, currentBookValue: { type: Number, min: 0 },
  currentCustodian: String, operationalStatus: { type: String, default: 'available' },
  procurementDate: Date, warrantyExpiry: Date, maintenanceDueAt: Date, lastAuditAt: Date,
  notes: String, createdBy: String, updatedBy: String,
}, { timestamps: true });
inventoryLineSchema.index({ item: 1, sku: 1, categoryId: 1 });
inventoryLineSchema.index({ sku: 1 }, { unique: true, sparse: true });

const stockBalanceSchema = new Schema({
  item: String,
  location: String,
  state: { type: String, enum: ['available', 'reserved', 'in_transit', 'needs_check', 'damaged', 'missing', 'maintenance', 'issued', 'awaiting_return'] },
  qty: { type: Number, min: 0 },
});
stockBalanceSchema.index({ item: 1, location: 1, state: 1 }, { unique: true });

const stockMovementSchema = new Schema({
  movementId: { type: String, unique: true, sparse: true },
  item: String,
  itemId: String, assetId: String,
  qty: Number,
  from: { location: String, state: String },
  to: { location: String, state: String },
  by: String,
  reason: String,
  movementType: { type: String, enum: ['purchase_received','transfer_out','transfer_in','reservation','release','dispatch','return','damaged','missing','recovered','adjustment','disposal','maintenance'] },
  relatedRequestId: String, relatedDispatchId: String, relatedReturnId: String,
  approvedBy: String, notes: String,
  disruptionId: String,
  at: { type: Date, default: Date.now },
});
stockMovementSchema.index({ itemId: 1, at: -1 });

const categorySchema = new Schema({ categoryId:{type:String,required:true,unique:true},name:{type:String,required:true},description:String,parentCategoryId:String,defaultUnit:{type:String,default:'unit'},trackingType:{type:String,enum:['individual','quantity'],default:'quantity'},reorderThreshold:{type:Number,min:0,default:0},criticality:{type:String,enum:['low','medium','high','critical'],default:'medium'},active:{type:Boolean,default:true} },{timestamps:true});
const assetSchema = new Schema({ assetId:{type:String,required:true,unique:true},itemId:{type:String,required:true,index:true},assetTag:{type:String,required:true,unique:true},serialNumber:String,qrCode:{type:String,unique:true,sparse:true},barcode:{type:String,unique:true,sparse:true},purchaseValue:{type:Number,min:0,default:0},currentValue:{type:Number,min:0},condition:{type:String,enum:['new','excellent','good','fair','damaged','unusable'],default:'good'},locationId:String,custodianStaffId:String,status:{type:String,enum:['available','reserved','issued','maintenance','damaged','missing','retired','inactive'],default:'available'},warrantyExpiry:Date,lastInspection:Date,nextMaintenanceDate:Date,notes:String,maintenanceHistory:[{maintenanceId:String,completedAt:Date,result:String,cost:Number,_id:false}]},{timestamps:true});
assetSchema.index({itemId:1,status:1,locationId:1});
const locationSchema = new Schema({locationId:{type:String,required:true,unique:true},name:{type:String,required:true},locationType:{type:String,enum:['main_warehouse','secondary_warehouse','venue_storage','department_storage','temporary_storage','checkout_desk','external_storage','other'],default:'other'},parentLocationId:String,building:String,floor:String,room:String,address:String,coordinates:{lat:Number,lng:Number},responsibleStaffId:String,capacity:Number,status:{type:String,enum:['active','inactive','closed','maintenance'],default:'active'},notes:String},{timestamps:true});
const requestLineSchema = new Schema({itemId:String,requestedQty:{type:Number,min:1,required:true},approvedQty:{type:Number,min:0,default:0},assetIds:[String],_id:false});
const resourceRequestSchema = new Schema({requestId:{type:String,required:true,unique:true},departmentId:String,eventId:String,venueId:String,requestedByStaffId:String,lines:[requestLineSchema],requiredAt:Date,returnDeadline:Date,priority:{type:String,enum:['low','normal','high','critical'],default:'normal'},justification:String,specialInstructions:String,status:{type:String,enum:['draft','submitted','under_review','approved','partially_approved','rejected','reserved','dispatched','partially_fulfilled','fulfilled','cancelled','completed'],default:'draft',index:true},approvedBy:String,rejectionReason:String,reservationIds:[String],emergency:{type:Boolean,default:false}},{timestamps:true});
resourceRequestSchema.index({eventId:1,status:1,requiredAt:1});
const reservationSchema = new Schema({reservationId:{type:String,required:true,unique:true},requestId:String,itemId:String,assetIds:[String],locationId:String,quantity:{type:Number,min:1,required:true},startAt:Date,endAt:Date,status:{type:String,enum:['active','dispatched','cancelled','expired','completed'],default:'active',index:true},createdBy:String,approvedBy:String,reason:String,emergency:{type:Boolean,default:false}},{timestamps:true});
reservationSchema.index({itemId:1,locationId:1,status:1,startAt:1,endAt:1});
const dispatchSchema = new Schema({dispatchId:{type:String,required:true,unique:true},requestId:String,reservationId:String,itemId:String,assetIds:[String],quantity:{type:Number,min:1},sourceLocationId:String,destinationLocationId:String,eventId:String,venueId:String,custodianStaffId:String,issuedTo:String,issuedBy:String,dispatchedAt:{type:Date,default:Date.now},expectedReturnAt:Date,actualReturnAt:Date,conditionBefore:String,notes:String,status:{type:String,enum:['dispatched','partially_returned','returned','overdue','closed'],default:'dispatched',index:true},returnedQty:{type:Number,min:0,default:0},reconciledQty:{type:Number,min:0,default:0},missingQty:{type:Number,min:0,default:0}},{timestamps:true});
dispatchSchema.index({eventId:1,status:1,expectedReturnAt:1});
const returnSchema = new Schema({returnId:{type:String,required:true,unique:true},dispatchId:{type:String,required:true,index:true},itemId:String,assetIds:[String],expectedQty:Number,returnedQty:Number,missingQty:{type:Number,default:0},damagedQty:{type:Number,default:0},conditionAfter:String,returnedBy:String,receivedBy:String,returnedAt:{type:Date,default:Date.now},inspectionStatus:{type:String,enum:['pending','verified','disputed'],default:'pending'},inspectionNotes:String,damageIncidentId:String,lossIncidentId:String},{timestamps:true});
const incidentSchema = new Schema({incidentId:{type:String,required:true,unique:true},incidentType:{type:String,enum:['damage','missing','loss','theft','malfunction','unusable'],required:true},itemId:String,assetId:String,dispatchId:String,eventId:String,venueId:String,reportedBy:String,reportedAt:{type:Date,default:Date.now},description:String,evidenceRefs:[String],severity:{type:String,enum:['low','medium','high','critical'],default:'medium'},estimatedCost:Number,assignedTo:String,status:{type:String,enum:['open','investigating','maintenance','resolved','written_off'],default:'open',index:true},resolution:String,resolvedBy:String,resolvedAt:Date},{timestamps:true});
const maintenanceSchema = new Schema({maintenanceId:{type:String,required:true,unique:true},assetId:String,itemId:String,taskType:{type:String,enum:['preventive','corrective','inspection','repair','testing','calibration','replacement'],default:'inspection'},description:String,priority:{type:String,enum:['low','normal','high','critical'],default:'normal'},assignedTo:String,startAt:Date,dueAt:Date,completedAt:Date,cost:{type:Number,min:0,default:0},spareParts:[{itemId:String,quantity:Number,_id:false}],status:{type:String,enum:['scheduled','in_progress','completed','cancelled','overdue'],default:'scheduled',index:true},inspectionResult:String,nextMaintenanceDate:Date,notes:String},{timestamps:true});
const transferSchema = new Schema({transferId:{type:String,required:true,unique:true},itemId:String,assetIds:[String],quantity:{type:Number,min:1},fromLocationId:String,toLocationId:String,status:{type:String,enum:['pending','approved','in_transit','received','cancelled','disputed'],default:'pending',index:true},requestedBy:String,approvedBy:String,receivedBy:String,receivedQty:Number,discrepancy:String,reason:String,requestedAt:{type:Date,default:Date.now},receivedAt:Date},{timestamps:true});
const poLineSchema = new Schema({itemId:String,quantity:{type:Number,min:1},receivedQty:{type:Number,min:0,default:0},unitPrice:{type:Number,min:0},_id:false});
const purchaseOrderSchema = new Schema({poNumber:{type:String,required:true,unique:true},supplierId:String,lines:[poLineSchema],tax:Number,totalCost:Number,deliveryLocationId:String,expectedDeliveryAt:Date,requestedBy:String,approvedBy:String,approvalStatus:{type:String,enum:['pending','approved','rejected'],default:'pending'},status:{type:String,enum:['open','partial','received','cancelled'],default:'open'},paymentStatus:String,notes:String},{timestamps:true});
const goodsReceiptSchema = new Schema({receiptId:{type:String,required:true,unique:true},poNumber:{type:String,required:true,index:true},lines:[{itemId:String,expectedQty:Number,actualQty:Number,damagedQty:Number,rejectedQty:Number,_id:false}],receivedBy:String,receivedAt:{type:Date,default:Date.now},inspectionStatus:String,discrepancyNotes:String,idempotencyKey:{type:String,unique:true,sparse:true}},{timestamps:true});
const inventoryAuditSchema = new Schema({auditId:{type:String,required:true,unique:true},locationId:String,categoryId:String,status:{type:String,enum:['draft','counting','submitted','approved','cancelled'],default:'draft',index:true},createdBy:String,submittedBy:String,approvedBy:String,reason:String,submittedAt:Date,approvedAt:Date},{timestamps:true});
const auditCountSchema = new Schema({auditId:{type:String,required:true,index:true},itemId:String,assetId:String,expectedQty:Number,countedQty:Number,damagedQty:Number,missingQty:Number,notes:String},{timestamps:true});
const reorderSchema = new Schema({suggestionId:{type:String,required:true,unique:true},itemId:String,locationId:String,usableQty:Number,reservedQty:Number,futureDemand:Number,pendingPurchaseQty:Number,reorderThreshold:Number,suggestedQty:Number,status:{type:String,enum:['open','approved','dismissed','ordered'],default:'open'},approvedBy:String,purchaseOrder:String},{timestamps:true});
const disruptionSchema = new Schema({disruptionId:{type:String,required:true,unique:true},type:String,params:Schema.Types.Mixed,status:{type:String,enum:['previewed','approved','executed','cancelled'],default:'previewed'},preview:Schema.Types.Mixed,result:Schema.Types.Mixed,createdBy:String,approvedBy:String,executedBy:String,reason:String},{timestamps:true});

const merchStockSchema = new Schema({
  item: String,
  size: { type: String, default: '-' },
  quantity: Number,
  reserved: Number,
  issued: { type: Number, default: 0 },
});
merchStockSchema.index({ item: 1, size: 1 }, { unique: true });

const merchCatalogSchema = new Schema({
  item: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  eligibility: { type: String, enum: ['participants', 'everyone'], default: 'participants' },
  sizes: { type: [String], default: [] },
  active: { type: Boolean, default: true },
}, { timestamps: true });

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
  returnedAt: { type: Date, default: null },
  returnReason: { type: String, default: null },
});
// The duplicate-claim guard: one original issue per person per item, enforced by the database.
merchIssueSchema.index({ participantId: 1, item: 1 }, { unique: true, partialFilterExpression: { kind: 'original' } });

export const InventoryLine = model('InventoryLine', inventoryLineSchema);
export const InventoryItem = InventoryLine;
export const StockBalance = model('StockBalance', stockBalanceSchema);
export const StockMovement = model('StockMovement', stockMovementSchema);
export const InventoryCategory = model('InventoryCategory', categorySchema);
export const Asset = model('Asset', assetSchema);
export const Location = model('Location', locationSchema);
export const ResourceRequest = model('ResourceRequest', resourceRequestSchema);
export const Reservation = model('Reservation', reservationSchema);
export const Dispatch = model('Dispatch', dispatchSchema);
export const ReturnRecord = model('ReturnRecord', returnSchema);
export const DamageLossIncident = model('DamageLossIncident', incidentSchema);
export const MaintenanceTask = model('MaintenanceTask', maintenanceSchema);
export const StockTransfer = model('StockTransfer', transferSchema);
export const PurchaseOrder = model('PurchaseOrder', purchaseOrderSchema);
export const GoodsReceipt = model('GoodsReceipt', goodsReceiptSchema);
export const InventoryAudit = model('InventoryAudit', inventoryAuditSchema);
export const InventoryAuditCount = model('InventoryAuditCount', auditCountSchema);
export const ReorderSuggestion = model('ReorderSuggestion', reorderSchema);
export const LogisticsDisruption = model('LogisticsDisruption', disruptionSchema);
export const MerchStock = model('MerchStock', merchStockSchema);
export const MerchCatalog = model('MerchCatalog', merchCatalogSchema);
export const MerchIssue = model('MerchIssue', merchIssueSchema);
