import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Modal } from './Modal.tsx';
import { apiFetch } from '../../utils/api.ts';

export interface ImportFieldSpec {
  key: string;
  label: string;
  required?: boolean;
}

interface BulkImportModalProps {
  open: boolean;
  onClose: () => void;
  entityType: 'students' | 'faculty';
  title: string;
  subtitle: string;
  fields: ImportFieldSpec[];
  existingKeys: Set<string>;
  duplicateKeyField: string;
  duplicateKeyLabel: string;
  templateFileName: string;
  sampleRows: Array<Array<string | number>>;
  onSuccess: () => Promise<void> | void;
}

export function BulkImportModal({
  open,
  onClose,
  entityType,
  title,
  subtitle,
  fields,
  existingKeys,
  duplicateKeyField,
  duplicateKeyLabel,
  templateFileName,
  sampleRows,
  onSuccess,
}: BulkImportModalProps) {
  const [rawFileName, setRawFileName] = useState('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, unknown>>>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    importedRows: number;
    skippedRows: number;
    errors: Array<{ row: number; registration_number?: string; employee_id?: string; reason: string }>;
  } | null>(null);

  const resetState = () => {
    setRawFileName('');
    setRawHeaders([]);
    setRawRows([]);
    setColumnMap({});
    setError(null);
    setResult(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const downloadTemplate = (format: 'csv' | 'xlsx') => {
    const headers = fields.map((f) => f.key);
    if (format === 'csv') {
      const lines = [headers.join(','), ...sampleRows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${templateFileName}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Template');
      XLSX.writeFile(wb, `${templateFileName}.xlsx`);
    }
  };

  const handleFileParse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setParsing(true);
    try {
      setRawFileName(file.name);
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) {
        setError('The uploaded workbook contains no readable sheets.');
        return;
      }
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: '' });
      if (json.length === 0) {
        setError('No data rows were detected in the uploaded file.');
        setRawHeaders([]);
        setRawRows([]);
        return;
      }

      const headers = Object.keys(json[0]);
      setRawHeaders(headers);
      setRawRows(json);

      const autoMap: Record<string, string> = {};
      for (const field of fields) {
        const normKey = field.key.toLowerCase().replace(/[^a-z0-9]/g, '');
        const match = headers.find((h) => {
          const normH = h.toLowerCase().replace(/[^a-z0-9]/g, '');
          return normH === normKey || normH.includes(normKey) || h.toLowerCase().includes(field.key.split('_')[0]);
        });
        if (match) autoMap[field.key] = match;
      }
      setColumnMap(autoMap);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not parse spreadsheet. Please upload a valid .csv or .xlsx file.');
    } finally {
      setParsing(false);
      e.target.value = '';
    }
  };

  const previewRows = rawRows.map((row, idx) => {
    const mapped: Record<string, unknown> = {};
    for (const f of fields) {
      const col = columnMap[f.key];
      mapped[f.key] = col ? row[col] : '';
    }
    const keyVal = String(mapped[duplicateKeyField] || '').trim();
    const isDuplicate = keyVal ? existingKeys.has(keyVal.toUpperCase()) : false;
    const missingFields = fields
      .filter((f) => f.required && !String(mapped[f.key] || '').trim())
      .map((f) => f.key);
    return { rowNumber: idx + 1, mapped, isDuplicate, missingFields, keyVal };
  });

  const handleCommit = async () => {
    if (previewRows.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const endpoint = entityType === 'students' ? '/api/import/students' : '/api/import/faculty';
      const res = await apiFetch<{
        importedRows: number;
        skippedRows: number;
        errors: Array<{ row: number; registration_number?: string; employee_id?: string; reason: string }>;
      }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          fileName: rawFileName,
          rows: previewRows.map((r) => r.mapped),
        }),
      });
      setResult(res);
      if (res.importedRows > 0) {
        await onSuccess();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to commit bulk import.');
    } finally {
      setImporting(false);
    }
  };

  const validCount = previewRows.filter((r) => !r.isDuplicate && r.missingFields.length === 0).length;

  return (
    <Modal open={open} onClose={handleClose} title={title} subtitle={subtitle} maxWidthClass="max-w-4xl">
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#07111F] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600 dark:text-slate-300">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              Upload CSV or Excel (.xlsx / .xls)
            </div>
            <div className="mt-0.5">
              Imported records are saved directly to the institutional database as verified records.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => downloadTemplate('csv')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E1C30] hover:bg-slate-100 dark:hover:bg-[#162944]"
            >
              <Download className="w-3.5 h-3.5" />
              Sample CSV
            </button>
            <button
              type="button"
              onClick={() => downloadTemplate('xlsx')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E1C30] hover:bg-slate-100 dark:hover:bg-[#162944]"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Sample Excel
            </button>
            <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F] cursor-pointer hover:opacity-90">
              {parsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              <span>{parsing ? 'Reading File...' : 'Choose File'}</span>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileParse} className="hidden" />
            </label>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {rawHeaders.length > 0 && (
          <div className="space-y-4">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Step 1 · Map Columns from "{rawFileName}" ({rawRows.length} rows, {validCount} valid ready)
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    {f.label} {f.required ? '*' : ''}
                  </label>
                  <select
                    value={columnMap[f.key] || ''}
                    onChange={(e) => setColumnMap((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
                  >
                    <option value="">— Unmapped —</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Step 2 · Validation Preview (First 25 rows)
            </div>
            <div className="max-h-56 overflow-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-[#0B1729] sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Row</th>
                    <th className="py-2 px-3">{duplicateKeyLabel}</th>
                    <th className="py-2 px-3">Full Name</th>
                    <th className="py-2 px-3">Department</th>
                    <th className="py-2 px-3">Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {previewRows.slice(0, 25).map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="py-2 px-3 font-mono-tabular">{r.rowNumber}</td>
                      <td className="py-2 px-3 font-mono-tabular">{r.keyVal || '—'}</td>
                      <td className="py-2 px-3">{String(r.mapped.full_name || '—')}</td>
                      <td className="py-2 px-3">{String(r.mapped.department || '—')}</td>
                      <td className="py-2 px-3">
                        {r.isDuplicate ? (
                          <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                            <AlertCircle className="w-3.5 h-3.5" /> Duplicate {duplicateKeyLabel}
                          </span>
                        ) : r.missingFields.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                            <AlertCircle className="w-3.5 h-3.5" /> Missing: {r.missingFields.join(', ')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && (
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#07111F] border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              Import Result: {result.importedRows} Imported · {result.skippedRows} Skipped
            </div>
            {result.errors.length > 0 && (
              <div className="max-h-28 overflow-y-auto space-y-1 text-red-600 dark:text-red-400">
                {result.errors.map((er, i) => (
                  <div key={i}>
                    Row {er.row} ({er.registration_number || er.employee_id || 'N/A'}): {er.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
          >
            Close
          </button>
          {rawRows.length > 0 && (
            <button
              type="button"
              disabled={importing}
              onClick={handleCommit}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F] disabled:opacity-50"
            >
              {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {importing ? 'Saving to Database...' : `Import Valid Rows (${rawRows.length} total)`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
