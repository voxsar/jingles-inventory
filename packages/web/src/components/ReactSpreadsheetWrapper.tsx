import { useState, useEffect, useMemo } from 'react';
import Spreadsheet, { CellBase, Matrix } from 'react-spreadsheet';

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
  onSave?: (row: T, changes: Partial<T>) => Promise<void>;
  onDelete?: (row: T) => Promise<void>;
  onAdd?: (row: Partial<T>) => Promise<void>;
  getRowKey: (row: T) => string;
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function ReactSpreadsheetWrapper<T extends Record<string, any>>({
  columns,
  data,
  isLoading,
  onSave,
  onDelete,
  onAdd,
  getRowKey,
  canAdd = true,
  canEdit = true,
  canDelete = true,
}: ReactSpreadsheetWrapperProps<T>) {
  const [spreadsheetData, setSpreadsheetData] = useState<Matrix<CellBase>>([]);
  const [isAddingRow, setIsAddingRow] = useState(false);

  // Convert data to spreadsheet matrix format
  useEffect(() => {
    if (isLoading || data.length === 0) {
      // Create empty rows for loading state
      if (isLoading) {
        const emptyMatrix: Matrix<CellBase> = Array.from({ length: 5 }, () =>
          columns.map(() => ({ value: '...' }))
        );
        setSpreadsheetData(emptyMatrix);
      } else {
        setSpreadsheetData([]);
      }
      return;
    }

    const matrix: Matrix<CellBase> = data.map((row) => {
      return columns.map((col) => {
        let value: any;
        if (col.getValue) {
          value = col.getValue(row);
        } else {
          value = row[col.key];
        }

        // Format the value for display
        let displayValue = value;
        if (col.render && value !== undefined && value !== null) {
          displayValue = col.render(value, row);
        } else if (col.options && value) {
          const option = col.options.find((o) => o.value === value);
          displayValue = option?.label || value;
        } else if (Array.isArray(value)) {
          displayValue = value.join(', ');
        } else if (typeof value === 'boolean') {
          displayValue = value ? '✓' : '✗';
        } else if (value === null || value === undefined || value === '') {
          displayValue = '';
        }

        return {
          value: String(displayValue || ''),
          readOnly: col.readOnly || !canEdit,
        };
      });
    });

    setSpreadsheetData(matrix);
  }, [data, columns, isLoading, canEdit]);

  // Column labels
  const columnLabels = useMemo(() => columns.map((col) => col.header), [columns]);

  // Handle data changes
  const handleChange = async (newData: Matrix<CellBase>) => {
    if (!onSave || !canEdit) return;

    // Find which cell changed
    for (let rowIndex = 0; rowIndex < newData.length; rowIndex++) {
      const newRow = newData[rowIndex];
      const oldRow = spreadsheetData[rowIndex];

      if (!newRow || !oldRow) continue;

      for (let colIndex = 0; colIndex < newRow.length; colIndex++) {
        const newCell = newRow[colIndex];
        const oldCell = oldRow[colIndex];

        if (newCell?.value !== oldCell?.value) {
          // Found the changed cell
          const column = columns[colIndex];
          const dataRow = data[rowIndex];

          if (!dataRow) continue;

          // Convert the cell value back to the appropriate type
          let newValue: any = newCell?.value;

          // Try to parse back to original type
          const oldValue = column.getValue ? column.getValue(dataRow) : dataRow[column.key];

          if (typeof oldValue === 'number') {
            newValue = parseFloat(newValue) || 0;
          } else if (typeof oldValue === 'boolean') {
            newValue = newValue === '✓' || newValue === 'true' || newValue === true;
          }

          // Create the changes object
          let changes: Partial<T>;
          if (column.setValue) {
            changes = column.setValue(dataRow, newValue);
          } else {
            changes = { [column.key]: newValue } as Partial<T>;
          }

          try {
            await onSave(dataRow, changes);
          } catch (err) {
            console.error('Failed to save:', err);
            // Revert the change
            setSpreadsheetData(spreadsheetData);
          }
          return;
        }
      }
    }

    setSpreadsheetData(newData);
  };

  const handleAddRow = () => {
    setIsAddingRow(true);
    // Add a new empty row at the end
    const emptyRow = columns.map(() => ({ value: '', readOnly: false }));
    setSpreadsheetData([...spreadsheetData, emptyRow]);
  };

  const handleSaveNewRow = async () => {
    if (!onAdd) return;

    // Get the last row (the new one)
    const lastRow = spreadsheetData[spreadsheetData.length - 1];
    if (!lastRow) return;

    // Convert to data object
    const newRowData: Partial<T> = {};
    columns.forEach((col, index) => {
      const cell = lastRow[index];
      if (cell && cell.value) {
        newRowData[col.key as keyof T] = cell.value as any;
      }
    });

    try {
      await onAdd(newRowData);
      setIsAddingRow(false);
    } catch (err) {
      console.error('Failed to add row:', err);
    }
  };

  const handleCancelAddRow = () => {
    setIsAddingRow(false);
    // Remove the last row
    setSpreadsheetData(spreadsheetData.slice(0, -1));
  };

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      {isLoading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#6d7175' }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⏳</div>
          <div>Loading...</div>
        </div>
      ) : data.length === 0 && spreadsheetData.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#6d7175' }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📭</div>
          <div>No data found</div>
          {canAdd && onAdd && (
            <button
              onClick={handleAddRow}
              className="btn-primary"
              style={{ marginTop: '16px' }}
            >
              + Add First Row
            </button>
          )}
        </div>
      ) : (
        <>
          <Spreadsheet
            data={spreadsheetData}
            onChange={handleChange}
            columnLabels={columnLabels}
            hideRowIndicators={false}
            hideColumnIndicators={false}
          />
          {canAdd && onAdd && !isAddingRow && (
            <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid #e1e3e5' }}>
              <button onClick={handleAddRow} className="btn-secondary">
                + Add New Row
              </button>
            </div>
          )}
          {isAddingRow && (
            <div style={{ padding: '16px', display: 'flex', gap: '8px', justifyContent: 'center', borderTop: '1px solid #e1e3e5' }}>
              <button onClick={handleSaveNewRow} className="btn-primary">
                Save New Row
              </button>
              <button onClick={handleCancelAddRow} className="btn-secondary">
                Cancel
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
