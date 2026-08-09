import type { HelpSection } from './helpTypes';

/**
 * In-app user documentation. Each section documents one page of the app and
 * the actions that can be taken on it. Screenshots live in public/docs/ and
 * are captured with scripts/capture-docs-screenshots.mjs.
 */
export const HELP_SECTIONS: HelpSection[] = [
	// ───────────────────────────── Getting Started ─────────────────────────────
	{
		id: 'login',
		title: 'Signing In',
		group: 'Getting Started',
		route: '/login',
		intro:
			'Sign in with the email address and password provided by your administrator. Your account role (Admin, Manager, Staff, Inspector, or Vendor) determines which pages and actions are available to you.',
		screenshot: 'login.png',
		actions: [
			{
				title: 'Sign in',
				steps: [
					'Enter your email address.',
					'Enter your password.',
					'Click "Sign In". On success you land on the Dashboard.',
				],
			},
			{
				title: 'Switch between light and dark mode',
				steps: [
					'Click the sun/moon icon in the corner of the login screen (or in the top bar once signed in).',
					'Your preference is saved and persists across sessions.',
				],
			},
		],
		tips: ['If your password is rejected, ask an Admin to reset it from the Users page.'],
	},
	{
		id: 'navigation',
		title: 'Finding Your Way Around',
		group: 'Getting Started',
		route: '/dashboard',
		intro:
			'The sidebar on the left groups every page into Workspace, Operations, Catalog, Locations, and Tools. The top bar gives you quick search, theme, notifications, and help.',
		screenshot: 'navigation.png',
		actions: [
			{
				title: 'Jump anywhere with the command palette',
				steps: [
					'Press Ctrl+K (or click the search bar in the top bar).',
					'Type the name of a page, e.g. "Reports".',
					'Press Enter to navigate there.',
				],
			},
			{
				title: 'Open this help section',
				steps: [
					'Click the "?" icon in the top bar, or choose "Help & Docs" in the sidebar under Tools.',
				],
			},
		],
	},

	// ─────────────────────────────── Workspace ────────────────────────────────
	{
		id: 'dashboard',
		title: 'Dashboard',
		group: 'Workspace',
		route: '/dashboard',
		intro:
			'The Dashboard shows live warehouse health: total items, shelf-ready stock, open GRNs, damaged stock, and the distribution of inventory across states.',
		screenshot: 'dashboard.png',
		actions: [
			{
				title: 'Refresh the metrics',
				steps: [
					'Click "Refresh" in the page header. The stats are recalculated and reloaded.',
				],
			},
			{
				title: 'Act on the AI insight',
				steps: [
					'Read the insight card at the top — it highlights what needs attention (e.g. open GRNs).',
					'Use "Review GRNs" or "Open inventory" to jump straight to the relevant page.',
				],
			},
			{
				title: 'Open reports',
				steps: ['Click "View Reports" in the page header to open the report workbench.'],
			},
		],
	},
	{
		id: 'inventory',
		title: 'Inventory',
		group: 'Workspace',
		route: '/inventory',
		intro:
			'Track every inventory record: which product it is, how much, where it sits (branch → floor → rack → shelf → box), which batch it belongs to, and what state it is in (Uninspected, Shelf Ready, Damaged, Returned, …).',
		screenshot: 'inventory.png',
		actions: [
			{
				title: 'Create an inventory record',
				steps: [
					'Click "+ New Record".',
					'Select the Product (required) and a Variant if the product has them.',
					'Enter the Quantity — the quick buttons (+1, +10, +100, …) help with common amounts.',
					'Pick the State (defaults to Uninspected) and optionally Floor, Shelf, Box, and Batch.',
					'Click "Create Record".',
				],
			},
			{
				title: 'Move or correct a record',
				steps: [
					'Click "Edit" on the record.',
					'Change the Floor / Shelf / Box, Quantity, or Batch.',
					'Click "Save Changes". (The state cannot be edited here — use Transition.)',
				],
			},
			{
				title: 'Transition a record to another state',
				steps: [
					'Click "Transition" on the record.',
					'Choose the target state — allowed transitions are marked ✅, role overrides ⚠️.',
					'Optionally enter a reason.',
					'Click "Apply Transition".',
				],
			},
			{
				title: 'Filter the list',
				steps: [
					'Use the search box ("Search by SKU or name...") or the State / Product / Branch / Floor / Rack / Shelf dropdowns.',
					'Location filters cascade: pick a Branch to unlock Floors, a Floor to unlock Racks, and so on.',
					'Click "✕ Clear filters" to reset.',
				],
			},
		],
	},
	{
		id: 'products',
		title: 'Products (SKUs)',
		group: 'Workspace',
		route: '/skus',
		intro:
			'The product master file. Each SKU carries its code, name, category, vendors, unit of measure, pricing, barcodes, images, tags, and variants. A Duplicates tab helps you find and merge accidental duplicates.',
		screenshot: 'products.png',
		actions: [
			{
				title: 'Create a product',
				steps: [
					'Click "+ New SKU".',
					'On the Details tab fill SKU Code, Name, Description, Category, Vendor(s), and Unit of Measure.',
					'Enter pricing (Cost, Selling, Wholesale, Bulk) and optionally a margin rule.',
					'Use the Barcodes, Images, and Tags tabs to enrich the product.',
					'Click "Create SKU".',
				],
			},
			{
				title: 'Manage variants',
				steps: [
					'Open a SKU and go to the Variants tab.',
					'Pick the attributes that vary (e.g. Size, Color — defined under Settings → Product Attributes).',
					'Create the variant combinations; each variant gets its own code and can carry its own pricing.',
				],
			},
			{
				title: 'Find and merge duplicates',
				steps: [
					'Switch to the "Duplicates" tab to see suspected duplicate products.',
					'Review each group and merge the duplicates into the product you want to keep.',
				],
			},
		],
		tips: [
			'Expand a row with the arrow to see its variants inline.',
			'Tags and categories power the filters on the Inventory and Reports pages — consistent tagging pays off.',
		],
	},

	// ─────────────────────────────── Operations ───────────────────────────────
	{
		id: 'grns',
		title: 'GRNs — Receiving Goods',
		group: 'Operations',
		route: '/grns',
		intro:
			'A Goods Receipt Note (GRN) records an incoming delivery from a supplier. GRNs move through Draft → Submitted → Partially Inspected → Fully Inspected → Closed.',
		screenshot: 'grns.png',
		actions: [
			{
				title: 'Create a GRN',
				steps: [
					'Click "+ New GRN".',
					'Select the Supplier (required), and optionally Invoice Reference, Expected Delivery Date, and Notes.',
					'Pick the receive location (Floor, then Shelf).',
					'Add line items: select the Product, enter the Expected Quantity, choose a Variant if needed.',
					'For each line choose "Use Existing Batch" or create a new batch, and fill in batch pricing.',
					'Use "+ Add Line" for more items, and "💰 Bulk Pricing" to price many lines at once.',
					'Click "Create GRN".',
				],
			},
			{
				title: 'Edit a draft GRN',
				steps: [
					'Only Draft GRNs can be edited — click "Edit" on the row.',
					'Adjust the details and click "💾 Save Changes".',
				],
			},
			{
				title: 'Filter the list',
				steps: [
					'Search by invoice reference or supplier, or filter by Status, Supplier, Branch, Floor, and created date range.',
				],
			},
		],
	},
	{
		id: 'grn-detail',
		title: 'GRN Detail — Submit & Inspect',
		group: 'Operations',
		route: '/grns',
		intro:
			'Open a GRN with "View" to submit it, inspect each line, and raise a purchase return for rejected goods. Clicking a row in the GRN report also lands here.',
		screenshot: 'grn-detail.png',
		actions: [
			{
				title: 'Submit a GRN',
				steps: [
					'Make sure a shelf is assigned (a warning appears if not).',
					'Click "📤 Submit GRN" and confirm.',
					'Uninspected inventory records are created for every line.',
				],
			},
			{
				title: 'Inspect a line',
				steps: [
					'Click "🔍 Inspect" on a line.',
					'Enter the Approved and Rejected quantities, pick a Damage Classification if anything was rejected, and add remarks.',
					'Click "Save Inspection". The GRN status advances automatically as lines are inspected.',
				],
			},
			{
				title: 'Create a PRN for damaged goods',
				steps: [
					'After inspections with rejections, click "↩️ Create PRN (n damaged)".',
					'You land on the PRN page with supplier, lines, quantities, and return location pre-filled.',
					'Review and click "Create PRN".',
				],
			},
		],
	},
	{
		id: 'prns',
		title: 'PRNs — Returning Goods',
		group: 'Operations',
		route: '/prns',
		intro:
			'A Purchase Return Note (PRN) records goods going back to a supplier. PRNs move through Draft → Submitted → Picked Up → Closed.',
		screenshot: 'prns.png',
		actions: [
			{
				title: 'Create a PRN',
				steps: [
					'Click "+ New PRN".',
					'Select the Supplier (required), enter a Return Reason and Expected Pickup Date.',
					'Pick the return location (Floor, then Shelf).',
					'Add lines: Product, Return Quantity, optional Variant and Batch.',
					'Click "Create PRN".',
				],
			},
			{
				title: 'Submit and hand over',
				steps: [
					'Open the PRN with "View".',
					'Click "📤 Submit PRN" — Damaged inventory at the assigned shelf becomes Returned.',
					'When the supplier collects the goods, click "🚚 Mark Picked Up".',
				],
			},
		],
		tips: ['PRNs created from a GRN inspection keep a link back to the source GRN on the detail page.'],
	},
	{
		id: 'stock-transfers',
		title: 'Stock Transfers',
		group: 'Operations',
		route: '/stock-transfers',
		intro:
			'Move stock between branches and locations. Transfers progress Draft → Approved → Completed, and can be cancelled at any point before completion.',
		screenshot: 'stock-transfers.png',
		actions: [
			{
				title: 'Create a transfer',
				steps: [
					'Click "+ New Transfer".',
					'Select the From Branch and To Branch (required), and optionally specific locations.',
					'Add transfer lines: SKU, quantity, and optional Variant / Batch / notes.',
					'Click "Create Transfer".',
				],
			},
			{
				title: 'Approve, complete, or cancel',
				steps: [
					'Click "Approve" on a Draft transfer to approve it.',
					'Click "Complete" on an Approved transfer once the goods have moved.',
					'Click "Cancel" on any transfer that is not yet Completed or Cancelled.',
				],
			},
		],
	},
	{
		id: 'pricing-overlays',
		title: 'Pricing Overlays',
		group: 'Operations',
		route: '/pricing-overlays',
		intro:
			'Overlays are dynamic pricing rules — percentage or fixed discounts and markups — that apply to all products, specific SKUs, variants, batches, or categories, optionally limited by quantity, customer type, or date range.',
		screenshot: 'pricing-overlays.png',
		actions: [
			{
				title: 'Create an overlay',
				steps: [
					'Click "Create Overlay" and name the rule.',
					'Choose the adjustment Type (Percentage/Fixed, Discount/Markup) and Value.',
					'Set the Priority (higher applies first) and whether it can stack with other overlays.',
					'Under "Applies To", choose the target: All Products, or specific SKUs / Variants / Batches / Categories.',
					'Optionally add activation conditions (min/max quantity, customer type, date range).',
					'Click "Create Overlay".',
				],
			},
			{
				title: 'Check rule conflicts',
				steps: [
					'Click "Conflicts" on an overlay to list rules with the same priority that target the same products but cannot stack.',
					'Adjust priorities or stacking to resolve.',
				],
			},
		],
	},
	{
		id: 'batch-pricing',
		title: 'Batch Pricing',
		group: 'Operations',
		route: '/pricing',
		intro:
			'Manage cost, selling, wholesale, and bulk prices per batch, apply margin rules, and bulk-update prices across many batches at once.',
		screenshot: 'batch-pricing.png',
		actions: [
			{
				title: 'Edit one batch',
				steps: [
					'Click "Edit" on the batch.',
					'Update the price fields, optionally configure a Margin Type and Value.',
					'Click "Save Changes".',
				],
			},
			{
				title: 'Bulk update prices',
				steps: [
					'Tick the checkboxes of the batches to change.',
					'Click "Bulk Update Pricing".',
					'Choose the price field, the operation (set / increase by amount / increase by %), and the value.',
					'Click "Apply to X Batches".',
				],
			},
			{
				title: 'See the effective price with overlays',
				steps: ['Click the 🎯 icon on a row to expand it and see the price after pricing overlays are applied.'],
			},
		],
	},

	// ──────────────────────────────── Catalog ─────────────────────────────────
	{
		id: 'categories',
		title: 'Categories',
		group: 'Catalog',
		route: '/categories',
		intro:
			'Organize products into a two-level hierarchy of categories and sub-categories. Categories appear as filters on products, inventory, and reports.',
		screenshot: 'categories.png',
		actions: [
			{
				title: 'Create a category or sub-category',
				steps: [
					'Click "+ New Category".',
					'Enter the Name — the Slug fills in automatically.',
					'To make it a sub-category, pick a Parent Category.',
					'Set a Sort Order and optional Description, then click "Create Category".',
				],
			},
			{
				title: 'Edit or delete',
				steps: ['Use "Edit" or "Delete" on the row. Deleting asks for confirmation.'],
			},
		],
	},
	{
		id: 'tags',
		title: 'Tags',
		group: 'Catalog',
		route: '/tags',
		roles: ['Admin', 'Manager'],
		intro:
			'Tags are free-form, color-coded labels for products. Use them for anything that does not fit the category tree — seasonal ranges, promotions, quality flags.',
		screenshot: 'tags.png',
		actions: [
			{
				title: 'Create a tag',
				steps: [
					'Click "+ Create Tag".',
					'Enter a Name and optionally pick a color.',
					'Click "Create". Apply tags to products from the SKU editor\'s Tags tab.',
				],
			},
			{
				title: 'Delete a tag',
				steps: ['Click "Delete" and confirm — the tag is removed from all products.'],
			},
		],
	},
	{
		id: 'suppliers',
		title: 'Suppliers',
		group: 'Catalog',
		route: '/suppliers',
		intro:
			'Manage supplier contacts and payment terms. The Possible Duplicates tab finds supplier records that look like the same company and lets you merge them safely.',
		screenshot: 'suppliers.png',
		actions: [
			{
				title: 'Create a supplier',
				steps: [
					'Click "+ New Supplier".',
					'Enter the Name (autocomplete warns about similar existing suppliers), Type, and Email.',
					'Optionally add Phone, Address, Website, Tax ID, Payment Terms, and Notes.',
					'Click "Create Supplier".',
				],
			},
			{
				title: 'Merge duplicates',
				steps: [
					'Open the "Possible Duplicates" tab (or click "Rescan").',
					'Click "Merge" on a suggested duplicate and confirm — GRNs, PRNs, and products are reassigned automatically.',
					'For manual merges: tick several suppliers in the main list, pick which one to keep, and click "Merge X Into Target".',
				],
			},
			{
				title: 'Disable a supplier',
				steps: ['Click "Disable" on the row — the supplier is hidden from new documents but history is kept.'],
			},
		],
	},

	// ─────────────────────────────── Locations ────────────────────────────────
	{
		id: 'branches',
		title: 'Branches & Storage',
		group: 'Locations',
		route: '/branches',
		intro:
			'Define your physical structure: Branches contain Storage Zones (floors), which hold Racks, which hold Shelf Levels, which hold Boxes. Boxes can also sit directly on a floor. Drill down by clicking the arrows on each row.',
		screenshot: 'branches.png',
		actions: [
			{
				title: 'Build the hierarchy',
				steps: [
					'Click "+ New Branch" and give it a Name and Code.',
					'Open the branch ("Storage Zones →") and click "+ New Storage Zone" for each floor.',
					'Open a zone ("Racks & Boxes →") and add racks with "+ New Rack" (dimensions in cm).',
					'Open a rack ("Shelves →") and add shelf levels — clearance height, width, depth, and flags for ❄️ freezer or 🔒 lock.',
					'Open a shelf ("Boxes →") and add boxes, or use "+ Box on Floor" at zone level.',
				],
			},
			{
				title: 'Navigate back',
				steps: ['Use "← Back" or click any level in the breadcrumb at the top.'],
			},
		],
		tips: ['Dimensions you enter here drive the Warehouse 3D view and the storage space calculations.'],
	},
	{
		id: 'warehouse-3d',
		title: 'Warehouse 3D',
		group: 'Locations',
		route: '/warehouse-3d',
		intro:
			'An interactive 3D view of your storage layout. Walk through a floor, inspect racks and boxes, and reposition racks — positions are saved automatically.',
		actions: [
			{
				title: 'Move around',
				steps: [
					'Use WASD to move, Q/E to go down/up, and drag with the left mouse button to look around.',
					'Right-click-drag (or Alt+drag) pans; the scroll wheel zooms.',
					'Pick the floor from the "Zone:" dropdown, or click "🏢 All Floors" for an overview.',
				],
			},
			{
				title: 'Reposition a rack',
				steps: [
					'Click a rack to select it (it highlights in gold).',
					'Use the ▲ ▼ ◄ ► buttons (or arrow keys) to move it, ↺/↻ to rotate in 45° steps.',
					'The new position is saved to the database automatically; press Escape to deselect.',
				],
			},
		],
	},

	// ───────────────────────────────── Tools ──────────────────────────────────
	{
		id: 'ai-imports',
		title: 'AI Imports',
		group: 'Tools',
		route: '/imports',
		roles: ['Admin', 'Manager', 'Staff'],
		intro:
			'Upload a source document — CSV, Excel, JSON, PDF, or even a photo of an invoice — and the AI maps it into GRNs, PRNs, Products, Inventory, or Suppliers. Nothing touches the database until you approve the preview.',
		screenshot: 'ai-imports.png',
		actions: [
			{
				title: 'Run an import',
				steps: [
					'Choose the Import Type (GRNs, PRNs, Products, Inventory, or Suppliers).',
					'Select your file and click "Upload And Map".',
					'Wait while the AI maps the document — the page updates automatically.',
				],
			},
			{
				title: 'Review and approve',
				steps: [
					'Click any preview row to see the extracted fields, related records affected, and any warnings.',
					'Tick the records you want (or use "Select Filtered" / "Select Page").',
					'Click "Approve Selected" to apply them, or "Reject Selected" to discard.',
				],
			},
			{
				title: 'Find problem records',
				steps: ['Filter by status (Pending, Approved, Rejected, Failed, Omitted) or search the preview summaries.'],
			},
		],
		tips: ['Large imports are applied in the background in small chunks — the counters update as records land.'],
	},
	{
		id: 'spreadsheet',
		title: 'Spreadsheet Tools',
		group: 'Tools',
		route: '/spreadsheet',
		intro:
			'Every major entity — products, inventory, vendors, branches, categories, floors, units, tags, GRNs — can be edited like a spreadsheet with inline cells, dropdowns, and pagination.',
		screenshot: 'spreadsheet.png',
		actions: [
			{
				title: 'Open a spreadsheet',
				steps: [
					'Pick the entity card (e.g. Products) and click "Open Spreadsheet →".',
					'Click any cell to edit it in place; dropdown cells (category, vendor, tags) open a searchable picker.',
					'Changes save as you leave the cell.',
				],
			},
		],
	},
	{
		id: 'reports',
		title: 'Reports',
		group: 'Tools',
		route: '/reports',
		intro:
			'A workbench of 27 reports across Inventory, Stock, Management, and Sales. Every report has week, month, and year period tabs plus filters, pagination, and export to CSV, Excel, or a printable PDF view. The selected report is part of the page URL, so you can bookmark or share a specific report.',
		screenshot: 'reports.png',
		actions: [
			{
				title: 'Run a report',
				steps: [
					'Pick a report from the Report Library on the left.',
					'Set filters — date range, supplier, branch, floor, product, status, grouping.',
					'Click "Run Report".',
				],
			},
			{
				title: 'Drill into source documents',
				steps: [
					'In the GRN, PRN, price change, and transfer reports, click a row to open the underlying document.',
				],
			},
			{
				title: 'Export',
				steps: [
					'"Export CSV" and "Export Excel" download the current rows.',
					'"PDF View" opens a print-ready layout including the summary cards.',
				],
			},
		],
	},
	{
		id: 'users',
		title: 'Users',
		group: 'Tools',
		route: '/users',
		roles: ['Admin', 'Manager'],
		intro:
			'Create and manage accounts. Roles: Admin (everything), Manager (operations + management), Staff (day-to-day), Inspector (inspections), Vendor (sees only their own products via the Vendor Portal).',
		screenshot: 'users.png',
		actions: [
			{
				title: 'Create a user',
				steps: [
					'Click "+ Create User".',
					'Enter the Email and a Password (minimum 6 characters).',
					'Pick the Role — for Vendor accounts also pick the vendor they belong to.',
					'Click "Create".',
				],
			},
			{
				title: 'Reset a password / deactivate',
				steps: [
					'Click "Password" on the row to set a new password.',
					'Click "Deactivate" to disable sign-in without deleting history.',
				],
			},
		],
	},
	{
		id: 'settings',
		title: 'Settings',
		group: 'Tools',
		route: '/settings',
		intro:
			'System-wide configuration: units of measure, the status values used across the app, product attributes for variants, and the full-text search sync.',
		screenshot: 'settings.png',
		actions: [
			{
				title: 'Add a unit of measure',
				steps: [
					'Open Units of Measure and click "+ Add Unit".',
					'Enter Name, Abbreviation, and Type (Weight, Volume, Length, Count, Area, Other).',
					'Optionally define a base unit and conversion factor (e.g. 1000 g = 1 kg).',
				],
			},
			{
				title: 'Manage statuses',
				steps: [
					'Open Status Management and pick the entity (Inventory, GRN, Damage, …).',
					'Use "+ Add Status" / "Edit" to set the code, label, color, and sort order.',
					'Assign an Application Behaviour where the status should drive workflow (e.g. Shelf Ready).',
				],
			},
			{
				title: 'Define product attributes',
				steps: [
					'Open Product Attributes and click "+ Add Attribute" (e.g. "Color").',
					'Click "🏷️ Values" to define the allowed values used when creating variants.',
				],
			},
			{
				title: 'Sync the search index',
				steps: [
					'Open Typesense Search Sync and click "Test Connection".',
					'Click "Sync All" — the sync runs in the background in small chunks and shows live progress.',
					'"Recreate & Sync All" rebuilds the index from scratch if search results look stale.',
				],
			},
		],
	},

	// ──────────────────────────────── Desktop ─────────────────────────────────
	{
		id: 'desktop-sync',
		title: 'Desktop Sync',
		group: 'Desktop',
		route: '/desktop-sync',
		intro:
			'Available in the desktop app only. The desktop shell keeps a local replica database so you can keep working offline; this page monitors and controls synchronization with the server.',
		screenshot: 'desktop-sync.png',
		actions: [
			{
				title: 'Check sync health',
				steps: [
					'Review the metric cards: DB Size, Pending changes, Conflicts, and Last Success.',
					'"Realtime connected" means changes stream in live; "Realtime offline" means the app will catch up on the next sync.',
				],
			},
			{
				title: 'Sync manually',
				steps: [
					'Click "Sync Now" for a full two-way sync.',
					'"Manual Forward Only Sync" pushes local changes; "Manual Backward Only Sync" pulls server changes.',
				],
			},
			{
				title: 'Back up or switch the local database',
				steps: [
					'"Backup Database" saves a copy of the local file.',
					'"Switch To New File" / "Switch Existing File" / "Use Default File" change which replica file the app uses (the app relaunches).',
				],
			},
		],
	},
];

export const HELP_GROUPS = [
	'Getting Started',
	'Workspace',
	'Operations',
	'Catalog',
	'Locations',
	'Tools',
	'Desktop',
] as const;
