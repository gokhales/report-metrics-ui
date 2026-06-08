import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { MetricsService } from '../services/metrics.service';
import { AmendedCorrected, AmendedReason, StaticItem, Summary } from '../models/metrics.models';
import { NgChartsModule } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import {
  Chart, BarController, CategoryScale, LinearScale,
  BarElement, Tooltip, Legend, DoughnutController, ArcElement
} from 'chart.js';

Chart.register(BarController, CategoryScale, LinearScale, BarElement,
  Tooltip, Legend, DoughnutController, ArcElement);

const DARK_TOOLTIP = {
  backgroundColor: '#1a1d27',
  borderColor: '#2d3148',
  borderWidth: 1,
  titleColor: '#e2e8f0',
  bodyColor: '#94a3b8'
};

// Unlock type colour palette — consistent across MGL and LIMS charts
const UNLOCK_COLORS: Record<string, string> = {
  'Amended':   '#f59e0b',
  'Corrected': '#f43f5e',
  'Addendum':  '#a78bfa',
};
const UNLOCK_FALLBACK = '#64748b';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, NgChartsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {

  startDate = '2026-03-01';
  endDate   = '2026-05-31';
  loading   = false;
  error     = '';

  summary: Summary | null = null;
  amended: AmendedCorrected | null = null;

  whiteLabelCustomers: StaticItem[] = [];
  discreteDataCustomers: StaticItem[] = [];
  dataDeliveryCustomers: StaticItem[] = [];
  systems: StaticItem[] = [];
  resultAccess: StaticItem[] = [];

  // ── Reports by test bar chart ──────────────────────────────────────
  barChartData: ChartData<'bar'> = { labels: [], datasets: [] };
  barChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    plugins: { legend: { display: false }, tooltip: { mode: 'index', ...DARK_TOOLTIP } },
    scales: {
      x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#2d3148' } },
      y: { beginAtZero: true, ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: '#2d3148' } }
    }
  };

  // ── Report mix doughnut ────────────────────────────────────────────
  doughnutData: ChartData<'doughnut'> = { labels: [], datasets: [] };
  doughnutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    plugins: {
      legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 14, padding: 12 } },
      tooltip: DARK_TOOLTIP
    }
  };

  // ── Delayed reports — bucketed bar chart ──────────────────────────
  static readonly DELAY_BUCKETS = [
    { label: '1–3 days',   min: 1,  max: 3,        color: '#facc15', severity: 'Minor'       },
    { label: '4–7 days',   min: 4,  max: 7,        color: '#fb923c', severity: 'Moderate'    },
    { label: '8–14 days',  min: 8,  max: 14,       color: '#f97316', severity: 'Significant' },
    { label: '15–30 days', min: 15, max: 30,       color: '#ef4444', severity: 'Serious'     },
    { label: '31+ days',   min: 31, max: Infinity, color: '#991b1b', severity: 'Critical'    },
  ];

  delayedChartData: ChartData<'bar'> = { labels: [], datasets: [] };
  delayedChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...DARK_TOOLTIP,
        callbacks: {
          title: items => {
            const b = DashboardComponent.DELAY_BUCKETS[items[0].dataIndex];
            return `${b?.label ?? ''} — ${b?.severity ?? ''}`;
          },
          label: item => ` ${item.formattedValue} cases`
        }
      }
    },
    scales: {
      x: { ticks: { color: '#94a3b8', font: { size: 12 } }, grid: { color: '#2d3148' } },
      y: { beginAtZero: true, ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: '#2d3148' } }
    }
  };

  // ── Amended / Corrected — stacked horizontal bar charts ───────────
  mglAmendedChartData:  ChartData<'bar'> = { labels: [], datasets: [] };
  limsAmendedChartData: ChartData<'bar'> = { labels: [], datasets: [] };

  amendedChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    indexAxis: 'y' as const,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#94a3b8', boxWidth: 12, padding: 16, font: { size: 11 } }
      },
      tooltip: {
        ...DARK_TOOLTIP,
        mode: 'index',
        callbacks: { label: item => ` ${item.dataset.label}: ${item.formattedValue}` }
      }
    },
    scales: {
      x: { stacked: true, beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#2d3148' } },
      y: { stacked: true, ticks: { color: '#e2e8f0', font: { size: 11 } }, grid: { color: 'transparent' } }
    }
  };

  constructor(private svc: MetricsService) {}

  ngOnInit(): void {
    this.loadStatic();
    this.loadMetrics();
  }

  loadStatic(): void {
    forkJoin({
      wl:  this.svc.getWhiteLabelCustomers(),
      dd:  this.svc.getDiscreteDataCustomers(),
      del: this.svc.getDataDeliveryCustomers(),
      sys: this.svc.getSystems(),
      ra:  this.svc.getResultAccess()
    }).subscribe({
      next: r => {
        this.whiteLabelCustomers   = r.wl;
        this.discreteDataCustomers = r.dd;
        this.dataDeliveryCustomers = r.del;
        this.systems               = r.sys;
        this.resultAccess          = r.ra;
      }
    });
  }

  loadMetrics(): void {
    this.loading = true;
    this.error   = '';
    forkJoin({
      summary: this.svc.getSummary(this.startDate, this.endDate),
      amended: this.svc.getAmendedCorrected(this.startDate, this.endDate)
    }).subscribe({
      next: ({ summary, amended }) => {
        this.summary = summary;
        this.amended = amended;
        this.buildCharts(summary, amended);
        this.loading = false;
      },
      error: () => {
        this.error   = 'Failed to load metrics. Make sure the API is running on port 5000.';
        this.loading = false;
      }
    });
  }

  private buildCharts(s: Summary, amended: AmendedCorrected): void {
    const palette = ['#6366f1','#22d3ee','#f59e0b','#10b981','#f43f5e',
                     '#a78bfa','#34d399','#fb923c','#38bdf8','#facc15'];

    // Reports by test
    const sorted = [...s.reportsByTest].sort((a, b) => b.count - a.count);
    this.barChartData = {
      labels: sorted.map(r => r.testCode),
      datasets: [{ data: sorted.map(r => r.count),
                   backgroundColor: sorted.map((_, i) => palette[i % palette.length]),
                   borderRadius: 6 }]
    };

    // Report mix doughnut
    this.doughnutData = {
      labels: ['Auto MGL','Auto PGx','Manual MGL','Manual PGx','Reanalysis','Failed/QC','Cancelled'],
      datasets: [{ data: [s.autogeneratedMgl, s.autogeneratedPgx, s.manualMgl, s.manualPgx,
                           s.reanalysis, s.failedQuality, s.cancelled],
                   backgroundColor: ['#6366f1','#22d3ee','#f59e0b','#10b981','#f43f5e','#a78bfa','#94a3b8'],
                   hoverOffset: 6 }]
    };

    // Delayed reports buckets
    const buckets = DashboardComponent.DELAY_BUCKETS;
    this.delayedChartData = {
      labels: buckets.map(b => b.label),
      datasets: [{ label: 'Cases',
                   data: buckets.map(b =>
                     s.delayedReports.filter(d => d.delayedDays >= b.min && d.delayedDays <= b.max)
                                     .reduce((sum, d) => sum + d.numberOfCases, 0)),
                   backgroundColor: buckets.map(b => b.color),
                   borderRadius: 6, borderSkipped: false }]
    };

    // Amended — stacked horizontal bar charts
    this.mglAmendedChartData  = this.buildAmendedChart(amended.mgl);
    this.limsAmendedChartData = this.buildAmendedChart(amended.lims);
  }

  /** Transform flat reason+type rows into a stacked bar dataset */
  private buildAmendedChart(rows: AmendedReason[]): ChartData<'bar'> {
    if (!rows.length) return { labels: [], datasets: [] };

    // Aggregate total per reason for sorting
    const reasonTotals = new Map<string, number>();
    rows.forEach(r => reasonTotals.set(r.reason, (reasonTotals.get(r.reason) ?? 0) + r.count));

    // Reasons sorted by total descending, cap at top 15 for readability
    const reasons = [...reasonTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([r]) => r);

    // One dataset per unlock type
    const types = [...new Set(rows.map(r => r.reportUnlockType))].sort();

    const datasets = types.map(type => ({
      label: type,
      data: reasons.map(reason => {
        const match = rows.find(r => r.reason === reason && r.reportUnlockType === type);
        return match?.count ?? 0;
      }),
      backgroundColor: UNLOCK_COLORS[type] ?? UNLOCK_FALLBACK,
      borderRadius: 3
    }));

    return { labels: reasons, datasets };
  }

  // ── Computed getters ────────────────────────────────────────────────
  get totalReports(): number {
    return this.summary?.reportsByTest.reduce((s, r) => s + r.count, 0) ?? 0;
  }

  get totalAmended(): number {
    const mgl  = this.amended?.mgl.reduce((s, r)  => s + r.count, 0) ?? 0;
    const lims = this.amended?.lims.reduce((s, r) => s + r.count, 0) ?? 0;
    return mgl + lims;
  }

  get totalDelayed(): number {
    return this.summary?.delayedReports.reduce((s, d) => s + d.numberOfCases, 0) ?? 0;
  }

  get delayedBuckets(): { label: string; severity: string; color: string; cases: number; pct: string }[] {
    const raw   = this.summary?.delayedReports ?? [];
    const total = this.totalDelayed || 1;
    return DashboardComponent.DELAY_BUCKETS.map(b => {
      const cases = raw.filter(d => d.delayedDays >= b.min && d.delayedDays <= b.max)
                       .reduce((s, d) => s + d.numberOfCases, 0);
      return { label: b.label, severity: b.severity, color: b.color, cases,
               pct: ((cases / total) * 100).toFixed(1) };
    });
  }

  // Summary pills for amended section header
  get mglAmendedSummary()  { return this.amendedSummary(this.amended?.mgl  ?? []); }
  get limsAmendedSummary() { return this.amendedSummary(this.amended?.lims ?? []); }

  private amendedSummary(rows: AmendedReason[]) {
    const byType = new Map<string, number>();
    rows.forEach(r => byType.set(r.reportUnlockType, (byType.get(r.reportUnlockType) ?? 0) + r.count));
    return [...byType.entries()].sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count, color: UNLOCK_COLORS[type] ?? UNLOCK_FALLBACK }));
  }

  trackByName(_: number, item: StaticItem) { return item.name; }
}
