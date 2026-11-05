import { Component, ElementRef, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/**
 * The LLM monitor on costaserver (llm-monitor.service, owned by the costaserver repo), reachable only
 * from devices in the tailnet. Contract: ?embed=1 is the compact card on a transparent background
 * with the details folding out inside it; the page posts {llmMonitorHeight} to its parent whenever
 * its content changes size.
 *
 * From https://costapaul.com, Chrome loads the tailnet address only after the visitor allowed
 * local network access for the site, and only eagerly: with loading="lazy" (Chrome 155) the iframe
 * stayed on about:blank. "local-network" is the newer name of "local-network-access"; both are set.
 *
 * A frame reports no load errors to its parent, so it stays invisible until its first height message (Chrome's
 * error page would show otherwise), and a request of its own decides whether the monitor is unreachable. The
 * height message is no such sign: Chrome holds it back while the frame is below the fold.
 */
const PROBE_TIMEOUT_MS = 6000;

@Component({
  selector: 'app-llm-frame',
  template: `@if (unreachable()) {
      <p class="hint">Only reachable from the tailnet. Turn on Tailscale and reload.</p>
    }
    <iframe
    #frame
    [src]="src()"
    [class.waiting]="!height()"
    [style.height.px]="height() || (unreachable() ? 1 : 480)"
    title="LLM activity on costaserver"
    allow="local-network; local-network-access"
  ></iframe>`,
  styles: `
    :host { display: block; }
    /* The monitor page declares no color-scheme (= light); a dark iframe would get an opaque white backdrop */
    iframe { display: block; width: 100%; border: 0; border-radius: var(--radius-child); color-scheme: light; transition: height 0.2s ease; }
    iframe.waiting { opacity: 0; }
    .hint { margin: 0; color: var(--muted); font-size: 14px; }
  `,
  host: { '(window:message)': 'resize($event)' },
})
export class LlmFrame implements OnInit {
  readonly url = input.required<string>();

  protected readonly height = signal(0);
  private readonly probeFailed = signal(false);
  protected readonly unreachable = computed(() => this.probeFailed() && !this.height());

  private readonly frame = viewChild.required<ElementRef<HTMLIFrameElement>>('frame');
  private readonly sanitizer = inject(DomSanitizer);

  // The URL comes from /private/server.json behind Cloudflare Access, not from user input
  protected readonly src = computed(() => {
    const url = new URL(this.url());
    url.searchParams.set('embed', '1');
    return this.sanitizer.bypassSecurityTrustResourceUrl(url.toString());
  });

  ngOnInit() {
    fetch(new URL('api/summary', this.url()), {
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    }).catch(() => this.probeFailed.set(true));
  }

  resize(event: MessageEvent) {
    if (event.origin !== new URL(this.url()).origin) return;
    if (event.source !== this.frame().nativeElement.contentWindow) return;
    const height = event.data?.llmMonitorHeight;
    if (typeof height === 'number' && height > 0) this.height.set(Math.ceil(height));
  }
}
