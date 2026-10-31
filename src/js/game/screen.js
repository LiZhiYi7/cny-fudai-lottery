// 屏幕基类：统一处理画布按钮、悬停、指针与键盘转发。

import { Art } from '../render/art.js';
import { audio } from './audio.js';

export class BaseScreen {
  constructor(app) {
    this.app = app;
    this.buttons = [];
    this.hover = null;
    this.pointer = { x: -999, y: -999 };
    this.name = 'screen';
  }

  enter() {}

  exit() {
    this.clearButtons();
  }

  update() {}

  draw(ctx, t) {
    this.drawButtons(ctx, t);
  }

  addButton(opts) {
    const item = { ...opts };
    this.buttons.push(item);
    return item;
  }

  clearButtons() {
    this.buttons.length = 0;
    this.hover = null;
  }

  buttonAt(x, y) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (b.disabled) continue;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  drawButtons(ctx, t) {
    for (const b of this.buttons) {
      Art.button(ctx, {
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        label: b.label,
        hover: this.hover === b,
        disabled: b.disabled,
        primary: b.primary,
        t,
      });
    }
  }

  onPointerMove(p) {
    this.pointer = p;
    const b = this.buttonAt(p.x, p.y);
    if (b !== this.hover) {
      this.hover = b;
      if (b) audio.hover();
    }
    this.app.setCursor(b ? 'pointer' : 'default');
  }

  onPointerDown(p) {
    const b = this.buttonAt(p.x, p.y);
    if (b && b.onClick) {
      audio.click();
      b.onClick();
      return true;
    }
    return false;
  }

  onPointerUp() {}

  onKeyDown() {}

  onKeyUp() {}
}
