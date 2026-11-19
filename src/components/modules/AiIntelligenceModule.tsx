import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Database, Download, FileText, Send, Sparkles } from 'lucide-react';
import type { AiQueryResult, AuthUser } from '../../types/index.ts';
import { apiFetch } from '../../utils/api.ts';
import { exportToCsv, exportToPdf } from '../../utils/reports.ts';

const SUGGESTED_QUESTIONS = [
  'How many students are currently enrolled across departments?',
  'Which department has the highest student enrollment and average CGPA?',
  'Which students have the highest CGPA?',
  'What is the average attendance by department and who is below 75%?',
  'How many scholarships and financial aid awards were granted this year?',
  'Compare academic performance and attendance across admission batches.',
  'Summarize institutional events, workshops, and top student achievements for this year.',
];

const CHART_COLORS = ['#0B1F3A', '#C59B27', '#1D4ED8', '#059669', '#D97706', '#7C3AED'];

interface HistoryEntry {
  id: string;
  question: string;
  response?: AiQueryResult;
  error?: string;
  timestamp: string;
}

export function AiIntelligenceModule({ user }: { user: AuthUser }) {
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const submitQuestion = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed || asking) return;
    setAsking(true);
    setQuestion('');

    const entryId = `${Date.now()}`;
    try {
      const res = await apiFetch<AiQueryResult>('/api/ai/query', {
        method: 'POST',
        body: JSON.stringify({ question: trimmed }),
      });
      setHistory((prev) => [
        {
          id: entryId,
          question: trimmed,
          response: res,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } catch (err: unknown) {
      setHistory((prev) => [
        {
          id: entryId,
          question: trimmed,
          error: err instanceof Error ? err.message : 'Unable to query Campus Brain AI.',
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } finally {
      setAsking(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuestion(question);
  };

  const downloadAnalyticalPdf = (entry: HistoryEntry) => {
    if (!entry.response) return;
    const { response } = entry;
    const cols = response.table?.columns || (response.chart ? [response.chart.xKey, response.chart.yLabel || response.chart.yKey] : ['Analytical Finding']);
    const rows = response.table?.rows || (response.chart ? response.chart.data.map((d) => [d[response.chart!.xKey], d[response.chart!.yKey]]) : [[response.answer]]);

    exportToPdf({
      title: `AI Campus Intelligence Report — ${entry.question.slice(0, 60)}`,
      subtitle: `Sources: ${response.sources.join(', ')}`,
      period: response.dataPeriod,
      generatedBy: `${user.full_name} (${user.role})`,
      columns: cols,
      rows,
      fileName: `ACW_AI_Analysis_${Date.now()}`,
    });
  };

  return (
    <div className="space-y-6">
      {/* AI Query Console Header */}
      <div className="p-6 rounded-xl bg-[#0B1F3A] text-white border border-[#173660]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#E5BA41]">
              <Sparkles className="w-4 h-4" />
              <span>AI-Powered Campus Intelligence · Connected to Live Institutional SQL Database</span>
            </div>
            <h2 className="font-serif-institutional text-2xl font-bold mt-1.5">
              Ask Any Question About Akhuwat College for Women, Chakwal
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Queries live authorized institutional records in real time, generates data-backed charts,
              respects your {user.role.replace('_', ' ')} access scope, and cites exact database sources and reporting periods.
            </p>
          </div>
        </div>

        <form onSubmit={handleFormSubmit} className="mt-5 flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Which department has the highest average CGPA and attendance?"
            disabled={asking}
            className="flex-1 px-4 py-3 text-sm rounded-lg bg-[#07111F] border border-[#244574] text-white placeholder:text-slate-400 focus:outline-none focus:border-[#C59B27]"
          />
          <button
            type="submit"
            disabled={asking || !question.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#C59B27] hover:bg-[#d4a934] text-[#07111F] text-sm font-semibold transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4" />
            {asking ? 'Analyzing Database...' : 'Analyze Records'}
          </button>
        </form>

        {/* Suggested Institutional Prompts */}
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={asking}
              onClick={() => submitQuestion(q)}
              className="px-3 py-1.5 text-xs rounded-lg bg-[#132E54] hover:bg-[#1a3d6e] text-slate-200 border border-white/10 transition-colors text-left"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Results Stream */}
      {asking && (
        <div className="p-6 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 animate-pulse space-y-3">
          <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-3 w-5/6 bg-slate-200 dark:bg-slate-800 rounded" />
        </div>
      )}

      {history.length === 0 && !asking && (
        <div className="p-8 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 text-center">
          <Database className="w-8 h-8 text-[#C59B27] mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Ready to Analyze Institutional Records
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto mt-1">
            Select one of the suggested institutional questions above or ask your own question to generate
            grounded insights, interactive charts, and downloadable reports.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {history.map((item) => (
          <article
            key={item.id}
            className="p-6 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 space-y-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="text-[11px] font-mono-tabular text-slate-400">Asked at {item.timestamp}</div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {item.question}
                </h3>
              </div>
              {item.response && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => downloadAnalyticalPdf(item)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#162944]"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Download PDF Report
                  </button>
                  {item.response.table && (
                    <button
                      type="button"
                      onClick={() =>
                        exportToCsv({
                          title: item.response!.table!.title,
                          period: item.response!.dataPeriod,
                          columns: item.response!.table!.columns,
                          rows: item.response!.table!.rows,
                          fileName: `ACW_AI_Table_${item.id}.csv`,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#162944]"
                    >
                      <Download className="w-3.5 h-3.5" />
                      CSV
                    </button>
                  )}
                </div>
              )}
            </div>

            {item.error ? (
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {item.error}
              </div>
            ) : item.response ? (
              <>
                {/* Grounded Explanation */}
                <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                  {item.response.answer}
                </div>

                {/* Data Period & Sources Attribution */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span>
                    <strong className="text-slate-700 dark:text-slate-300">Data Period:</strong> {item.response.dataPeriod}
                  </span>
                  <span>·</span>
                  <span>
                    <strong className="text-slate-700 dark:text-slate-300">Database Sources:</strong>{' '}
                    <span className="font-mono-tabular">{item.response.sources.join(', ') || 'institutional_db'}</span>
                  </span>
                </div>

                {/* Auto-Generated Chart from Real Data */}
                {item.response.chart && item.response.chart.data?.length > 0 && (
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#07111F] border border-slate-200 dark:border-slate-800">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-3">
                      {item.response.chart.title}
                    </div>
                    <div className="h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        {item.response.chart.type === 'line' ? (
                          <LineChart data={item.response.chart.data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                            <XAxis dataKey={item.response.chart.xKey} tick={{ fontSize: 11, fill: '#64748b' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                            <Tooltip />
                            <Line
                              type="monotone"
                              dataKey={item.response.chart.yKey}
                              name={item.response.chart.yLabel || item.response.chart.yKey}
                              stroke="#C59B27"
                              strokeWidth={2.5}
                            />
                          </LineChart>
                        ) : item.response.chart.type === 'pie' ? (
                          <PieChart>
                            <Pie
                              data={item.response.chart.data}
                              dataKey={item.response.chart.yKey}
                              nameKey={item.response.chart.xKey}
                              cx="50%"
                              cy="50%"
                              outerRadius={90}
                              label
                            >
                              {item.response.chart.data.map((_, idx) => (
                                <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        ) : (
                          <BarChart data={item.response.chart.data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                            <XAxis dataKey={item.response.chart.xKey} tick={{ fontSize: 11, fill: '#64748b' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                            <Tooltip />
                            <Bar
                              dataKey={item.response.chart.yKey}
                              name={item.response.chart.yLabel || item.response.chart.yKey}
                              fill="#0B1F3A"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Structured Table */}
                {item.response.table && item.response.table.rows?.length > 0 && (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 dark:bg-[#0B1729] border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          {item.response.table.columns.map((col, idx) => (
                            <th key={idx} className="py-2.5 px-3 font-semibold text-slate-600 dark:text-slate-300">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {item.response.table.rows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="py-2 px-3 font-mono-tabular">
                                {cell == null ? 'Missing' : String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
