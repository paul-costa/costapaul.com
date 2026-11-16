import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

/**
 * /private/router.json behind Cloudflare Access, written every 2 minutes on costaserver by router-card.timer
 * (scripts/server/router-card.py in the costaserver repo) from the UniFi Site Manager API. The router UI itself
 * cannot be framed (X-Frame-Options: SAMEORIGIN) and is reachable only at home, so the card shows numbers instead.
 */
export interface RouterStatus {
  updated: string;
  name: string;
  clients: { wifi: number | null; wired: number | null; guest: number | null };
  devices: { total: number | null; offline: number | null };
  wan: {
    isp?: string | null;
    uptimePct: number | null;
    issues: number;
    down: number | null;
    up: number | null;
    latency: number | null;
    at?: string | null;
  };
  history: { t: string | null; down: number | null; up: number | null; latency: number | null }[];
  links: { label: string; url: string }[];
}

const REFRESH_MS = 60_000;
/** The timer writes every 2 minutes; older data means the collector or the API is stuck */
const STALE_MS = 10 * 60_000;
const W = 300;
const H = 40;

@Component({
  selector: 'app-router-card',
  imports: [MatIcon],
  template: `@if (status(); as s) {
    <section class="tile wide router" style="--tint: #60a5fa">
      <div class="head">
        <mat-icon>router</mat-icon>
        <span class="label">{{ s.name }}</span>
        <span class="links">
          @for (link of s.links; track link.url) {
            <a [href]="link.url" target="_blank" rel="noopener">{{ link.label }}<mat-icon>north_east</mat-icon></a>
          }
        </span>
      </div>
      <dl class="stats">
        <div><dt>Wi-Fi</dt><dd>{{ s.clients.wifi ?? '–' }}</dd></div>
        <div><dt>Wired</dt><dd>{{ s.clients.wired ?? '–' }}</dd></div>
        <div><dt>Down</dt><dd>{{ s.wan.down ?? '–' }}<small> Mbit/s</small></dd></div>
        <div><dt>Up</dt><dd>{{ s.wan.up ?? '–' }}<small> Mbit/s</small></dd></div>
        <div><dt>Latency</dt><dd>{{ s.wan.latency ?? '–' }}<small> ms</small></dd></div>
        <div [class.bad]="s.wan.issues > 0"><dt>WAN uptime</dt><dd>{{ s.wan.uptimePct ?? '–' }}<small> %</small></dd></div>
      </dl>
      @if (spark(); as p) {
        <svg class="spark" [attr.viewBox]="'0 0 ' + w + ' ' + h" preserveAspectRatio="none" aria-hidden="true">
          <path class="area" [attr.d]="p.area" />
          <path class="line" [attr.d]="p.line" />
        </svg>
        <span class="caption">download, last 24 h (peak {{ p.max }} Mbit/s)</span>
      }
      <span class="updated" [class.stale]="stale()">updated {{ time(s.updated) }}{{ stale() ? ' – stale' : '' }}</span>
    </section>
  }`,
  styles: `
    :host { display: contents; }
    /* display: contents above makes the section itself the grid item, like the other tiles */
    /* double gap like the LLM card: not one of the links */
    .router { margin-top: var(--gap); grid-column: 1 / -1; flex-direction: column; align-items: stretch; gap: 14px; min-height: 0; }
    .label { margin-top: 0; white-space: nowrap; }
    .head { display: flex; align-items: center; gap: 12px; }
    .head > mat-icon { color: color-mix(in srgb, var(--tint) 70%, #fff); }
    .links { display: inline-flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 14px; margin-left: auto; }
    .links a { display: inline-flex; align-items: center; gap: 4px; font: 400 12px/1 var(--mono); color: var(--faint); transition: color 0.2s ease; }
    .links a:hover { color: var(--text); }
    .links mat-icon { width: 16px; height: 16px; font-size: 16px; }
    .stats { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin: 0; }
    dt { font: 400 11px/1 var(--mono); color: var(--faint); text-transform: lowercase; }
    dd { margin: 6px 0 0; font-size: 20px; color: var(--text); font-variant-numeric: tabular-nums; }
    small { font-size: 12px; color: var(--muted); }
    .bad dd { color: #f87171; }
    .spark { display: block; width: 100%; height: 40px; }
    .area { fill: color-mix(in srgb, var(--tint) 14%, transparent); }
    .line { fill: none; stroke: var(--tint); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
    .caption, .updated { font: 400 11px/1 var(--mono); color: var(--faint); }
    .caption { margin-top: -8px; }
    .updated.stale { color: #f87171; }
    @media (max-width: 599px) { .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  `,
})
export class RouterCard {
  protected readonly status = signal<RouterStatus | null>(null);
  private readonly now = signal(Date.now());
  protected readonly w = W;
  protected readonly h = H;

  protected readonly stale = computed(() => {
    const s = this.status();
    return !!s && this.now() - Date.parse(s.updated) > STALE_MS;
  });

  /** Download over the last 24 h as an SVG line and area, scaled to the peak */
  protected readonly spark = computed(() => {
    const points = (this.status()?.history ?? []).map((p) => p.down).filter((v): v is number => v != null);
    if (points.length < 2) return null;
    const max = Math.max(...points, 1);
    const xy = points.map((v, i) => `${((i / (points.length - 1)) * W).toFixed(1)},${(H - (v / max) * (H - 2)).toFixed(1)}`);
    const line = 'M' + xy.join('L');
    return { line, area: `${line}L${W},${H}L0,${H}Z`, max: Math.round(max) };
  });

  constructor() {
    this.load();
    const timer = setInterval(() => {
      this.now.set(Date.now());
      if (document.visibilityState === 'visible') this.load();
    }, REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected time(iso: string) {
    return new Date(iso).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
  }

  private async load() {
    try {
      const response = await fetch('/private/router.json', { redirect: 'manual', cache: 'no-store' });
      if (response.ok && response.headers.get('content-type')?.includes('json')) this.status.set(await response.json());
    } catch {
      // offline or signed out: keep the last numbers
    }
  }
}
