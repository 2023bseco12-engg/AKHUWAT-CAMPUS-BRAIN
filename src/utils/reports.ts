import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface ReportConfig {
  title: string;
  subtitle?: string;
  period?: string;
  generatedBy?: string;
  summaryPairs?: Array<{ label: string; value: string | number }>;
  columns: string[];
  rows: Array<Array<string | number | null | undefined>>;
  fileName: string;
}

export function exportToCsv(config: ReportConfig): void {
  const escape = (val: unknown) => {
    const str = val == null ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines: string[] = [];
  lines.push(`"Akhuwat College for Women, Chakwal — ${config.title}"`);
  if (config.period) lines.push(`"Reporting Period: ${config.period}"`);
  lines.push(`"Generated: ${new Date().toLocaleString()}"`);
  lines.push('');
  lines.push(config.columns.map(escape).join(','));
  for (const row of config.rows) {
    lines.push(row.map(escape).join(','));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = config.fileName.endsWith('.csv') ? config.fileName : `${config.fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToExcel(config: ReportConfig): void {
  const wb = XLSX.utils.book_new();
  const headerRows: Array<Array<string | number>> = [
    ['Akhuwat College for Women, Chakwal, Pakistan'],
    ['Akhuwat Campus Brain — Institutional Report'],
    [config.title],
    [`Reporting Period: ${config.period || 'Academic Year 2026-2027'}`],
    [`Generated On: ${new Date().toLocaleString()}`],
    [],
  ];

  if (config.summaryPairs && config.summaryPairs.length > 0) {
    headerRows.push(['Summary Metrics']);
    for (const pair of config.summaryPairs) {
      headerRows.push([pair.label, pair.value]);
    }
    headerRows.push([]);
  }

  const normalizedRows = config.rows.map((r) => r.map((c) => (c == null ? '' : c)));
  const sheetData = [...headerRows, config.columns, ...normalizedRows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(wb, ws, 'Institutional Report');
  const outName = config.fileName.endsWith('.xlsx') ? config.fileName : `${config.fileName}.xlsx`;
  XLSX.writeFile(wb, outName);
}

let cachedLogoDataUrl: string | null = null;

if (typeof window !== 'undefined') {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 160;
      canvas.height = img.naturalHeight || 160;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        cachedLogoDataUrl = canvas.toDataURL('image/png');
      }
    } catch {
      // Ignore canvas error
    }
  };
  img.src = '/assets/aistudio/image_92675513.png';
}

export function exportToPdf(config: ReportConfig): void {
  const doc = new jsPDF({ orientation: config.columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Institutional Navy Header Banner
  doc.setFillColor(11, 31, 58); // #0B1F3A
  doc.rect(0, 0, pageWidth, 84, 'F');

  // Gold Accent Strip
  doc.setFillColor(197, 155, 39); // #C59B27
  doc.rect(0, 84, pageWidth, 4, 'F');

  let textStartX = 36;
  if (cachedLogoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(36, 16, 52, 52, 4, 4, 'F');
    doc.addImage(cachedLogoDataUrl, 'PNG', 39, 19, 46, 46);
    textStartX = 100;
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('AKHUWAT COLLEGE FOR WOMEN, CHAKWAL', textStartX, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(229, 186, 65);
  doc.text('AKHUWAT CAMPUS BRAIN · ONE COLLEGE. ONE DIGITAL BRAIN.', textStartX, 54);

  doc.setTextColor(226, 232, 240);
  doc.setFontSize(8.5);
  doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, pageWidth - 36, 34, { align: 'right' });
  if (config.generatedBy) {
    doc.text(`Authorized By: ${config.generatedBy}`, pageWidth - 36, 50, { align: 'right' });
  }

  // Report Title Block
  let cursorY = 116;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(config.title, 36, cursorY);
  cursorY += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  const metaLine = [config.subtitle, config.period ? `Period: ${config.period}` : null].filter(Boolean).join('  |  ');
  if (metaLine) {
    doc.text(metaLine, 36, cursorY);
    cursorY += 16;
  }

  // Optional Summary Strip
  if (config.summaryPairs && config.summaryPairs.length > 0) {
    cursorY += 4;
    const boxW = (pageWidth - 72) / Math.min(config.summaryPairs.length, 4);
    config.summaryPairs.slice(0, 4).forEach((pair, idx) => {
      const x = 36 + idx * boxW;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(x, cursorY, boxW - 8, 42, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(pair.label, x + 8, cursorY + 15);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(11, 31, 58);
      doc.text(String(pair.value), x + 8, cursorY + 33);
    });
    cursorY += 56;
  }

  autoTable(doc, {
    startY: cursorY,
    head: [config.columns],
    body: config.rows.map((r) => r.map((c) => (c == null ? '—' : String(c)))),
    styles: {
      fontSize: 8.5,
      cellPadding: 6,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [11, 31, 58],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 36, right: 36, bottom: 40 },
    didDrawPage: (data) => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Akhuwat College for Women, Chakwal · Institutional Intelligence System', 36, pageHeight - 18);
      doc.text(`Page ${data.pageNumber}`, pageWidth - 36, pageHeight - 18, { align: 'right' });
    },
  });

  const outName = config.fileName.endsWith('.pdf') ? config.fileName : `${config.fileName}.pdf`;
  doc.save(outName);
}
