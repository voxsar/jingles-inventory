import { useEffect, useMemo, useRef, useState } from 'react';
import jspreadsheet from 'jspreadsheet-ce';

export type ColumnDefinition<T> = {
  key: keyof T | string;
  header: string;
  width?: string;
  readOnly?: boolean;
  getValue?: (row: T) => any;
  setValue?: (row: T, value: any) => Partial<T>;
  render?: (value: any, row: T) => string;
  options?: Array<{ value: string; label: string }>;
  validate?: (value: any) => string | null;
};

interface ReactSpreadsheetWrapperProps<T extends Record<string, any>> {
  columns: ColumnDefinition<T>[];
  data: T[];
  isLoading?: boolean;
  isLoadingMore?: boolean;
  totalRows?: number;
  hasMoreRows?: boolean;
  onSave?: (row: T, changes: Partial<T>) => Promise<void>;
  onDelete?: (row: T) => Promise<void>;
  onAdd?: (row: Partial<T>) => Promise<void>;
  onLoadMore?: () => Promise<void> | void;
  onSearchChange?: (value: string) => void;
  getRowKey: (row: T) => string;
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

type SpreadsheetCellValue = string | number | boolean;
type WorksheetInstance = ReturnType<typeof jspreadsheet>[number];
type SpreadsheetDestroyTarget = Parameters<typeof jspreadsheet.destroy>[0];

type ColumnModel<T> = {
  definition: ColumnDefinition<T>;
  editable: boolean;
  multiple: boolean;
  type: 'text' | 'numeric' | 'checkbox' | 'dropdown' | 'calendar';
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SYSTEM_READ_ONLY_FIELDS = new Set(['createdAt', 'updatedAt']);
const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

const isNil = (value: unknown) => value === null || value === undefined;

const getColumnRawValue = <T extends Record<string, any>>(row: T, column: ColumnDefinition<T>) => (
  column.getValue ? column.getValue(row) : row[column.key as keyof T]
);

const findSampleValue = <T extends Record<string, any>>(rows: T[], column: ColumnDefinition<T>) => {
  for (const row of rows) {
    const value = getColumnRawValue(row, column);
    if (Array.isArray(value)) {
      if (value.length > 0) return value;
      continue;
    }

    if (!isNil(value) && value !== '') return value;
  }

  return undefined;
};

const inferIsMultiple = <T extends Record<string, any>>(rows: T[], column: ColumnDefinition<T>) => {
  if (typeof column.key === 'string' && /Ids$/.test(column.key)) return true;

  return rows.some((row) => Array.isArray(getColumnRawValue(row, column)));
};

const inferIsEditable = <T extends Record<string, any>>(
  column: ColumnDefinition<T>,
  sampleValue: unknown,
  canEdit: boolean,
) => {
  if (!canEdit || column.readOnly) return false;
  if (typeof column.key === 'string' && SYSTEM_READ_ONLY_FIELDS.has(column.key)) return false;

  if (column.render && !column.setValue && !column.options) {
    if (isNil(sampleValue)) return false;
    if (typeof sampleValue === 'object') return false;
    if (typeof column.key === 'string' && /Id$/.test(column.key)) return false;
  }

  return true;
};

const inferColumnType = (
  column: ColumnDefinition<any>,
  sampleValue: unknown,
  multiple: boolean,
): ColumnModel<any>['type'] => {
  if (column.options) return 'dropdown';
  if (typeof sampleValue === 'boolean') return 'checkbox';
  if (typeof sampleValue === 'number') return 'numeric';
  if (!multiple && typeof sampleValue === 'string' && DATE_VALUE_PATTERN.test(sampleValue) && /Date$/i.test(String(column.key))) {
    return 'calendar';
  }

  return 'text';
};

const buildColumnModels = <T extends Record<string, any>>(
  columns: ColumnDefinition<T>[],
  rows: T[],
  canEdit: boolean,
): ColumnModel<T>[] => columns.map((definition) => {
  const sampleValue = findSampleValue(rows, definition);
  const multiple = inferIsMultiple(rows, definition);

  return {
    definition,
    editable: inferIsEditable(definition, sampleValue, canEdit),
    multiple,
    type: inferColumnType(definition, sampleValue, multiple),
  };
});

const normalizeBoolean = (value: unknown) => (
  value === true || value === 'true' || value === '1' || value === 1
);

const normalizeDropdownValue = (value: unknown, multiple: boolean): SpreadsheetCellValue => {
  if (multiple) {
    if (Array.isArray(value)) return value.map(String).filter(Boolean).join(';');
    if (typeof value === 'string') return value;
    return '';
  }

  if (Array.isArray(value)) return value[0] ? String(value[0]) : '';
  if (isNil(value)) return '';
  return String(value);
};

const stringifyValue = (value: unknown): SpreadsheetCellValue => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (isNil(value)) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
};

const serializeCellValue = <T extends Record<string, any>>(row: T, model: ColumnModel<T>): SpreadsheetCellValue => {
  const rawValue = getColumnRawValue(row, model.definition);

  if (model.type === 'dropdown') return normalizeDropdownValue(rawValue, model.multiple);
  if (model.type === 'checkbox') return normalizeBoolean(rawValue);
  if (!model.editable && model.definition.render) return stringifyValue(model.definition.render(rawValue, row));

  return stringifyValue(rawValue);
};

const serializeRows = <T extends Record<string, any>>(rows: T[], models: ColumnModel<T>[]) => (
  rows.map((row) => models.map((model) => serializeCellValue(row, model)))
);

const emptyCellValue = <T extends Record<string, any>>(model: ColumnModel<T>): SpreadsheetCellValue => {
  if (model.definition.key === 'isActive') return true;
  if (model.type === 'checkbox') return false;
  return '';
};

const parseMultipleValue = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const parseNumericValue = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseCellValue = <T extends Record<string, any>>(
  value: unknown,
  row: T | null,
  model: ColumnModel<T>,
) => {
  const currentValue = row ? getColumnRawValue(row, model.definition) : undefined;

  if (model.type === 'dropdown') {
    return model.multiple ? parseMultipleValue(value) : (isNil(value) ? '' : String(value));
  }

  if (model.type === 'checkbox') return normalizeBoolean(value);

  if (typeof currentValue === 'number' || model.type === 'numeric') return parseNumericValue(value);
  if (Array.isArray(currentValue)) return parseMultipleValue(value);
  if (typeof currentValue === 'boolean') return normalizeBoolean(value);

  if (isNil(value)) return '';
  return String(value);
};

const isEmptyValue = (value: unknown) => {
  if (isNil(value)) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim() === '';
  return false;
};

const areValuesEqual = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export default function ReactSpreadsheetWrapper<T extends Record<string, any>>({
  columns,
  data,
  isLoading,
  isLoadingMore = false,
  totalRows,
  hasMoreRows = false,
  onSave,
  onDelete,
  onAdd,
  onLoadMore,
  onSearchChange,
  getRowKey,
  canAdd = true,
  canEdit = true,
  canDelete = true,
}: ReactSpreadsheetWrapperProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const worksheetRef = useRef<WorksheetInstance | null>(null);
  const suppressEventsRef = useRef(false);
  const columnsRef = useRef(columns);
  const columnModelsRef = useRef<ColumnModel<T>[]>([]);
  const dataRef = useRef(data);
  const onSaveRef = useRef(onSave);
  const onAddRef = useRef(onAdd);
  const onDeleteRef = useRef(onDelete);
  const searchTermRef = useRef('');
  const pendingRowIndexRef = useRef<number | null>(null);
  const [pendingRowIndex, setPendingRowIndex] = useState<number | null>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [isDeletingRow, setIsDeletingRow] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const isServerSearch = !!onSearchChange;

  const columnModels = useMemo(
    () => buildColumnModels(columns, data, canEdit),
    [columns, data, canEdit],
  );

  const serializedRows = useMemo(
    () => serializeRows(data, columnModels),
    [data, columnModels],
  );

  const schemaSignature = useMemo(
    () => JSON.stringify(columnModels.map((model) => ({
      key: String(model.definition.key),
      header: model.definition.header,
      width: model.definition.width ?? '',
      readOnly: model.definition.readOnly ?? false,
      editable: model.editable,
      multiple: model.multiple,
      type: model.type,
      options: model.definition.options ?? [],
    }))),
    [columnModels],
  );

  const dataSignature = useMemo(
    () => JSON.stringify(serializedRows.map((row, index) => ({
      key: index < data.length ? getRowKey(data[index]) : `row-${index}`,
      row,
    }))),
    [data, getRowKey, serializedRows],
  );

  columnsRef.current = columns;
  columnModelsRef.current = columnModels;
  dataRef.current = data;
  onSaveRef.current = onSave;
  onAddRef.current = onAdd;
  onDeleteRef.current = onDelete;
  searchTermRef.current = searchTerm;

  const destroySpreadsheet = () => {
    if (!containerRef.current) return;

    jspreadsheet.destroy(containerRef.current as unknown as SpreadsheetDestroyTarget);
    worksheetRef.current = null;
  };

  const syncPendingState = (nextValue: number | null) => {
    pendingRowIndexRef.current = nextValue;
    setPendingRowIndex(nextValue);
  };

  const applySearch = (value: string) => {
    setSearchTerm(value);
    if (!isServerSearch) {
      worksheetRef.current?.search(value);
    }
  };

  const revertCell = (instance: WorksheetInstance, colIndex: number, rowIndex: number) => {
    const row = dataRef.current[rowIndex];
    const model = columnModelsRef.current[colIndex];
    if (!row || !model) return;

    suppressEventsRef.current = true;
    instance.setValueFromCoords(colIndex, rowIndex, serializeCellValue(row, model), true);
    suppressEventsRef.current = false;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || isLoading) return;

    destroySpreadsheet();

    const handleSelection = (
      instance: WorksheetInstance,
      left: number,
      top: number,
      right: number,
      bottom: number,
    ) => {
      setSelectedRowIndex(top);

      const model = columnModelsRef.current[left];
      if (!model?.editable || model.type !== 'dropdown' || left !== right || top !== bottom) return;

      window.setTimeout(() => {
        if (instance.edition) return;
        instance.openEditor(instance.getCellFromCoords(left, top));
      }, 0);
    };

    const handleChange = async (
      instance: WorksheetInstance,
      _cell: HTMLTableCellElement,
      colIndex: string | number,
      rowIndex: string | number,
      newValue: SpreadsheetCellValue,
    ) => {
      if (suppressEventsRef.current || !canEdit || !onSaveRef.current) return;

      const x = Number(colIndex);
      const y = Number(rowIndex);
      const model = columnModelsRef.current[x];
      const row = dataRef.current[y];

      if (!model || !row || !model.editable) return;
      if (pendingRowIndexRef.current !== null && y === pendingRowIndexRef.current) return;

      const parsedValue = parseCellValue(newValue, row, model);
      const currentValue = getColumnRawValue(row, model.definition);
      const validationError = model.definition.validate?.(parsedValue);

      if (validationError) {
        window.alert(validationError);
        revertCell(instance, x, y);
        return;
      }

      if (areValuesEqual(currentValue, parsedValue)) return;

      const changes = model.definition.setValue
        ? model.definition.setValue(row, parsedValue)
        : ({ [model.definition.key]: parsedValue } as Partial<T>);

      try {
        setSaveState('saving');
        await onSaveRef.current(row, changes);
        setSaveState('saved');
      } catch (error) {
        setSaveState('error');
        console.error('Failed to save spreadsheet cell', error);
        revertCell(instance, x, y);
      }
    };

    const worksheetOptions = {
      data: serializedRows,
      columns: columnModelsRef.current.map((model) => ({
        title: model.definition.header,
        name: String(model.definition.key),
        width: model.definition.width ?? '160px',
        type: model.type,
        readOnly: !model.editable,
        source: model.definition.options?.map((option) => ({
          id: option.value,
          name: option.label,
        })),
        autocomplete: model.type === 'dropdown',
        multiple: model.multiple,
        options: model.type === 'calendar'
          ? { format: 'YYYY-MM-DD' }
          : model.type === 'dropdown'
            ? { position: true }
            : undefined,
      })),
      editable: canEdit,
      allowInsertColumn: false,
      allowDeleteColumn: false,
      allowInsertRow: false,
      allowDeleteRow: false,
      allowRenameColumn: false,
      allowManualInsertColumn: false,
      allowManualInsertRow: false,
      allowDeletingAllRows: true,
      columnDrag: false,
      columnResize: true,
      columnSorting: false,
      rowDrag: false,
      rowResize: false,
      search: true,
      tableOverflow: true,
      tableWidth: '100%',
      tableHeight: 'min(70vh, 720px)',
      minDimensions: [columns.length, 0] as [number, number],
    };

    const worksheets = jspreadsheet(container, {
      about: false,
      allowExport: false,
      onchange: handleChange,
      onselection: handleSelection,
      tabs: false,
      toolbar: false,
      worksheets: [worksheetOptions],
    });

    worksheetRef.current = worksheets[0] ?? null;
    if (!isServerSearch && searchTermRef.current) worksheetRef.current?.search(searchTermRef.current);

    return () => {
      destroySpreadsheet();
    };
  }, [canEdit, columns.length, isLoading, isServerSearch, schemaSignature]);

  useEffect(() => {
    const worksheet = worksheetRef.current;
    if (!worksheet) return;

    suppressEventsRef.current = true;
    worksheet.setData(serializedRows);
    suppressEventsRef.current = false;

    if (pendingRowIndexRef.current !== null && pendingRowIndexRef.current >= data.length) {
      syncPendingState(null);
    }

    setSelectedRowIndex((current) => (
      current !== null && current >= data.length
        ? (data.length > 0 ? data.length - 1 : null)
        : current
    ));

    if (!isServerSearch && searchTermRef.current) worksheet.search(searchTermRef.current);
  }, [data.length, dataSignature, serializedRows]);

  useEffect(() => {
    if (!isServerSearch) {
      worksheetRef.current?.search(searchTerm);
    }
  }, [isServerSearch, searchTerm]);

  useEffect(() => {
    if (!onSearchChange) return;

    const timeoutId = window.setTimeout(() => {
      onSearchChange(searchTerm);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [onSearchChange, searchTerm]);

  const handleAddRow = () => {
    const worksheet = worksheetRef.current;
    if (!worksheet || !onAdd || pendingRowIndexRef.current !== null) return;

    suppressEventsRef.current = true;
    worksheet.insertRow(columnModelsRef.current.map((model) => emptyCellValue(model)));
    suppressEventsRef.current = false;

    const nextIndex = (worksheet.options.data?.length ?? 0) - 1;
    syncPendingState(nextIndex);
    setSelectedRowIndex(nextIndex);
    worksheet.updateSelectionFromCoords(0, nextIndex, Math.max(columns.length - 1, 0), nextIndex);
  };

  const handleSaveNewRow = async () => {
    const worksheet = worksheetRef.current;
    const rowIndex = pendingRowIndexRef.current;
    if (!worksheet || rowIndex === null || !onAddRef.current) return;

    const rowData = worksheet.getRowData(rowIndex) ?? [];
    const newRowData: Partial<T> = {};

    for (let columnIndex = 0; columnIndex < columnModelsRef.current.length; columnIndex++) {
      const model = columnModelsRef.current[columnIndex];
      if (!model.editable) continue;

      const parsedValue = parseCellValue(rowData[columnIndex], null, model);
      const validationError = model.definition.validate?.(parsedValue);
      if (validationError) {
        window.alert(`${model.definition.header}: ${validationError}`);
        return;
      }

      if (isEmptyValue(parsedValue) && model.type !== 'checkbox') continue;

      if (model.definition.setValue) {
        Object.assign(newRowData, model.definition.setValue({} as T, parsedValue));
      } else {
        (newRowData as Record<string, unknown>)[String(model.definition.key)] = parsedValue;
      }
    }

    try {
      setSaveState('saving');
      await onAddRef.current(newRowData);
      setSaveState('saved');
      syncPendingState(null);
    } catch (error) {
      setSaveState('error');
      console.error('Failed to add spreadsheet row', error);
    }
  };

  const handleCancelAddRow = () => {
    const worksheet = worksheetRef.current;
    const rowIndex = pendingRowIndexRef.current;
    if (!worksheet || rowIndex === null) return;

    suppressEventsRef.current = true;
    worksheet.deleteRow(rowIndex, 1);
    suppressEventsRef.current = false;

    syncPendingState(null);
    setSelectedRowIndex(null);
  };

  const handleDeleteRow = async () => {
    if (!onDeleteRef.current || !canDelete || isDeletingRow || selectedRowIndex === null) return;

    if (pendingRowIndexRef.current !== null && selectedRowIndex === pendingRowIndexRef.current) {
      handleCancelAddRow();
      return;
    }

    const row = data[selectedRowIndex];
    if (!row) return;
    if (!window.confirm('Delete the selected row?')) return;

    setIsDeletingRow(true);

    try {
      await onDeleteRef.current(row);
    } catch (error) {
      console.error('Failed to delete spreadsheet row', error);
    } finally {
      setIsDeletingRow(false);
    }
  };

  const statusLabel = saveState === 'saving'
    ? 'Saving'
    : saveState === 'saved'
      ? 'Saved'
      : saveState === 'error'
        ? 'Save failed'
        : 'Ready';
  const loadedRows = data.length;
  const metaLabel = typeof totalRows === 'number' && totalRows >= loadedRows
    ? `${loadedRows} of ${totalRows} rows`
    : `${loadedRows} rows`;

  return (
    <div className="spreadsheet-shell">
      {isLoading ? (
        <div className="spreadsheet-empty-state">
          <span className="material-icons spreadsheet-empty-icon">hourglass_empty</span>
          <div>Loading...</div>
        </div>
      ) : (
        <>
          <div className="spreadsheet-toolbar">
            <div className="spreadsheet-toolbar-left">
              <div className="spreadsheet-search">
                <span className="material-icons">search</span>
                <input
                  value={searchTerm}
                  onChange={(event) => applySearch(event.target.value)}
                  placeholder="Search rows"
                />
                {searchTerm && (
                  <button type="button" onClick={() => applySearch('')} title="Clear search">
                    <span className="material-icons">close</span>
                  </button>
                )}
              </div>
              <span className={`spreadsheet-status spreadsheet-status-${saveState}`}>
                {statusLabel}
              </span>
            </div>
            <div className="spreadsheet-toolbar-right">
              <span className="spreadsheet-meta">{metaLabel}</span>
              {selectedRowIndex !== null && (
                <span className="spreadsheet-meta">Row {selectedRowIndex + 1}</span>
              )}
              {canAdd && onAdd && pendingRowIndex === null && (
                <button type="button" onClick={handleAddRow} className="spreadsheet-icon-button" title="Add row">
                  <span className="material-icons">add</span>
                </button>
              )}
              {canDelete && onDelete && selectedRowIndex !== null && pendingRowIndex === null && (
                <button type="button" onClick={handleDeleteRow} className="spreadsheet-icon-button danger" disabled={isDeletingRow} title="Delete selected row">
                  <span className="material-icons">{isDeletingRow ? 'hourglass_empty' : 'delete'}</span>
                </button>
              )}
              {pendingRowIndex !== null && (
                <>
                  <button type="button" onClick={handleSaveNewRow} className="spreadsheet-action-button primary">
                    <span className="material-icons">check</span>
                    Save row
                  </button>
                  <button type="button" onClick={handleCancelAddRow} className="spreadsheet-action-button">
                    <span className="material-icons">close</span>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
          {data.length === 0 && pendingRowIndex === null && (
            <div className="spreadsheet-empty-state compact">
              <span className="material-icons spreadsheet-empty-icon">inbox</span>
              <div>No data found</div>
            </div>
          )}
          <div ref={containerRef} className="spreadsheet-grid" />
          {hasMoreRows && pendingRowIndex === null && (
            <div className="spreadsheet-toolbar" style={{ borderTop: '1px solid #e5e7eb' }}>
              <div className="spreadsheet-toolbar-left">
                <span className="spreadsheet-meta">
                  {isLoadingMore ? 'Loading more rows...' : 'More rows available'}
                </span>
              </div>
              <div className="spreadsheet-toolbar-right">
                <button
                  type="button"
                  onClick={() => void onLoadMore?.()}
                  className="spreadsheet-action-button"
                  disabled={isLoadingMore}
                >
                  <span className="material-icons">{isLoadingMore ? 'hourglass_empty' : 'expand_more'}</span>
                  {isLoadingMore ? 'Loading...' : 'Load more'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
