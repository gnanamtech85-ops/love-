class ChartBase {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.options = {
      bgColor: 'transparent',
      gridColor: 'rgba(255,255,255,0.06)',
      textColor: '#6b6b80',
      fontFamily: "'JetBrains Mono', monospace",
      lineColor: '#2D68FF',
      fillColor: 'rgba(45,104,255,0.12)',
      pointColor: '#2D68FF',
      ...options
    };
    this.data = [];
    this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
    this.width = rect.width;
    this.height = rect.height;
  }
  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}

class LineChart extends ChartBase {
  setData(labels, values) {
    this.labels = labels;
    this.values = values;
    this.draw();
  }
  draw() {
    this.clear();
    const { ctx, width, height, values, labels, options } = this;
    if (!values || values.length < 2) return;
    const pad = { top: 10, bottom: 24, left: 10, right: 10 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const max = Math.max(...values, 1);
    const min = 0;
    const range = max - min || 1;
    const stepX = chartW / (values.length - 1);
    const points = values.map((v, i) => ({
      x: pad.left + i * stepX,
      y: pad.top + chartH - ((v - min) / range) * chartH
    }));
    ctx.save();
    ctx.strokeStyle = options.gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = options.textColor;
      ctx.font = `10px ${options.fontFamily}`;
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(max - (range / 4) * i) + '', pad.left - 4, y + 4);
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const cx = (points[i - 1].x + points[i].x) / 2;
      ctx.bezierCurveTo(cx, points[i - 1].y, cx, points[i].y, points[i].x, points[i].y);
    }
    ctx.strokeStyle = options.lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    const grad = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
    grad.addColorStop(0, options.fillColor);
    grad.addColorStop(1, 'rgba(45,104,255,0)');
    ctx.lineTo(points[points.length - 1].x, height - pad.bottom);
    ctx.lineTo(points[0].x, height - pad.bottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    if (labels && labels.length > 0) {
      const labelStep = Math.max(1, Math.floor(labels.length / 6));
      ctx.fillStyle = options.textColor;
      ctx.font = `9px ${options.fontFamily}`;
      ctx.textAlign = 'center';
      for (let i = 0; i < labels.length; i += labelStep) {
        ctx.fillText(labels[i], points[i].x, height - 4);
      }
    }
    ctx.restore();
  }
}

class BarChart extends ChartBase {
  setData(labels, values) {
    this.labels = labels;
    this.values = values;
    this.draw();
  }
  draw() {
    this.clear();
    const { ctx, width, height, values, labels, options } = this;
    if (!values || values.length === 0) return;
    const pad = { top: 10, bottom: 24, left: 10, right: 10 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const max = Math.max(...values, 1);
    const barW = Math.min(20, (chartW / values.length) * 0.6);
    const gap = chartW / values.length;
    ctx.save();
    ctx.strokeStyle = options.gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
    }
    values.forEach((v, i) => {
      const barH = (v / max) * chartH;
      const x = pad.left + i * gap + (gap - barW) / 2;
      const y = pad.top + chartH - barH;
      ctx.fillStyle = options.lineColor;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, [2, 2, 0, 0]);
      ctx.fill();
    });
    if (labels && labels.length > 0) {
      const labelStep = Math.max(1, Math.floor(labels.length / 6));
      ctx.fillStyle = options.textColor;
      ctx.font = `9px ${options.fontFamily}`;
      ctx.textAlign = 'center';
      for (let i = 0; i < labels.length; i += labelStep) {
        ctx.fillText(labels[i], pad.left + i * gap + gap / 2, height - 4);
      }
    }
    ctx.restore();
  }
}
