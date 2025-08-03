import { LitElement, html, css } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

@customElement('overlay-scrollbar')
export class OverlayScrollbar extends LitElement {
  @query('.container') private containerEl!: HTMLElement;
  @query('.content') private contentEl!: HTMLElement;
  @query('.scrollbar-thumb') private thumbEl!: HTMLElement;

  @state() private thumbHeight = 0;
  @state() private thumbTop = 0;
  @state() private isHovering = false;
  @state() private isDragging = false;
  @state() private hasOverflow = false;

  private resizeObserver!: ResizeObserver;

  override firstUpdated() {
    this.resizeObserver = new ResizeObserver(this.updateScrollbar);
    this.resizeObserver.observe(this.containerEl);
    this.resizeObserver.observe(this.contentEl);
    this.updateScrollbar();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
  }

  private handleScroll = () => {
    this.updateScrollbar();
  };

  private updateScrollbar = () => {
    if (!this.contentEl) return;
    const { scrollTop, scrollHeight, clientHeight } = this.contentEl;
    const contentHeight = scrollHeight;
    const containerHeight = clientHeight;

    this.hasOverflow = contentHeight > containerHeight;

    if (!this.hasOverflow) {
      this.thumbHeight = 0;
      return;
    }

    const thumbH = (containerHeight / contentHeight) * containerHeight;
    const thumbT = (scrollTop / contentHeight) * containerHeight;

    this.thumbHeight = thumbH;
    this.thumbTop = thumbT;
  };

  private handlePointerDown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    this.isDragging = true;
    this.thumbEl.setPointerCapture(e.pointerId);

    const startY = e.clientY;
    const startScrollTop = this.contentEl.scrollTop;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!this.isDragging) return;
      const dy = moveEvent.clientY - startY;
      const scrollableDist = this.contentEl.scrollHeight - this.contentEl.clientHeight;
      const trackDist = this.containerEl.clientHeight - this.thumbHeight;
      this.contentEl.scrollTop = startScrollTop + (dy / trackDist) * scrollableDist;
    };

    const handlePointerUp = () => {
      this.isDragging = false;
      this.thumbEl.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  override render() {
    const thumbStyles = {
      height: `${this.thumbHeight}px`,
      top: `${this.thumbTop}px`,
      opacity: this.isHovering || this.isDragging ? 1 : 0,
      backgroundColor: this.isDragging ? '#999' : '#777',
    };

    return html`
      <div
        class="container"
        @pointerenter=${() => { this.isHovering = true; }}
        @pointerleave=${() => { this.isHovering = false; }}
      >
        <div class="content" @scroll=${this.handleScroll}>
          <slot></slot>
        </div>
        ${this.hasOverflow ? html`
          <div class="scrollbar-track" style=${styleMap({ opacity: this.isHovering || this.isDragging ? 1 : 0 })}>
            <div
              class="scrollbar-thumb"
              style=${styleMap(thumbStyles)}
              @pointerdown=${this.handlePointerDown}
            ></div>
          </div>
        ` : ''}
      </div>
    `;
  }

  static override styles = css`
    :host {
      display: block;
      position: relative;
      height: 100%;
      overflow: hidden;
    }
    .container {
      width: 100%;
      height: 100%;
      position: relative;
    }
    .content {
      height: 100%;
      width: 100%;
      overflow-y: scroll;
      /* Hide native scrollbar */
      -ms-overflow-style: none; /* IE and Edge */
      scrollbar-width: none; /* Firefox */
    }
    .content::-webkit-scrollbar {
      display: none; /* Chrome, Safari, and Opera */
    }
    .scrollbar-track {
      position: absolute;
      top: 2px;
      right: 2px;
      bottom: 2px;
      width: 8px;
      background-color: rgba(0, 0, 0, 0.1);
      border-radius: 4px;
      transition: opacity 0.2s ease-in-out;
    }
    .scrollbar-thumb {
      position: absolute;
      width: 100%;
      border-radius: 4px;
      background-color: #777;
      transition: opacity 0.2s ease-in-out;
      cursor: pointer;
    }
    .scrollbar-thumb:hover {
      background-color: #888;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'overlay-scrollbar': OverlayScrollbar;
  }
}