"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricingOverlayStatus = exports.PricingOverlayType = exports.UnitType = exports.BarcodeType = exports.VendorType = exports.StockTransferStatus = exports.UnitOfMeasure = exports.DamageClassification = exports.SyncStatus = exports.UserRole = exports.PRNStatus = exports.GRNStatus = exports.InventoryEventType = exports.InventoryState = void 0;
var InventoryState;
(function (InventoryState) {
    InventoryState["UnopenedBox"] = "UnopenedBox";
    InventoryState["Uninspected"] = "Uninspected";
    InventoryState["Inspected"] = "Inspected";
    InventoryState["ShelfReady"] = "ShelfReady";
    InventoryState["Damaged"] = "Damaged";
    InventoryState["Returned"] = "Returned";
    InventoryState["Reserved"] = "Reserved";
    InventoryState["Sold"] = "Sold";
})(InventoryState || (exports.InventoryState = InventoryState = {}));
var InventoryEventType;
(function (InventoryEventType) {
    InventoryEventType["GRN_CREATED"] = "GRN_CREATED";
    InventoryEventType["PRN_CREATED"] = "PRN_CREATED";
    InventoryEventType["BOX_OPENED"] = "BOX_OPENED";
    InventoryEventType["INSPECTION_APPROVED"] = "INSPECTION_APPROVED";
    InventoryEventType["LOCATION_TRANSFER"] = "LOCATION_TRANSFER";
    InventoryEventType["STATE_CHANGE"] = "STATE_CHANGE";
    InventoryEventType["SALE_DEDUCTED"] = "SALE_DEDUCTED";
    InventoryEventType["RETURN_RECEIVED"] = "RETURN_RECEIVED";
    InventoryEventType["MANUAL_ADJUSTMENT"] = "MANUAL_ADJUSTMENT";
    InventoryEventType["DAMAGE_RECORDED"] = "DAMAGE_RECORDED";
})(InventoryEventType || (exports.InventoryEventType = InventoryEventType = {}));
var GRNStatus;
(function (GRNStatus) {
    GRNStatus["Draft"] = "Draft";
    GRNStatus["Submitted"] = "Submitted";
    GRNStatus["PartiallyInspected"] = "PartiallyInspected";
    GRNStatus["FullyInspected"] = "FullyInspected";
    GRNStatus["Closed"] = "Closed";
})(GRNStatus || (exports.GRNStatus = GRNStatus = {}));
var PRNStatus;
(function (PRNStatus) {
    PRNStatus["Draft"] = "Draft";
    PRNStatus["Submitted"] = "Submitted";
    PRNStatus["PickedUp"] = "PickedUp";
    PRNStatus["Closed"] = "Closed";
})(PRNStatus || (exports.PRNStatus = PRNStatus = {}));
var UserRole;
(function (UserRole) {
    UserRole["Admin"] = "Admin";
    UserRole["Manager"] = "Manager";
    UserRole["Staff"] = "Staff";
    UserRole["Inspector"] = "Inspector";
    UserRole["Vendor"] = "Vendor";
})(UserRole || (exports.UserRole = UserRole = {}));
var SyncStatus;
(function (SyncStatus) {
    SyncStatus["Pending"] = "Pending";
    SyncStatus["Processed"] = "Processed";
    SyncStatus["Failed"] = "Failed";
    SyncStatus["Conflict"] = "Conflict";
})(SyncStatus || (exports.SyncStatus = SyncStatus = {}));
var DamageClassification;
(function (DamageClassification) {
    DamageClassification["Minor"] = "Minor";
    DamageClassification["Major"] = "Major";
    DamageClassification["Totaled"] = "Totaled";
})(DamageClassification || (exports.DamageClassification = DamageClassification = {}));
var UnitOfMeasure;
(function (UnitOfMeasure) {
    UnitOfMeasure["Piece"] = "Piece";
    UnitOfMeasure["Box"] = "Box";
    UnitOfMeasure["Pack"] = "Pack";
    UnitOfMeasure["Liter"] = "Liter";
    UnitOfMeasure["Milliliter"] = "Milliliter";
    UnitOfMeasure["Kilogram"] = "Kilogram";
    UnitOfMeasure["Gram"] = "Gram";
    UnitOfMeasure["Meter"] = "Meter";
    UnitOfMeasure["Centimeter"] = "Centimeter";
})(UnitOfMeasure || (exports.UnitOfMeasure = UnitOfMeasure = {}));
var StockTransferStatus;
(function (StockTransferStatus) {
    StockTransferStatus["Draft"] = "Draft";
    StockTransferStatus["Pending"] = "Pending";
    StockTransferStatus["Approved"] = "Approved";
    StockTransferStatus["InTransit"] = "InTransit";
    StockTransferStatus["Completed"] = "Completed";
    StockTransferStatus["Cancelled"] = "Cancelled";
})(StockTransferStatus || (exports.StockTransferStatus = StockTransferStatus = {}));
var VendorType;
(function (VendorType) {
    VendorType["Vendor"] = "Vendor";
    VendorType["Supplier"] = "Supplier";
    VendorType["Both"] = "Both";
})(VendorType || (exports.VendorType = VendorType = {}));
var BarcodeType;
(function (BarcodeType) {
    BarcodeType["EAN13"] = "EAN13";
    BarcodeType["UPC"] = "UPC";
    BarcodeType["QRCode"] = "QRCode";
    BarcodeType["Code128"] = "Code128";
    BarcodeType["Code39"] = "Code39";
    BarcodeType["Custom"] = "Custom";
})(BarcodeType || (exports.BarcodeType = BarcodeType = {}));
var UnitType;
(function (UnitType) {
    UnitType["Weight"] = "Weight";
    UnitType["Volume"] = "Volume";
    UnitType["Length"] = "Length";
    UnitType["Count"] = "Count";
    UnitType["Area"] = "Area";
    UnitType["Other"] = "Other";
})(UnitType || (exports.UnitType = UnitType = {}));
var PricingOverlayType;
(function (PricingOverlayType) {
    PricingOverlayType["PercentageDiscount"] = "percentage_discount";
    PricingOverlayType["FixedDiscount"] = "fixed_discount";
    PricingOverlayType["PercentageMarkup"] = "percentage_markup";
    PricingOverlayType["FixedMarkup"] = "fixed_markup";
})(PricingOverlayType || (exports.PricingOverlayType = PricingOverlayType = {}));
var PricingOverlayStatus;
(function (PricingOverlayStatus) {
    PricingOverlayStatus["Active"] = "active";
    PricingOverlayStatus["Inactive"] = "inactive";
    PricingOverlayStatus["Scheduled"] = "scheduled";
    PricingOverlayStatus["Expired"] = "expired";
})(PricingOverlayStatus || (exports.PricingOverlayStatus = PricingOverlayStatus = {}));
